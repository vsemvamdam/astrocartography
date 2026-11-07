// Run from qa/: npx playwright test -c e2e/playwright.config.js
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');
// QA_SITE: the folder to serve (default: this checkout); QA_PORT: its port
const PORT = +(process.env.QA_PORT || 8765);
const SITE = process.env.QA_SITE || path.join(__dirname, '..', '..');
module.exports = defineConfig({
  testDir: __dirname,
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: path.join(__dirname, 'results.json') }]],
  outputDir: path.join(__dirname, 'test-results'),
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    geolocation: { latitude: 55.7558, longitude: 37.6173 },
    permissions: ['geolocation'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory ${SITE}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true,
  },
});
