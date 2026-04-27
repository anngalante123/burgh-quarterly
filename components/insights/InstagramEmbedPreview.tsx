"use client";

import { cn } from "@/lib/utils";

/**
 * InstagramEmbedPreview, the post-card thumbnail for the BY list.
 *
 * IG's iframe embed is unreliable on mobile (renders a static thumbnail
 * + caption, video doesn't play inline reliably across devices, tap
 * behavior is inconsistent). So we don't try to embed it. We render the
 * brand-treated placeholder card and on tap we open the post on
 * Instagram directly (new tab on web, IG app if installed on mobile).
 * Reliable, native, fast.
 *
 * The Apify-served thumbnail URL is also skipped because IG's CDN URLs
 * are short-lived and block cross-origin hot-linking. The gradient
 * placeholder reads as 'tap to watch on Instagram' and gets us out of
 * the way.
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
  // shortcode + thumbnailUrl are accepted for back-compat with the
  // original embed-iframe approach; we no longer render them.
  void shortcode;
  void thumbnailUrl;

  return (
    <a
      href={postUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block w-full max-w-[280px] aspect-[4/5] overflow-hidden bg-brand-black/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
      aria-label={`Open Instagram post: ${caption.slice(0, 60)}`}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-brand-black via-brand-purple/40 to-brand-black">
        <span className="font-display text-[0.6rem] uppercase tracking-[0.22em] text-brand-lime">
          Instagram
        </span>
        <span className="font-display text-[0.55rem] uppercase tracking-[0.18em] text-brand-off-white/55">
          Tap to watch
        </span>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-colors group-hover:bg-black/15",
        )}
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
    </a>
  );
}

export default InstagramEmbedPreview;
