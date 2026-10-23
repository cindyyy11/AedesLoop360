import { test, expect, type Page } from "@playwright/test";

/* Needs a Chromium-compatible browser. The camera test uses a fake camera: set AEDES_FAKE_CAMERA_MJPEG to a file of concatenated JPEG frames
   (for example a drone tile repeated) and run against an API that has AEDES_DRONE_MODEL_PATH set. */
const fake = process.env.AEDES_FAKE_CAMERA_MJPEG;
test.use({
  permissions: ["camera"],
  launchOptions: {
    executablePath: process.env.AEDES_BROWSER_EXECUTABLE,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", ...(fake ? [`--use-file-for-fake-video-capture=${fake}`] : [])],
  },
});

async function enter(page: Page) {
  const enterDemo = page.getByRole("button", { name: "Enter demo", exact: true });
  const role = page.locator(".topbar .badge");
  await expect(enterDemo.or(role)).toBeVisible();
  if (await enterDemo.isVisible().catch(() => false)) await enterDemo.click();
  await expect(role).toHaveText("coordinator");
}

const findingCount = async (page: Page) => (await (await page.request.get("/api/v1/findings")).json()).data.length;

test("live camera frames show UNCERTAIN candidates and store nothing until saved", async ({ page }) => {
  test.skip(!fake, "AEDES_FAKE_CAMERA_MJPEG is not set");
  await page.goto("/missions");
  await enter(page);
  await page.getByRole("link", { name: /Drone missions/i }).click();
  const panel = page.locator("section[aria-labelledby='live-title']");
  await expect(panel.getByText("IMPORTED · analysed, not stored")).toBeVisible();
  const before = await findingCount(page);

  await panel.getByRole("button", { name: "Start camera" }).click();
  // The first result can take a while because the model loads on first use.
  await expect(panel.getByRole("status").filter({ hasText: /\d+ candidate\(s\) in view · \d+ distinct track\(s\) this session · \d+ ms model time/ })).toBeVisible({ timeout: 55000 });
  await expect(panel.getByRole("status").filter({ hasText: /^[1-9]\d* candidate/ })).toBeVisible({ timeout: 15000 });

  // A steady scene settles on one distinct track, not a new box every frame.
  await expect(panel.getByRole("status").filter({ hasText: /1 distinct track\(s\) this session/ })).toBeVisible();

  // The overlay canvas has drawn at least one box.
  const drawn = await panel.locator("canvas").evaluate((c: HTMLCanvasElement) => c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0));
  expect(drawn).toBe(true);

  // Analysis alone creates no finding.
  expect(await findingCount(page)).toBe(before);

  await panel.getByRole("button", { name: "Save frame for ground review" }).click();
  await expect(panel.getByText(/^Saved .*YOLO_LOCAL_V1:DETECTED/)).toBeVisible({ timeout: 20000 });
  expect(await findingCount(page)).toBeGreaterThan(before);

  await panel.getByRole("button", { name: "Stop" }).click();
  await expect(panel.getByText("No feed running.")).toBeVisible();
});

// The video-file source: a clip of the drone tile slowly panning, played from disk instead of the camera.
const clip = process.env.AEDES_TEST_VIDEO;
test("a video file is analysed like a camera and tracked across frames", async ({ page }) => {
  test.skip(!clip, "AEDES_TEST_VIDEO is not set");
  await page.goto("/missions");
  await enter(page);
  await page.getByRole("link", { name: /Drone missions/i }).click();
  const panel = page.locator("section[aria-labelledby='live-title']");
  const before = await findingCount(page);

  await panel.locator('input[type="file"]').setInputFiles(clip!);
  await expect(panel.getByRole("status").filter({ hasText: /\d+ candidate\(s\) in view · \d+ distinct track\(s\) this session · \d+ ms model time/ })).toBeVisible({ timeout: 55000 });
  await expect(panel.getByRole("status").filter({ hasText: /^[1-9]\d* candidate/ })).toBeVisible({ timeout: 15000 });
  // A slowly panning scene keeps one identity instead of splitting into a new track per frame.
  await expect(panel.getByRole("status").filter({ hasText: /1 distinct track\(s\) this session/ })).toBeVisible();
  expect(await findingCount(page)).toBe(before);

  await panel.getByRole("button", { name: "Stop" }).click();
  await expect(panel.getByText("No feed running.")).toBeVisible();
});
