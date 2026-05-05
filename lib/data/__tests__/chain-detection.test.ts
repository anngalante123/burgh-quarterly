import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isChain } from "../chain-detection";

/**
 * Unit tests for chain detection. The blocklist is a substring match;
 * Pittsburgh local mini-chains (Pamela's, Eat'n Park, Big Burrito family,
 * Klavon's, Driftwood Oven, La Gourmandine) MUST short-circuit even when
 * their names share substrings with national chains. False positives are
 * worse than false negatives.
 *
 * Run via:
 *   npx tsx --test lib/data/__tests__/chain-detection.test.ts
 */

describe("isChain national chain matches", () => {
  it("flags Starbucks", () => {
    assert.equal(isChain("Starbucks"), true);
    assert.equal(isChain("Starbucks Reserve - Strip District"), true);
  });
  it("flags Sheetz", () => {
    assert.equal(isChain("Sheetz #324"), true);
  });
  it("flags Dunkin variants", () => {
    assert.equal(isChain("Dunkin'"), true);
    assert.equal(isChain("Dunkin Donuts"), true);
    assert.equal(isChain("Dunkin"), true);
  });
  it("flags fast food chains", () => {
    assert.equal(isChain("McDonald's"), true);
    assert.equal(isChain("Burger King"), true);
    assert.equal(isChain("Wendy's"), true);
    assert.equal(isChain("Chipotle Mexican Grill"), true);
    assert.equal(isChain("Subway"), true);
    assert.equal(isChain("Five Guys Burgers and Fries"), true);
    assert.equal(isChain("Chick-fil-A"), true);
    assert.equal(isChain("KFC"), true);
    assert.equal(isChain("Taco Bell"), true);
  });
  it("flags pizza chains", () => {
    assert.equal(isChain("Domino's Pizza"), true);
    assert.equal(isChain("Pizza Hut"), true);
    assert.equal(isChain("Papa John's"), true);
    assert.equal(isChain("Little Caesars"), true);
  });
  it("flags sit-down chains", () => {
    assert.equal(isChain("Applebee's Grill + Bar"), true);
    assert.equal(isChain("Olive Garden Italian Restaurant"), true);
    assert.equal(isChain("Buffalo Wild Wings"), true);
    assert.equal(isChain("Chili's Grill & Bar"), true);
    assert.equal(isChain("IHOP"), true);
    assert.equal(isChain("Cracker Barrel Old Country Store"), true);
    assert.equal(isChain("Texas Roadhouse"), true);
    assert.equal(isChain("Outback Steakhouse"), true);
  });
  it("flags grocery + big box", () => {
    assert.equal(isChain("Whole Foods Market"), true);
    assert.equal(isChain("Trader Joe's"), true);
    assert.equal(isChain("ALDI"), true);
    assert.equal(isChain("Giant Eagle"), true);
    assert.equal(isChain("Walmart Supercenter"), true);
    assert.equal(isChain("Target"), true);
    assert.equal(isChain("Costco Wholesale"), true);
  });
  it("flags drugstores", () => {
    assert.equal(isChain("CVS"), true);
    assert.equal(isChain("Walgreens"), true);
    assert.equal(isChain("Rite Aid"), true);
  });
  it("flags fitness chains", () => {
    assert.equal(isChain("Planet Fitness"), true);
    assert.equal(isChain("LA Fitness"), true);
    assert.equal(isChain("Orangetheory Fitness"), true);
    assert.equal(isChain("F45 Training"), true);
  });
  it("flags salon + wellness chains", () => {
    assert.equal(isChain("Massage Envy"), true);
    assert.equal(isChain("European Wax Center"), true);
    assert.equal(isChain("Hand & Stone Massage"), true);
    assert.equal(isChain("Great Clips"), true);
  });
  it("flags ice cream chains", () => {
    assert.equal(isChain("Dairy Queen"), true);
    assert.equal(isChain("Cold Stone Creamery"), true);
    assert.equal(isChain("Baskin-Robbins"), true);
  });
});

describe("isChain Pittsburgh local exemptions (must NOT flag)", () => {
  it("Pamela's Diner is local, not a chain", () => {
    assert.equal(isChain("Pamela's Diner"), false);
    assert.equal(isChain("Pamela's P&G Diner"), false);
    assert.equal(isChain("Pamelas Diner - Strip District"), false);
  });
  it("Eat'n Park is local", () => {
    assert.equal(isChain("Eat'n Park"), false);
    assert.equal(isChain("Eat'n Park - Robinson"), false);
  });
  it("Big Burrito Group restaurants are local", () => {
    assert.equal(isChain("Mad Mex"), false);
    assert.equal(isChain("Mad Mex - Shadyside"), false);
    assert.equal(isChain("Gaucho Parrilla Argentina"), false);
    assert.equal(isChain("Eleven"), false);
    assert.equal(isChain("Casbah"), false);
    assert.equal(isChain("Kaya"), false);
    assert.equal(isChain("Soba"), false);
  });
  it("Klavon's is local", () => {
    assert.equal(isChain("Klavon's Ice Cream Parlor"), false);
    assert.equal(isChain("Klavon's"), false);
  });
  it("Driftwood Oven is local", () => {
    assert.equal(isChain("Driftwood Oven"), false);
    assert.equal(isChain("Driftwood Oven - Lawrenceville"), false);
  });
  it("La Gourmandine is local", () => {
    assert.equal(isChain("La Gourmandine Bakery & Pastry Shop"), false);
  });
});

describe("isChain edge cases", () => {
  it("handles empty / null inputs gracefully", () => {
    assert.equal(isChain(""), false);
    assert.equal(isChain({ name: null }), false);
    assert.equal(isChain({ name: undefined }), false);
    assert.equal(isChain({}), false);
  });
  it("supports the object call shape with alternateName", () => {
    assert.equal(
      isChain({ name: "An Indie Place", alternateName: "Starbucks #2" }),
      true,
    );
    assert.equal(
      isChain({ name: "Pamela's Diner", alternateName: "Starbucks" }),
      false,
      "local exemption short-circuits the alternate name",
    );
  });
  it("does not flag indie names that share substrings", () => {
    // Confidence checks: indie Pittsburgh businesses with names that do
    // not collide with the blocklist.
    assert.equal(isChain("De Fer Coffee & Tea"), false);
    assert.equal(isChain("Allegro Hearth Bakery"), false);
    assert.equal(isChain("Apteka"), false);
    assert.equal(isChain("Bitter Ends Garden & Luncheonette"), false);
  });
});
