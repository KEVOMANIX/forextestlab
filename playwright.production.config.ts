import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/production",
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: process.env.PRODUCTION_BASE_URL || "https://forextestlab.com",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
