// Throwaway screenshot script (deleted after use): node shots.cjs <outDir>
const { chromium } = require("@playwright/test");
const out = process.argv[2];
const routes = [["dashboard", "/dashboard"], ["ovitraps", "/ovitraps"], ["drone", "/drone/missions"], ["planning", "/planning"], ["operations", "/operations"]];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.AEDES_BROWSER_EXECUTABLE });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: "http://localhost:13200" });
  const page = await ctx.newPage();
  await page.goto("/dashboard");
  const enter = page.getByRole("button", { name: "Enter demo", exact: true });
  await enter.or(page.locator(".topbar .badge")).waitFor();
  if (await enter.isVisible().catch(() => false)) await enter.click();
  await page.locator(".topbar .badge").waitFor();
  for (const [name, path] of routes) {
    await page.goto(path);
    await page.locator("h1").waitFor();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${out}/phone2-${name}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(name, "height", h, "overflowX", overflow);
  }
  await browser.close();
})();
