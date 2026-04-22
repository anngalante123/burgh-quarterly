"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * PageTransition — subtle fade between routes.
 *
 * Spec:
 *   - ~200ms fade (no slides, no scales)
 *   - Keyed on pathname so back/forward navigation re-triggers
 *   - Reduced-motion users get a static wrapper with no opacity animation
 *
 * Wrapped around {children} in the root layout. Because this is a client
 * boundary, the children themselves remain server-rendered Suspense trees —
 * this wrapper just animates their mount/unmount when the key changes.
 */

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className="contents">{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="contents"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export default PageTransition;
