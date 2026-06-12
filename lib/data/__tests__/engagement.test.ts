import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_ENGAGEMENT_FOLLOWERS,
  MAX_CREDIBLE_ENGAGEMENT_RATE,
  sanitizeEngagementRate,
} from "../engagement";

describe("sanitizeEngagementRate", () => {
  it("passes a credible rate through unchanged", () => {
    assert.equal(sanitizeEngagementRate(0.0639, 3129), 0.0639);
  });

  it("zeroes the audit's 1,739% artifact (turtle-twist)", () => {
    assert.equal(sanitizeEngagementRate(17.3904, 653), 0);
  });

  it("zeroes high rates on tiny accounts (souper-bowl, 20 followers)", () => {
    assert.equal(sanitizeEngagementRate(1.75, 20), 0);
  });

  it("zeroes any rate below the follower floor", () => {
    assert.equal(
      sanitizeEngagementRate(0.05, MIN_ENGAGEMENT_FOLLOWERS - 1),
      0,
    );
    assert.equal(
      sanitizeEngagementRate(0.05, MIN_ENGAGEMENT_FOLLOWERS),
      0.05,
    );
  });

  it("zeroes rates above the credibility ceiling even with many followers", () => {
    assert.equal(
      sanitizeEngagementRate(MAX_CREDIBLE_ENGAGEMENT_RATE + 0.01, 50000),
      0,
    );
    assert.equal(
      sanitizeEngagementRate(MAX_CREDIBLE_ENGAGEMENT_RATE, 50000),
      MAX_CREDIBLE_ENGAGEMENT_RATE,
    );
  });

  it("handles missing, non-finite, and non-positive input", () => {
    assert.equal(sanitizeEngagementRate(undefined, 5000), 0);
    assert.equal(sanitizeEngagementRate(null, 5000), 0);
    assert.equal(sanitizeEngagementRate(NaN, 5000), 0);
    assert.equal(sanitizeEngagementRate(Infinity, 5000), 0);
    assert.equal(sanitizeEngagementRate(-0.02, 5000), 0);
    assert.equal(sanitizeEngagementRate(0, 5000), 0);
    assert.equal(sanitizeEngagementRate(0.05, undefined), 0);
    assert.equal(sanitizeEngagementRate(0.05, null), 0);
  });
});
