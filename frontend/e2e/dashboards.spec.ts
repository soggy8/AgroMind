import { expect, type Page, test } from "@playwright/test";

// The three dashboards share one shell: top bar (farm switcher, nav, units, help, advisor), farm choice and units.
// These checks keep them in step. Reduced motion keeps the demo farm's globe still; tests fly past it when needed.
test.use({ reducedMotion: "reduce" });

const PAGES = [
  { route: "command-center", name: "Command Center", ready: (p: Page) => p.getByText("Replay · as of 12 Aug 2012").first() },
  { route: "simulator", name: "Simulator", ready: (p: Page) => p.getByRole("button", { name: "Run simulation" }) },
  { route: "farm-profile", name: "Farm profile", ready: (p: Page) => p.getByRole("button", { name: /Save farm|All changes saved/ }).first() },
] as const;

async function quietTours(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const t of ["simulator-v1", "command-center-v1", "farm-profile-v1"]) localStorage.setItem(`agromind.tour.${t}`, "done");
    } catch { /* storage off */ }
  });
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

for (const pg of PAGES) {
  test(`${pg.name}: the shared top bar, advisor and tour are all there`, async ({ page, isMobile }) => {
    await quietTours(page);
    await page.goto(`/#/${pg.route}`);
    await expect(pg.ready(page)).toBeVisible({ timeout: 20_000 });
    const bar = page.getByRole("banner");
    await expect(bar.getByRole("link", { name: "AgroMind home" })).toBeVisible();
    if (isMobile) {
      await bar.getByLabel("Menu").click();
      await expect(bar.getByRole("button", { name: /Demo Farm/ })).toBeVisible();
      await expect(bar.getByRole("tab", { name: "US", exact: true })).toBeVisible();
      await bar.getByLabel("Menu").click();
    } else {
      await expect(bar.getByLabel(/^Farm: Demo Farm/)).toBeVisible();
      await expect(bar.getByRole("tab", { name: pg.name })).toHaveAttribute("aria-selected", "true");
      await bar.getByLabel("Display settings").click();
      await expect(bar.getByRole("tab", { name: "US", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    }

    // The advisor is the assistant console (e2e/assistant.spec.ts covers it; no question asked here: the free API
    // tier is small).
    await bar.getByRole("button", { name: "Ask the advisor" }).click();
    const advisor = page.getByRole("region", { name: "AgroMind assistant" });
    await expect(advisor.getByLabel("Ask the assistant")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(advisor).toBeHidden();

    await bar.getByRole("button", { name: "Take the tour" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /Next|Done/ })).toBeVisible();
  });
}

test("Metric / US applies on every dashboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "the units switch itself is checked on phones in the Simulator suite");
  await quietTours(page);
  await page.goto("/#/command-center");
  await expect(PAGES[0].ready(page)).toBeVisible({ timeout: 20_000 });
  await setUnits(page, "US");
  await expect(page.getByRole("complementary", { name: "Fields" }).getByText(/\d ac$/).first()).toBeVisible();
  await page.getByRole("banner").getByRole("tab", { name: "Farm profile" }).click();
  await expect(page.getByRole("radiogroup", { name: "Field to edit" }).getByText(/\d ac$/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("banner").getByRole("tab", { name: "Simulator" }).click();
  await expect(page.getByRole("radiogroup", { name: "Field to simulate" }).getByText(/\d ac$/).first()).toBeVisible({ timeout: 20_000 });
  await setUnits(page, "Metric");
});

test("the farm chosen in the top bar is the farm every dashboard shows", async ({ page, isMobile }) => {
  test.skip(isMobile, "the phone menu lists the same farms; this checks the switch once");
  await quietTours(page);
  const name = `E2E farm ${Date.now()}`;
  const made = await page.request.post("/api/farms", { data: { name, region: "Test county" } });
  expect(made.ok()).toBeTruthy();
  const id = (await made.json()).id as string;
  try {
    await page.goto("/#/command-center");
    await expect(PAGES[0].ready(page)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("banner").getByLabel(/^Farm: Demo Farm/).click();
    await page.getByRole("button", { name: new RegExp(name) }).click();
    // A farm with no fields yet: each dashboard says so and points to the farm profile.
    await expect(page.getByRole("banner").getByLabel(new RegExp(`^Farm: ${name}`))).toBeVisible();
    await expect(page.getByText(/has no fields yet/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("banner").getByRole("tab", { name: "Simulator" }).click();
    await expect(page.getByRole("banner").getByLabel(new RegExp(`^Farm: ${name}`))).toBeVisible();
    await expect(page.getByText(/has no fields yet/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("banner").getByRole("tab", { name: "Farm profile" }).click();
    await expect(page.locator("#farm-picker")).toHaveValue(id, { timeout: 20_000 });
  } finally {
    await page.request.delete(`/api/farms/${id}`);
    await page.evaluate(() => { try { localStorage.removeItem("agromind.croptwin.farm"); } catch { /* fine */ } });
  }
});
