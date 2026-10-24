import { expect, test, type Page } from "@playwright/test";

// Explicit browser-test fixtures, not model results or production data.
const stamp = "2026-10-23T00:00:00Z";
const assets = [1, 2, 3].map(n => ({ id: `asset-p0${n}`, block_id: "block-1", name: `P-0${n} / planter`, x: 10 + n, y: 20, accessible: true, permission: true, mode: "SIMULATED", tenant_id: "t", created_at: stamp }));
const states = ["DRY", "VISIBLE_WATER", "OCCLUDED"];
const findings = states.map((water_state, i) => ({
  id: `finding-${i + 1}`, asset_id: assets[i].id, media_id: "media-aerial-001", water_state, object_class: "planter", bbox: [0.1, 0.2, 0.2, 0.3],
  confidence: null, model_version: "DEMO_PREANNOTATED_V1", reason: `Fixture ${water_state}`, review_status: "UNREVIEWED", reviewed_by: null, reviewed_at: null, review_note: null,
  eligibility: "GROUND_REVIEW", mode: "SIMULATED", tenant_id: "t", created_at: stamp,
}));
const kinds = ["SKIPPED", "MOCK_ACTION_RECORDED", "GROUND_REVIEW"];
const events = kinds.map((kind, i) => ({ id: `event-${i}`, mission_id: "mission-demo-001", event_key: `step:${i}`, kind, mode: "SIMULATED", tenant_id: "t", created_at: `2026-10-23T00:0${i}:00Z`, payload: { asset_id: assets[i].id, reason: `Fixture ${kind}` } }));
const mission = (id: string, status: string) => ({ id, block_id: "block-1", status, target_ids: findings.map(f => f.id), policy_version: "demo-policy-v1", approved_by: null, approved_at: null, approval_expires_at: null, mode: "SIMULATED", tenant_id: "t", created_at: stamp });

async function mockApi(page: Page, role = "operator") {
  const writes: string[] = [];
  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    if (request.method() !== "GET") writes.push(`${request.method()} ${request.url()}`);
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const responses: Record<string, unknown> = {
      "/auth/me": { id: role, role, tenant_id: "t" },
      "/drones/missions": { data: [mission("mission-demo-001", "COMPLETED"), mission("mission-draft", "DRAFT")] },
      "/drones/missions/mission-demo-001/events": { data: events },
      "/findings": { data: findings }, "/assets": { data: assets },
    };
    await route.fulfill({ json: responses[path] ?? { data: [] } });
  });
  return writes;
}

test("3D flight rehearsal replays stored outcomes without writing anything", async ({ page }, testInfo) => {
  test.slow(); // headless software WebGL renders the larger viewport slowly while the whole flight plays
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const writes = await mockApi(page);
  await page.goto("/drone/missions");
  const sim = page.getByRole("heading", { name: "3D flight rehearsal" });
  await expect(sim).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("dronesim-canvas").locator("canvas")).toBeVisible();
  await expect(page.getByText("Mock actuator DISARMED")).toBeVisible();
  const list = page.locator(".dronesim-targets");
  await expect(list.locator("li")).toHaveCount(3);
  await expect(list).toContainText("Mock action recorded · not verified effective");
  await expect(list).toContainText("Occluded / uncertain");

  await page.locator(".dronesim-viewport").screenshot({ path: testInfo.outputPath("dronesim-orbit-start.png") });
  await page.getByRole("button", { name: "Play flight replay" }).first().click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  // Jump to the second target (visible water): the drone camera must report a candidate, never a confirmed site.
  await list.locator("li").nth(1).getByRole("button").click();
  await page.waitForTimeout(800);
  await expect(page.locator(".dronesim-hud")).toContainText("Altitude");
  await expect(list.locator("li").nth(1)).toHaveAttribute("aria-current", "step");
  await expect(page.locator(".dronesim-bbox")).toContainText("candidate container · Visible water");
  await page.screenshot({ path: testInfo.outputPath("dronesim-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Drone camera" }).click();
  await expect(page.locator(".dronesim-pov")).toHaveAttribute("data-view", "pov");
  await page.screenshot({ path: testInfo.outputPath("dronesim-pov.png") });
  await page.getByRole("button", { name: "Follow drone" }).click();
  await page.getByRole("slider", { name: "Flight timeline position" }).fill("0");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Orbit" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("dronesim-mobile.png"), fullPage: true });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("draft mission shows a route preview and claims no outcome", async ({ page }) => {
  await mockApi(page, "coordinator");
  await page.goto("/drone/missions");
  await page.getByLabel("Mission", { exact: true }).selectOption("mission-draft");
  await expect(page.locator(".dronesim-side")).toContainText("planned route only");
  await expect(page.locator(".dronesim-targets")).toContainText("No event recorded yet");
  await expect(page.locator(".next-step")).toContainText("Send the draft for review");
});

test("flight rehearsal map view shows the route on a real basemap and returns to 3D", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const writes = await mockApi(page);
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.goto("/drone/missions");
  await expect(page.getByTestId("dronesim-canvas").locator("canvas")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Map view", exact: true }).click();
  await expect(page.getByRole("group", { name: /Real-world basemap/ })).toBeVisible();
  await expect(page.locator(".tm-route")).toHaveCount(1);
  await expect(page.locator(".tm-drone-icon")).toHaveCount(1);
  await expect(page.locator(".dronesim-badges")).toContainText("NOT A SURVEY");
  await expect(page.getByRole("button", { name: "Drone camera", exact: true })).toBeDisabled();
  await page.getByRole("slider", { name: "Flight timeline position" }).fill("40");
  await expect(page.locator(".tm-flown")).toHaveCount(1);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await expect(page.getByRole("button", { name: "Drone camera", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
});
