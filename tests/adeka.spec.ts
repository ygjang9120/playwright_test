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
// --- 재사용 가능한 제품 테스트 함수 (수정된 버전) ---
async function runProductValidation(
  browser: Browser,
  productName: string,
  productUrlSlug: string,
  maxLots = 30
) {
  const context = await browser.newContext({ storageState: 'storageState.json' });
  const page = await context.newPage();

  // --- 1. 초기 탐색 및 테스트할 총 LOT 개수 확정 ---
  await page.goto(`${baseUrl}/#/process/shipout/${productUrlSlug}`, { waitUntil: 'networkidle' });
  await expect(page.locator('tbody > tr').first()).toBeVisible({ timeout: 30_000 });
  
  console.log(`[정보] 테스트할 총 LOT 개수를 확인하기 위해 전체 스크롤을 시작합니다...`);
  // 먼저 스크롤을 끝까지 내려서 테스트 대상이 총 몇 개인지 확정합니다.

  let lastLoggedIndex = 0;

  while (true) {
    const lotRows = page.locator('tbody > tr');
    const currentLotCount = await lotRows.count();

    if (currentLotCount > lastLoggedIndex) {
      for (let j = lastLoggedIndex; j < currentLotCount; j++) {
        const newRow = lotRows.nth(j);
        const lotCell = newRow.locator('td').nth(1); // LOT 번호가 있는 두 번째 'td'
        const lotNumber = await lotCell.textContent() || '[읽기 실패]';
        console.log(`[초기 스크롤] ${j + 1}번째 LOT 발견: ${lotNumber.trim()}`);
      }
      lastLoggedIndex = currentLotCount; // 로그 찍은 개수 업데이트
    }

    if (currentLotCount >= maxLots) {
      console.log(`[정보] 목표 개수인 ${maxLots}개 이상(${currentLotCount}개)을 찾았으므로 스크롤을 중단합니다.`);
      break;
    }

    const previousLotCount = currentLotCount;
    await lotRows.last().scrollIntoViewIfNeeded();

    try {
      // 새 항목이 로드될 때까지 최대 30초 대기
      await expect(lotRows).toHaveCount(previousLotCount + 1, { timeout: 30000 });
    } catch (e) {
      console.log('[정보] 더 이상 로드할 데이터가 없는 것으로 간주하고 스크롤을 중단합니다.');
      break;
    }
  }

  const totalLotsFound = await page.locator('tbody > tr').count();
  const lotsToTestCount = Math.min(maxLots, totalLotsFound);
  console.log(`\n[${productName}] 총 ${lotsToTestCount}개의 LOT를 대상으로 다운로드 테스트를 시작합니다.`);
  
  // 페이지를 초기 상태로 되돌려 첫 번째 LOT부터 테스트를 준비합니다.
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('tbody > tr').first()).toBeVisible({ timeout: 30_000 });


  // --- 2. 인덱스 기반으로 루프 실행 (핵심 수정 사항) ---
  for (let i = 0; i < lotsToTestCount; i++) {
    let lotNumber = '알 수 없음';
    console.log(`\n[${i + 1}/${lotsToTestCount}] 테스트 처리 시작...`);

    try {
      // **핵심 로직**: 매번 루프가 시작될 때마다 페이지 상태가 초기화되었다고 가정합니다.
      // 따라서 i번째 요소를 찾기 위해 처음부터 다시 스크롤합니다.
      let isTargetVisible = false;
      while (!isTargetVisible) {
        const currentVisibleCount = await page.locator('tbody > tr').count();
        if (i < currentVisibleCount) {
          // i번째 요소가 현재 화면(DOM)에 로드되었으므로 스크롤 중단
          isTargetVisible = true;
        } else {
          // 목표가 아직 로드되지 않았으므로 맨 아래로 스크롤하여 더 많은 항목을 불러옵니다.
          console.log(`[정보] ${i + 1}번째 LOT를 찾기 위해 스크롤합니다. (현재 ${currentVisibleCount}개)`);
          await page.locator('tbody > tr').last().scrollIntoViewIfNeeded();
          // 새 데이터가 로드될 시간을 줍니다.
          await page.waitForTimeout(10000); 
        }
      }

      // 이제 i번째 요소가 확실히 로드되었으므로 해당 요소를 지정하여 테스트를 진행합니다.
      const targetRow = page.locator('tbody > tr').nth(i);
      await targetRow.scrollIntoViewIfNeeded(); // 정확한 상호작용을 위해 뷰포트로 이동

      const lotNumberCell = targetRow.locator('td').nth(1);
      await expect(lotNumberCell).toBeVisible({ timeout: 10_000 }); 
      lotNumber = (await lotNumberCell.textContent()) || `[읽기 실패]`;
      console.log(`[정보] 대상: 제품=${productName}, LOT=${lotNumber} (인덱스: ${i})`);

      await targetRow.getByRole('button', { name: '출력' }).click();

      // ▼▼▼ 이하 다운로드 및 파일 저장 로직은 기존과 동일합니다. ▼▼▼
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
      // 다음 LOT 테스트를 위해 페이지를 새로고침합니다. (루프 시작 시 어차피 초기화된 상태에서 시작)
      if (i < lotsToTestCount - 1) {
        // 주석 처리하셨던 안정적인 새로고침 로직을 사용하는 것이 좋습니다.
        let reloadSuccess = false;
        for (let attempt = 0; attempt < 3; attempt++) { 
          try {
            console.log(`[정보] ${lotNumber} 테스트 완료. 다음 LOT를 위해 페이지를 새로고침합니다... (시도 ${attempt + 1}/3)`);
            await page.reload({ waitUntil: 'networkidle', timeout: 120_000 });
            await expect(page.locator('tbody > tr').first()).toBeVisible({ timeout: 120_000 });
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
