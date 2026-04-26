"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion/Reveal";
import type { TikTokMentions as TikTokData } from "@/lib/data/load-social";
import { cn } from "@/lib/utils";

/**
 * TikTokMentions, the creator-coverage block.
 *
 * Surfaces what the city is filming about this business on TikTok,
 * regardless of whether the business has its own account. Renders:
 *   - Headline stat: video count + total plays
 *   - Top 5 creators by aggregated plays (handle, fans, video count, plays)
 *   - Top video pull-quote (caption + author + plays)
 *   - "Detected own handle" if heuristic matched
 *
 * The editorial point: the gap between zero-IG-cadence and 30-videos-of-
 * coverage is the conversion-friendly story. Reads like a journalist
 * wrote it, not a dashboard widget.
 */

type Props = {
  data: TikTokData | null;
  businessName: string;
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  const now = Date.now();
  const days = Math.round((now - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function TikTokMentions({ data, businessName }: Props) {
  const reduced = useReducedMotion();

  if (!data || data.video_count === 0) {
    return (
      <Reveal as="section" className="block">
        <div aria-label="TikTok creator coverage">
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black border-b border-brand-black/15 pb-3 mb-5">
            TikTok creator coverage
          </h2>
          <p className="font-body text-sm text-brand-black/60">
            No Pittsburgh TikToks indexed for {businessName} this issue.
          </p>
        </div>
      </Reveal>
    );
  }

  const top = data.top_videos[0];
  const headline =
    data.video_count >= 30
      ? `${data.video_count}+ videos`
      : `${data.video_count} videos`;

  return (
    <Reveal as="section" className="block">
      <div aria-label="TikTok creator coverage">
        <div className="border-b border-brand-black/15 pb-3 mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black">
            TikTok creator coverage
          </h2>
          <span className="font-body text-[0.65rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/50">
            Most recent: {formatDate(data.most_recent_post_at)}
          </span>
        </div>

        {/* Top-line stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          <Stat label="Videos" value={headline} />
          <Stat label="Total plays" value={formatNumber(data.total_plays)} accent="lime" />
          <Stat label="Total likes" value={formatNumber(data.total_likes)} />
          <Stat label="Creators" value={data.unique_creators.toString()} accent="purple" />
        </div>

        {/* Editorial line, the framing */}
        <p className="font-body text-sm md:text-base text-brand-black/80 leading-relaxed mb-6">
          {data.detected_own_handle ? (
            <>
              <span className="font-medium">{businessName}</span> posts on
              TikTok as{" "}
              <a
                href={`https://www.tiktok.com/@${data.detected_own_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-purple font-medium hover:underline"
              >
                @{data.detected_own_handle}
              </a>
              , and {data.unique_creators - 1} other Pittsburgh creators are
              filming there too. The catalog already exists; the question
              is who's amplifying it.
            </>
          ) : (
            <>
              <span className="font-medium">{businessName}</span>{" "}
              isn&apos;t posting on TikTok, but{" "}
              <span className="font-medium text-brand-black">
                {data.unique_creators} Pittsburgh creators
              </span>{" "}
              are filming there anyway. {formatNumber(data.total_plays)}{" "}
              plays say the audience exists. The business hasn&apos;t
              captured any of it.
            </>
          )}
        </p>

        {/* Top creators by aggregated plays */}
        <div className="mb-6">
          <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mb-3">
            Who&apos;s filming
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.top_creators.slice(0, 6).map((c, i) => (
              <li
                key={c.handle}
                className="flex items-baseline gap-3 border-l-2 border-brand-black/10 pl-3 py-1.5 hover:border-brand-purple transition-colors"
              >
                <span
                  aria-hidden="true"
                  className="font-display text-[0.6rem] font-semibold tabular-nums tracking-[0.14em] text-brand-purple"
                >
                  0{i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={c.top_video_url ?? `https://www.tiktok.com/@${c.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={
                      c.top_video_url
                        ? `Watch @${c.handle}'s top video about this business`
                        : `Open @${c.handle} on TikTok`
                    }
                    className="font-display font-semibold text-sm md:text-base text-brand-black hover:text-brand-purple"
                  >
                    @{c.handle}
                  </a>
                  <p className="font-body text-[0.7rem] text-brand-black/55 leading-snug">
                    {c.fans !== null && c.fans > 0
                      ? `${formatNumber(c.fans)} fans · `
                      : ""}
                    {c.videos} video{c.videos === 1 ? "" : "s"} ·{" "}
                    {formatNumber(c.plays)} plays
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Top video pull-quote */}
        {top && (
          <div className="bg-brand-cream border-l-4 border-brand-lime px-4 py-3 md:px-5 md:py-4">
            <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mb-2">
              Most-watched video this quarter
            </p>
            <blockquote className="font-body text-sm md:text-base text-brand-black leading-snug mb-2">
              &ldquo;{top.text || "(no caption)"}&rdquo;
            </blockquote>
            <p className="font-body text-[0.72rem] text-brand-black/65 mb-2">
              <a
                href={`https://www.tiktok.com/@${top.author}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-purple hover:underline"
              >
                @{top.author}
              </a>{" "}
              · {formatNumber(top.plays)} plays · {formatNumber(top.likes)}{" "}
              likes · {formatDate(top.posted)}
            </p>
            {top.url && (
              <a
                href={top.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-display text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-brand-black hover:text-brand-purple"
              >
                Watch on TikTok
                <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        )}

        <p className="mt-4 font-body text-[0.68rem] text-brand-black/45 leading-relaxed">
          Search query: &ldquo;{data.query}&rdquo;. Top 30 results from
          TikTok&apos;s public search. Total plays counts views across
          videos in the result set; some queries match loosely so very
          large numbers may include a viral video adjacent to the brand.
        </p>
      </div>
    </Reveal>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "lime" | "purple";
}) {
  const dot =
    accent === "lime"
      ? "bg-brand-lime"
      : accent === "purple"
        ? "bg-brand-purple"
        : "bg-brand-black/30";
  return (
    <div className="border border-brand-black/15 bg-white/60 p-3">
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn("inline-block h-1.5 w-1.5 rounded-full", dot)}
        />
        <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-brand-black/55">
          {label}
        </p>
      </div>
      <p className="mt-1 font-display text-xl md:text-2xl font-black tabular-nums text-brand-black">
        {value}
      </p>
    </div>
  );
}
