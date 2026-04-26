import { test } from "@playwright/test";

test("homepage with thumbs + featured photo", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("https://burgh-quarterly.vercel.app/", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: "e2e/screenshots/v21-home-with-thumbs.png",
    fullPage: true,
  });
});

test("scorecard with hero photo", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/business/la-gourmandine-lawrenceville",
    { waitUntil: "networkidle" },
  );
  await page.screenshot({
    path: "e2e/screenshots/v21-scorecard-with-photo.png",
    fullPage: false,
  });
});

test("scorecard mobile with hero", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/business/pages",
    { waitUntil: "networkidle" },
  );
  await page.screenshot({
    path: "e2e/screenshots/v21-scorecard-mobile.png",
    fullPage: false,
  });
});
