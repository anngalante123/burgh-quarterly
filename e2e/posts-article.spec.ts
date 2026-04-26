import { test } from "@playwright/test";

test("posts article desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/best-on-social/best-creator-posts-about",
    { waitUntil: "networkidle" },
  );
  await page.screenshot({
    path: "e2e/screenshots/v16-posts-desktop.png",
    fullPage: false,
  });
});

test("homepage v2 desktop", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("https://burgh-quarterly.vercel.app/", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/v16-home-desktop.png",
    fullPage: false,
  });
});
