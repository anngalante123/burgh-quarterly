import { test } from "@playwright/test";

test("home with cta", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("https://burgh-quarterly.vercel.app/", {
    waitUntil: "networkidle",
  });
  // Scroll to the CTA placement
  await page.locator("text=For Pittsburgh business owners").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "e2e/screenshots/v22-home-cta.png",
    fullPage: false,
  });
});
