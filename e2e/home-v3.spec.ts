import { test } from "@playwright/test";

test("home v3 desktop above fold", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("https://burgh-quarterly.vercel.app/", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/v20-home-fold.png",
    fullPage: false,
  });
});

test("home v3 desktop full", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("https://burgh-quarterly.vercel.app/", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/v20-home-full.png",
    fullPage: true,
  });
});

test("home v3 mobile", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://burgh-quarterly.vercel.app/", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/v20-home-mobile.png",
    fullPage: true,
  });
});
