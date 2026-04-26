import { test } from "@playwright/test";

test("series index desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("https://burgh-quarterly.vercel.app/best-on-social", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/v13-series-index-desktop.png",
    fullPage: true,
  });
});

test("sweets-top-10 article desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/best-on-social/sweets-top-10",
    { waitUntil: "networkidle" },
  );
  await page.screenshot({
    path: "e2e/screenshots/v13-sweets-top-10-desktop.png",
    fullPage: true,
  });
});

test("sweets-top-10 article mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/best-on-social/sweets-top-10",
    { waitUntil: "networkidle" },
  );
  await page.screenshot({
    path: "e2e/screenshots/v13-sweets-top-10-mobile.png",
    fullPage: true,
  });
});
