import { PhotoOrPlaceholder } from "@/components/PhotoOrPlaceholder";

/**
 * ListHero, the top-of-article anchor for an editorial list.
 *
 * Eater/Infatuation pattern: one edge-to-edge landscape photo,
 * headline UNDER the photo (never overlaid), 1-sentence dek
 * beneath the headline, then a small meta row (issue + count).
 *
 * If `heroPhoto` is null (no #1 business resolved, or the business
 * has no hero) or the photo fails to load, we fall back to a branded
 * initial placeholder. This keeps every article visually anchored
 * without ever shipping a broken image. `heroName` seeds the
 * placeholder initial and color; it falls back to the title.
 */

type ListHeroProps = {
  heroPhoto: string | null;
  heroAlt: string;
  heroName?: string;
  kicker: string;
  title: string;
  dek?: string | null;
  meta: string;
};

export function ListHero({
  heroPhoto,
  heroAlt,
  heroName,
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
        <PhotoOrPlaceholder
          src={heroPhoto}
          alt={heroAlt}
          name={heroName ?? title}
          eager
          imgClassName="absolute inset-0 w-full h-full object-cover"
        />
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
