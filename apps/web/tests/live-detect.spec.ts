import { test, expect, type Page } from "@playwright/test";

/* Needs a Chromium-compatible browser with a fake camera. Set AEDES_FAKE_CAMERA_MJPEG to a file of concatenated JPEG frames
   (for example a drone tile repeated) and run against an API that has AEDES_DRONE_MODEL_PATH set. */
const fake = process.env.AEDES_FAKE_CAMERA_MJPEG;
test.skip(!fake, "AEDES_FAKE_CAMERA_MJPEG is not set");
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

const findingCount = async (page: Page) => (await (await page.request.get("/api/v1/findings")).json()).data.length;

test("live camera frames show UNCERTAIN candidates and store nothing until saved", async ({ page }) => {
  await page.goto("/missions");
  await enter(page);
  await page.getByRole("link", { name: /Drone missions/i }).click();
  const panel = page.locator("section[aria-labelledby='live-title']");
  await expect(panel.getByText("IMPORTED · analysed, not stored")).toBeVisible();
  const before = await findingCount(page);

  await panel.getByRole("button", { name: "Start camera" }).click();
  // The first result can take a while because the model loads on first use.
  await expect(panel.getByRole("status").filter({ hasText: /\d+ candidate\(s\) · \d+ ms model time/ })).toBeVisible({ timeout: 55000 });
  await expect(panel.getByRole("status").filter({ hasText: /^[1-9]\d* candidate/ })).toBeVisible({ timeout: 15000 });

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
