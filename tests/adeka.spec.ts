import { test, expect } from '@playwright/test';
import path from 'path'; 
import fs from 'fs'; 
import * as XLSX from 'xlsx'; 

// // 개발 환경에 대한 설정을 정의합니다.
// // 모든 테스트에 공통으로 적용될 설정을 정의합니다.
// test.use({
//   baseURL: 'http://localhost:8091',
//   ignoreHTTPSErrors: true,
// });

// /**
//  * 첫 번째 테스트: 로그인 후 메인 페이지가 정상적으로 보이는지 확인합니다.
//  */
// test('로그인 후 홈 스크린샷', async ({ page }) => {
//   await page.goto('/#/', { waitUntil: 'networkidle' });
//   await expect(page.locator('text=/ADEKA/i')).toBeVisible({ timeout: 15_000 });
//   await page.screenshot({ path: 'home-after-login.png', fullPage: true });
// });

// /**
//  * 두 번째 테스트: 메인 페이지에서 메뉴를 클릭하여 상세 페이지로 이동하고,
//  * 데이터가 정상적으로 로드되는지 확인합니다.
//  */
// test('출하관리 메뉴 이동 및 ANP-1 페이지 데이터 확인', async ({ page }) => {
//   await page.goto('/#/', { waitUntil: 'networkidle' });
//   await page.getByRole('link', { name: '출하 관리' }).click();
//   await page.getByRole('link', { name: 'ANP-1', exact: true }).click();
//   await expect(page).toHaveURL(/.*\/#\/process\/shipout\/anp-1/);

//   const firstDataRow = page.locator('tbody > tr').first();
//   await expect(firstDataRow).toBeVisible({ timeout: 15_000 });
//   await page.screenshot({ path: 'anp-1-page-with-data.png', fullPage: true });
// });

// /**
//  * 세 번째 테스트: 엑셀 다운로드 버튼을 클릭하고, 다운로드된 파일의 내용을 검증합니다.
//  */
// test('엑셀 다운로드 버튼 클릭 및 파일 내용 검증', async ({ page }) => {
//   // [핵심 1] 파일 생성 및 다운로드 시간이 길 수 있으므로, 테스트 타임아웃을 넉넉하게 3분으로 설정합니다.
//   test.setTimeout(180_000);

//   // 1. 테스트 준비: 데이터가 있는 ANP-1 페이지로 이동합니다.
//   await page.goto('/#/', { waitUntil: 'networkidle' });
//   await page.getByRole('link', { name: '출하 관리' }).click();
//   await page.getByRole('link', { name: 'ANP-1', exact: true }).click();
//   await expect(page.locator('tbody > tr').first()).toBeVisible({ timeout: 15_000 });

//   // 2. 'Lot.0003' 행의 '출력' 버튼을 클릭하여 파일 생성을 시작합니다.
//   const targetRow = page.locator('tr', { hasText: 'Lot.0003' });
//   await targetRow.getByRole('button', { name: '출력' }).click();

//   // 3. [핵심 2] 파일 이름이 포함된 최종 다운로드 버튼을 찾습니다.
//   const downloadButton = page.getByRole('button', { name: 'ANP-1 COA_2.xlsx' });

//   // 4. 해당 버튼이 나타날 때까지 최대 3분까지 기다립니다.
//   await expect(downloadButton).toBeVisible({ timeout: 180_000 });

//   // 5. 다운로드를 기다리기 시작하고, 버튼을 클릭합니다.
//   const downloadPromise = page.waitForEvent('download');
//   await downloadButton.click();
//   const download = await downloadPromise;

//   // 6. 다운로드된 파일 이름이 올바른지 확인합니다.
//   expect(download.suggestedFilename()).toBe('ANP-1 COA_2.xlsx');

//   // 7. 파일을 'downloads' 폴더에 저장합니다. (프로젝트 루트에 'downloads' 폴더가 있어야 합니다)
//   const downloadsPath = path.join(process.cwd(), 'downloads');
//   if (!fs.existsSync(downloadsPath)) {
//     fs.mkdirSync(downloadsPath);
//   }
//   const filePath = path.join(downloadsPath, download.suggestedFilename());
//   await download.saveAs(filePath);
//   console.log(`파일이 다음 경로에 저장되었습니다: ${filePath}`);

//   // 8. 다운로드된 엑셀 파일을 읽어옵니다.
//   const workbook = XLSX.readFile(filePath);

//   let isFound = false;
//   let foundCellAddress = '';
//   let foundSheetName = '';

//   // 9. 엑셀 파일의 모든 시트를 순회하며 "F_AL" 텍스트를 찾습니다.
//   for (const sheetName of workbook.SheetNames) {
//     const worksheet = workbook.Sheets[sheetName];
//     // 시트의 모든 셀을 순회합니다.
//     for (const cellAddress in worksheet) {
//       // 셀 주소 형식이 아니면 건너뜁니다 (예: '!ref').
//       if (cellAddress[0] === '!') continue;

//       const cell = worksheet[cellAddress];
//       // 셀의 값(cell.v)이 "F_AL"과 일치하는지 확인합니다.
//       if (cell && cell.v === 'F_AL') {
//         isFound = true;
//         foundCellAddress = cellAddress;
//         foundSheetName = sheetName;
//         console.log(`성공: "F_AL" 항목을 찾았습니다!`);
//         console.log(`위치: 시트 '${foundSheetName}', 셀 '${foundCellAddress}'`);
//         break;
//       }
//     }
//     if (isFound) {
//       break; 
//     }
//   }
//   // 10. Playwright의 expect를 사용하여 "F_AL" 항목이 반드시 존재해야 함을 단언합니다.
//   // 이 부분이 실패하면 테스트가 실패 처리됩니다.
//   expect(isFound, `"F_AL" 항목이 엑셀 파일 내에 존재해야 합니다.`).toBe(true);

