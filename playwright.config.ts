import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const productionServer = process.env.PLAYWRIGHT_WEB_SERVER === "production";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    headless: true,
    launchOptions: existsSync(chromePath) ? { executablePath: chromePath } : undefined,
    screenshot: "only-on-failure",
    video: "off",
    trace: "retain-on-failure"
  },
  webServer: {
    command: productionServer ? "npm run start -- --port 3100" : "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 60_000
  }
});
