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
        {/* Instagram glyph, simple square + ring SVG. Visual anchor in
            absence of a real post thumbnail. */}
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
