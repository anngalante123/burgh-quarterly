import { test } from "@playwright/test";

test("scorecard fold (LG)", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("https://burgh-quarterly.vercel.app/business/la-gourmandine-lawrenceville", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/audit-scorecard-fold.png",
    fullPage: false,
  });
});

test("scorecard with reviews row open", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("https://burgh-quarterly.vercel.app/business/la-gourmandine-lawrenceville", {
    waitUntil: "networkidle",
  });
  // Set unlock cookie
  await context.addCookies([{
    name: "signal_unlocked",
    value: "1",
    domain: "burgh-quarterly.vercel.app",
    path: "/",
  }]);
  await page.reload({ waitUntil: "networkidle" });
  const reviews = page.locator("summary", { hasText: "Reviews" }).first();
  await reviews.click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "e2e/screenshots/audit-scorecard-reviews-open.png",
    fullPage: false,
  });
});

test("scorecard mobile fold (Pages)", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://burgh-quarterly.vercel.app/business/pages", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/audit-scorecard-mobile.png",
    fullPage: true,
  });
});

test("scorecard full (Pages)", async ({ page, context }) => {
  await context.addCookies([{
    name: "signal_unlocked",
    value: "1",
    domain: "burgh-quarterly.vercel.app",
    path: "/",
  }]);
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.goto("https://burgh-quarterly.vercel.app/business/pages", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/audit-scorecard-full.png",
    fullPage: true,
  });
});
