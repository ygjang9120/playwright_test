import { test as setup, expect } from '@playwright/test';

// 인증 상태를 저장할 파일 경로
const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ request, page }) => {
  // 1. API로 로그인해서 토큰 가져오기 (기존 코드와 동일)
  const res = await request.post('https://localhost:8092/user/login', {
    ignoreHTTPSErrors: true,
    data: { id: 'sjkim@eretec.com', pwd: '12345' },
  });
  expect(res.ok()).toBeTruthy();
  const { token } = await res.json();
  expect(token).toBeTruthy();

  // 2. 빈 페이지로 이동해서 localStorage 설정
  //    (addInitScript 대신 page.evaluate 사용)
  await page.goto('http://localhost:8091'); // baseURL로 이동
  await page.evaluate(t => {
    localStorage.setItem('authToken', t);
  }, token);

  // 3. 현재 컨텍스트의 인증 상태(localStorage, cookies)를 파일로 저장
  await page.context().storageState({ path: authFile });
});