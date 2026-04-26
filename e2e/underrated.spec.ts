import { test } from "@playwright/test";

test("underrated flagship desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/best-on-social/underrated-spring-2026",
    { waitUntil: "networkidle" },
  );
  await page.screenshot({
    path: "e2e/screenshots/v19-underrated-desktop.png",
    fullPage: false,
  });
});

test("homepage with underrated feature", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("https://burgh-quarterly.vercel.app/", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/v19-home-with-underrated.png",
    fullPage: false,
  });
});
