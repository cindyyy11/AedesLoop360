import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

// Run against a freshly seeded isolated database; never the shared demo.
test("real paddle model: review, interval persistence, retry and chart", async ({ page }, info) => {
  await page.goto("/ovitraps");
  await page.getByRole("button", { name: "Enter demo", exact: true }).click();
  await expect(page.locator(".topbar .badge")).toHaveText("coordinator");
  const samplesUrl = "/api/v1/ovitraps/trap-b1-1/samples";
  const before = (await (await page.request.get(samplesUrl)).json()).data;
  const counter = page.locator("section.counter");
  const sample = readFileSync("../../data/external/user-ovitrap-monitor/images/ovitrap_sample_pics/2-NE-1.JPEG");
  await counter.locator('input[type="file"]').setInputFiles({ name: "2-NE-1.JPEG", mimeType: "image/jpeg", buffer: sample });
  await counter.getByText("Fine-tune the area").click();
  for (const [label, value] of [["Left", "36"], ["Top", "4"], ["Right", "66"], ["Bottom", "99"]]) {
    await counter.getByLabel(new RegExp(`^${label}`)).fill(value);
  }
  await counter.getByLabel("Image rights / permission").fill("Andreo et al., Zenodo 6962536; attributed local test");
  await counter.getByLabel(/Photo taken/).fill("2026-10-20T09:00");
  await counter.getByLabel(/covers the whole paddle/).check();
  const created = page.waitForResponse(r => r.request().method() === "POST" && /\/egg-analyses$/.test(r.url()));
  await counter.getByRole("button", { name: "Count eggs in this area" }).click();
  const response = await created;
  expect(response.status()).toBe(200);
  const analysis = (await response.json()).data;
  expect(analysis.status).toBe("ESTIMATED");
  expect(analysis.model_version).toBe("texture_ridge");
  expect(analysis.proposed_count).toBe(8);
  expect((await (await page.request.get(samplesUrl)).json()).data).toHaveLength(before.length);
  const card = counter.locator(".result-card");
  await expect(card.getByText("NOT SURVEILLANCE YET")).toBeVisible();
  const form = card.locator("form.confirm-form");
  await form.getByLabel(/Eggs you accept/).fill("7");
  await form.getByLabel(/^Collection period starts/).fill("2026-09-01T00:00");
  await form.getByLabel(/^Collection period ends/).fill("2026-09-08T00:00");
  await form.getByLabel(/^Collected at/).fill("2026-09-08T00:00");
  await form.getByLabel("Sample ID").fill("isolated-paddle-2-NE-1");
  await form.getByLabel(/Physical paddle ID/).fill("isolated-paddle-20260901");
  await form.getByLabel(/Why you accept/).fill("Integration test: accept published technician label of seven eggs");
  const confirmed = page.waitForResponse(r => r.request().method() === "POST" && /\/confirm$/.test(r.url()));
  await form.getByRole("button", { name: "Confirm and add to trap history" }).click();
  const confirmation = await confirmed;
  expect(confirmation.status()).toBe(200);
  const saved = (await confirmation.json()).data;
  expect(saved.egg_count).toBe(7);
  expect(saved.source).toBe("MODEL_ASSISTED_REVIEWED");
  expect(saved.mode).toBe("IMPORTED");
  expect(saved.interval_start).toMatch(/^2026-09-01T00:00:00/);
  await expect(card).toHaveClass(/confirmed/);

  // Replay the exact browser submission: retries must return the same interval.
  const request = confirmation.request();
  const replay = await page.request.post(request.url(), {
    headers: { "Idempotency-Key": request.headers()["idempotency-key"] },
    data: request.postDataJSON(),
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).data.id).toBe(saved.id);
  const after = (await (await page.request.get(samplesUrl)).json()).data;
  expect(after).toHaveLength(before.length + 1);
  expect(after.filter((row: { id: string }) => row.id === saved.id)).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("button", { name: /2026-09-01 to 2026-09-08: 7 eggs/ })).toHaveCount(1);
  await page.getByRole("button", { name: /2026-09-01 to 2026-09-08: 7 eggs/ }).click();
  await expect(page.getByRole("heading", { name: "isolated-paddle-2-NE-1 · 7 reviewed eggs" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await info.attach("reviewed-interval-mobile", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
