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
        "group relative flex flex-col items-start justify-between w-full max-w-[200px] min-h-[140px] p-4 md:p-5",
        "bg-brand-cream/40 border border-brand-black/15",
        "hover:bg-brand-cream/70 hover:border-brand-black hover:shadow-[3px_3px_0_0_var(--color-brand-purple)]",
        "transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
      )}
      aria-label={`Open Instagram post: ${caption.slice(0, 60)}`}
    >
      <span className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
        Instagram
      </span>
      <span className="font-display font-black uppercase tracking-[-0.005em] text-brand-black text-base md:text-lg leading-tight mt-2">
        Tap to watch on Instagram
      </span>
      <span className="mt-3 inline-flex items-center gap-1 font-display text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-brand-black/70 group-hover:text-brand-purple transition-colors">
        Open post
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
