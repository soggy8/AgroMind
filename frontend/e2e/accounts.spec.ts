import { expect, test } from "@playwright/test";
import { signUp } from "./account";

// Accounts: visitors can look around the read-only demo farm; an account is needed for a farm of your own, and
// your farms are private.

test("visitors see the demo farm read-only, and creating an account opens a new farm", async ({ page, isMobile }) => {
  await page.goto("/#/farm-profile");
  if (isMobile) await page.getByRole("tab", { name: "Farm & fields" }).click();
  await expect(page.getByText("Demo farm, read-only")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Draw a field" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save farm" })).toHaveCount(0);
  await expect(page.locator("#farm-name")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete farm" })).toHaveCount(0);

  await page.getByRole("note", { name: "Read-only demo farm" }).getByRole("button", { name: "Create an account" }).click();
  const dialog = page.getByRole("dialog", { name: "Create your account" });
  await dialog.getByLabel("Email").fill(`e2e-ui-${Date.now()}@example.com`);
  await dialog.getByLabel("Password").fill("short");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog.getByRole("alert")).toContainText("at least 8 characters");
  await dialog.getByLabel("Password").fill("a good long password");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog).toBeHidden();
  // Straight on to the farm they came for.
  await expect(page.getByRole("button", { name: "Create farm" })).toBeVisible();
});

test("sign in and out from the top bar", async ({ page, isMobile }) => {
  test.skip(isMobile, "the phone menu has the same account row");
  const email = await signUp(page);
  await page.request.post("/api/auth/logout");
  await page.goto("/#/overview");
  const bar = page.getByRole("banner");
  await bar.getByRole("button", { name: "Sign in" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign in to AgroMind" });
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill("wrong password");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog.getByRole("alert")).toContainText("don't match");
  await dialog.getByLabel("Password").fill("e2e password");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog).toBeHidden();
  await bar.getByLabel(`Account: ${email}`).click();
  await bar.getByRole("button", { name: "Sign out" }).click();
  await expect(bar.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("your farms are private to your account", async ({ page, browser }) => {
  await signUp(page);
  const name = `E2E private ${Date.now()}`;
  const id = (await (await page.request.post("/api/farms", { data: { name } })).json()).id as string;
  try {
    const mine = (await (await page.request.get("/api/farms")).json()) as { id: string }[];
    expect(mine.map((f) => f.id)).toContain(id);
    const other = await browser.newContext();
    const stranger = await other.newPage();
    const theirs = (await (await stranger.request.get("/api/farms")).json()) as { id: string }[];
    expect(theirs.map((f) => f.id)).not.toContain(id);
    expect((await stranger.request.get(`/api/farms/${id}`)).status()).toBe(404);
    await other.close();
  } finally {
    await page.request.delete(`/api/farms/${id}`);
  }
});
