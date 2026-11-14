import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/#/command-center");
  await expect(page.getByText("Replay · as of 12 Aug 2012")).toBeVisible();
  return errors;
}

test("the advisor button says it is a work in progress", async ({ page }) => {
  await open(page);
  const button = page.getByRole("button", { name: "Ask the advisor" });
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Ask the advisor" });
  await expect(dialog.getByText("Work in progress")).toBeVisible();
  await expect(dialog.getByText("The AI advisor isn't built yet.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
});
