import { test, expect, type Page } from "@playwright/test";

async function enter(page: Page) {
  const enterDemo = page.getByRole("button", { name: "Enter demo", exact: true });
  const role = page.locator(".topbar .badge");
  await expect(enterDemo.or(role)).toBeVisible();
  if (await enterDemo.isVisible().catch(() => false)) await enterDemo.click();
  await expect(role).toHaveText("coordinator");
}

test("a simulated drone pass queues proposals that need human confirmation", async ({ page }) => {
  await page.goto("/ovitraps");
  await enter(page);
  await page.getByRole("tab", { name: /Drone inbox/ }).click();

  const inbox = page.locator("section[aria-labelledby='inbox-title']");
  await expect(inbox.getByRole("heading", { name: "Drone inbox" })).toBeVisible();
  await expect(inbox.getByText("SIMULATED · human confirmation required")).toBeVisible();

  await inbox.getByRole("button", { name: "Run simulated trap pass" }).click();
  await expect(inbox.getByRole("status").filter({ hasText: /Last pass: \d+ photographed/ })).toBeVisible({ timeout: 45000 });

  // Proposals come from the drone simulation and are not surveillance until confirmed.
  const first = inbox.locator("article.inbox-item").first();
  await expect(first).toBeVisible();
  await expect(first.getByText("DRONE_SIM")).toBeVisible();
  await expect(first.getByText("NOT SURVEILLANCE YET")).toBeVisible();

  // Offline traps are reported as unavailable, never as zero.
  const skipped = inbox.getByLabel("Skipped traps");
  if (await skipped.count()) await expect(skipped).toContainText("DATA_UNAVAILABLE");
});
