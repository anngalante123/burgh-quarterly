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

  it("'Spanish restaurant' returns restaurant, not salon (substring 'spa')", () => {
    // Regression: the salon regex used a bare /spa/ that matched the
    // 'spa' substring inside 'Spanish'. Spanish restaurants got rerouted
    // to salon. Word boundaries fix it.
    assert.equal(mapCategory("Spanish restaurant", []), "restaurant");
    assert.equal(mapCategory("Spanish restaurant", ["Tapas bar"]), "restaurant");
  });

  it("'Snail Gallery' is not a salon (substring 'nail')", () => {
    // Same family of bug: bare /nail/ would match 'snail'. Word
    // boundaries keep nail salons distinct from anything else.
    // Note: galleries now live in gallery_museum after the Phase scaling
    // carve-out; this test verifies the salon regex does not misfire on
    // the substring 'snail' in the secondaries.
    assert.equal(
      mapCategory("Art gallery", ["Snail collection"]),
      "gallery_museum",
    );
  });

  it("hair / nail / barber / beauty still maps to salon", () => {
    assert.equal(mapCategory("Nail salon", []), "salon");
    assert.equal(mapCategory("Hair salon", []), "salon");
    assert.equal(mapCategory("Barber shop", []), "salon");
    assert.equal(mapCategory("Beauty salon", []), "salon");
  });

  it("returns null when both primary and secondaries are empty", () => {
    assert.equal(mapCategory(undefined, undefined), null);
    assert.equal(mapCategory("", []), null);
  });
});

describe("mapCategory new categories (Phase scaling)", () => {
  it("primary 'Live music venue' returns live_music, not bar", () => {
    assert.equal(mapCategory("Live music venue", []), "live_music");
  });
  it("primary 'Concert venue' returns live_music", () => {
    assert.equal(mapCategory("Concert venue", []), "live_music");
  });
  it("primary 'Jazz club' returns live_music", () => {
    assert.equal(mapCategory("Jazz club", ["Bar"]), "live_music");
  });
  it("primary 'Music venue' returns live_music", () => {
    assert.equal(mapCategory("Music venue", []), "live_music");
  });

  it("primary 'Plant nursery' returns plant_shop", () => {
    assert.equal(mapCategory("Plant nursery", []), "plant_shop");
  });
  it("primary 'Garden center' returns plant_shop", () => {
    assert.equal(mapCategory("Garden center", []), "plant_shop");
  });
  it("primary 'Plant store' returns plant_shop", () => {
    assert.equal(mapCategory("Plant store", []), "plant_shop");
  });
  it("'Florist' with plant context returns plant_shop", () => {
    assert.equal(
      mapCategory("Florist", ["Plant store", "House plants"]),
      "plant_shop",
    );
  });

  it("primary 'Book store' returns bookstore", () => {
    assert.equal(mapCategory("Book store", []), "bookstore");
  });
  it("primary 'Bookstore' returns bookstore", () => {
    assert.equal(mapCategory("Bookstore", []), "bookstore");
  });
  it("primary 'Used bookstore' returns bookstore", () => {
    assert.equal(mapCategory("Used bookstore", []), "bookstore");
  });
  it("primary 'Comic book store' returns bookstore", () => {
    assert.equal(mapCategory("Comic book store", []), "bookstore");
  });

  it("primary 'Record store' returns record_store", () => {
    assert.equal(mapCategory("Record store", []), "record_store");
  });
  it("primary 'Vinyl store' returns record_store", () => {
    assert.equal(mapCategory("Vinyl store", []), "record_store");
  });
  it("'Music store' alone returns null (ambiguous, queue for review)", () => {
    // Could be instruments OR vinyl. We do NOT map it; needs_review queue
    // catches it. This is the explicit carve-out from the spec.
    assert.equal(mapCategory("Music store", []), null);
  });

  it("primary 'Florist' returns florist", () => {
    assert.equal(mapCategory("Florist", []), "florist");
  });
  it("primary 'Flower shop' returns florist", () => {
    assert.equal(mapCategory("Flower shop", []), "florist");
  });
  it("primary 'Flower delivery' returns florist", () => {
    assert.equal(mapCategory("Flower delivery", []), "florist");
  });

  it("primary 'Art gallery' returns gallery_museum", () => {
    assert.equal(mapCategory("Art gallery", []), "gallery_museum");
  });
  it("primary 'Museum' returns gallery_museum", () => {
    assert.equal(mapCategory("Museum", []), "gallery_museum");
  });
  it("primary 'Modern art museum' returns gallery_museum", () => {
    assert.equal(mapCategory("Modern art museum", []), "gallery_museum");
  });
  it("primary 'History museum' returns gallery_museum", () => {
    assert.equal(mapCategory("History museum", []), "gallery_museum");
  });
  it("primary \"Children's museum\" returns gallery_museum", () => {
    assert.equal(mapCategory("Children's museum", []), "gallery_museum");
  });
  it("'Theater' still returns experience (not gallery_museum)", () => {
    // Regression: gallery_museum carved out from experience; experience
    // retains theaters, arenas, bowling, escape rooms, tours.
    assert.equal(mapCategory("Theater", []), "experience");
    assert.equal(mapCategory("Bowling alley", []), "experience");
    assert.equal(mapCategory("Escape room", []), "experience");
  });

  it("'Karaoke bar' returns live_music, not bar", () => {
    assert.equal(mapCategory("Karaoke bar", []), "live_music");
  });
});

describe("mapCategory spa branch (Phase A2 follow-up)", () => {
  it("primary 'Day spa' returns spa", () => {
    assert.equal(mapCategory("Day spa", []), "spa");
  });
  it("primary 'Spa' returns spa", () => {
    assert.equal(mapCategory("Spa", []), "spa");
  });
  it("primary 'Med spa' returns spa", () => {
    assert.equal(mapCategory("Med spa", []), "spa");
  });
  it("primary 'Medical spa' returns spa", () => {
    assert.equal(mapCategory("Medical spa", []), "spa");
  });
  it("primary 'Massage spa' returns spa", () => {
    assert.equal(mapCategory("Massage spa", []), "spa");
  });
  it("primary 'Wellness center' returns spa", () => {
    assert.equal(mapCategory("Wellness center", []), "spa");
  });
  it("primary 'Wellness studio' returns spa", () => {
    assert.equal(mapCategory("Wellness studio", []), "spa");
  });

  it("'Hair salon' does NOT map to spa", () => {
    assert.equal(mapCategory("Hair salon", []), "salon");
  });
  it("'Nail salon' does NOT map to spa", () => {
    assert.equal(mapCategory("Nail salon", []), "salon");
  });
  it("'Barber shop' does NOT map to spa", () => {
    assert.equal(mapCategory("Barber shop", []), "salon");
  });
  it("'Beauty salon' does NOT map to spa", () => {
    assert.equal(mapCategory("Beauty salon", []), "salon");
  });

  it("'Spanish restaurant' still returns restaurant (substring 'spa' guard)", () => {
    assert.equal(mapCategory("Spanish restaurant", []), "restaurant");
  });

  it("'Hair salon' with 'Spa' secondary stays salon, not spa", () => {
    // Salons that also list spa services in secondaries should not flip
    // to spa. The spa branch defers when salon/barber/nail context shows.
    assert.equal(mapCategory("Hair salon", ["Spa", "Day spa"]), "salon");
  });
});
