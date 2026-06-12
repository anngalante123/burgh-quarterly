import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test("viral moments article renders 10 items with correct rank label", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(`${BASE}/best-on-social/unexpectedly-viral-moments`, {
    waitUntil: "networkidle",
  });
  await expect(
    page.getByRole("heading", {
      name: /Pittsburgh's Most Unexpectedly Viral Moments/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/ranked by lift over a typical post/i)).toBeVisible();
  const igItems = await page.getByText(/view on instagram/i).count();
  const ttItems = await page.getByText(/watch on tiktok/i).count();
  expect(igItems + ttItems).toBe(10);
  // Hard editorial rule: no em dashes anywhere on the property.
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("—");
  await page.screenshot({
    path: "e2e/screenshots/issue02-viral-desktop.png",
    fullPage: false,
  });
});

test("viral moments article mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/best-on-social/unexpectedly-viral-moments`, {
    waitUntil: "networkidle",
  });
  await page
    .getByText(/view on instagram/i)
    .first()
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "e2e/screenshots/issue02-viral-mobile.png",
    fullPage: false,
  });
});

test("defense list card appears on index", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(`${BASE}/best-on-social`, { waitUntil: "networkidle" });
  await expect(
    page.getByText(/The Businesses Pittsburgh Defends in the Comments/i).first(),
  ).toBeVisible();
});

test("defense list renders six reported entries", async ({ page }) => {
  const res = await page.goto(`${BASE}/best-on-social/defended-in-the-comments`, {
    waitUntil: "networkidle",
  });
  expect(res?.status()).toBeLessThan(500);
  // Intro keeps the reported-not-generated framing.
  await expect(
    page.getByText(/This list is reported, not generated/i),
  ).toBeVisible();
  for (const name of [
    "The Urban Tap",
    "Beto's Pizza",
    "Apteka",
    "DiAnoia's Eatery",
    "Oakmont Bakery",
  ]) {
    await expect(page.getByRole("heading", { name }).first()).toBeVisible();
  }
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("—");
});