//   console.log('최종 파일 다운로드 및 엑셀 내용 검증 완료!');
// });


// 실제 아데카 URL에 대한 로그인 테스트 코드
// ==============================================================================


// 환경 변수에서 로그인 정보와 URL을 가져옵니다.
const username = process.env.ADEKA_ID;
const password = process.env.ADEKA_PASSWORD;
const baseUrl = process.env.BASE_URL || 'https://spc.adkk.co.kr:8091';

// 테스트 결과 객체의 타입을 명확하게 정의합니다.
type TestResult = {
  status: 'success' | 'failure';
  productName: string;
  lotNumber: string;
  file?: string;      // 성공 시에만 존재
  error?: string;     // 실패 시에만 존재
};

// 관련된 테스트들을 하나의 'describe' 블록으로 그룹화합니다.
test.describe('전체 LOT 대상 COA 다운로드 및 상세 검증', () => {

  // 'beforeAll'을 사용하여 모든 테스트 시작 전에 딱 한 번만 로그인합니다.
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

  // 모든 LOT를 순회하며 검증하는 메인 테스트
  test('ANP-1 제품의 모든 LOT 검증', async ({ browser }) => {
    test.setTimeout(1800_000); // 전체 테스트 시간이 길 수 있으므로 타임아웃을 30분으로 넉넉하게 설정

    const context = await browser.newContext({ storageState: 'storageState.json' });
    const page = await context.newPage();

    // 1. ANP-1 출하관리 페이지로 이동
    await page.goto(`${baseUrl}/#/process/shipout/anp-1`, { waitUntil: 'networkidle' });
    await expect(page.locator('tbody > tr').first()).toBeVisible({ timeout: 20_000 });

    // 2. 페이지의 모든 LOT 행(row)을 가져옵니다.
    const lotRows = await page.locator('tbody > tr').all();
    console.log(`총 ${lotRows.length}개의 LOT를 대상으로 테스트를 시작합니다.`);

    // 3. 각 LOT의 테스트 결과를 저장할 배열
    const results: TestResult[] = [];

    // 4. for...of 반복문을 사용하여 각 행을 순서대로 테스트합니다.
    for (const [index, row] of lotRows.entries()) {
      const lotNumber = await row.locator('td').nth(1).textContent() || '알 수 없음';
      const productName = 'ANP-1';
      console.log(`\n[${index + 1}/${lotRows.length}] 테스트 시작: 제품=${productName}, LOT=${lotNumber}`);

      try {
        await row.getByRole('button', { name: '출력' }).click();
        const downloadButton = page.getByRole('button', { name: /ANP-1 COA_.*\.xlsx/ });
        await expect(downloadButton).toBeVisible({ timeout: 360_000 });

        const downloadPromise = page.waitForEvent('download');
        await downloadButton.click();
        const download = await downloadPromise;

        const downloadsPath = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(downloadsPath)) {
          fs.mkdirSync(downloadsPath, { recursive: true });
        }
        const filePath = path.join(downloadsPath, download.suggestedFilename());
        await download.saveAs(filePath);
        console.log(`파일 저장 완료: ${filePath}`);

        const workbook = XLSX.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // [수정됨] sheet_to_json의 결과를 안전하게 string 배열로 변환합니다.
        const data: string[] = (XLSX.utils.sheet_to_json(worksheet, { header: 1 }).flat() as any[]).map(String);

        const targetElements = ['F_AL', 'F_Ca', 'F_Cr'];
        let lastFoundIndex = -1;

        for (const el of targetElements) {
          const foundIndex = data.indexOf(el);
          if (foundIndex === -1) {
            throw new Error(`필수 항목 누락: "${el}"을(를) 찾을 수 없습니다.`);
          }
          if (foundIndex < lastFoundIndex) {
            throw new Error(`항목 순서 오류: "${el}"이(가) 이전 항목보다 먼저 나타났습니다.`);
          }
          lastFoundIndex = foundIndex;
        }
        console.log(`상세 검증 완료: 모든 항목(${targetElements.join(', ')})이 순서대로 존재합니다.`);
        
        console.log(`✅ [성공] 제품: ${productName}, LOT: ${lotNumber}`);
        results.push({ status: 'success', productName, lotNumber, file: download.suggestedFilename() });

        await page.reload({ waitUntil: 'networkidle' });

      } catch (error) {
        console.error(`❌ [실패] 제품: ${productName}, LOT: ${lotNumber}, 오류: ${(error as Error).message}`);
        results.push({ status: 'failure', productName, lotNumber, error: (error as Error).message });
        await page.reload({ waitUntil: 'networkidle' });
      }
    }

    console.log('\n--- 최종 테스트 결과 요약 ---');
    console.log(JSON.stringify(results, null, 2));

    const failures = results.filter(r => r.status === 'failure');
    if (failures.length > 0) {
      const failureDetails = failures.map(f => `  - 제품: ${f.productName}, LOT: ${f.lotNumber}, 오류: ${f.error}`).join('\n');
      // [수정됨] expect.fail 대신, 명확한 에러 메시지와 함께 Error를 발생시켜 테스트를 실패시킵니다.
      throw new Error(`테스트 실패. 총 ${failures.length}개의 LOT에서 오류가 발생했습니다:\n${failureDetails}`);
    } else {
      console.log(`🎉 모든 ${results.length}개의 LOT 테스트를 성공적으로 완료했습니다!`);
    }
  });
});



