import { expect, test, type Page } from "@playwright/test";

// Explicit browser-test fixtures, not model results or production data.
const blocks = [1, 2, 3, 4].map((n) => ({
  id: `block-${n}`, name: `Block ${n}`, x: n % 2 ? 20 : 65, y: n < 3 ? 20 : 65,
  mode: "SIMULATED", status: n === 4 ? "DATA_UNAVAILABLE" : "MONITORING",
  valid_intervals: n === 4 ? 0 : 4, expected_intervals: 4, eggs_per_interval: n === 4 ? null : 12,
  positivity: n === 4 ? null : 0.5, unresolved_sources: 1,
  unavailable_traps: n === 4 ? ["trap-4"] : [],
}));
const assets = blocks.map((b, i) => ({ id: `asset-${i + 1}`, block_id: b.id, name: `Roof ${i + 1}`, x: b.x + 4, y: b.y, accessible: false, mode: "SIMULATED" }));
const traps = blocks.map((b, i) => ({ id: `trap-${i + 1}`, block_id: b.id, name: `Trap ${i + 1}`, effective_status: i === 3 ? "OFFLINE" : "ACTIVE", heartbeat_at: "2026-10-20T00:00:00Z", mode: "SIMULATED" }));
const events = ["SKIPPED", "GROUND_REVIEW", "MOCK_ACTION_RECORDED"].map((kind, i) => ({
  id: `event-${i}`, mission_id: "mission-test", kind, mode: "SIMULATED",
  created_at: `2026-10-23T00:0${i}:00Z`, payload: { asset_id: `asset-${i + 1}`, reason: ["Dry fixture", "Occluded fixture", "Approved fixture action"][i] },
}));

async function mockApi(page: Page, options: { empty?: boolean; failed?: boolean; noEvents?: boolean } = {}) {
  const writes: string[] = [];
  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    if (request.method() !== "GET") writes.push(request.url());
    const path = new URL(request.url()).pathname;
    if (options.failed && path.endsWith("/ovitraps")) return route.fulfill({ status: 503, json: { detail: "Fixture API unavailable" } });
    const responses: Record<string, unknown> = {
      "/auth/me": { id: "coordinator", role: "coordinator", tenant_id: "tenant-demo" },
      "/blocks": { data: options.empty ? [] : blocks }, "/assets": { data: assets }, "/ovitraps": { data: traps },
      "/drones/missions": { data: [{ id: "mission-test", mode: "SIMULATED", status: "COMPLETED" }, { id: "mission-empty", mode: "SIMULATED", status: "DRAFT", target_ids: ["finding-a", "finding-b"] }] },
      "/findings": { data: [{ id: "finding-a", asset_id: "asset-1" }, { id: "finding-b", asset_id: "asset-2" }] },
      "/drones/missions/mission-test/events": { data: options.noEvents ? [] : events },
      "/drones/missions/mission-empty/events": { data: [] },
      "/planning/runs": { data: [{ id: "plan-fixture", created_at: "2026-10-23T00:00:00Z", status: "DRAFT", mode: "SIMULATED", result: { block_priorities: blocks.map(b => ({ ...b, score: 8, reasons: ["Offline traps require servicing"] })) } }] },
      "/analytics/surveillance": { data: [] }, "/analytics/allocation-benchmark": { data: null },
      "/analytics/evaluations": { drone_detection: { run_type: "drone_detection", status: "NOT_EVALUATED", reason: "Test fixture" }, ovitrap_count: { run_type: "ovitrap_count", status: "NOT_EVALUATED", reason: "Test fixture" } },
    };
    await route.fulfill({ json: responses[path.replace("/api/v1", "")] ?? { data: [] } });
  });
  return writes;
}

