"use client";

import { cn } from "@/lib/utils";

/**
 * InstagramEmbedPreview, the post-card thumbnail for the BY lists.
 *
 * Two render paths:
 *
 * 1. WITH thumbnail (preferred). When the generator successfully
 *    downloaded the IG image into /public/post-thumbs/, we render the
 *    real thumbnail with a lime play-button overlay. Click opens the
 *    post on Instagram (new tab, native IG-app handoff on iOS).
 *    Visually parallel to the TikTok cards. The play button is
 *    aspirational. IG opens in a new tab/app, but the visual cue
 *    matches the TikTok pattern so the lists feel like one product.
 *
 * 2. WITHOUT thumbnail (fallback). When the IG CDN URL had already
 *    expired by gen time, we render the cream editorial card we used
 *    before: brand-purple kicker, IG glyph, "Tap to watch" headline,
 *    "Open on Instagram" link. Honest about there being no preview,
 *    still a usable CTA.
 */

type Props = {
  postUrl: string;
  shortcode: string | null | undefined;
  thumbnailUrl: string | null | undefined;
  caption: string;
};

export function InstagramEmbedPreview({
  postUrl,
  shortcode,
  thumbnailUrl,
  caption,
}: Props) {
  void shortcode;

  // Path 1, real thumbnail
  if (thumbnailUrl) {
    return (
      <a
        href={postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block w-full max-w-[280px] aspect-[4/5] overflow-hidden bg-brand-black/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
        aria-label={`Open Instagram post: ${caption.slice(0, 60)}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:group-hover:scale-100"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-black/15 group-hover:bg-black/30 transition-colors"
        >
          <span className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-brand-lime text-brand-black shadow-[3px_3px_0_0_var(--color-brand-purple)] group-hover:scale-105 transition-transform motion-reduce:group-hover:scale-100">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-6 h-6 md:w-7 md:h-7 ml-1"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
        {/* Subtle "Instagram" tag in the corner so the brand is clear */}
        <span
          aria-hidden="true"
          className="absolute top-3 left-3 font-display text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-brand-lavender bg-brand-black/60 px-1.5 py-0.5"
        >
          Instagram
        </span>
      </a>
    );
  }

  // Path 2, fallback editorial card when no thumbnail downloaded
  return (
    <a
      href={postUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative flex flex-col items-start justify-between w-full max-w-[280px] min-h-[200px] p-5 md:p-6",
        "bg-brand-cream/60 border-t-4 border-brand-lime border-l border-r border-b border-brand-black/20",
        "hover:bg-brand-cream hover:border-l-brand-black hover:border-r-brand-black hover:border-b-brand-black",
        "hover:shadow-[5px_5px_0_0_var(--color-brand-purple)]",
        "transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
      )}
      aria-label={`Open Instagram post: ${caption.slice(0, 60)}`}
    >
      <div className="flex items-center justify-between w-full">
        <span className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
          Instagram
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="w-6 h-6 text-brand-black/55 group-hover:text-brand-purple transition-colors"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
        </svg>
      </div>
      <span className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-xl md:text-2xl leading-[1.05] mt-3 [text-wrap:balance]">
        Watch the post
      </span>
      <span className="font-body text-xs md:text-sm text-brand-black/65 mt-2 leading-snug line-clamp-2 [overflow-wrap:anywhere]">
        &ldquo;{caption.slice(0, 80)}{caption.length > 80 ? "…" : ""}&rdquo;
      </span>
      <span className="mt-4 inline-flex items-center gap-1.5 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-black group-hover:text-brand-purple transition-colors">
        Open on Instagram
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1"
        >
          ↗
        </span>
      </span>
    </a>
  );
}

export default InstagramEmbedPreview;
