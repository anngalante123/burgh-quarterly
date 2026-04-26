import { test } from "@playwright/test";

test("BY posts article desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/best-on-social/best-by-posts",
    { waitUntil: "networkidle" },
  );
  await page.screenshot({
    path: "e2e/screenshots/v18-by-posts-desktop.png",
    fullPage: false,
  });
});

test("BY posts cards section", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(
    "https://burgh-quarterly.vercel.app/best-on-social/best-by-posts",
    { waitUntil: "networkidle" },
  );
  await page.locator("h2", { hasText: "The list" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "e2e/screenshots/v18-by-posts-cards.png",
    fullPage: false,
  });
});
