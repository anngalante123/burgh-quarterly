import { test } from "@playwright/test";

test("mobile strengths/gaps Pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://burgh-quarterly.vercel.app/business/pages", {
    waitUntil: "networkidle",
  });
  await page.locator("text=The Verdict").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "e2e/screenshots/mobile-strengths-pages.png",
    fullPage: false,
  });
});

test("mobile strengths/gaps La Gourmandine", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/business/la-gourmandine-lawrenceville",
    { waitUntil: "networkidle" },
  );
  await page.locator("text=The Verdict").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "e2e/screenshots/mobile-strengths-lg.png",
    fullPage: false,
  });
});
