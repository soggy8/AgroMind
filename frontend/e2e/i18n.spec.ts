import { expect, type Page, test } from "@playwright/test";

// English / Macedonian (frontend/src/shared/i18n, backend/app/shared/i18n.py). Switching reloads the page so every
// text, including what the backend writes, comes back in the new language.
test.use({ reducedMotion: "reduce" });

async function quietTours(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const t of ["simulator-v1", "command-center-v1", "farm-profile-v1", "overview-v1"]) localStorage.setItem(`agromind.tour.${t}`, "done");
    } catch { /* storage off */ }
  });
}

test("the switch turns the whole site Macedonian, including the backend's sentences and dates", async ({ page, isMobile }) => {
  await quietTours(page);
  await page.goto("/#/command-center");
  await expect(page.getByText("Replay · as of 12 Aug 2012").first()).toBeVisible({ timeout: 20_000 });

  const bar = page.getByRole("banner");
  // The language sits with the units: in the phone menu, or behind the language-and-units button on desktop.
  const pick = async (code: string, opener: RegExp) => {
    await bar.getByLabel(opener).click();
    await bar.getByRole("tab", { name: code }).click();
  };
  await pick("МК", isMobile ? /^Menu$/ : /^Display settings$/);

  // After the reload: the page, the backend's finding and the dates are Macedonian.
  await expect(page.getByText("Повторување · состојба на 12 авг 2012").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("html")).toHaveAttribute("lang", "mk");
  await expect(page.getByText("Можен недостиг на вода").first()).toBeVisible();
  if (!isMobile) await expect(bar.getByRole("tab", { name: "Команден центар" })).toBeVisible();
  await expect(page.getByText("Possible water stress")).toHaveCount(0);

  // The choice is remembered; English comes back the same way.
  await page.reload();
  await expect(page.getByText("Можен недостиг на вода").first()).toBeVisible({ timeout: 20_000 });
  await pick("EN", isMobile ? /^Мени$/ : /^Поставки за приказ$/);
  await expect(page.getByText("Possible water stress").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("?lang=mk opens the site in Macedonian, landing page included", async ({ page }) => {
  await quietTours(page);
  await page.goto("/?lang=mk#/");
  await expect(page.getByRole("heading", { name: /Запознајте ја вашата фарма/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Отвори ја апликацијата" })).toBeVisible();
});

test("the Simulator's results and assistant console read in Macedonian", async ({ page }) => {
  await quietTours(page);
  await page.goto("/?lang=mk#/simulator");
  await page.getByRole("button", { name: "Пушти симулација" }).click({ timeout: 20_000 });
  // The recommendation comes from the backend, translated: a rotation name and "fits your priorities".
  await expect(page.getByText(/најдобро одговара на вашите приоритети|Премногу изедначено/).first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Control+k");
  const panel = page.getByRole("region", { name: "Асистент AgroMind" });
  await expect(panel.getByLabel("Прашајте го асистентот")).toBeFocused();
});
