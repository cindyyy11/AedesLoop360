import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

async function enter(page: Page) {
  const enterDemo = page.getByRole("button", { name: "Enter demo", exact: true });
  const role = page.locator(".topbar .badge");
  await expect(enterDemo.or(role)).toBeVisible();
  if (await enterDemo.isVisible().catch(() => false)) await enterDemo.click();
  await expect(role).toHaveText("coordinator");
}

test("coordinator counts eggs from a photo, confirms it, and sees it in the trap history", async ({ page }, testInfo) => {
  const run = Date.now().toString(36);
  // Each run saves a real row in the local demo database, so give it its own non-overlapping week (8-day slots from 2020, rotating each minute).
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(2020, 0, 1) + (Math.floor(Date.now() / 60000) % 200) * 8 * 86400000);
  const end = new Date(start.getTime() + 7 * 86400000);
  await page.goto("/ovitraps");
  await enter(page);

  const counter = page.locator("section.counter");
  await expect(counter.getByRole("heading", { name: /Count eggs from a photo · B1 \/ T1/ })).toBeVisible();

  // Step 1: add a photo (external Mosqlimate sample, already in the repo's data folder).
  // The API rejects an identical image twice (anti double counting), so each run uploads a byte-distinct copy.
  const sample = readFileSync("../../data/external/eggs-mosqlimate-v2/images/1-1.jpeg");
  await counter.locator('input[type="file"]').setInputFiles({ name: `e2e-${run}.jpeg`, mimeType: "image/jpeg", buffer: Buffer.concat([sample, Buffer.from(`e2e-${run}`)]) });
  const stage = counter.locator(".roi-stage");
  await expect(stage).toBeVisible();

  // Step 2: drag a region on the photo.
  await stage.locator("img").evaluate((img: HTMLImageElement) => img.decode());
  await stage.scrollIntoViewIfNeeded();
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9, { steps: 8 });
  await page.mouse.up();
  await expect(stage.locator(".roi-box")).toBeVisible();
  await counter.getByText("Fine-tune the area").click();
  const left = Number(await counter.getByLabel(/^Left/).inputValue());
  const right = Number(await counter.getByLabel(/^Right/).inputValue());
  expect(left).toBeGreaterThan(5);
  expect(left).toBeLessThan(15);
  expect(right).toBeGreaterThan(85);

  const analyze = counter.getByRole("button", { name: "Count eggs in this area" });
  await expect(analyze).toBeDisabled();
  await counter.getByLabel("Image rights / permission").fill("Mosqlimate dataset sample, test use");
  await counter.getByLabel(/Photo taken/).fill("2026-10-20T09:00");
  await counter.getByLabel(/covers the whole paddle/).check();
  await expect(analyze).toBeEnabled();
  await testInfo.attach("before-analyze", { body: await page.screenshot(), contentType: "image/png" });

  // Step 3: the model proposes a count.
  // Take the expected count from the API response: after the status message the card can still show the previous
  // analysis until the list refetch lands, so reading the number straight off the page is a race.
  const created = page.waitForResponse(r => r.request().method() === "POST" && /\/egg-analyses$/.test(r.url()));
  await analyze.click();
  const analysis = (await (await created).json()).data as { id: string; proposed_count: number };
  const proposed = analysis.proposed_count;
  expect(Number.isInteger(proposed)).toBeTruthy();
  await expect(page.getByRole("status").filter({ hasText: "Image analysis persisted" })).toBeVisible({ timeout: 30000 });
  // Select the card for this exact analysis; an earlier result can stay on screen until the list refetch lands.
  const card = counter.locator(".result-card").filter({ has: page.getByAltText(`Imported egg substrate for analysis ${analysis.id}`) });
  await expect(card).toBeVisible();
  await expect(card.locator(".result-number b")).toHaveText(String(proposed));
  await expect(card.getByText("NOT SURVEILLANCE YET")).toBeVisible();
  await expect(card.locator(".roi-box")).toBeVisible();

  // Step 4: reviewer confirms with a unique paddle and interval.
  const confirm = card.locator("form.confirm-form");
  await expect(confirm.getByLabel(/Eggs you accept/)).toHaveValue(String(proposed));
  await confirm.getByLabel(/Eggs you accept/).fill(String(proposed + 1));
  await confirm.getByLabel(/^Collection period starts/).fill(`${day(start)}T00:00`);
  await confirm.getByLabel(/^Collection period ends/).fill(`${day(end)}T00:00`);
  await confirm.getByLabel(/^Collected at/).fill(`${day(end)}T00:00`);
  await confirm.getByLabel("Sample ID").fill(`e2e-sample-${run}`);
  await confirm.getByLabel(/Physical paddle ID/).fill(`e2e-paddle-${run}`);
  await confirm.getByLabel(/Why you accept/).fill("Checked against the photo, added one missed egg");
  await confirm.getByRole("button", { name: "Confirm and add to trap history" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reviewed imported interval saved" })).toBeVisible({ timeout: 15000 });
  await expect(card).toHaveClass(/confirmed/);
  await expect(card).toContainText(`Confirmed by a reviewer as ${proposed + 1} eggs`);

  // The confirmed interval is now a selectable bar in the trap chart.
  await page.getByRole("tab", { name: /Trap monitoring/ }).click();
  await expect(page.getByRole("button", { name: new RegExp(`${day(start)} to ${day(end)}: ${proposed + 1} eggs`) })).toHaveCount(1);
  await testInfo.attach("after-confirm", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
