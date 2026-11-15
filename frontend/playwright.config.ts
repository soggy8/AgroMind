import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests for the Simulator UI.
 * Start the API and `npm run dev` first (see docs/modules/simulator.md section 1), then `npm run e2e`.
 * E2E_BASE_URL overrides the dev server address.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  // Every dashboard renders WebGL (the globe) in software here; give assertions room and keep parallel load moderate.
  expect: { timeout: 10_000 },
  workers: 3,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    // The Command Center and Farm profile tours start on a first desktop visit; tests of other features start with
    // them already seen (their own tests clear this). The Simulator's tour tests handle it themselves.
    storageState: {
      cookies: [],
      origins: [{
        origin: process.env.E2E_BASE_URL ?? "http://localhost:5173",
        localStorage: [
          { name: "agromind.tour.command-center-v1", value: "done" },
          { name: "agromind.tour.farm-profile-v1", value: "done" },
          { name: "agromind.tour.overview-v1", value: "done" },
        ],
      }],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
