import { Reveal } from "@/components/motion/Reveal";
import type { Playbook as PlaybookData } from "@/lib/editorial/playbook";
import { cn } from "@/lib/utils";

/**
 * Playbook, three data-derived recommendations per business, each tied
 * to a specific subscore. Replaces the generic "here's one unfair
 * advantage" framing with prescriptive, specific guidance.
 *
 * Visual: numbered card list with a signal chip (which axis it moves),
 * a priority pill, and the recommended action. Reads like a consulting
 * one-pager slide, not a scorecard row.
 */

const SIGNAL_LABEL: Record<
  PlaybookData["items"][number]["signal"],
  string
> = {
  momentum: "Instagram",
  content_canvas: "Photos",
  community_spark: "Reviews",
  conversion_path: "Findability",
  collab_fit: "Creator fit",
};

const PRIORITY_CLASS: Record<
  PlaybookData["items"][number]["priority"],
  string
> = {
  high: "bg-brand-lime text-brand-black",
  medium: "bg-brand-purple text-brand-lavender",
  low: "bg-brand-cream text-brand-black border border-brand-black/25",
};

const PRIORITY_LABEL: Record<
  PlaybookData["items"][number]["priority"],
  string
> = {
  high: "Highest leverage",
  medium: "Medium leverage",
  low: "Keep it tight",
};

type PlaybookProps = {
  playbook: PlaybookData;
};

export function Playbook({ playbook }: PlaybookProps) {
  if (playbook.items.length === 0) return null;

  return (
    <Reveal as="section" className="block">
      <div aria-label="Playbook">
        <div className="border-b border-brand-black/15 pb-3 mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black">
            The Playbook
          </h2>
          <span className="font-body text-[0.65rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/50">
            Three moves that move the rank
          </span>
        </div>

        <ol className="pb-flow-line relative grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {playbook.items.map((item, i) => (
            <li
              key={i}
              data-pos={i}
              className="pb-card relative z-10 flex flex-col gap-3 border border-brand-black/15 bg-white/85 backdrop-blur-sm p-5 md:p-6 rounded-sm"
              style={
                {
                  "--pb-delay": `${i * 120}ms`,
                } as React.CSSProperties
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[0.7rem] font-semibold tabular-nums tracking-[0.14em] text-brand-purple">
                  0{i + 1}
                </span>
                <span
                  className={cn(
                    "font-display text-[0.55rem] font-semibold uppercase tracking-[0.14em] px-2 py-0.5",
                    PRIORITY_CLASS[item.priority],
                  )}
                >
                  {PRIORITY_LABEL[item.priority]}
                </span>
              </div>
              <h3 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-lg md:text-xl leading-[1.1]">
                {item.headline}
              </h3>
              <p className="font-body text-sm md:text-base text-brand-black/80 leading-snug">
                {item.action}
              </p>
              {/* Signal label only. The lime impact_label pill was
                  removed per 2026-04-30 review. The codenames
                  ("+SENTIMENT FLOOR", "+VISUAL RANK") read as internal
                  jargon and didn't add reader value. */}
              <div className="mt-auto pt-2 border-t border-brand-black/10">
                <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-brand-black/50">
                  Signal · {SIGNAL_LABEL[item.signal]}
                </p>
              </div>
            </li>
          ))}
        </ol>

      </div>
    </Reveal>
  );
}
