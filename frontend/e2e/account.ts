import { expect, type Page } from "@playwright/test";

/**
 * Accounts for tests. The demo farm is read-only, so a test that changes data signs up first (a fresh account each
 * time) and works on a farm of its own. `page.request` shares the page's cookies, so the page is signed in too.
 */
export async function signUp(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const r = await page.request.post("/api/auth/signup", { data: { email, password: "e2e password" } });
  expect(r.ok(), await r.text()).toBeTruthy();
  return email;
}

/** Sign up, then make a farm with a copy of the demo farm's first field (same weather cell, so it runs offline). */
export async function ownFarmLikeDemo(page: Page, name = `E2E own farm ${Date.now()}`): Promise<string> {
  await signUp(page);
  const demo = await (await page.request.get("/api/farms/demo")).json();
  const made = await page.request.post("/api/farms", { data: { name, region: demo.region } });
  expect(made.ok(), await made.text()).toBeTruthy();
  const id = (await made.json()).id as string;
  const f = demo.fields[0];
  const field = await page.request.post(`/api/farms/${id}/fields`,
    { data: { name: f.name, boundary: f.boundary, current_crop_id: f.current_crop_id, soil_texture: "silty_clay_loam" } });
  expect(field.ok(), await field.text()).toBeTruthy();
  return id;
}
