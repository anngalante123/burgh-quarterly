import Image from "next/image";

/**
 * ListHero, the top-of-article anchor for an editorial list.
 *
 * Eater/Infatuation pattern: one edge-to-edge landscape photo,
 * headline UNDER the photo (never overlaid), 1-sentence dek
 * beneath the headline, then a small meta row (issue + count).
 *
 * If `heroPhoto` is null (no #1 business resolved, or the business
 * has no hero), we fall back to a brand-tokenized gradient block
 * with a small "Photo coming next issue" label. This keeps every
 * article visually anchored without ever shipping a broken image.
 */

type ListHeroProps = {
  heroPhoto: string | null;
  heroAlt: string;
  kicker: string;
  title: string;
  dek?: string | null;
  meta: string;
};

export function ListHero({
  heroPhoto,
  heroAlt,
  kicker,
  title,
  dek,
  meta,
}: ListHeroProps) {
  return (
    <header className="mt-2 md:mt-4">
      {/* Hero photo: 4:5 on mobile, 16:9 on desktop. Edge-to-edge
          inside the article column. */}
      <div className="relative w-full overflow-hidden rounded-sm bg-brand-cream aspect-[4/5] md:aspect-[16/9]">
        {heroPhoto ? (
          <Image
            src={heroPhoto}
            alt={heroAlt}
            fill
            sizes="(max-width: 768px) 100vw, 1024px"
            className="object-cover"
            priority
            unoptimized
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-end justify-start p-5 bg-gradient-to-br from-brand-lime via-brand-cream to-brand-lavender"
          >
            <span className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/65">
              Photo coming next issue
            </span>
          </div>
        )}
      </div>

      {/* Kicker + headline + dek + meta sit UNDER the photo. */}
      <div className="mt-6 md:mt-8">
        <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
          {kicker}
        </p>
        <h1 className="mt-3 font-display font-black uppercase tracking-[-0.02em] text-brand-black text-[clamp(2rem,6vw,4.25rem)] leading-[0.95] [text-wrap:balance]">
          {title}
        </h1>
        {dek ? (
          <p className="mt-4 font-body text-base md:text-lg text-brand-black/70 leading-relaxed max-w-2xl [text-wrap:balance]">
            {dek}
          </p>
        ) : null}
        <p className="mt-5 font-body text-xs uppercase tracking-[0.16em] text-brand-black/55">
          {meta}
        </p>
      </div>
    </header>
  );
}

export default ListHero;
