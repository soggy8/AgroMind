import { expect, test, type Page } from "@playwright/test";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/#/command-center");
  await expect(page.getByText("Replay · as of 12 Aug 2012")).toBeVisible();
  return errors;
}

test("opens on the 2012 replay with a cautious finding on West Field", async ({ page }) => {
  test.skip(isPhone(page), "desktop; Task 6 covers the phone");
  const errors = await open(page);
  const finding = page.getByRole("region", { name: "Finding" });
  await expect(finding.getByText("Possible water stress")).toBeVisible();
  await expect(finding.getByText("Watch", { exact: true })).toBeVisible();
  await expect(finding.getByText("West Field · since 11 Jul 2012")).toBeVisible();
  await expect(finding.getByText("Water stress may be one explanation.")).toBeVisible();
  await expect(finding.getByText("Dig to 15 cm in a few places across the field and feel whether the soil is dry.")).toBeVisible();
  await expect(finding.getByText("Satellites can't rule out pests or disease.")).toBeVisible();
  const fields = page.getByRole("complementary", { name: "Fields" });
  // Creek's crop-map points agree; West's do not (amendment 2: "Mixed" labels).
  await expect(fields.getByText(/^Corn · /)).toBeVisible();
  await expect(fields.getByText(/^Mixed: Corn and Grassland\/Pasture · /)).toBeVisible();
  await expect(fields.getByText("observed").first()).toBeVisible();
  await expect(fields.getByText("modelled").first()).toBeVisible();
  await expect(page.getByText(/^\d findings?$/)).toBeVisible();
  await expect(page.getByText("How this was worked out")).toBeVisible();
  expect(errors).toEqual([]);
});

test("an out-of-season date shows the checks as paused, and Today leaves the replay", async ({ page }) => {
  test.skip(isPhone(page), "desktop; Task 6 covers the phone");
  await open(page);
  await page.getByLabel("Show the farm as of").fill("2026-11-10");
  await expect(page.getByText("Replay · as of 10 Nov 2026")).toBeVisible();
  await expect(page.getByText("Stress checks are paused")).toBeVisible();
  await expect(page.getByRole("region", { name: "Finding" })).toBeHidden();
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText(/Replay · as of/)).toBeHidden();
});
