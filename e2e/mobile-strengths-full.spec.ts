import { test } from "@playwright/test";

test("mobile strengths full Pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://burgh-quarterly.vercel.app/business/pages", {
    waitUntil: "networkidle",
  });
  await page.locator("text=The Verdict").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  // Capture twice the viewport height starting from the verdict
  await page.evaluate(() => window.scrollBy(0, 100));
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "e2e/screenshots/mobile-strengths-pages-deep.png",
    fullPage: false,
  });
});
