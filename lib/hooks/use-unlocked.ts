"use client";

import { useEffect, useState } from "react";

/**
 * useUnlocked, a client hook that returns whether the current visitor
 * has unlocked gated content (the medium gate on business pages).
 *
 * State derives from the `signal_unlocked` cookie. The cookie is set
 * by /api/subscribe after a successful email submission, from either
 * the SubscribeFooter or the inline GatedReveal email form.
 *
 * To trigger an immediate unlock without a page reload (e.g. after the
 * gate's own form submits), dispatch a `signal:unlock` window event.
 * Every Gated component listens, all unlock simultaneously.
 */

const COOKIE_NAME = "signal_unlocked";
export const UNLOCK_EVENT = "signal:unlock";

function readCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE_NAME}=1`));
}

export function useUnlocked(): boolean {
  // Start locked on first paint to avoid SSR/CSR mismatch. Effect flips
  // it to the cookie-derived state immediately on mount.
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    setUnlocked(readCookie());
    const onUnlock = () => setUnlocked(true);
    window.addEventListener(UNLOCK_EVENT, onUnlock);
    return () => window.removeEventListener(UNLOCK_EVENT, onUnlock);
  }, []);

  return unlocked;
}

/** Notify every Gated region on the page that we just unlocked. */
export function dispatchUnlock(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UNLOCK_EVENT));
}
