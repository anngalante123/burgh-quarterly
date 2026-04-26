import { test } from "@playwright/test";

const URL = "https://burgh-quarterly.vercel.app/business/la-gourmandine-lawrenceville";

test("locked desktop", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.screenshot({
    path: "e2e/screenshots/v12-locked-desktop.png",
    fullPage: false,
  });
});

test("locked mobile with focus row", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.screenshot({
    path: "e2e/screenshots/v12-locked-mobile.png",
    fullPage: true,
  });
});

test("locked rank expanded shows gate", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(URL, { waitUntil: "networkidle" });
  const rankSummary = page.locator("summary", { hasText: "Rank in" }).first();
  await rankSummary.click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "e2e/screenshots/v12-locked-rank-gate.png",
    fullPage: false,
  });
});
