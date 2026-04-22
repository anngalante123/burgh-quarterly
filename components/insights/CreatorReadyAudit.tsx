import { Reveal } from "@/components/motion/Reveal";
import type { CreatorAudit } from "@/lib/editorial/creator-audit";
import { cn } from "@/lib/utils";

/**
 * CreatorReadyAudit, boolean checklist of creator-readiness signals.
 * Each fail carries a one-line fix so the reader (or owner) walks away
 * with a concrete to-do list.
 *
 * Pass/fail uses visual tokens from the brand palette, lime for pass,
 * purple for fail, rather than green/red.
 */

type CreatorReadyAuditProps = {
  audit: CreatorAudit;
};

export function CreatorReadyAudit({ audit }: CreatorReadyAuditProps) {
  const { checks, passed, total } = audit;

  return (
    <Reveal as="section" className="block">
      <div aria-label="Creator-ready audit">
        <div className="border-b border-brand-black/15 pb-3 mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black">
            Creator-ready audit
          </h2>
          <span className="font-display text-[0.65rem] font-semibold tabular-nums tracking-[0.14em] text-brand-black">
            <span className="text-brand-lime font-black">{passed}</span>
            <span className="text-brand-black/40"> / {total} passing</span>
          </span>
        </div>

        <p className="mb-5 font-body text-xs md:text-sm text-brand-black/65 max-w-2xl leading-snug">
          The ten things creators check before pitching a business. Passes
          are visible on Google and Instagram right now. Each fail carries
          a specific fix.
        </p>

        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0 border-t border-brand-black/10">
          {checks.map((check) => (
            <li
              key={check.id}
              className="flex items-start gap-3 py-3 border-b border-brand-black/10"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "shrink-0 inline-flex items-center justify-center w-5 h-5 mt-0.5 rounded-full font-display text-[0.65rem] font-semibold",
                  check.pass
                    ? "bg-brand-lime text-brand-black"
                    : "bg-brand-purple text-brand-off-white",
                )}
              >
                {check.pass ? "✓" : "×"}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "font-display text-sm font-semibold tracking-tight",
                    check.pass ? "text-brand-black" : "text-brand-black",
                  )}
                >
                  {check.label}
                </p>
                {!check.pass && check.fix && (
                  <p className="mt-1 font-body text-[0.78rem] md:text-xs text-brand-purple leading-snug">
                    Fix: {check.fix}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}
