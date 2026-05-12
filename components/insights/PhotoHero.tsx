"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion/Reveal";

/**
 * PhotoHero, visual anchor for a business's photography.
 *
 * Replaces the old 6-cell placeholder grid, which rendered as mostly empty
 * "Photo pending" boxes when the Apify scrape only saved one image per
 * business (v1 state). That grid read as broken.
 *
 * Behavior:
 *   - If no photos: clean "Photo pending" single-cell state
 *   - If >=1 photo: single big hero image with overlay badge
 *     ("{count} photos on Google") and a click-to-enlarge lightbox
 *   - If >1 photo passed (future, when we re-scrape with images): a
 *     horizontal thumbnail strip appears under the hero
 *
 * Interactivity:
 *   - Click hero → open full-size lightbox (framer-motion spring scale-in)
 *   - Esc key closes lightbox
 *   - Backdrop click closes lightbox
 *   - Respects `useReducedMotion`
 */

type PhotoHeroProps = {
  photos: string[];
  googleImagesCount: number;
  businessName: string;
  googleMapsUrl?: string | null;
};

export function PhotoHero({
  photos,
  googleImagesCount,
  businessName,
  googleMapsUrl,
}: PhotoHeroProps) {
  const reduced = useReducedMotion();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIdx(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx]);

  const hasPhotos = photos.length > 0;
  const displayIdx = Math.min(activeIdx, Math.max(photos.length - 1, 0));
  const heroSrc = hasPhotos ? photos[displayIdx] : null;

  return (
    <Reveal as="section" className="block">
      <div aria-label="Photos">
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black border-b border-brand-black/15 pb-3 mb-5">
          Photos
        </h2>

        {!hasPhotos ? (
          <div className="aspect-[16/9] w-full bg-brand-cream border border-brand-black/10 flex items-center justify-center">
            <span className="font-body text-xs uppercase tracking-[0.18em] text-brand-black/30">
              Photo pending
            </span>
          </div>
        ) : (
          <>
            {/* Hero image */}
            <button
              type="button"
              onClick={() => setLightboxIdx(displayIdx)}
              className="group relative block aspect-[16/9] w-full overflow-hidden border border-brand-black/10 bg-brand-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroSrc ?? ""}
                alt={`${businessName}, photo ${displayIdx + 1}`}
                className="ken-burns absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
                loading="eager"
              />
              {/* Gradient overlay at bottom for legibility of the badge */}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-brand-black/70 via-brand-black/20 to-transparent"
              />
              {/* "View photo" hint */}
              <span className="absolute top-3 right-3 inline-flex items-center gap-1 bg-brand-black/80 px-2.5 py-1 text-brand-lavender font-display text-[0.62rem] font-semibold uppercase tracking-[0.16em] opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:group-hover:opacity-100">
                View full
                <span aria-hidden="true" className="-mt-0.5">
                  ↗
                </span>
              </span>
              {/* Google photos count badge */}
              {googleImagesCount > 0 && (
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 bg-brand-black/85 px-3 py-1.5 text-brand-lavender font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full bg-brand-lime"
                  />
                  {googleImagesCount.toLocaleString()} photos on Google
                </span>
              )}
            </button>

            {/* Thumbnail strip, only renders when >1 photo */}
            {photos.length > 1 && (
              <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {photos.map((src, i) => (
                  <li key={i} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveIdx(i)}
                      aria-pressed={i === displayIdx}
                      className={`relative block aspect-[4/3] w-20 md:w-24 overflow-hidden border transition-all ${
                        i === displayIdx
                          ? "border-brand-black shadow-[2px_2px_0_0_var(--color-brand-lime)]"
                          : "border-brand-black/15 hover:border-brand-black"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* Footer line */}
        {googleImagesCount > 0 && (
          <p className="mt-3 font-body text-xs text-brand-black/55">
            {googleImagesCount.toLocaleString()} photos on Google across
            kitchen, menu, and exterior.
            {googleMapsUrl ? (
              <>
                {" "}
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-purple hover:underline"
                >
                  View all →
                </a>
              </>
            ) : null}
          </p>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIdx !== null && heroSrc && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/90 p-4 md:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
            onClick={() => setLightboxIdx(null)}
            role="dialog"
            aria-modal="true"
            aria-label={`${businessName}, full-size photo`}
          >
            <motion.img
              src={photos[lightboxIdx]}
              alt={`${businessName}, photo`}
              className="max-h-full max-w-full object-contain"
              initial={{ scale: reduced ? 1 : 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: reduced ? 1 : 0.97, opacity: 0 }}
              transition={{
                type: reduced ? "tween" : "spring",
                stiffness: 300,
                damping: 26,
                duration: reduced ? 0 : undefined,
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => setLightboxIdx(null)}
              className="absolute top-4 right-4 md:top-6 md:right-6 bg-brand-lime text-brand-black font-display text-xs font-semibold uppercase tracking-[0.16em] px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-lavender"
              aria-label="Close photo"
            >
              Close ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Reveal>
  );
}

export default PhotoHero;
