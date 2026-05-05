import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isInPittsburghMetro, extractZipState } from "../geo-filter";

/**
 * Unit tests for the Pittsburgh-metro geo filter. Scope is intentional:
 *   - In:  PA + ZIP starts with `152` (Allegheny County, Pittsburgh)
 *   - In:  PA + ZIP starts with `153` (Washington / Greene / Fayette)
 *   - In:  PA + specific 151xx Allegheny County suburb ZIPs
 *   - Out: any other state, any other PA ZIP (including non-Allegheny
 *          151xx ZIPs like Aliquippa 15001), anything malformed
 *
 * Run via:
 *   npx tsx --test lib/data/__tests__/geo-filter.test.ts
 */

describe("extractZipState parser", () => {
  it("parses standard Apify address shape", () => {
    const r = extractZipState("5525 Walnut St, Pittsburgh, PA 15232");
    assert.equal(r.zip, "15232");
    assert.equal(r.state, "PA");
  });
  it("parses Pennsylvania spelled out", () => {
    const r = extractZipState("100 Main St, Pittsburgh, Pennsylvania 15217");
    assert.equal(r.zip, "15217");
    assert.equal(r.state, "PA");
  });
  it("tolerates ZIP+4", () => {
    const r = extractZipState("100 Main St, Pittsburgh, PA 15217-1234");
    assert.equal(r.zip, "15217");
    assert.equal(r.state, "PA");
  });
  it("parses non-PA state codes verbatim", () => {
    const r = extractZipState("123 Main, Goshen, NY 10940");
    assert.equal(r.zip, "10940");
    assert.equal(r.state, "NY");
  });
  it("returns nulls on missing input", () => {
    assert.deepEqual(extractZipState(null), { zip: null, state: null });
    assert.deepEqual(extractZipState(undefined), { zip: null, state: null });
    assert.deepEqual(extractZipState(""), { zip: null, state: null });
  });
  it("returns nulls on a malformed address (no zip)", () => {
    const r = extractZipState("somewhere in pittsburgh");
    assert.equal(r.zip, null);
    assert.equal(r.state, null);
  });
});

describe("isInPittsburghMetro Pittsburgh ZIPs", () => {
  it("accepts 15201 (Lawrenceville)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "100 Main St, Pittsburgh, PA 15201" }),
      true,
    );
  });
  it("accepts 15203 (South Side)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "100 Main St, Pittsburgh, PA 15203" }),
      true,
    );
  });
  it("accepts 15217 (Squirrel Hill)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "100 Main St, Pittsburgh, PA 15217" }),
      true,
    );
  });
  it("accepts 15222 (Strip District / Downtown)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "100 Main St, Pittsburgh, PA 15222" }),
      true,
    );
  });
});

describe("isInPittsburghMetro Washington County PA ZIPs", () => {
  it("accepts 15301 (Washington PA)", () => {
    assert.equal(
      isInPittsburghMetro({
        address: "100 Main St, Washington, PA 15301",
      }),
      true,
    );
  });
  it("accepts 15317 (Canonsburg)", () => {
    assert.equal(
      isInPittsburghMetro({
        address: "100 Main St, Canonsburg, PA 15317",
      }),
      true,
    );
  });
  it("accepts 15370 (Waynesburg)", () => {
    assert.equal(
      isInPittsburghMetro({
        address: "100 Main St, Waynesburg, PA 15370",
      }),
      true,
    );
  });
});

