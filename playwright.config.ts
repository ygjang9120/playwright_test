import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  timeout: 3 * 60 * 1000, // 3분 (밀리초 단위)

  // expect의 타임아웃도 넉넉하게 설정해 줄 수 있습니다.
  expect: {
    timeout: 15 * 1000, // 15초
  },
  
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    baseURL: 'http://127.0.0.1:8091',   // ← ITP 우회 위해 localhost → 127.0.0.1
    ignoreHTTPSErrors: true,            // 백엔드 HTTPS(자체서명) 오류 무시
    storageState: 'playwright/.auth/user.json',  // ① 단계에서 생성
    // video: 'on-first-retry',   // 비디오 녹화 설정 (선택 사항) 
    // screenshot: 'only-on-failure',      // 실패 시에만 스크린

  },

  /* Configure projects for major browsers */
  projects: [
    /* 1. 인증 Setup 프로젝트 설정 */
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    /* 2. 실제 테스트 프로젝트 설정 */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // setup 프로젝트에서 생성한 인증 파일을 사용
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'], // setup이 먼저 실행되도록 의존성 설정
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
