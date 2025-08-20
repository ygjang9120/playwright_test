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
async function runProductValidation(
  browser: Browser,
  productName: string,
  productUrlSlug: string,
  maxLots = 30
) {
  const context = await browser.newContext({ storageState: 'storageState.json' });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/#/process/shipout/${productUrlSlug}`, { waitUntil: 'networkidle' });
  await expect(page.locator('tbody > tr').first()).toBeVisible({ timeout: 30_000 });

  console.log(`[정보] ${productName} 제품의 LOT를 최대 ${maxLots}개까지 불러옵니다...`);
  while (true) {
    const lotRows = page.locator('tbody > tr');
    const currentLotCount = await lotRows.count();

    if (currentLotCount >= maxLots) {
      console.log(`[정보] 목표 개수인 ${maxLots}개 이상을 찾았으므로 스크롤을 중단합니다.`);
      break;
    }

    console.log(`[${productName}] 현재 ${currentLotCount}개 LOT 발견. 더 불러오기 위해 마지막 항목으로 스크롤합니다...`);
    await lotRows.last().scrollIntoViewIfNeeded();

    try {
      // ✅ [핵심 수정] 개수를 세는 대신, 다음 항목(currentLotCount 인덱스)이
      // 실제로 나타날 때까지 기다리는 방식으로 변경합니다. 이것이 가장 안정적입니다.
      await expect(lotRows.nth(currentLotCount)).toBeVisible({ timeout: 30000 });
      
      const newCount = await lotRows.count();
      console.log(`[정보] 새 LOT가 로드되었습니다. (이전: ${currentLotCount}개 -> 현재: ${newCount}개)`);
    } catch (e) {
      console.log('[정보] 대기 시간 초과. 더 이상 로드할 데이터가 없는 것으로 간주하고 스크롤을 중단합니다.');
      break;
    }
  }


  const finalLotRows = await page.locator('tbody > tr').all();
  // ▼▼▼ 이 로그를 추가하면 혼동을 줄일 수 있습니다. ▼▼▼
  console.log(`[정보] 스크롤 종료 후, 최종적으로 ${finalLotRows.length}개의 LOT가 발견되었습니다.`);
  const lotRowsToTest = finalLotRows.slice(0, Math.min(maxLots, finalLotRows.length));
  console.log(`\n[${productName}] 총 ${lotRowsToTest.length}개의 LOT를 대상으로 다운로드 테스트를 시작합니다.`);

  for (const [index, row] of lotRowsToTest.entries()) {
    let lotNumber = '알 수 없음';
    console.log(`\n[${index + 1}/${lotRowsToTest.length}] 테스트 처리 시작...`);
    
    try {
      const lotNumberCell = row.locator('td').nth(1);
      await expect(lotNumberCell).toBeVisible({ timeout: 120_000 });
      lotNumber = await lotNumberCell.textContent() || `[읽기 실패]`;
      console.log(`[정보] 대상: 제품=${productName}, LOT=${lotNumber}`);

      await row.getByRole('button', { name: '출력' }).click();
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
      // // [수정됨] 새로고침 로직에 '자동 재시도' 기능 추가
      // if (index < lotRowsToTest.length - 1) {
      //   let reloadSuccess = false;
      //   for (let i = 0; i < 3; i++) { // 최대 3번 재시도
      //     try {
      //       console.log(`[정보] ${lotNumber} 테스트 완료. 다음 LOT를 위해 페이지를 새로고침합니다... (시도 ${i + 1}/3)`);
      //       await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      //       await expect(page.locator('tbody > tr').first()).toBeVisible({ timeout: 120_000 });
      //       console.log('[정보] 페이지 새로고침 및 UI 확인 완료.');
      //       reloadSuccess = true;
      //       break; // 성공 시 재시도 루프 탈출
      //     } catch (reloadError) {
      //       console.warn(`[경고] 새로고침 시도 ${i + 1} 실패: ${(reloadError as Error).message}`);
      //       if (i < 2) { // 마지막 시도가 아니라면 5초 후 재시도
      //         await page.waitForTimeout(5000);
      //       } else { // 3번 모두 실패 시 최종 에러 처리
      //         const errorMessage = `페이지 새로고침에 3번 연속 실패했습니다: ${(reloadError as Error).message}`;
      //         console.error(`[심각] ${errorMessage}`);
      //         throw new Error(errorMessage);
      //       }
      //     }
      //   }
      // }
       await page.reload({ waitUntil: 'networkidle' });
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

  test('ACP-3 제품의 최신 LOT 검증', async ({ browser }) => {
    test.setTimeout(18000_000);
    await runProductValidation(browser, 'ACP-3', 'acp-3', 30);
  });

  test('TMA-F 제품의 최신 LOT 검증', async ({ browser }) => {
    test.setTimeout(18000_000);
    await runProductValidation(browser, 'TMA-F', 'tma-f', 30);
  });

  test('NCE-2 제품의 최신 LOT 검증', async ({ browser }) => {
    test.setTimeout(18000_000);
    await runProductValidation(browser, 'NCE-2', 'nce-2', 30);
  });

  test('GMP-02 제품의 최신 LOT 검증', async ({ browser }) => {
    test.setTimeout(18000_000);
    await runProductValidation(browser, 'GMP-02', 'gmp-02', 30);
  });

  test('ECH 제품의 최신 LOT 검증', async ({ browser }) => {
    test.setTimeout(18000_000);
    await runProductValidation(browser, 'ECH', 'ech', 30);
  });

  test('ANP-1 제품의 최신 LOT 검증', async ({ browser }) => {
    test.setTimeout(18000_000);
    await runProductValidation(browser, 'ANP-1', 'anp-1', 30);
  });

  test('HPL-02 제품의 최신 LOT 검증', async ({ browser }) => {
    test.setTimeout(18000_000);
    await runProductValidation(browser, 'HPL-02', 'hpl-02', 30);
  });


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
