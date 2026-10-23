import { test, expect } from "@playwright/test";

test("dashboard shows persisted data as a board and links onward", async ({ page }) => {
  await page.goto("/dashboard");
  const enterDemo = page.getByRole("button", { name: "Enter demo", exact: true });
  const role = page.locator(".topbar .badge");
  await expect(enterDemo.or(role)).toBeVisible();
  if (await enterDemo.isVisible().catch(() => false)) await enterDemo.click();
  await expect(role).toBeVisible();

  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs your attention" })).toBeVisible();
  // A block with no readings is shown as no data, never as zero or low.
  await expect(page.getByText("NO DATA", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("No data, not zero").first()).toBeVisible();
  // The loop strip names the four steps and each one links to its page.
  const strip = page.getByRole("list", { name: "The AedesLoop loop, step by step" });
  await expect(strip.getByRole("link")).toHaveCount(4);
  for (const title of ["Township at a glance", "How far can you trust this?"]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  // Model accuracy stays folded away until asked for.
  await expect(page.getByText("Drone detector recall")).toBeHidden();
  await page.getByText("How far can you trust this?").click();
  await expect(page.getByText("Drone detector recall")).toBeVisible();

  await strip.getByRole("link", { name: /Count/ }).click();
  await expect(page).toHaveURL(/\/ovitraps$/);
  await expect(page.getByText("Step 1 of 4")).toBeVisible();

  // No horizontal page scroll on a phone-width screen.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Needs your attention" })).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
