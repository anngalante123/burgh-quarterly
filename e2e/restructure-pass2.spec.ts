import { test } from "@playwright/test";

const SLUG = "la-gourmandine-lawrenceville";
const URL = `http://localhost:3000/business/${SLUG}`;

test("desktop full page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.screenshot({
    path: "e2e/screenshots/v10-desktop-full.png",
    fullPage: true,
  });
});

test("desktop above fold", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.screenshot({
    path: "e2e/screenshots/v10-desktop-fold.png",
    fullPage: false,
  });
});

test("mobile full page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.screenshot({
    path: "e2e/screenshots/v10-mobile-full.png",
    fullPage: true,
  });
});

test("desktop with rank row expanded", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: "networkidle" });
  // Click to expand the rank row (closed by default unless it's the focus row)
  const rankSummary = page.locator("summary", { hasText: "Rank in" }).first();
  await rankSummary.click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "e2e/screenshots/v10-desktop-rank-expanded.png",
    fullPage: true,
  });
});
