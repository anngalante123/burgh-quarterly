import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapCategory } from "../normalize";

/**
 * Unit tests for the primary-wins precedence in mapCategory.
 *
 * Run via:
 *   npx tsx --test lib/data/__tests__/normalize.test.ts
 *
 * Background: Apify returns one primary categoryName plus a secondary
 * categories[] array. Many restaurants also list "Bar" as a secondary
 * because they have a bar inside. The bar regex sits before the
 * restaurant regex in the ladder, so the old joined-haystack approach
 * miscategorized restaurants-with-bars as bars. The fix is to run the
 * regex ladder against the primary first, and only fall back to the
 * joined haystack if the primary does not match anything.
 */

describe("mapCategory primary-wins precedence", () => {
  it("primary 'Restaurant' with secondary ['Bar'] returns restaurant", () => {
    assert.equal(mapCategory("Restaurant", ["Bar"]), "restaurant");
  });

  it("primary 'Bar' with secondary ['Restaurant'] returns bar", () => {
    assert.equal(mapCategory("Bar", ["Restaurant"]), "bar");
  });

  it("primary 'Brewery' with secondary ['Bar'] returns brewery", () => {
    assert.equal(mapCategory("Brewery", ["Bar"]), "brewery");
  });

  it("missing primary, secondary ['Bar'] returns bar", () => {
    assert.equal(mapCategory(undefined, ["Bar"]), "bar");
    assert.equal(mapCategory("", ["Bar"]), "bar");
  });

  it("primary that does not match falls back to secondaries", () => {
    // 'Point of interest' is not in the regex ladder, so we fall back
    // to the joined haystack and pick up 'Cafe' from secondaries.
    assert.equal(mapCategory("Point of interest", ["Cafe"]), "cafe");
  });

  it("real Apify shape: Burgatory (Hamburger restaurant + Bar secondary)", () => {
    assert.equal(
      mapCategory("Hamburger restaurant", [
        "Hamburger restaurant",
        "American restaurant",
        "Bar",
        "Restaurant",
      ]),
      "restaurant",
    );
  });

  it("real Apify shape: Muddy Waters Oyster Bar (Oyster bar restaurant primary)", () => {
    // 'Oyster bar restaurant' contains 'bar' as a substring AND
    // 'restaurant'. The bar branch has a guard: if the same string also
    // names a restaurant, the place is a restaurant-with-bar, not a bar.
    assert.equal(
      mapCategory("Oyster bar restaurant", [
        "Oyster bar restaurant",
        "Bar & grill",
        "Brunch restaurant",
        "Cajun restaurant",
        "Restaurant",
      ]),
      "restaurant",
    );
  });

  it("real Apify shape: The Fire Side Public House (Bar & grill primary)", () => {
    // 'Bar & grill' contains both 'bar' and 'grill'. Guard kicks in and
    // we resolve to restaurant, not bar.
    assert.equal(
      mapCategory("Bar & grill", ["Bar & grill", "Gastropub"]),
      "restaurant",
    );
  });

  it("standalone bar primaries still return bar", () => {
    assert.equal(mapCategory("Wine bar", []), "bar");
    assert.equal(mapCategory("Cocktail bar", []), "bar");
    assert.equal(mapCategory("Sports bar", []), "bar");
    assert.equal(mapCategory("Dive bar", []), "bar");
  });

  it("returns null when both primary and secondaries are empty", () => {
    assert.equal(mapCategory(undefined, undefined), null);
    assert.equal(mapCategory("", []), null);
  });
});
