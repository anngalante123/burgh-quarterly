import { test } from "@playwright/test";

test("strict posts list with thumbs, desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/best-on-social/best-creator-posts-about",
    { waitUntil: "networkidle" },
  );
  await page.screenshot({
    path: "e2e/screenshots/v17-posts-strict-desktop.png",
    fullPage: false,
  });
});

test("strict posts list mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/best-on-social/best-creator-posts-about",
    { waitUntil: "networkidle" },
  );
  await page.screenshot({
    path: "e2e/screenshots/v17-posts-strict-mobile.png",
    fullPage: false,
  });
});
