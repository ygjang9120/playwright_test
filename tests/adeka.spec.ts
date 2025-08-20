import { test, expect, type Browser } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';

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

// --- 재사용 가능한 제품 테스트 함수 (내부 검증 로직 제거) ---
/**
 * 지정된 제품의 최상위 LOT들에 대한 COA 다운로드를 수행하고 파일 저장 성공 여부를 확인합니다.
 * @param browser - Playwright 브라우저 인스턴스
 * @param productName - 테스트할 제품명 (예: 'ANP-1')
 * @param productUrlSlug - 제품 페이지 URL 슬러그 (예: 'anp-1')
 * @param maxLots - 테스트할 최대 LOT 개수 (기본값: 3)
 */
async function runProductValidation(
  browser: Browser,
  productName: string,
  productUrlSlug: string,
  maxLots = 30
) {
  const context = await browser.newContext({ storageState: 'storageState.json' });
  const page = await context.newPage();

  // 1. 제품 페이지로 이동
  await page.goto(`${baseUrl}/#/process/shipout/${productUrlSlug}`, { waitUntil: 'networkidle' });
  await expect(page.locator('tbody > tr').first()).toBeVisible({ timeout: 30_000 });

  // 2. 지정된 개수만큼 최상위 LOT 행을 선택
  const lotRowsAll = await page.locator('tbody > tr').all();
  const lotRows = lotRowsAll.slice(0, Math.min(maxLots, lotRowsAll.length));
  console.log(`\n[${productName}] 총 ${lotRows.length}개의 LOT를 대상으로 다운로드 테스트를 시작합니다.`);

  for (const [index, row] of lotRows.entries()) {
    const lotNumber = await row.locator('td').nth(1).textContent() || '알 수 없음';
    console.log(`\n[${index + 1}/${lotRows.length}] 테스트 시작: 제품=${productName}, LOT=${lotNumber}`);

    try {
      // 3. '출력' 버튼 클릭
      await row.getByRole('button', { name: '출력' }).click();
      await page.waitForLoadState('networkidle', { timeout: 120_000 });

      // 4. 다운로드 버튼이 나타날 때까지 대기 (최대 10분)
      const downloadButtons = page.getByRole('button', { name: new RegExp(`${productName} COA_.*\\.xlsx`) });
      await expect(downloadButtons.first()).toBeVisible({ timeout: 600_000 });

      // 5. 파일 다운로드 이벤트 대기 및 버튼 클릭
      const downloadPromise = page.waitForEvent('download');
      await downloadButtons.first().click();
      const download = await downloadPromise;

      // 6. 파일 저장 경로 설정 및 저장
      const downloadsPath = path.join(process.cwd(), 'downloads');
      if (!fs.existsSync(downloadsPath)) {
        fs.mkdirSync(downloadsPath, { recursive: true });
      }
      const filePath = path.join(downloadsPath, download.suggestedFilename());
      await download.saveAs(filePath);

      // 7. 파일이 실제로 존재하는지 확인하여 성공 여부 판단
      expect(fs.existsSync(filePath), `파일이 성공적으로 저장되어야 합니다: ${filePath}`).toBe(true);
      console.log(`[성공] 파일 다운로드 및 저장 완료: ${filePath}`);
      allTestResults.push({ status: 'success', productName, lotNumber, file: download.suggestedFilename() });

    } catch (error) {
      console.error(`[실패] 제품: ${productName}, LOT: ${lotNumber}, 오류: ${(error as Error).message}`);
      const sanitizedLot = lotNumber.replace(/[^a-zA-Z0-9.-]/g, '_');
      const screenshotPath = `test-results/failure-${productName}-${sanitizedLot}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`디버깅을 위해 스크린샷 저장: ${screenshotPath}`);
      allTestResults.push({ status: 'failure', productName, lotNumber, error: (error as Error).message });
    } finally {
      // 다음 LOT 테스트를 위해 페이지를 새로고침합니다.
      await page.reload({ waitUntil: 'networkidle' });
    }
  }
  await page.close();
  await context.close();
}


// --- 테스트 스위트 정의 ---
test.describe('전체 LOT 대상 COA 다운로드 및 저장 검증', () => {

  // 1. 모든 테스트 시작 전, 단 한 번 로그인 실행
  test.beforeAll(async ({ browser }) => {
    if (!username || !password) {
      throw new Error("ADEKA_ID 또는 ADEKA_PASSWORD 환경 변수가 설정되지 않았습니다. GitHub Secrets를 확인하세요.");
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

  // 각 제품별 테스트 케이스 (최대 3개 LOT)
  // test('ACP-2 제품의 최신 LOT 검증', async ({ browser }) => {
  //   test.setTimeout(18000_000); // 테스트 타임아웃을 1시간으로 설정
  //   await runProductValidation(browser, 'ACP-2', 'apc-2', 30);
  // });

  // test('ACP-3 제품의 최신 LOT 검증', async ({ browser }) => {
  //   test.setTimeout(18000_000);
  //   await runProductValidation(browser, 'ACP-3', 'acp-3', 30);
  // });

  // test('TMA-F 제품의 최신 LOT 검증', async ({ browser }) => {
  //   test.setTimeout(18000_000);
  //   await runProductValidation(browser, 'TMA-F', 'tma-f', 30);
  // });

  test('NCE-2 제품의 최신 LOT 검증', async ({ browser }) => {
    test.setTimeout(18000_000);
    await runProductValidation(browser, 'NCE-2', 'nce-2', 30);
  });

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


  // 3. 모든 테스트가 끝난 후, 최종 결과 처리 및 상세 리포트 파일 생성
  test.afterAll(async () => {
    console.log('\n--- 최종 테스트 결과 요약 ---');
    const summaryDir = 'test-results';
    if (!fs.existsSync(summaryDir)) {
      fs.mkdirSync(summaryDir, { recursive: true });
    }
    // 전체 결과는 JSON 파일로 저장
    fs.writeFileSync(path.join(summaryDir, 'summary.json'), JSON.stringify(allTestResults, null, 2));

    const successes = allTestResults.filter(r => r.status === 'success');
    const failures = allTestResults.filter(r => r.status === 'failure');

    // 성공 리포트 생성
    if (successes.length > 0) {
      const successDetails = successes.map(s => `  - 제품: ${s.productName}, LOT: ${s.lotNumber}`).join('\n');
      const successMessage = `✅ COA 테스트 성공 (${successes.length}건)\n${successDetails}`;
      fs.writeFileSync(path.join(summaryDir, 'success-message.txt'), successMessage);
      console.log('\n' + successMessage);
    }

    // 실패 리포트 생성
    if (failures.length > 0) {
      const failureDetails = failures.map(f => `  - 제품: ${f.productName}, LOT: ${f.lotNumber}, 오류: ${f.error}`).join('\n');
      const failureMessage = `❌ COA 에러 발생 (${failures.length}건)\n${failureDetails}`;
      fs.writeFileSync(path.join(summaryDir, 'failure-message.txt'), failureMessage);
      
      console.error('\n\n==================== TEST FAILURE DETAILS ====================');
      console.error(failureMessage);
      console.error('============================================================\n');
      
      // 테스트 실패 시 워크플로우를 중단시키기 위해 에러 발생
      throw new Error(`E2E test failed for ${failures.length} LOT(s). Check logs for details.`);
    }

    if (successes.length === allTestResults.length && allTestResults.length > 0) {
        console.log(`🎉 모든 ${allTestResults.length}개의 LOT 다운로드 테스트를 성공적으로 완료했습니다!`);
    } else if (successes.length === 0 && failures.length === 0) {
        console.log('테스트가 실행되었지만, 성공 또는 실패 결과가 없습니다.');
    }
  });
});
