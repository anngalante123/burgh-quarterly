"use client";

import { useCallback } from "react";
import posthog from "posthog-js";
import type { EventName } from "@/lib/posthog/events";

/**
 * Returns a stable `track(event, properties)` callback for client components.
 *
 * Safe to call before PostHog has loaded (or when no key is configured): it
 * checks posthog.__loaded and silently no-ops, so analytics never throws into
 * a user interaction.
 */
export function useTrackEvent() {
  return useCallback(
    (event: EventName, properties?: Record<string, unknown>) => {
      try {
        if (typeof window !== "undefined" && posthog.__loaded) {
          posthog.capture(event, properties);
        }
      } catch {
        // PostHog not initialized — skip.
      }
    },
    [],
  );
}
