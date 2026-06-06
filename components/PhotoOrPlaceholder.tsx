"use client";

import { useEffect, useRef, useState } from "react";

/**
 * PhotoOrPlaceholder, a drop-in replacement for a business photo that
 * degrades gracefully to a branded placeholder.
 *
 * WHY: business photos are currently hotlinked from Google Maps, whose
 * URLs are time-limited and now frequently return HTTP 403. When that
 * happens a plain <img> renders an ugly blank gray box with alt text.
 * This component swaps in a clean, brand-colored initial card so the
 * page looks intentional instead of broken. This is purely cosmetic. It
 * does not fix or replace the photo source.
 *
 * It renders a plain <img> (not next/image) so it behaves uniformly
 * regardless of remote-host config, and so the onError handler is simple.
 * On image load error, OR when src is falsy, it renders the placeholder.
 *
 * The placeholder fills its parent (absolute inset-0), so the caller must
 * give the wrapping element a size and `position: relative` (every call
 * site here already does, via an aspect-ratio + overflow-hidden wrapper).
 */

type PhotoOrPlaceholderProps = {
  src?: string | null;
  alt: string;
  /** Business name, used to derive the placeholder initial(s) and color. */
  name: string;
  /** Classes applied to the real <img> element. */
  imgClassName?: string;
  /** Classes applied to the placeholder wrapper div. */
  className?: string;
  /** When true, the image loads eagerly (above the fold). Defaults to lazy. */
  eager?: boolean;
};

/**
 * A small set of brand color combos, each with guaranteed high contrast
 * between background and text. We never pair low-contrast tokens (e.g.
 * lavender text on a cream background).
 */
const PLACEHOLDER_COMBOS = [
  { bg: "bg-brand-purple", text: "text-brand-lavender" },
  { bg: "bg-brand-lime", text: "text-brand-black" },
  { bg: "bg-brand-cream", text: "text-brand-black" },
  { bg: "bg-brand-black", text: "text-brand-lime" },
] as const;

/**
 * Derive up to two uppercase initials from a business name. Uses the first
 * letter of each of the first two words, falling back to a single letter
 * for one-word names, and a neutral dot when the name has no letters.
 */
function initialsFromName(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-zA-Z0-9]/.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return words[0]!.slice(0, 1).toUpperCase();
  }
  return (words[0]!.slice(0, 1) + words[1]!.slice(0, 1)).toUpperCase();
}

/**
 * Deterministically pick a color combo from the name via a simple char-sum
 * hash, so a grid of placeholders is varied but stable across renders.
 */
function comboForName(name: string): (typeof PLACEHOLDER_COMBOS)[number] {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) {
    sum += name.charCodeAt(i);
  }
  return PLACEHOLDER_COMBOS[sum % PLACEHOLDER_COMBOS.length]!;
}

export function PhotoOrPlaceholder({
  src,
  alt,
  name,
  imgClassName,
  className,
  eager = false,
}: PhotoOrPlaceholderProps) {
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // The image can fail to load (e.g. an expired Google URL 403s) BEFORE
  // React hydrates and attaches onError, so that handler alone misses the
  // common case. After mount, check whether the img already finished
  // loading broken (complete but zero intrinsic width) and fall back.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setHasError(true);
    }
  }, [src]);

  const showPlaceholder = !src || hasError;

  if (showPlaceholder) {
    const combo = comboForName(name);
    const initials = initialsFromName(name);
    return (
      <div
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-center [container-type:size] ${combo.bg} ${className ?? ""}`}
      >
        <span
          className={`font-display font-black leading-none select-none ${combo.text} text-[clamp(1.25rem,35cqmin,7rem)]`}
        >
          {initials}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      className={imgClassName}
      onError={() => setHasError(true)}
    />
  );
}

export default PhotoOrPlaceholder;
