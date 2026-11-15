import { expect, type Page, type Route, test } from "@playwright/test";

// The assistant (docs/modules/assistant.md). Its chat endpoint is mocked with scripted events, so these tests check
// the browser side (applying actions, the trace, Undo, confirm cards) without spending the free LLM quota.
test.use({ reducedMotion: "reduce" });

async function quietTours(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const t of ["simulator-v1", "command-center-v1", "farm-profile-v1"]) localStorage.setItem(`agromind.tour.${t}`, "done");
    } catch { /* storage off */ }
  });
}

/** Answer every assistant request with these events (one JSON object per line), and record the requests. */
async function script(page: Page, events: object[]) {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/farms/*/assistant/chat", async (route: Route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" });
  });
  return requests;
}

async function ask(page: Page, question: string) {
  const panel = page.getByRole("region", { name: "AgroMind assistant" });
  await panel.getByLabel("Ask the assistant").fill(question);
  await panel.getByRole("button", { name: "Send" }).click();
  return panel;
}

test("opens from the top bar and with Ctrl+K, and Escape minimises it", async ({ page }) => {
  await quietTours(page);
  await page.goto("/#/simulator");
  await expect(page.getByRole("button", { name: "Run simulation" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("banner").getByRole("button", { name: "Ask the advisor" }).click();
  const panel = page.getByRole("region", { name: "AgroMind assistant" });
  await expect(panel.getByRole("button", { name: /Show me what happened on this farm/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await page.keyboard.press("Control+k");
  await expect(panel.getByLabel("Ask the assistant")).toBeFocused();
});

test("drives the Command Center to a date, cites facts, and Undo puts things back", async ({ page }) => {
  await quietTours(page);
  const requests = await script(page, [
    { type: "status", text: "Opening the Command Center at 31 Mar 2016" },
    { type: "action", action: { type: "navigate", page: "command-center" } },
    { type: "action", action: { type: "set_date", date: "2016-03-31" } },
    { type: "facts", start: 1, facts: ["OBSERVED Rainfall, 30 days: 50 mm; normal 44 mm. Source: NASA POWER daily (MERRA-2)."] },
    { type: "action", action: { type: "highlight_fields", field_ids: ["west"] } },
    { type: "answer", text: "March 2016 was a little wetter than normal [1].", cited_facts: [1], grounded: true, model: "test" },
  ]);
  await page.goto("/#/simulator");
  await expect(page.getByRole("button", { name: "Run simulation" })).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Control+k");
  const panel = await ask(page, "show me march 2016");

  await expect(page).toHaveURL(/#\/command-center$/);
  await expect(panel.getByText("Opened Command Center")).toBeVisible();
  await expect(panel.getByText("Date", { exact: true })).toBeVisible();
  await expect(panel.getByText("31 Mar 2016", { exact: true })).toBeVisible();
  await expect(panel.getByText("March 2016 was a little wetter than normal")).toBeVisible();
  // The browser told the assistant where the farmer was.
  expect((requests[0].page as { page: string }).page).toBe("simulator");

  await panel.getByRole("button", { name: "Fact 1" }).click();
  await expect(panel.getByRole("note")).toContainText("NASA POWER");

  await panel.getByRole("button", { name: "Undo these changes" }).click();
  await expect(page).toHaveURL(/#\/simulator$/);
  await expect(panel.getByText("Changes undone.")).toBeVisible();
});

test("sets the Simulator's inputs, shows each change, and runs it", async ({ page, request, isMobile }) => {
  await quietTours(page);
  const options = await (await request.get("/api/farms/demo/simulations/options")).json();
  const sim = {
    field_id: "west", rotations: options.suggested_rotations, include_economics: true,
    scenario: { ...options.scenario_presets[0].scenario, temp_delta_c: 2, rain_change_pct: -20, irrigation: "full", projection: null },
  };
  await script(page, [
    { type: "status", text: "Running the simulation: West Field, +2 °C, rain -20%, irrigation full" },
    { type: "action", action: { type: "navigate", page: "simulator" } },
    { type: "action", action: { type: "set_simulation", request: sim } },
    { type: "action", action: { type: "run_simulation" } },
    { type: "answer", text: "Done.", cited_facts: [], grounded: false, model: "test" },
  ]);
  await page.goto("/#/simulator");
  await expect(page.getByRole("button", { name: "Run simulation" })).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Control+k");
  const ran = page.waitForResponse((r) => r.url().includes("/simulations/run") && r.request().method() === "POST");
  const panel = await ask(page, "west field, 2 degrees hotter, 20% less rain, full irrigation");

  for (const label of ["Field", "Temperature", "Rainfall", "Irrigation", "Ran the simulation"]) {
    await expect(panel.getByText(label, { exact: true })).toBeVisible();
  }
  if (!isMobile) {
    // Phones switch to the results sheet after a run; on desktop the set-up panel shows the new inputs.
    await expect(page.getByRole("radio", { name: /West Field/ })).toBeChecked();
    await expect(page.getByLabel("Temperature")).toHaveValue("2");
  }
  await expect(panel.getByText(/doesn't cite AgroMind's facts/)).toBeVisible(); // ungrounded answers are flagged
  // The run happened against the real API, with the inputs the assistant set.
  const run = await ran;
  expect(run.status()).toBe(200);
  expect(run.request().postDataJSON()).toMatchObject({ field_id: "west", scenario: { temp_delta_c: 2, rain_change_pct: -20, irrigation: "full" } });
});

test("farm changes wait on a confirm card, and Dismiss saves nothing", async ({ page }) => {
  await quietTours(page);
  await script(page, [
    { type: "status", text: "Preparing a change for you to confirm" },
    { type: "action", action: { type: "navigate", page: "farm-profile" } },
    { type: "action", action: { type: "propose_change", id: "p1", title: "Change West Field",
      change: { kind: "update_field", field_id: "west", current_crop_id: "soybean" }, summary: ["Current crop: Oats → Soybean"] } },
    { type: "answer", text: "Check and confirm the change.", cited_facts: [], grounded: false, model: "test" },
  ]);
  let writes = 0;
  await page.route("**/api/farms/demo/fields/**", (route) => {
    if (route.request().method() !== "GET") writes++;
    return route.continue();
  });
  await page.goto("/#/command-center");
  await expect(page.getByText("Replay · as of 12 Aug 2012").first()).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Control+k");
  const panel = await ask(page, "west field is soybean now");
  await expect(page).toHaveURL(/#\/farm-profile$/);
  await expect(panel.getByText("Current crop: Oats → Soybean")).toBeVisible();
  await expect(panel.getByText("Not saved yet.")).toBeVisible();
  await panel.getByRole("button", { name: "Dismiss" }).click();
  await expect(panel.getByText("Dismissed. Nothing changed.")).toBeVisible();
  expect(writes).toBe(0);
});

test("a report opens as a printable page with its sources", async ({ page }) => {
  await quietTours(page);
  await script(page, [
    { type: "action", action: { type: "open_report", title: "West Field summary" } },
    { type: "facts", start: 1, facts: ["MODELLED, rank 1: Maize → Soybean → Oats. Yield 86% of typical."] },
    { type: "answer", text: "**Result**\n\n- The best rotation keeps 86% of typical yield [1].", cited_facts: [1], grounded: true, model: "test" },
  ]);
  await page.goto("/#/simulator");
  await expect(page.getByRole("button", { name: "Run simulation" })).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Control+k");
  await ask(page, "write a report for my bank");
  const report = page.getByRole("dialog", { name: "West Field summary" });
  await expect(report.getByRole("heading", { name: "West Field summary" })).toBeVisible();
  await expect(report.getByText("Sources")).toBeVisible();
  await expect(report.getByText(/rank 1: Maize → Soybean → Oats/)).toBeVisible();
  await expect(report.getByRole("button", { name: /Print or save as PDF/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(report).toBeHidden();
});

test("the Overview has a full-page chat; its conversation follows the assistant to other pages", async ({ page }) => {
  await quietTours(page);
  await script(page, [
    { type: "status", text: "Opening the Command Center at 31 Mar 2016" },
    { type: "action", action: { type: "navigate", page: "command-center" } },
    { type: "action", action: { type: "set_date", date: "2016-03-31" } },
    { type: "answer", text: "Here is March 2016.", cited_facts: [], grounded: false, model: "test" },
  ]);
  await page.goto("/#/overview");
  const chat = page.getByRole("region", { name: "Ask AgroMind" });
  await expect(chat.getByRole("heading", { name: /What should we look at/ })).toBeVisible({ timeout: 20_000 });
  // The docked console isn't shown here: the page has the big chat.
  await expect(page.getByRole("region", { name: "AgroMind assistant" })).toBeHidden();
  // The top bar's advisor button puts the cursor in this chat.
  await page.getByRole("banner").getByRole("button", { name: "Ask the advisor" }).click();
  const box = chat.getByLabel("Ask the assistant");
  await expect(box).toBeFocused();

  await box.fill("show me march 2016");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/command-center$/);
  const dock = page.getByRole("region", { name: "AgroMind assistant" });
  await expect(dock.getByText("show me march 2016")).toBeVisible();
  await expect(dock.getByText("Here is March 2016.")).toBeVisible();

  // Back to the Overview without reloading (the conversation lives in the page, not on the server).
  await page.evaluate(() => { window.location.hash = "/overview"; });
  await expect(page).toHaveURL(/#\/overview$/);
  await expect(chat.getByText("Here is March 2016.")).toBeVisible();
  await expect(chat.getByRole("button", { name: "Undo these changes" })).toBeVisible();
});
