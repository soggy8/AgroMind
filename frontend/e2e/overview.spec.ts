import { expect, test } from "@playwright/test";
import { signUp } from "./account";

// The Overview is the app's front door: one next step, the farm on the map, and the three tools as doors.
test.use({ reducedMotion: "reduce" });

test("shows the demo farm, one next step and the three tools in order", async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/overview");
  await expect(page.getByRole("heading", { level: 1, name: "Demo Farm" })).toBeVisible({ timeout: 20_000 });
  const next = page.getByRole("region", { name: /possible water stress/i });
  await expect(next.getByText("Next step")).toBeVisible();
  await expect(next.getByText(/Suggested check: Dig to 15 cm/)).toBeVisible();
  const steps = page.getByRole("region", { name: "Your three tools" }).locator(":scope > ol > li");
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText("Step 1 · Farm profile");
  await expect(steps.nth(0)).toContainText("Fields drawn");
  await expect(steps.nth(1)).toContainText("Step 2 · Command Center");
  await expect(steps.nth(1)).toContainText("West Field");
  await expect(steps.nth(2)).toContainText("Step 3 · Simulator");
  if (!isMobile) await expect(page.getByRole("banner").getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

test("the next step and each door open the right dashboard", async ({ page }) => {
  await page.goto("/#/overview");
  await page.getByRole("button", { name: /See why in the Command Center/ }).click();
  await expect(page).toHaveURL(/#\/command-center$/);
  for (const [button, route] of [["Open farm profile", "farm-profile"], ["Open Command Center", "command-center"], ["Open the Simulator", "simulator"]] as const) {
    await page.goto("/#/overview");
    await page.getByRole("region", { name: "Your three tools" }).getByRole("button", { name: button }).click();
    await expect(page).toHaveURL(new RegExp(`#/${route}$`));
  }
});

test("a farm with no fields is told to draw one first", async ({ page }) => {
  await signUp(page);
  const made = await page.request.post("/api/farms", { data: { name: `E2E empty ${Date.now()}` } });
  const id = (await made.json()).id as string;
  try {
    await page.goto(`/?farm=${id}#/overview`);
    await expect(page.getByRole("region", { name: "Draw your first field" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Open farm profile" }).first().click();
    await expect(page).toHaveURL(/#\/farm-profile$/);
  } finally {
    await page.request.delete(`/api/farms/${id}`);
    await page.evaluate(() => { try { localStorage.removeItem("agromind.croptwin.farm"); } catch { /* fine */ } });
  }
});

test("phone layout has no horizontal scroll", async ({ page }) => {
  await page.goto("/#/overview");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
