import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.AEDES_WEB_ORIGIN ?? "http://127.0.0.1:3000",
    headless: true,
    screenshot: "only-on-failure",
    launchOptions: process.env.AEDES_BROWSER_EXECUTABLE
      ? { executablePath: process.env.AEDES_BROWSER_EXECUTABLE }
      : {},
  },
});
