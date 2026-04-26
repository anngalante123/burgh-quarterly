import { test } from "@playwright/test";
test("posts cards", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("https://burgh-quarterly.vercel.app/best-on-social/best-creator-posts-about", { waitUntil: "networkidle" });
  await page.locator("h2", { hasText: "The list" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "e2e/screenshots/v17-posts-cards.png", fullPage: false });
});
