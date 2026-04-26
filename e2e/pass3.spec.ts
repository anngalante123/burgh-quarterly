import { test } from "@playwright/test";

const URLS = [
  ["pages", "Pages"],
  ["la-gourmandine-lawrenceville", "LaGourmandine"],
];

for (const [slug, label] of URLS) {
  test(`${label} desktop`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.goto(`https://burgh-quarterly.vercel.app/business/${slug}`, {
      waitUntil: "networkidle",
    });
    await page.screenshot({
      path: `e2e/screenshots/v11-${slug}.desktop.png`,
      fullPage: false,
    });
  });

  test(`${label} rank expanded`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.goto(`https://burgh-quarterly.vercel.app/business/${slug}`, {
      waitUntil: "networkidle",
    });
    const rank = page.locator("summary", { hasText: "Rank in" }).first();
    await rank.click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `e2e/screenshots/v11-${slug}.rank-expanded.png`,
      fullPage: true,
    });
  });
}
