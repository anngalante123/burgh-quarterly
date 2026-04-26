import { test } from "@playwright/test";

test("gate mobile, both rows expanded", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/business/la-gourmandine-lawrenceville",
    { waitUntil: "networkidle" },
  );
  // Open the rank and reviews rows so we can see if gates overlap
  const rank = page.locator("summary", { hasText: "Rank in" }).first();
  const reviews = page.locator("summary", { hasText: "Reviews" }).first();
  await rank.click();
  await page.waitForTimeout(150);
  await reviews.click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "e2e/screenshots/v15-gate-mobile-both-open.png",
    fullPage: true,
  });
});
