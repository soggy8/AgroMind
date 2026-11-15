import { expect, test } from "@playwright/test";
import { signUp } from "./account";

// A farm made in CropTwin opens in the Command Center from the page address (?farm=<id>).
// The farm has no fields, so no weather is fetched and the test stays offline.
test("a new farm from CropTwin opens with ?farm=", async ({ page }) => {
  await signUp(page);
  const created = await page.request.post("/api/farms", { data: { name: "E2E empty farm" } });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  try {
    await page.goto(`/?farm=${id}#/command-center`);
    await expect(page.getByText("Draw your first field")).toBeVisible();
    await expect(page.getByText("E2E empty farm has no fields yet", { exact: false })).toBeVisible();
    await expect(page.getByText(/Replay · as of/)).toBeHidden();
  } finally {
    await page.request.delete(`/api/farms/${id}`);
  }
});
