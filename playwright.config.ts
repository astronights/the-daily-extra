import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// Optional: point at an already-installed Chromium instead of Playwright's own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    // Mobile first: the phone run is the main one.
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
  ],
  webServer: {
    // CI builds in an earlier step; locally build first.
    command: process.env.CI ? `npm run start -- -p ${PORT}` : `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/colours`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: "",
      PGLITE_DIR: "memory://",
      ADMIN_PASSWORD: "test-admin",
      SESSION_SECRET: "test-secret",
    },
  },
});
