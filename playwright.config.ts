import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the First Milestone.
 * Run against a local or preview deployment connected to a TEST database:
 *
 *   E2E_BASE_URL=http://localhost:3000 E2E_PIN=<test pin> npm run test:e2e
 *
 * The PIN is read from the environment and never committed.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
    timezoneId: "America/New_York",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
      },
    },
  ],
});
