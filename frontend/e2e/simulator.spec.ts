import { expect, test, type Page } from "@playwright/test";
import { ownFarmLikeDemo } from "./account";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

async function open(page: Page, { tour = false, farm }: { tour?: boolean; farm?: string } = {}) {
  if (!tour) await page.addInitScript(() => localStorage.setItem("agromind.tour.simulator-v1", "done"));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(farm ? `/?farm=${farm}#/simulator` : "/#/simulator");
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

/** Units sit in the top bar: inline on very wide screens, behind "Display settings" or the phone menu otherwise. */
async function setUnits(page: Page, label: "US" | "Metric") {
  const bar = page.getByRole("banner");
  const tab = bar.getByRole("tab", { name: label, exact: true });
  if (!(await tab.isVisible())) {
    const settings = bar.getByLabel("Display settings");
    await ((await settings.isVisible()) ? settings : bar.getByLabel("Menu")).click();
  }
  await tab.click();
  await page.keyboard.press("Escape");
}

// The demo farm is read-only, so saving runs is tested on a farm of the test's own account (e2e/account.ts). Those
// farms live in the shared dev database: each is deleted afterwards, with its runs, even if the test fails midway.
const farms: string[] = [];
test.afterEach(async ({ page }) => {
  for (const id of farms) await page.request.delete(`/api/farms/${id}`);
  farms.length = 0;
});

async function openOwnFarm(page: Page) {
  const id = await ownFarmLikeDemo(page);
  farms.push(id);
  return open(page, { farm: id });
}

test("the demo farm runs but doesn't save: it asks for an account", async ({ page }) => {
  await open(page);
  await run(page);
  await page.getByRole("tab", { name: "Saved" }).click();
  await expect(page.getByText("The demo farm is read-only")).toBeVisible();
  await expect(page.getByLabel("Name for this run")).toHaveCount(0);
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByRole("dialog", { name: "Create your account" })).toBeVisible();
});

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
  await openOwnFarm(page);
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

test("first visit on desktop shows the tour, and it can be finished", async ({ page }) => {
  test.skip(isPhone(page), "the tour starts by itself on large screens only");
  await open(page, { tour: true });
  const dialog = page.getByRole("dialog", { name: "Pick a field" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("NASA projection scenario runs and is named in the result", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: "NASA projection" }).click();
  await page.getByRole("tab", { name: "High emissions" }).click();
  await page.getByRole("tab", { name: /2080s/ }).click();
  await expect(page.getByText("Median of 6 climate models", { exact: false })).toBeVisible();
  await run(page);
  await page.getByRole("tab", { name: "Sources" }).click();
  await expect(page.getByText("Climate projection", { exact: true })).toBeVisible();
});

test("replay tab shows the driest year by default", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Hotter and drier" }).click();
  await run(page);
  await page.getByRole("tab", { name: "Replay" }).click();
  await expect(page.getByLabel("Start in")).toHaveValue("2012");
  await page.getByLabel("Start in").selectOption("2020");
  await expect(page.getByTitle(/harvested in 2020's weather/).first()).toBeVisible();
});

test("rotation finder suggests rotations and adds one", async ({ page }) => {
  await open(page);
  await toSetup(page);
  await page.getByRole("button", { name: "Remove Continuous maize" }).click();
  await page.getByRole("button", { name: "Suggest the best rotations" }).click();
  const drawer = page.getByRole("dialog", { name: "Suggest the best rotations" });
  await expect(drawer.getByText(/rotations tested/)).toBeVisible({ timeout: 30_000 });
  await drawer.getByRole("button", { name: "Add" }).first().click();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: /^Remove .* from / }).first()).toBeVisible();
});

test("irrigation planner explains what water can and can't fix", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Irrigation planner" }).click();
  const drawer = page.getByRole("dialog", { name: "Irrigation planner" });
  await expect(drawer.getByText("Yield by irrigation cap")).toBeVisible({ timeout: 30_000 });
  await expect(drawer.getByRole("row")).toHaveCount(10); // header + nine irrigation levels
});

test("US units convert areas and water", async ({ page }) => {
  await open(page);
  await setUnits(page, "US");
  await expect(page.getByRole("radio", { name: /North Field/ })).toContainText(" ac");
  await run(page);
  await expect(page.getByText(" in", { exact: false }).first()).toBeVisible();
});

test("saved runs can be compared side by side", async ({ page }) => {
  await openOwnFarm(page);
  await run(page);
  await page.getByRole("tab", { name: "Saved" }).click();
  const a = `E2E A ${Date.now()}`;
  const b = `E2E B ${Date.now()}`;
  for (const name of [a, b]) {
    await page.getByLabel("Name for this run").fill(name);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(name)).toBeVisible();
  }
  await page.getByLabel(`Select ${a} to compare`).check();
  await page.getByLabel(`Select ${b} to compare`).check();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Compare saved runs" }).getByText("Rotation by rotation")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  for (const name of [a, b]) await page.getByRole("button", { name: `Delete ${name}` }).click();
});
