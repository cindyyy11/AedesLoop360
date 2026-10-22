import { expect, test } from "@playwright/test";

// Opt in only against an isolated migrated/seeded database with its worker running.
test("3D view reads persisted approved mission events and saved allocation", async ({ page }, testInfo) => {
  test.skip(process.env.AEDES_LIVE_3D_TEST !== "1", "Requires isolated seeded API and worker; see docs/3D_TOWNSHIP.md");
  const api = page.context().request;
  const login = async (role: string) => {
    const response = await api.post("/api/v1/auth/login", { data: { username: role, password: `demo-${role}-360` } });
    expect(response.ok()).toBeTruthy();
  };
  // Exercise real browser Origin validation, not only API-client authentication.
  await page.goto("/township");
  await page.getByRole("button", { name: "Enter demo", exact: true }).click();
  await expect(page.locator(".topbar .badge")).toHaveText("coordinator", { timeout: 15000 });
  const created = await api.post("/api/v1/drones/missions", { data: { block_id: "block-1", target_ids: ["finding-dry", "finding-mock", "finding-occluded"], mode: "SIMULATED" } });
  expect(created.ok()).toBeTruthy();
  const mission = (await created.json()).data;
  expect((await api.post(`/api/v1/drones/missions/${mission.id}/review`)).ok()).toBeTruthy();
  expect((await api.post(`/api/v1/drones/missions/${mission.id}/decision`, { data: { decision: "APPROVE", reason: "Isolated 3D browser validation of fixture replay", checked_items: ["SIMULATED_MODE", "AUTHORIZED_TEST_ZONE", "NO_CHEMICAL_PAYLOAD"] } })).ok()).toBeTruthy();
  const plan = await api.post("/api/v1/planning/runs", { data: { budget: { staff_hours: 12, drone_survey_hours: 2 }, window_start: "2026-10-16T00:00:00Z", window_end: "2026-10-23T00:00:00Z" } });
  expect(plan.ok()).toBeTruthy();
  const planId = (await plan.json()).data.id;
  await api.post("/api/v1/auth/logout");
  await login("operator");
  const simulation = await api.post(`/api/v1/drones/missions/${mission.id}/simulate`, { headers: { "Idempotency-Key": `3d-live-${mission.id}` } });
  expect(simulation.ok()).toBeTruthy();
  await expect.poll(async () => {
    const response = await api.get(`/api/v1/drones/missions/${mission.id}/events`);
    return (await response.json()).data.map((e: { kind: string }) => e.kind);
  }, { timeout: 25000 }).toContain("MISSION_COMPLETED");
  const writes: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/") && request.method() !== "GET") writes.push(request.url()); });
  await page.goto("/township");
  const experience = page.getByRole("region", { name: "3D township walkthrough" });
  await expect(experience).toBeVisible({ timeout: 15000 });
  await page.getByRole("combobox", { name: "Mission", exact: true }).selectOption(mission.id);
  const eventSelect = page.getByRole("combobox", { name: "Recorded event", exact: true });
  await expect(eventSelect).toContainText("SKIPPED");
  await expect(eventSelect).toContainText("MOCK ACTION RECORDED");
  await expect(eventSelect).toContainText("GROUND REVIEW");
  await eventSelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Inspect event asset", exact: true }).click();
  await expect(experience.getByRole("link", { name: "Open asset evidence" })).toHaveAttribute("href", "/assets/asset-p02");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await experience.screenshot({ path: testInfo.outputPath("township-live-desktop.png") });
  await page.getByRole("button", { name: "Keep monitoring visible" }).click();
  await page.getByLabel("Inspect a block, asset or trap").selectOption("block-4");
  await expect(experience.locator(".township-evidence")).toContainText("DATA UNAVAILABLE");
  await page.getByRole("button", { name: "Explain the next decision" }).click();
  await expect(experience).toContainText(planId);
  await expect(experience.locator(".township-evidence")).toContainText("Saved priority:");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await experience.screenshot({ path: testInfo.outputPath("township-live-mobile.png") });
  expect(writes).toEqual([]);
});
