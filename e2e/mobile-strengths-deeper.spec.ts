import { test } from "@playwright/test";

test("mobile after verdict header", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1600 });
  await page.goto("https://burgh-quarterly.vercel.app/business/pages", {
    waitUntil: "networkidle",
  });
  await page.locator("text=The Verdict").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "e2e/screenshots/mobile-pages-tall.png",
    fullPage: false,
  });
});
