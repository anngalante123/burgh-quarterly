"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Manual pageview tracking for the App Router.
 *
 * posthog-js autocapture only fires a pageview on the initial hard load. This
 * component listens to pathname + search param changes so every client-side
 * navigation also records a `$pageview`. Must be rendered inside a <Suspense>
 * boundary because useSearchParams() opts the subtree into client rendering.
 */
export default function PostHogPageview(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || !posthog.__loaded) return;

    let url = window.origin + pathname;
    const search = searchParams.toString();
    if (search) {
      url += `?${search}`;
    }

    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}
