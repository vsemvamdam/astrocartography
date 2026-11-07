const { defineConfig, devices } = require('@playwright/test');
const path = require('path');
module.exports = defineConfig({
  testDir: __dirname, timeout: 180000, workers: 2,
  reporter: [['list'], ['json', { outputFile: path.join(__dirname, 'results.json') }]],
  outputDir: path.join(__dirname, 'test-results'),
  use: { baseURL: process.env.LIVE_URL || 'https://vsemvamdam.github.io/astrocartography/', locale: 'ru-RU', timezoneId: 'Europe/Moscow', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'desktop', use: { viewport: { width: 1366, height: 900 } } }, { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } }],
});
