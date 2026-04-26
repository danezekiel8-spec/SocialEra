const { defineConfig } = require('@playwright/test');

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4100';

module.exports = defineConfig({
  testDir: './tests/smoke',
  testMatch: '**/*.spec.js',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