describe("isInPittsburghMetro Allegheny County 151xx suburbs", () => {
  it("accepts 15139 (Oakmont)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "100 Main St, Oakmont, PA 15139" }),
      true,
    );
  });
  it("accepts 15101 (Allison Park)", () => {
    assert.equal(
      isInPittsburghMetro({
        address: "100 Main St, Allison Park, PA 15101",
      }),
      true,
    );
  });
  it("accepts 15116 (Glenshaw)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "100 Main St, Glenshaw, PA 15116" }),
      true,
    );
  });
  it("accepts 15146 (Monroeville)", () => {
    assert.equal(
      isInPittsburghMetro({
        address: "100 Main St, Monroeville, PA 15146",
      }),
      true,
    );
  });
  it("accepts 15143 (Sewickley)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "100 Main St, Sewickley, PA 15143" }),
      true,
    );
  });
  it("accepts 15102 (Bethel Park)", () => {
    assert.equal(
      isInPittsburghMetro({
        address: "100 Main St, Bethel Park, PA 15102",
      }),
      true,
    );
  });
  it("accepts 15106 (Carnegie)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "100 Main St, Carnegie, PA 15106" }),
      true,
    );
  });
  it("accepts a 151xx suburb via structured Apify fields", () => {
    assert.equal(
      isInPittsburghMetro({
        postalCode: "15146",
        state: "Pennsylvania",
        address: null,
      }),
      true,
    );
  });
});

describe("isInPittsburghMetro out-of-scope", () => {
  it("rejects NY (Goshen 10940)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "123 Main, Goshen, NY 10940" }),
      false,
    );
  });
  it("rejects MA (Cambridge 02139)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "123 Main, Cambridge, MA 02139" }),
      false,
    );
  });
  it("rejects AK (Fairbanks 99701)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "123 Main, Fairbanks, AK 99701" }),
      false,
    );
  });
  it("rejects CT (Bethany 06472)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "123 Main, Bethany, CT 06472" }),
      false,
    );
  });
  it("rejects PA out of metro: Stroudsburg 18360", () => {
    assert.equal(
      isInPittsburghMetro({ address: "100 Main, Stroudsburg, PA 18360" }),
      false,
    );
  });
  it("rejects PA out of metro: Erie 16501", () => {
    assert.equal(
      isInPittsburghMetro({ address: "100 Main, Erie, PA 16501" }),
      false,
    );
  });
  it("rejects non-Allegheny 151xx: Aliquippa 15001 (Beaver County)", () => {
    assert.equal(
      isInPittsburghMetro({ address: "100 Main, Aliquippa, PA 15001" }),
      false,
    );
  });
  it("rejects non-Allegheny 151xx via structured fields: 15001 + PA", () => {
    assert.equal(
      isInPittsburghMetro({
        postalCode: "15001",
        state: "PA",
        address: null,
      }),
      false,
    );
  });
});

describe("isInPittsburghMetro malformed / missing", () => {
  it("rejects missing address", () => {
    assert.equal(isInPittsburghMetro({}), false);
  });
  it("rejects null address", () => {
    assert.equal(isInPittsburghMetro({ address: null }), false);
  });
  it("rejects malformed address with no zip", () => {
    assert.equal(
      isInPittsburghMetro({ address: "somewhere in pittsburgh" }),
      false,
    );
  });
  it("rejects empty string", () => {
    assert.equal(isInPittsburghMetro({ address: "" }), false);
  });
});

describe("isInPittsburghMetro structured Apify fields", () => {
  it("uses postalCode + state when present", () => {
    assert.equal(
      isInPittsburghMetro({
        postalCode: "15232",
        state: "Pennsylvania",
        address: null,
      }),
      true,
    );
  });
  it("rejects when state is non-PA even if postalCode looks Pittsburgh-ish", () => {
    assert.equal(
      isInPittsburghMetro({
        postalCode: "15232",
        state: "NY",
        address: null,
      }),
      false,
    );
  });
  it("rejects when postalCode is out of metro even if state is PA", () => {
    assert.equal(
      isInPittsburghMetro({
        postalCode: "16501",
        state: "PA",
        address: null,
      }),
      false,
    );
  });
  it("falls back to address parsing when only one structured field is present", () => {
    assert.equal(
      isInPittsburghMetro({
        postalCode: "15217",
        state: null,
        address: "100 Main St, Pittsburgh, PA 15217",
      }),
      true,
    );
  });
});
