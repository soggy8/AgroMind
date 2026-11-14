import { expect, test, type Page } from "@playwright/test";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/#/simulator");
  await expect(page.getByRole("button", { name: "Run simulation" })).toBeVisible();
  return errors;
}

async function run(page: Page) {
  await page.getByRole("button", { name: "Run simulation" }).click();
  if (isPhone(page)) await page.getByRole("tab", { name: "Results" }).click();
  await expect(page.getByText(/Ranked (first )?for your priorities/)).toBeVisible();
}

/** The per-rotation rows of the "Change vs today's climate" section. */
const changeRows = (page: Page) =>
  page.getByRole("region", { name: /Change vs today's climate|Yield in today's climate/ }).getByRole("listitem");

async function toSetup(page: Page) {
  if (isPhone(page)) await page.getByRole("tab", { name: "Set up" }).click();
}

test("loads the demo farm and runs a hotter, drier scenario", async ({ page }) => {
  const errors = await open(page);
  for (const name of ["North Field", "Creek Field", "West Field"]) {
    await expect(page.getByRole("radio", { name: new RegExp(name) })).toBeVisible();
  }
  await page.getByRole("button", { name: "Hotter and drier" }).click();
  await run(page);

  const results = isPhone(page) ? page.getByRole("region", { name: "Simulation" }) : page.getByRole("complementary", { name: "Simulation results" });
  await expect(results.getByText("Change vs today's climate")).toBeVisible();
  // Every rotation loses yield in a hotter, drier scenario, and the other heat response is shown too.
  const changes = await changeRows(page).allInnerTexts();
  expect(changes.length).toBe(3);
  for (const c of changes) expect(c).toMatch(/−\d+%/);
  await expect(results.getByText(/With county history:/).first()).toBeVisible();
  await expect(results.getByText("By starting weather year")).toBeVisible();
  expect(errors).toEqual([]);
});

test("changing an input marks results stale until the next run", async ({ page }) => {
  await open(page);
  await run(page);
  await toSetup(page);
  await page.getByRole("button", { name: "Severe heat and drought" }).click();
  if (isPhone(page)) await page.getByRole("tab", { name: "Results" }).click();
  const stale = page.getByRole("button", { name: /Inputs changed since this result/ });
  await expect(stale).toBeVisible();
  await stale.click();
  await expect(stale).toBeHidden();
});

test("the heat-response setting changes the scenario result", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Hotter and drier" }).click();
  await run(page);
  const first = changeRows(page).first();
  const published = await first.innerText();
  await toSetup(page);
  await page.getByRole("tab", { name: "This county" }).click();
  await run(page);
  await expect(first).not.toHaveText(published);
  await expect(first).toContainText("With US research:");
});

test("saves, lists and deletes a run", async ({ page }) => {
  await open(page);
  await run(page);
  await page.getByRole("tab", { name: "Saved" }).click();
  const name = `E2E run ${Date.now()}`;
  await page.getByLabel("Name for this run").fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(page.getByText(name)).toBeHidden();
});

test("adds a fourth rotation with winter wheat", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Add rotation" }).click();
  await expect(page.getByText("Maize → Soybean → Winter wheat", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add rotation" })).toBeHidden(); // four is the maximum
  await run(page);
  await expect(changeRows(page)).toHaveCount(4);
});

test("phone layout has no horizontal scroll", async ({ page }) => {
  test.skip(!isPhone(page), "phone only");
  await open(page);
  await run(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
