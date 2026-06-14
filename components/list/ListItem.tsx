import Link from "next/link";

import { PhotoOrPlaceholder } from "@/components/PhotoOrPlaceholder";
import type { Category, Tier } from "@/lib/data/schemas";
import type { ListArticleItem } from "@/lib/data/load-list";
import { familyForBusinessCategory } from "@/lib/data/category-family";

import { TierPill } from "./TierPill";

/**
 * ListItem, one ranked entry inside a list article.
 *
 * Layout (Eater + Infatuation synthesis):
 *   - Large rank numeral (display font), aria-hidden. Real
 *     ordering comes from the wrapping <ol>.
 *   - Business name in display font, links to /business/[slug].
 *   - Tier pill (Talk of the Town / In the Conversation /
 *     Word of Mouth). No numbers, no letter grades.
 *   - Meta row (neighborhood · family label), muted, mid-dot.
 *   - 3:2 photo from the business's hero_photo. Lazy-loaded.
 *   - Italic tagline pulled from `descriptor`.
 *   - Body text from `stat_line` (terse, no engagement-rate
 *     percentages, no composite scores).
 *   - Optional featured-creator pull (handle + plays).
 *   - Footer: link to the full record + outbound links if any.
 *
 * No card chrome (no border, no shadow, no background tint).
 * Whitespace separates entries; the parent <ol> handles spacing.
 */

type ListItemEnriched = {
  item: ListArticleItem;
  business: {
    name: string;
    neighborhood: string;
    category: Category;
    hero_photo: string | null;
    instagram?: string | null;
    website?: string | null;
    tier: Tier;
  } | null;
  /**
   * When false, the tier pill is suppressed. Used on Underrated lists,
   * where surfacing per-item tier labels (In the Conversation / Word
   * of Mouth) mixes two editorial frames and reads as inconsistent.
   * The Underrated frame is the only frame those lists need.
   */
  showTier?: boolean;
};

/**
 * Resolve the family label to display for a list entry.
 *
 * The article JSON carries a cached `family_label` string that was correct
 * when the article was generated, but it can drift from the business's
 * current category over time (e.g. a bakery cached as "Pittsburgh Cafes").
 * The DB `category` enum is the live source of truth, so we always derive
 * the label from it via the canonical, enum-keyed resolver. When the live
 * category is unavailable (business failed to load), we fall back to the
 * article-embedded label so the row is not blanked.
 */
function resolvedFamilyLabel(
  familyLabel: string,
  category: Category | undefined,
): string {
  if (!category) return familyLabel;
  return familyForBusinessCategory(category).label;
}

function formatPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M plays`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K plays`;
  return `${n.toLocaleString()} plays`;
}

export function ListItem({
  item,
  business,
  showTier = true,
}: ListItemEnriched) {
  const heroPhoto = business?.hero_photo ?? null;
  const tier = showTier ? (business?.tier ?? null) : null;
  const familyLabel = resolvedFamilyLabel(
    item.family_label,
    business?.category,
  );

  const altText = `${item.name}, ${item.neighborhood}`;

  return (
    <li className="block">
      <article className="grid grid-cols-1 md:grid-cols-[5rem_1fr] gap-4 md:gap-8">
        {/* Rank numeral (decorative, real order via <ol>). */}
        <div aria-hidden="true" className="hidden md:block">
          <span className="font-display font-black tabular-nums tracking-[-0.04em] text-brand-black/15 text-[clamp(3.5rem,6vw,6rem)] leading-none">
            {String(item.rank).padStart(2, "0")}
          </span>
        </div>

        <div className="min-w-0">
          {/* Mobile rank, smaller and inline-leading. */}
          <p
            aria-hidden="true"
            className="md:hidden font-display font-black tabular-nums tracking-[-0.03em] text-brand-black/20 text-5xl leading-none"
          >
            {String(item.rank).padStart(2, "0")}
          </p>

          <h2 className="mt-3 md:mt-0 font-display font-black uppercase tracking-[-0.02em] text-brand-black text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1] [text-wrap:balance]">
            <Link
              href={`/business/${item.business_slug}`}
              className="hover:text-brand-purple transition-colors"
            >
              {item.name}
            </Link>
          </h2>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            {tier ? <TierPill tier={tier} /> : null}
            <p className="font-body text-xs md:text-sm uppercase tracking-[0.14em] text-brand-black/55">
              {item.neighborhood}
              <span aria-hidden="true" className="mx-2">
                ·
              </span>
              {familyLabel}
            </p>
          </div>

          {/* Photo, full-bleed on mobile, capped at ~720 on desktop. */}
          <div className="mt-6 relative w-full aspect-[3/2] overflow-hidden rounded-sm bg-brand-cream md:max-w-[720px]">
            <PhotoOrPlaceholder
              src={heroPhoto}
              alt={altText}
              name={item.name}
              imgClassName="absolute inset-0 w-full h-full object-cover"
            />
          </div>

          {/* Italic tagline, the one-line read of the place. */}
          <p className="mt-6 font-display italic text-brand-black text-lg md:text-xl leading-snug [text-wrap:balance]">
            {item.descriptor}
          </p>

          {/* Body line: stats + facts in editorial prose voice. */}
          {item.stat_line ? (
            <p className="mt-3 font-body text-base md:text-lg text-brand-black/80 leading-relaxed max-w-2xl">
              {item.stat_line}
            </p>
          ) : null}

          {/* Featured creator pull. */}
          {item.featured_tiktok ? (
            <p className="mt-5 font-body italic text-sm md:text-base text-brand-black/75 leading-snug border-l-2 border-brand-purple pl-3 max-w-2xl">
              Filmed by{" "}
              <a
                href={item.featured_tiktok.url}
                target="_blank"
                rel="noopener noreferrer"
                className="not-italic font-display font-semibold text-brand-black hover:text-brand-purple transition-colors"
              >
                @{item.featured_tiktok.author}
              </a>
              <span className="not-italic text-brand-black/55 tabular-nums">
                {" "}
                · {formatPlays(item.featured_tiktok.plays)}
              </span>
            </p>
          ) : null}

          {/* Footer row. */}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href={`/business/${item.business_slug}`}
              className="inline-flex items-center gap-1 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-black hover:text-brand-purple transition-colors"
            >
              Read full record
              <span aria-hidden="true">→</span>
            </Link>
            {business?.instagram ? (
              <a
                href={business.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-xs uppercase tracking-[0.14em] text-brand-black/55 hover:text-brand-purple transition-colors"
              >
                Instagram
              </a>
            ) : null}
            {business?.website ? (
              <a
                href={business.website}
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-xs uppercase tracking-[0.14em] text-brand-black/55 hover:text-brand-purple transition-colors"
              >
                Website
              </a>
            ) : null}
          </div>
        </div>
      </article>
    </li>
  );
}

export default ListItem;
