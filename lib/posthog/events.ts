/**
 * Central registry of analytics event names.
 *
 * Defining them here (instead of sprinkling string literals through the
 * components) keeps the PostHog dashboard insights pointed at a stable,
 * typo-proof set of event names. If you rename an event, do it here and the
 * compiler points you at every call site.
 *
 * Page views (`$pageview`) are captured automatically by PostHogPageview and
 * are NOT listed here.
 */

export const EVENTS = {
  // --- Form conversions (goal completions) ---
  SUBSCRIBE_COMPLETED: "subscribe_completed",
  GET_FEATURED_SUBMITTED: "get_featured_submitted",
  BUSINESS_CLAIM_SUBMITTED: "business_claim_submitted",

  // --- Engagement / discovery ---
  SEARCH_PERFORMED: "search_performed",
  BUSINESS_PROFILE_VIEWED: "business_profile_viewed",
  OUTBOUND_CLICK: "outbound_click",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
