import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config.
 *
 * Prerequisites (see README): build the app, create + seed the database, then
 * run `npm start`. This config will reuse an already-running dev/prod server on
 * port 3000, or start `npm run start` for you.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
