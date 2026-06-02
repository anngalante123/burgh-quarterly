"use client";

import { useSearchParams } from "next/navigation";
import { ClaimAffordance } from "@/components/ClaimAffordance";
import { SidebarCTA } from "@/components/SidebarCTA";

/**
 * Client-side ?claimed=true branchers, colocated with the business route.
 *
 * The ?claimed query-string toggle is the only source of page dynamism.
 * Keeping the toggle reader client-side lets the server component
 * pre-render to static HTML (one shell per slug via generateStaticParams).
 * These small components hydrate the claimed/unclaimed variations at
 * request time, so the shell stays static while the toggle stays dynamic.
 */
function useClaimed(): boolean {
  const sp = useSearchParams();
  return sp.get("claimed") === "true";
}

export function ClaimedHeaderBadge() {
  if (!useClaimed()) return null;
  return (
    <p className="mt-3 inline-flex items-center gap-2 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-purple">
      <span
        aria-hidden="true"
        className="inline-block w-1.5 h-1.5 rounded-full bg-brand-purple"
      />
      Claimed by owner
    </p>
  );
}

export function ClaimAffordanceUnlessClaimed({ slug }: { slug: string }) {
  if (useClaimed()) return null;
  return (
    <div className="pt-2">
      <ClaimAffordance slug={slug} />
    </div>
  );
}

export function SidebarCTAIfClaimed() {
  const claimed = useClaimed();
  return <SidebarCTA visible={claimed} />;
}
