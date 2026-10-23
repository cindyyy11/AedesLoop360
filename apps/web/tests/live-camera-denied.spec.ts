import { test, expect, type Page } from "@playwright/test";

/* No camera permission is granted and the browser's own prompt is not auto-accepted, so getUserMedia is refused. */
test.use({ permissions: [], launchOptions: { executablePath: process.env.AEDES_BROWSER_EXECUTABLE } });

async function enter(page: Page) {
  const enterDemo = page.getByRole("button", { name: "Enter demo", exact: true });
  const role = page.locator(".topbar .badge");
  await expect(enterDemo.or(role)).toBeVisible();
  if (await enterDemo.isVisible().catch(() => false)) await enterDemo.click();
  await expect(role).toHaveText("coordinator");
}

test("a refused camera explains itself and leaves nothing running", async ({ page }) => {
  await page.goto("/missions");
  await enter(page);
  await page.getByRole("link", { name: /Drone missions/i }).click();
  const panel = page.locator("section[aria-labelledby='live-title']");
  await panel.getByRole("button", { name: "Start camera" }).click();
  await expect(panel.getByRole("alert")).toContainText(/Camera permission was denied|Could not start the camera/, { timeout: 20000 });
  await expect(panel.getByText("No feed running.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Stop" })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Start camera" })).toBeEnabled();
});
