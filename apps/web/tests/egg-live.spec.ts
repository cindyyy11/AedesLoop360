import { test, expect, type Page } from "@playwright/test";

/* Needs a Chromium-compatible browser with a fake camera. Set AEDES_FAKE_EGG_MJPEG to a file of concatenated JPEG frames of an
   egg paddle, and run against an API that has AEDES_EGG_MODEL_PATH set. */
const fake = process.env.AEDES_FAKE_EGG_MJPEG;
test.skip(!fake, "AEDES_FAKE_EGG_MJPEG is not set");
test.use({
  permissions: ["camera"],
  launchOptions: {
    executablePath: process.env.AEDES_BROWSER_EXECUTABLE,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${fake}`],
  },
});

async function enter(page: Page) {
  const enterDemo = page.getByRole("button", { name: "Enter demo", exact: true });
  const role = page.locator(".topbar .badge");
  await expect(enterDemo.or(role)).toBeVisible();
  if (await enterDemo.isVisible().catch(() => false)) await enterDemo.click();
  await expect(role).toHaveText("coordinator");
}

async function storedAnalyses(page: Page) {
  const traps = (await (await page.request.get("/api/v1/ovitraps")).json()).data as { id: string }[];
  let total = 0;
  for (const t of traps) total += (await (await page.request.get(`/api/v1/ovitraps/${t.id}/egg-analyses`)).json()).data.length;
  return total;
}

test("live egg preview stores nothing and hands a frame to the normal review flow", async ({ page }) => {
  await page.goto("/ovitraps");
  await enter(page);
  const counter = page.locator("section.counter");
  await expect(counter.getByRole("heading", { name: /Count eggs from a photo/ })).toBeVisible();
  const before = await storedAnalyses(page);

  await counter.getByRole("button", { name: "Aim a camera (live preview)" }).click();
  const live = counter.locator(".egg-live");
  await expect(live.getByText("IMPORTED · preview only, not stored")).toBeVisible();
  await live.getByRole("button", { name: "Start camera" }).click();

  // The first estimate waits on the model loading, so allow for it.
  const readout = live.locator(".egg-live-readout");
  await expect(readout).toContainText(/About \d+ eggs · range \d+–\d+ over the last \d+ frame/, { timeout: 60000 });
  expect(await storedAnalyses(page)).toBe(before);

  // Taking the frame moves it into the usual form: the reviewer still marks the paddle, confirms rights and time, and confirms the count.
  await live.getByRole("button", { name: "Use this frame for the full count" }).click();
  await expect(counter.locator(".egg-live")).toHaveCount(0);
  const stage = counter.locator(".roi-stage");
  await expect(stage).toBeVisible();
  await expect(stage.locator(".roi-box")).toBeVisible();
  await expect(counter.getByRole("checkbox", { name: /The box covers the whole paddle/ })).not.toBeChecked();
  await expect(counter.getByRole("button", { name: "Count eggs in this area" })).toBeDisabled();
  expect(await storedAnalyses(page)).toBe(before);
});
