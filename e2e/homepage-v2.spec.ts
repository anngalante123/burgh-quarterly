import { test } from "@playwright/test";

test("homepage desktop full", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("https://burgh-quarterly.vercel.app/", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/v14-home-desktop-full.png",
    fullPage: true,
  });
});

test("homepage mobile", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://burgh-quarterly.vercel.app/", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/v14-home-mobile.png",
    fullPage: true,
  });
});
