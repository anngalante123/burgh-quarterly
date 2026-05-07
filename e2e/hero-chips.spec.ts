import { test, expect } from "@playwright/test";

/**
 * HeroSearch neighborhood chip rotation. The change reduces a wall of ~80
 * chips to a stable top-10 plus 3 rotating slots that flash through the
 * long tail. This test verifies:
 *   1. Chip count is reduced (no longer all neighborhoods).
 *   2. The "+N more" indicator is present.
 *   3. After waiting one rotation interval, at least one rotating chip
 *      shows a different name than at t=0.
 *   4. A reduced-motion run still rotates without crashing.
 *
 * Hits localhost:3000 (the dev server we already started). The shared
 * playwright config baseURL is :3002, so this spec uses absolute URLs.
 */
const HOME = "http://localhost:3000";

test.describe("hero search chips: stable top-N plus rotating tail", () => {
  test("hero chip count is bounded and tail indicator shows", async ({ page }) => {
    await page.goto(HOME, { waitUntil: "networkidle" });
    await page.locator("input[placeholder*='Search the Spring 2026']").waitFor();
    // Scope to the HeroSearch block: it's the chips immediately following
    // the search input, before the "Browse the full index" section.
    const heroChips = page
      .locator("input[placeholder*='Search the Spring 2026']")
      .locator("xpath=../../..")
      .locator("button[aria-pressed]");
    const count = await heroChips.count();
    expect(count).toBeGreaterThanOrEqual(10);
    expect(count).toBeLessThanOrEqual(15);
    await expect(
      page.locator("text=/^\\+\\d+ more$/").first(),
    ).toBeVisible();
  });

  test("browse-the-index chip count is bounded with show-all expander", async ({
    page,
  }) => {
    await page.goto(HOME, { waitUntil: "networkidle" });
    await page.locator("text=Browse the full index").waitFor();
    const browseSection = page.locator(
      "section[aria-label='Browse the full index']",
    );
    const compactCount = await browseSection
      .locator("button[aria-pressed]")
      .count();
    expect(compactCount).toBeGreaterThanOrEqual(10);
    expect(compactCount).toBeLessThanOrEqual(16);
    // Click "Show all N" and confirm the chip count expands.
    await browseSection.locator("text=/^Show all \\d+/").click();
    const expandedCount = await browseSection
      .locator("button[aria-pressed]")
      .count();
    expect(expandedCount).toBeGreaterThan(40);
  });

  test("rotating slots actually rotate over time (hero block)", async ({
    page,
  }) => {
    await page.goto(HOME, { waitUntil: "networkidle" });
    await page.locator("input[placeholder*='Search the Spring 2026']").waitFor();
    const heroChips = page
      .locator("input[placeholder*='Search the Spring 2026']")
      .locator("xpath=../../..")
      .locator("button[aria-pressed]");
    const before = await heroChips.allInnerTexts();
    await page.waitForTimeout(2200);
    const after = await heroChips.allInnerTexts();
    expect(after.join("|")).not.toEqual(before.join("|"));
  });

  test("desktop screenshot: chip area rendered", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(HOME, { waitUntil: "networkidle" });
    await page.locator("input[placeholder*='Search the Spring 2026']").waitFor();
    await page.screenshot({
      path: `e2e/screenshots/hero-chips-${testInfo.project.name}.png`,
      clip: { x: 0, y: 200, width: 1280, height: 600 },
    });
  });

  test("mobile screenshot: chips wrap cleanly", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(HOME, { waitUntil: "networkidle" });
    await page.locator("input[placeholder*='Search the Spring 2026']").waitFor();
    await page.screenshot({
      path: `e2e/screenshots/hero-chips-mobile-${testInfo.project.name}.png`,
      fullPage: false,
    });
  });

  test("reduced motion: rotation still works without animation", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(HOME, { waitUntil: "networkidle" });
    await page.locator("input[placeholder*='Search the Spring 2026']").waitFor();
    const heroChips = page
      .locator("input[placeholder*='Search the Spring 2026']")
      .locator("xpath=../../..")
      .locator("button[aria-pressed]");
    const before = await heroChips.allInnerTexts();
    await page.waitForTimeout(2200);
    const after = await heroChips.allInnerTexts();
    expect(after.join("|")).not.toEqual(before.join("|"));
    await ctx.close();
  });
});
