import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests for the Simulator UI.
 * Start the API and `npm run dev` first (see docs/modules/simulator.md section 1), then `npm run e2e`.
 * E2E_BASE_URL overrides the dev server address.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
