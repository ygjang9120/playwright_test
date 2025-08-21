import { test, expect, type Browser } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import dotenv from 'dotenv';

// .env 파일의 환경 변수를 로드합니다. (로컬 테스트용)
dotenv.config();

// --- 환경 변수 및 기본 설정 ---
const username = process.env.ADEKA_ID;
const password = process.env.ADEKA_PASSWORD;
const baseUrl = process.env.BASE_URL || 'https://spc.adkk.co.kr:8091';

// --- 타입 정의 ---
type TestResult = {
  status: 'success' | 'failure';
  productName: string;
  lotNumber: string;
  file?: string;
  error?: string;
};

// 모든 테스트 케이스의 결과를 누적할 배열
const allTestResults: TestResult[] = [];

// --- 재사용 가능한 제품 테스트 함수 ---
// --- 최종 완성본 ---
async function runProductValidation(
  browser: Browser,
  productName: string,
  productUrlSlug: string,
  maxLots = 30
) {
  const context = await browser.newContext({ storageState: 'storageState.json' });
  const page = await context.newPage();

  // --- 1. 초기 탐색: '마우스 휠'로 스크롤하여 테스트할 총 LOT 개수 확정 ---
await page.goto(`${baseUrl}/#/process/shipout/${productUrlSlug}`, { waitUntil: 'networkidle' });
await expect(page.locator('tbody > tr').first()).toBeVisible({ timeout: 30_000 });

console.log(`[정보] 마지막 행까지 스크롤하며 LOT를 더 로드합니다...`);
const rows = page.locator('tbody > tr');
await rows.first().hover();
await page.mouse.wheel(0, 300);
let prevCount = 0;
let stagnant = 0;

while (true) {
  const count = await rows.count();
  if (count > prevCount) {
    console.log(`[정보] 현재 LOT ${count}개 발견.`);

    for (let j = prevCount; j < count; j++) {
        const newRow = rows.nth(j);
        const lotCell = newRow.locator('td').nth(1);
        try {
          // 안정성을 위해 셀이 보일 때까지 기다립니다.
          await expect(lotCell).toBeVisible({ timeout: 5000 });
          const lotNumber = await lotCell.textContent() || '[읽기 실패]';
          console.log(`  - ${j + 1}번째 LOT: ${lotNumber.trim()}`);
        } catch (error) {
          console.log(`  - ${j + 1}번째 행의 LOT 번호를 읽는 데 실패했습니다.`);
        }
      }
    stagnant = 0;
    prevCount = count;
  } else {
    stagnant++;
  }

  if (count >= maxLots) {
    console.log(`[정보] 목표 개수인 ${maxLots}개 이상(${count}개)을 찾았으므로 스크롤을 중단합니다.`);
    break;
  }
  if (stagnant >= 3) {
    console.log(`[정보] 3번 연속 스크롤해도 새 LOT가 없어 중단합니다. (총 ${count}개)`);
    break;
  }

  // 핵심: 마지막 행을 화면에 보이게 하여 내부 스크롤 컨테이너를 움직입니다.
  // await rows.last().scrollIntoViewIfNeeded();
  //  await rows.first().hover();
  // await page.mouse.wheel(0, 300);
  await page.waitForTimeout(800);
}

const lotsToTestCount = Math.min(maxLots, await rows.count());
console.log(`\n[${productName}] 총 ${lotsToTestCount}개의 LOT를 대상으로 다운로드 테스트를 시작합니다.`);

  
  // 페이지를 초기 상태로 되돌려 첫 번째 LOT부터 테스트를 준비합니다.
  // await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('tbody > tr').first()).toBeVisible({ timeout: 30_000 });

  // --- 2. 인덱스 기반으로 다운로드 루프 실행 ---
  for (let i = 0; i < lotsToTestCount; i++) {
    let lotNumber = '알 수 없음';
    console.log(`\n[${i + 1}/${lotsToTestCount}] 테스트 처리 시작...`);

    try {
      // 매번 새로고침되므로, 목표(i번째) LOT가 보일 때까지 다시 스크롤합니다.
      let isTargetVisible = false;
      let scrollAttempts = 0;
      while (!isTargetVisible && scrollAttempts < 10) { // 무한 루프 방지
        const currentVisibleCount = await page.locator('tbody > tr').count();
        if (i < currentVisibleCount) {
          isTargetVisible = true;
        } else {
          console.log(`[정보] ${i + 1}번째 LOT를 찾기 위해 스크롤합니다. (현재 ${currentVisibleCount}개)`);
          // ✨ 여기도 마찬가지로 '마우스 휠' 스크롤을 사용합니다.
          await page.mouse.wheel(0, 500);
          await page.waitForTimeout(3000);
          scrollAttempts++;
        }
      }

      const targetRow = page.locator('tbody > tr').nth(i);
      await targetRow.scrollIntoViewIfNeeded(); // 상호작용 전 화면에 보이도록 최종 스크롤

      const lotNumberCell = targetRow.locator('td').nth(1);
      await expect(lotNumberCell).toBeVisible({ timeout: 10_000 });
      lotNumber = (await lotNumberCell.textContent()) || `[읽기 실패]`;
      console.log(`[정보] 대상: 제품=${productName}, LOT=${lotNumber} (인덱스: ${i})`);

      await targetRow.getByRole('button', { name: '출력' }).click();

      // (이하 다운로드 로직은 기존과 동일)
      await page.waitForLoadState('networkidle', { timeout: 180_000 });
      const downloadButtons = page.getByRole('button', { name: new RegExp(`${productName} COA_.*\\.xlsx`) });
      await expect(downloadButtons.first()).toBeVisible({ timeout: 600_000 });
      const downloadPromise = page.waitForEvent('download');
      await downloadButtons.first().click();
      const download = await downloadPromise;
      const sanitizedLotNumber = lotNumber.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileExtension = path.extname(download.suggestedFilename()) || '.xlsx';
      const uniqueFileName = `${productName}_${sanitizedLotNumber}${fileExtension}`;
      const downloadsPath = path.join(process.cwd(), 'downloads');
      if (!fs.existsSync(downloadsPath)) fs.mkdirSync(downloadsPath, { recursive: true });
      const filePath = path.join(downloadsPath, uniqueFileName);
      await download.saveAs(filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      console.log(`[성공] 파일 다운로드 및 저장 완료: ${filePath}`);
      allTestResults.push({ status: 'success', productName, lotNumber, file: uniqueFileName });

    } catch (error) {
      console.error(`[실패] 제품: ${productName}, LOT: ${lotNumber}, 오류: ${(error as Error).message}`);
      const sanitizedLot = lotNumber.replace(/[^a-zA-Z0-9.-]/g, '_');
      const screenshotPath = `test-results/failure-${productName}-${sanitizedLot}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`디버깅을 위해 스크린샷 저장: ${screenshotPath}`);
      allTestResults.push({ status: 'failure', productName, lotNumber, error: (error as Error).message });
    } finally {
      if (i < lotsToTestCount - 1) {
        // (안정적인 새로고침 로직은 기존과 동일)
        let reloadSuccess = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            console.log(`[정보] ${lotNumber} 테스트 완료. 다음 LOT를 위해 페이지를 새로고침합니다... (시도 ${attempt + 1}/3)`);
            await page.reload({ waitUntil: 'networkidle', timeout: 120_000 });
            await expect(page.locator('tbody > tr').first()).toBeVisible({ timeout: 120_000 });
            const rows = page.locator('tbody > tr');
            await rows.first().hover();
            await page.mouse.wheel(0, 300);
            console.log('[정보] 페이지 새로고침 및 UI 확인 완료.');
            reloadSuccess = true;
            break;
          } catch (reloadError) {
            console.warn(`[경고] 새로고침 시도 ${attempt + 1} 실패: ${(reloadError as Error).message}`);
            if (attempt < 2) {
              await page.waitForTimeout(5000);
            } else {
              const errorMessage = `페이지 새로고침에 3번 연속 실패했습니다: ${(reloadError as Error).message}`;
              console.error(`[심각] ${errorMessage}`);
              throw new Error(errorMessage);
            }
          }
        }
      }
    }
  }
  await page.close();
  await context.close();
}


// --- 테스트 스위트 정의 ---
test.describe('전체 LOT 대상 COA 다운로드 및 저장 검증', () => {

  test.beforeAll(async ({ browser }) => {
    if (!username || !password) {
      throw new Error("ADEKA_ID 또는 ADEKA_PASSWORD 환경 변수가 설정되지 않았습니다.");
    }
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/login#/login`);
    await page.locator('input[name="id"]').fill(username);
    await page.locator('input[name="pwd"]').fill(password);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByText('ADEKA')).toBeVisible({ timeout: 10000 });
    console.log('로그인 성공. 테스트를 시작합니다.');
    await page.context().storageState({ path: 'storageState.json' });
    await page.close();
  });

  // 각 제품별 테스트 케이스 (최대 30개 LOT, 타임아웃 5시간)
  test('ACP-2 제품의 최신 LOT 검증', async ({ browser }) => {
    test.setTimeout(18000_000);
    await runProductValidation(browser, 'ACP-2', 'acp-2', 30);
  });

  // test('ACP-3 제품의 최신 LOT 검증', async ({ browser }) => {
  //   test.setTimeout(18000_000);
  //   await runProductValidation(browser, 'ACP-3', 'acp-3', 30);
  // });

  // test('TMA-F 제품의 최신 LOT 검증', async ({ browser }) => {
  //   test.setTimeout(18000_000);
  //   await runProductValidation(browser, 'TMA-F', 'tma-f', 30);
  // });

  // test('NCE-2 제품의 최신 LOT 검증', async ({ browser }) => {
  //   test.setTimeout(18000_000);
  //   await runProductValidation(browser, 'NCE-2', 'nce-2', 30);
  // });

  // test('GMP-02 제품의 최신 LOT 검증', async ({ browser }) => {
  //   test.setTimeout(18000_000);
  //   await runProductValidation(browser, 'GMP-02', 'gmp-02', 30);
  // });

  // test('ECH 제품의 최신 LOT 검증', async ({ browser }) => {
  //   test.setTimeout(18000_000);
  //   await runProductValidation(browser, 'ECH', 'ech', 30);
  // });

  // test('ANP-1 제품의 최신 LOT 검증', async ({ browser }) => {
  //   test.setTimeout(18000_000);
  //   await runProductValidation(browser, 'ANP-1', 'anp-1', 30);
  // });

  // test('HPL-02 제품의 최신 LOT 검증', async ({ browser }) => {
  //   test.setTimeout(18000_000);
  //   await runProductValidation(browser, 'HPL-02', 'hpl-02', 30);
  // });


  test.afterAll(async () => {
    console.log('\n--- 최종 테스트 결과 요약 ---');
    const summaryDir = 'test-results';
    if (!fs.existsSync(summaryDir)) fs.mkdirSync(summaryDir, { recursive: true });
    fs.writeFileSync(path.join(summaryDir, 'summary.json'), JSON.stringify(allTestResults, null, 2));

    const successes = allTestResults.filter(r => r.status === 'success');
    const failures = allTestResults.filter(r => r.status === 'failure');

    if (successes.length > 0) {
      // const successDetails = successes.map(s => `  - 제품: ${s.productName}, LOT: ${s.lotNumber}`).join('\n');
      const successDetails = successes.map(s => `LOT: ${s.lotNumber}`).join('\n');
      const successMessage = `✅ COA 테스트 성공 (${successes.length}건)\n${successDetails}`;
      fs.writeFileSync(path.join(summaryDir, 'success-message.txt'), successMessage);
      console.log('\n' + successMessage);
    }

    if (failures.length > 0) {
      // const failureDetails = failures.map(f => `  - 제품: ${f.productName}, LOT: ${f.lotNumber}, 오류: ${f.error}`).join('\n');
      const failureDetails = failures.map(f => `LOT: ${f.lotNumber}`).join('\n');
      const failureMessage = `❌ COA 에러 발생 (${failures.length}건)\n${failureDetails}`;
      fs.writeFileSync(path.join(summaryDir, 'failure-message.txt'), failureMessage);
      console.error('\n\n==================== TEST FAILURE DETAILS ====================\n' + failureMessage + '\n============================================================\n');
      throw new Error(failureMessage);
    }

    if (allTestResults.length > 0) {
      console.log(`🎉 모든 ${allTestResults.length}개의 LOT 다운로드 테스트를 성공적으로 완료했습니다!`);
    } else {
      console.log('테스트가 실행되었지만, 처리된 LOT가 없습니다.');
    }
  });
});
