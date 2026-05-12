"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * TikTokEmbedPreview, the click-to-embed thumbnail used in the creator
 * posts list. Strategy:
 *
 *   - Default state, render the TikTok-served thumbnail with a play
 *     button overlay. Heavy embed iframe is NOT loaded.
 *   - On click, swap the thumbnail for the official TikTok embed
 *     iframe (https://www.tiktok.com/embed/v2/{video_id}). Only the
 *     videos a reader actually wants to watch get the heavy load.
 *
 * If thumbnail_url is missing (oEmbed failed at gen time) we show a
 * placeholder card with the play icon and a fallback "Watch on TikTok"
 * link. If video_id is missing (URL didn't match the expected pattern)
 * the click falls back to opening the TikTok URL in a new tab.
 */

type Props = {
  videoUrl: string;
  videoId: string | null | undefined;
  thumbnailUrl: string | null | undefined;
  /** Used as alt text and aria-label. */
  caption: string;
};

export function TikTokEmbedPreview({
  videoUrl,
  videoId,
  thumbnailUrl,
  caption,
}: Props) {
  const [playing, setPlaying] = useState(false);

  if (playing && videoId) {
    return (
      <div className="relative w-full max-w-[325px] aspect-[9/16] overflow-hidden bg-brand-black">
        <iframe
          src={`https://www.tiktok.com/embed/v2/${videoId}?lang=en-US`}
          allow="encrypted-media; clipboard-write; gyroscope; accelerometer; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
          title={`TikTok by ${caption.slice(0, 60)}`}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (videoId) {
          setPlaying(true);
        } else {
          // Fall back to opening the URL if we couldn't extract an ID
          window.open(videoUrl, "_blank", "noopener,noreferrer");
        }
      }}
      className="group relative w-full max-w-[325px] aspect-[9/16] overflow-hidden bg-brand-black/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
      aria-label={`Play TikTok: ${caption.slice(0, 60)}`}
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
          <span className="font-display text-xs uppercase tracking-[0.18em] text-brand-lavender/55">
            Tap to load
          </span>
        </div>
      )}
      {/* Play button overlay */}
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

export default TikTokEmbedPreview;
