import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
export default defineConfig({
  testDir: './tests/browser', testMatch: ['appointment-assistant.spec.ts', 'appointment-assistant-lifecycle.spec.ts'],
  workers: 1, retries: 0, timeout: 30_000,
  outputDir: 'test-results/assistant-component',
  use: {
    baseURL: 'http://127.0.0.1:3117', browserName: 'chromium', headless: true,
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    trace: 'off', screenshot: 'off', video: 'off'
  },
  webServer: {
    command: 'node tests/assistant-browser/server.mjs', url: 'http://127.0.0.1:3117',
    reuseExistingServer: false, timeout: 60_000
  }
});