test("3D evidence, recorded replay and chapters are read-only on desktop and mobile", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const writes = await mockApi(page);
  await page.goto("/township");
  const experience = page.getByRole("region", { name: "3D township walkthrough" });
  await expect(experience).toBeVisible();
  await expect(page.getByTestId("township-canvas").locator("canvas")).toBeVisible({ timeout: 15000 });
  await page.getByLabel("Inspect a block, asset or trap").selectOption("asset-1");
  await expect(experience.getByRole("link", { name: "Open asset evidence" })).toHaveAttribute("href", "/assets/asset-1");
  await page.getByRole("button", { name: "Rotate left", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.getByRole("button", { name: "Play recorded events", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause replay", exact: true })).toBeVisible();
  await expect(experience.locator("b").filter({ hasText: "GROUND REVIEW" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Pause replay", exact: true }).click();
  await page.getByRole("combobox", { name: "Recorded event", exact: true }).selectOption("2");
  await expect(experience).toContainText("Approved fixture action");
  await page.getByRole("slider", { name: "Replay position" }).fill("0");
  await expect(page.getByRole("combobox", { name: "Recorded event", exact: true })).toHaveValue("0");
  await page.getByRole("combobox", { name: "Playback speed" }).selectOption("4");
  await expect(page.getByRole("combobox", { name: "Playback speed" })).toHaveValue("4");
  await page.screenshot({ path: testInfo.outputPath("township-desktop.png"), fullPage: true });
  await page.getByRole("combobox", { name: "Mission", exact: true }).selectOption("mission-empty");
  await expect(experience).toContainText("No recorded events.");
  await expect(experience).toContainText("Planned route only: 2 stored targets");
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.getByRole("button", { name: "Map view", exact: true }).click();
  await expect(page.getByRole("group", { name: /Real-world basemap/ })).toBeVisible();
  await expect(page.locator(".tm-route")).toHaveCount(1);
  await expect(page.locator(".tm-flown")).toHaveCount(0);
  await expect(experience).toContainText("not a survey or GPS");
  await expect(page.getByRole("status").filter({ hasText: "Basemap tiles could not load" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rotate left", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.getByRole("combobox", { name: "Mission", exact: true }).selectOption("mission-test");
  await page.getByRole("combobox", { name: "Recorded event", exact: true }).selectOption("1");
  await expect(page.locator(".tm-flown")).toHaveCount(1);
  await expect(page.locator(".tm-drone-icon")).toHaveCount(1);
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rotate left", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Mission", exact: true }).selectOption("mission-empty");
  await expect(experience).not.toContainText("Approved fixture action");
  await page.getByRole("button", { name: "Keep monitoring visible" }).click();
  await page.getByLabel("Inspect a block, asset or trap").selectOption("trap-4");
  await expect(experience.locator(".township-evidence")).toContainText("DATA UNAVAILABLE");
  await expect(experience.locator(".township-evidence")).toContainText("OFFLINE");
  await page.getByRole("button", { name: "Explain the next decision" }).click();
  await expect(experience).toContainText("plan-fixture");
  await expect(experience.locator(".township-evidence")).toContainText("Offline traps require servicing");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Inspect a block, asset or trap")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("township-mobile.png"), fullPage: true });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("loop chapter, egg overlay and day/night are read-only and honest", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const writes = await mockApi(page);
  await page.goto("/township");
  const experience = page.getByRole("region", { name: "3D township walkthrough" });
  await expect(page.getByTestId("township-canvas").locator("canvas")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Keep monitoring visible" }).click();
  await expect(page.getByRole("button", { name: "Egg-count overlay" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Switch to day" }).click();
  await expect(page.getByRole("button", { name: "Switch to night" })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath("township-heat-day.png") });
  await page.getByRole("button", { name: "Close the loop" }).click();
  await expect(experience).toContainText("Feedback loop · stage 1 of 5: Detect");
  await expect(experience).toContainText("candidate containers, not confirmed larval sites");
  await page.getByRole("button", { name: /Approve/ }).click();
  await expect(experience).toContainText("cannot bypass the gate");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Record action/ }).click();
  await expect(experience).toContainText("not a biologically effective one");
  await page.getByRole("button", { name: /Verify/ }).click();
  await expect(experience).toContainText("separate follow-up verification");
  await page.getByLabel("Inspect a block, asset or trap").selectOption("trap-1");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: testInfo.outputPath("township-loop.png") });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("WebGL fallback retains evidence and reduced-motion presentation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await mockApi(page, { noEvents: true });
  await page.goto("/township");
  await expect(page.getByRole("status").filter({ hasText: "3D rendering is unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rotate left", exact: true })).toBeDisabled();
  await page.getByLabel("Inspect a block, asset or trap").selectOption("asset-1");
  await expect(page.locator(".township-evidence")).toContainText("Roof 1");
  await expect(page.getByRole("button", { name: "Play recorded events", exact: true })).toHaveCount(0);
});

test("empty township has no invented objects", async ({ page }) => {
  await mockApi(page, { empty: true });
  await page.goto("/township");
  await expect(page.getByText("No registered blocks.", { exact: false })).toBeVisible();
  await expect(page.getByTestId("township-canvas")).toHaveCount(0);
});

test("failed 3D reads offer retry without fabricated data", async ({ page }) => {
  await mockApi(page, { failed: true });
  await page.goto("/township");
  await expect(page.getByRole("button", { name: "Retry 3D data" })).toBeVisible();
  await page.getByRole("button", { name: "Retry 3D data" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Fixture API unavailable" })).toBeVisible();
  await expect(page.getByTestId("township-canvas")).toHaveCount(0);
});
