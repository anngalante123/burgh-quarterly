"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * InstagramEmbedPreview, click-to-embed for IG posts in the BY list.
 * Mirrors TikTokEmbedPreview but uses IG's public embed URL
 * (https://www.instagram.com/p/<shortcode>/embed/) and renders in a
 * 4:5 aspect ratio (typical for IG feed posts) instead of 9:16.
 *
 * Default state, displays the IG-served thumbnail + lime play button.
 * On click, swaps to the iframe. Heavy embed only loads on demand.
 *
 * Note: IG image URLs are CDN-signed and expire over time. For an
 * Issue 01 publication this is acceptable; for longer durability the
 * generator could download images at gen time and serve from /public.
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
  const [playing, setPlaying] = useState(false);

  if (playing && shortcode) {
    return (
      <div className="relative w-full max-w-[280px] aspect-[4/5] overflow-hidden bg-brand-black">
        <iframe
          src={`https://www.instagram.com/p/${shortcode}/embed/captioned`}
          allow="encrypted-media"
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 w-full h-full border-0 bg-white"
          title={`Instagram post: ${caption.slice(0, 60)}`}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (shortcode) {
          setPlaying(true);
        } else {
          window.open(postUrl, "_blank", "noopener,noreferrer");
        }
      }}
      className="group relative w-full max-w-[280px] aspect-[4/5] overflow-hidden bg-brand-black/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
      aria-label={`Open Instagram post: ${caption.slice(0, 60)}`}
    >
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:group-hover:scale-100"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-black to-brand-purple/30">
          <span className="font-display text-xs uppercase tracking-[0.18em] text-brand-off-white/55">
            Tap to load
          </span>
        </div>
      )}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-colors",
          thumbnailUrl ? "bg-black/15 group-hover:bg-black/30" : "",
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
    </button>
  );
}

export default InstagramEmbedPreview;
