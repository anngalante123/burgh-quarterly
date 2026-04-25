import { test } from "@playwright/test";

const SLUGS = [
  "la-gourmandine-lawrenceville",
  "ka-fair-coffee-and-cakery",
  "jenis-splendid-ice-creams",
  "pages",
];

for (const slug of SLUGS) {
  test(`diagnosis ${slug}`, async ({ page }) => {
    await page.goto(`https://burgh-quarterly.vercel.app/business/${slug}`, {
      waitUntil: "networkidle",
    });
    await page.screenshot({
      path: `e2e/screenshots/diag-${slug}.desktop.png`,
      fullPage: false,
      clip: { x: 0, y: 0, width: 1280, height: 1100 },
    });
  });
}
