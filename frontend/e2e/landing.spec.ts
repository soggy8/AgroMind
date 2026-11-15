import { expect, test } from "@playwright/test";

// The globe holds still under reduced motion; spinning it in software WebGL slows the whole run.
test.use({ reducedMotion: "reduce" });

test("landing page shows the demo finding and opens the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Understand your farm");
  // The finding comes live from the CropDoctor API, not from copy on the page.
  await expect(page.getByRole("region", { name: "Example finding from the demo farm" })).toContainText("West Field");
  await expect(page.getByText("Not an official NASA product")).toBeVisible();
  await page.getByRole("button", { name: "Open your farm" }).first().click();
  await expect(page).toHaveURL(/#\/overview$/);
});

test("the logo in the app returns to the landing page", async ({ page }) => {
  await page.goto("/#/command-center");
  await page.getByRole("link", { name: "AgroMind home" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Understand your farm");
});

test("landing page has no horizontal scroll", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
