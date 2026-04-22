import { test } from "@playwright/test";

const routes = [
  { path: "/",                                                    name: "home" },
  { path: "/business/la-gourmandine-lawrenceville",               name: "business-unclaimed" },
  { path: "/business/la-gourmandine-lawrenceville?claimed=true",  name: "business-claimed" },
];

for (const r of routes) {
  test(`${r.name} full page`, async ({ page }, testInfo) => {
    await page.goto(r.path, { waitUntil: "networkidle" });
    await page.screenshot({
      path: `e2e/screenshots/${r.name}.${testInfo.project.name}.png`,
      fullPage: true,
    });
  });
}
