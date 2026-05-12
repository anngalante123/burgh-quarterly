import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeApifyRecord,
  normalizeBusinessTitle,
  resetDedupeState,
  type SkipReason,
} from "../normalize";

/**
 * Tests for the ingest-time guards added 2026-05-12 after the cleanup pass
 * that deleted 326 bad rows from production. The guards live inside
 * `normalizeApifyRecord` so every consumer (ingest-30, migrate-json-to-db,
 * any future batch path) is protected without each caller having to call
 * `isInPittsburghMetro` and `isChain` themselves.
 *
 * Run via:
 *   npx tsx --test lib/data/__tests__/ingest-guards.test.ts
 */

function record(overrides: Record<string, unknown> = {}) {
  return {
    placeId: "ChIJ_TEST_PLACE_ID_PA",
    title: "Test Cafe",
    categoryName: "Coffee shop",
    address: "100 Main St, Pittsburgh, PA 15217",
    state: "PA",
    ...overrides,
  };
}

describe("normalizeApifyRecord — geo guard", () => {
  it("accepts a Pittsburgh 152xx address", () => {
    resetDedupeState();
    const r = normalizeApifyRecord(record());
    assert.notEqual(r, null);
    assert.equal(r?.address, "100 Main St, Pittsburgh, PA 15217");
  });

  it("rejects a Boston (MA) address", () => {
    resetDedupeState();
    const skips: SkipReason[] = [];
    const r = normalizeApifyRecord(
      record({
        title: "Tatte Bakery Back Bay",
        address: "399 Boylston St, Boston, MA 02116",
        state: "MA",
      }),
      { onSkip: (reason) => skips.push(reason) },
    );
    assert.equal(r, null);
    assert.deepEqual(skips, ["out_of_geo"]);
  });

  it("rejects an NYC address", () => {
    resetDedupeState();
    const r = normalizeApifyRecord(
      record({
        title: "Mustang Harrys",
        address: "352 7th Ave, New York, NY 10001",
        state: "NY",
      }),
    );
    assert.equal(r, null);
  });

  it("rejects a far-PA address (Philadelphia)", () => {
    resetDedupeState();
    const skips: SkipReason[] = [];
    const r = normalizeApifyRecord(
      record({
        title: "Reading Terminal Market",
        address: "51 N 12th St, Philadelphia, PA 19107",
        state: "PA",
      }),
      { onSkip: (reason) => skips.push(reason) },
    );
    assert.equal(r, null);
    assert.deepEqual(skips, ["out_of_geo"]);
  });

  it("respects enforceGeoFilter:false opt-out (for ingest-one.ts)", () => {
    resetDedupeState();
    const r = normalizeApifyRecord(
      record({
        title: "Out-of-Geo Test",
        address: "1 Bass Pro Dr, Bridgeport, CT 06608",
        state: "CT",
      }),
      { enforceGeoFilter: false },
    );
    // Geo guard skipped, but chain guard still runs. "Out-of-Geo Test"
    // isn't a chain, so the record should pass.
    assert.notEqual(r, null);
  });
});

describe("normalizeApifyRecord — chain guard", () => {
  it("rejects Starbucks", () => {
    resetDedupeState();
    const skips: SkipReason[] = [];
    const r = normalizeApifyRecord(
      record({ title: "Starbucks", placeId: "ChIJ_SBX_1" }),
      { onSkip: (reason) => skips.push(reason) },
    );
    assert.equal(r, null);
    assert.deepEqual(skips, ["chain"]);
  });

  it("rejects McDonald's even on a valid PGH address", () => {
    resetDedupeState();
    const r = normalizeApifyRecord(
      record({ title: "McDonald's", placeId: "ChIJ_MCD_1" }),
    );
    assert.equal(r, null);
  });

  it("respects enforceChainFilter:false opt-out", () => {
    resetDedupeState();
    const r = normalizeApifyRecord(
      record({ title: "Starbucks", placeId: "ChIJ_SBX_2" }),
      { enforceChainFilter: false },
    );
    assert.notEqual(r, null);
  });
});

describe("normalizeBusinessTitle", () => {
  it("title-cases multi-word ALL-CAPS names", () => {
    assert.equal(
      normalizeBusinessTitle("AGORA MEDITERRANEAN CUISINE"),
      "Agora Mediterranean Cuisine",
    );
    assert.equal(
      normalizeBusinessTitle("ALL GOOD TATTOO COMPANY"),
      "All Good Tattoo Company",
    );
    assert.equal(
      normalizeBusinessTitle("FINE WINE & GOOD SPIRITS"),
      "Fine Wine & Good Spirits",
    );
  });

  it("preserves single-word stylized brands", () => {
    assert.equal(normalizeBusinessTitle("APTEKA"), "APTEKA");
    assert.equal(normalizeBusinessTitle("BARRE3"), "BARRE3");
    assert.equal(normalizeBusinessTitle("BRGR"), "BRGR");
    assert.equal(normalizeBusinessTitle("SOHO"), "SOHO");
  });

  it("preserves mixed-case names unchanged", () => {
    assert.equal(normalizeBusinessTitle("La Gourmandine"), "La Gourmandine");
    assert.equal(normalizeBusinessTitle("DeLuca's Diner"), "DeLuca's Diner");
    assert.equal(normalizeBusinessTitle("Page's"), "Page's");
    assert.equal(
      normalizeBusinessTitle("Nan Xiang Soup Dumplings - Pittsburgh"),
      "Nan Xiang Soup Dumplings - Pittsburgh",
    );
  });

  it("lowercases connectors when not first", () => {
    assert.equal(
      normalizeBusinessTitle("THE CHURCH BREW WORKS"),
      "The Church Brew Works",
    );
    assert.equal(
      normalizeBusinessTitle("HOUSE OF BAR-B-QUE"),
      "House of Bar-B-Que",
    );
  });

  it("preserves known acronyms inside multi-word titles", () => {
    assert.equal(
      normalizeBusinessTitle("PGH BBQ COMPANY"),
      "PGH BBQ Company",
    );
  });

  it("handles ampersand-joined names", () => {
    assert.equal(
      normalizeBusinessTitle("MCCORMICK & SCHMICK'S"),
      "Mccormick & Schmick's",
    );
    // Note: Mc-prefix names get downcased; this is an acceptable
    // trade-off vs. the alternative (treating Mc/Mac specially adds
    // complexity for marginal benefit). Callers can post-process if
    // a specific row needs further normalization.
  });

  it("handles empty and trimmable input", () => {
    assert.equal(normalizeBusinessTitle(""), "");
    assert.equal(normalizeBusinessTitle("   "), "   ");
  });
});
