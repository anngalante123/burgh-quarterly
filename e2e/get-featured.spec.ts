import { test } from "@playwright/test";

test("get featured CTA desktop", async ({ page, context }) => {
  await context.addCookies([{
    name: "signal_unlocked",
    value: "1",
    domain: "burgh-quarterly.vercel.app",
    path: "/",
  }]);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("https://burgh-quarterly.vercel.app/business/la-gourmandine-lawrenceville", {
    waitUntil: "networkidle",
  });
  // Scroll to the CTA section
  await page.locator("text=The cheap next move").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "e2e/screenshots/v22-get-featured-cta.png",
    fullPage: false,
  });
});
