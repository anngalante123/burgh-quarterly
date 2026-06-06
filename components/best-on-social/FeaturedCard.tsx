import Link from "next/link";

import { PhotoOrPlaceholder } from "@/components/PhotoOrPlaceholder";

/**
 * FeaturedCard, the oversized hero card used for the three flagship lists
 * at the top of /best-on-social. Pulls a hero photo from the #1-ranked
 * business of the list and pairs it with the title, dek, count, and a
 * "Read list" CTA.
 *
 * The visual treatment intentionally diverges from the smaller ListCard
 * below the filter bar so a reader can scan the page and instantly know
 * which three lists are the editorial picks for the issue.
 */

type FeaturedCardProps = {
  slug: string;
  title: string;
  dek: string;
  itemCount: number;
  unit: string;
  tierPill: string;
  heroPhoto: string | null;
  heroAlt: string;
};

export function FeaturedCard({
  slug,
  title,
  dek,
  itemCount,
  unit,
  tierPill,
  heroPhoto,
  heroAlt,
}: FeaturedCardProps) {
  return (
    <Link
      href={`/best-on-social/${slug}`}
      className="group flex flex-col border border-brand-black/15 bg-white/70 overflow-hidden transition-all hover:border-brand-black hover:shadow-[6px_6px_0_0_var(--color-brand-lime)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-brand-black/5">
        <PhotoOrPlaceholder
          src={heroPhoto}
          alt={heroAlt}
          name={title}
          imgClassName="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span
          className={`absolute left-3 top-3 inline-flex items-center font-display text-[0.6rem] font-semibold uppercase tracking-[0.18em] px-2 py-1 ${tierPill}`}
        >
          Featured
        </span>
      </div>
      <div className="p-5 md:p-6 flex flex-col flex-1">
        <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
          {itemCount} {unit} · Spring 2026
        </p>
        <h2 className="mt-3 font-display font-black uppercase tracking-[-0.01em] text-brand-black text-2xl md:text-3xl leading-[1.0] [text-wrap:balance] group-hover:text-brand-purple transition-colors">
          {title}
        </h2>
        <p className="mt-3 font-body text-sm md:text-base text-brand-black/70 leading-snug">
          {dek}
        </p>
        <p className="mt-auto pt-5 inline-flex items-center gap-1 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-black group-hover:text-brand-purple transition-colors">
          Read list
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-150 group-hover:translate-x-1"
          >
            →
          </span>
        </p>
      </div>
    </Link>
  );
}
