import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/economics");
  await expect(page.getByRole("region", { name: "The climate bill" })).toBeVisible({ timeout: 60_000 });
  return errors;
}

test("farm money opens with a report on the defaults, every block labelled", async ({ page }) => {
  const errors = await open(page);
  const bill = page.getByRole("region", { name: "The climate bill" });
  await expect(bill.getByText(/^modelled$/i)).toBeVisible();
  await expect(bill.getByText(/than in today's climate|the same as in today's climate/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Bad-year money" }).getByText("Seasons that lose money")).toBeVisible();
  const grid = page.getByRole("region", { name: "Who earns most?" });
  await expect(grid.getByRole("row")).toHaveCount(6); // header + 5 warming levels
  await expect(page.getByText(/not forecasts/).first()).toBeVisible();
  // Never a page-wide sideways scroll, phone included.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(errors).toEqual([]);
});

test("your own numbers are used and labelled as yours", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: "I own it" }).click();
  await page.getByRole("textbox", { name: "Maize price" }).fill("200");
  await page.getByRole("button", { name: "Work out the money" }).click();
  const used = page.getByRole("region", { name: "The numbers used" });
  await expect(used.getByText("own land")).toBeVisible();
  await expect(used.getByText("Your number", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/what's left to pay for the land/)).toBeVisible();
});
