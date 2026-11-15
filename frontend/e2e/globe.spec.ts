import { expect, type Page, test } from "@playwright/test";

// The shared farm map opens on a 3D globe for the demo farm (shared/map/GlobeView).
// Reduced motion keeps the globe still and makes "Fly to" jump, so software WebGL stays quick.
test.use({ reducedMotion: "reduce" });

const globe = (page: Page) => page.locator(".maplibregl-map");

for (const [route, name] of [["command-center", "Command Center"], ["simulator", "Simulator"], ["farm-profile", "Farm profile"]] as const) {
  test(`${name} opens on the globe for the demo farm`, async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem("agromind.tour.simulator-v1", "done"); } catch { /* storage off */ } });
    await page.goto(`/#/${route}`);
    await expect(globe(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Fly to Demo Farm", exact: true })).toBeVisible();
  });
}

test("Fly to hands over to the farm map, and zooming far out returns to the globe", async ({ page, isMobile }) => {
  await page.goto("/#/command-center");
  await page.getByRole("button", { name: "Fly to Demo Farm", exact: true }).click();
  await expect(globe(page)).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(".leaflet-container .field-chip", { hasText: "West Field" })).toBeVisible();

  test.skip(isMobile, "zoom buttons are covered by the phone layout's sheet in this check");
  const zoomOut = page.getByRole("button", { name: "Zoom out", exact: true });
  for (let i = 0; i < 12 && (await globe(page).count()) === 0; i++) {
    await zoomOut.click();
    await page.waitForTimeout(400);
  }
  await expect(globe(page)).toBeVisible({ timeout: 20_000 });
});
