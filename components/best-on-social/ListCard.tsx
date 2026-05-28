import Image from "next/image";
import Link from "next/link";

/**
 * ListCard, the smaller card used in the "All Lists" grid below the
 * filter bar. Pairs a 4:3 hero thumbnail with a compact title, dek,
 * item count, and category tag.
 */

type ListCardProps = {
  slug: string;
  title: string;
  dek: string;
  itemCount: number;
  unit: string;
  category: string;
  heroPhoto: string | null;
  heroAlt: string;
};

export function ListCard({
  slug,
  title,
  dek,
  itemCount,
  unit,
  category,
  heroPhoto,
  heroAlt,
}: ListCardProps) {
  return (
    <Link
      href={`/best-on-social/${slug}`}
      className="group flex flex-col border border-brand-black/15 bg-white/60 overflow-hidden transition-all hover:border-brand-black hover:shadow-[4px_4px_0_0_var(--color-brand-lime)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-brand-black/5">
        {heroPhoto ? (
          <Image
            src={heroPhoto}
            alt={heroAlt}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            unoptimized
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-brand-cream"
          />
        )}
      </div>
      <div className="p-4 md:p-5 flex flex-col flex-1">
        <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-brand-purple">
          {itemCount} {unit} · {category}
        </p>
        <h3 className="mt-2 font-display font-black uppercase tracking-[-0.01em] text-brand-black text-base md:text-lg leading-[1.1] [text-wrap:balance] group-hover:text-brand-purple transition-colors">
          {title}
        </h3>
        {dek ? (
          <p className="mt-2 font-body text-xs md:text-sm text-brand-black/65 leading-snug">
            {dek}
          </p>
        ) : null}
        <p className="mt-auto pt-4 inline-flex items-center gap-1 font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black group-hover:text-brand-purple transition-colors">
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
