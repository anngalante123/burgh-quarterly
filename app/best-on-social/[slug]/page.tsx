import { notFound } from "next/navigation";
import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";
import { SubscribeFooter } from "@/components/SubscribeFooter";
import {
  isPostArticle,
  listAllListSlugs,
  loadListArticleBySlug,
  type ListArticleItem,
  type PostArticleItem,
} from "@/lib/data/load-list";
import { getBusiness } from "@/lib/data/load-business";
import { TikTokEmbedPreview } from "@/components/insights/TikTokEmbedPreview";
import { InstagramEmbedPreview } from "@/components/insights/InstagramEmbedPreview";
import { ListHero } from "@/components/list/ListHero";
import { ListItem } from "@/components/list/ListItem";

/**
 * /best-on-social/[slug], renderer for ranked-list articles.
 *
 * Two layouts share this route:
 *   - Business lists (the typical case): magazine layout with a
 *     real photographic hero pulled from the #1 business, then a
 *     stack of ListItem blocks. No card chrome, lots of whitespace.
 *     Inspired by Eater + Infatuation list templates.
 *   - Post lists (kind: "posts"): kept as compact cards because
 *     the load-bearing content is the embed itself.
 *
 * Article JSON is hand-edited in content/lists/articles. Owner-
 * facing playbook moves live in the JSON for internal use only;
 * the public renderer does not surface them.
 */

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams(): { slug: string }[] {
  return listAllListSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const article = loadListArticleBySlug(slug);
  if (!article) return { title: "Not found, Signal Pittsburgh" };
  return {
    title: `${article.title}, Signal Pittsburgh`,
    description: article.angle,
  };
}

function PostItemCard({ item }: { item: PostArticleItem }) {
  const date = item.posted ? new Date(item.posted) : null;
  const dateLabel = date
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
  return (
    <Reveal as="article" className="block">
      <div className="grid grid-cols-[3rem_1fr] md:grid-cols-[5rem_1fr] gap-4 md:gap-6 border-b border-brand-black/15 pb-8 md:pb-10">
        <div>
          <span className="font-display text-3xl md:text-5xl font-black tabular-nums tracking-[-0.02em] text-brand-purple">
            {String(item.rank).padStart(2, "0")}
          </span>
        </div>
        <div className="min-w-0 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 md:gap-7 items-start">
          <div className="min-w-0">
            <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/55">
              {item.neighborhood}
            </p>

            <h3 className="mt-2 font-display font-black uppercase tracking-[-0.01em] text-brand-black text-xl md:text-2xl leading-[1.1]">
              <Link
                href={`/business/${item.business_slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-purple transition-colors"
              >
                {item.business_name}
              </Link>
            </h3>

            <p className="mt-1 font-body text-xs text-brand-black/55">
              <a
                href={item.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-purple"
              >
                @{item.creator_handle}
              </a>
            </p>

            {/* Editorial "why" pull-quote, only on the most-creative
                list where this field exists. Numeric creativity scores
                are intentionally not surfaced. */}
            {item.creativity_score !== undefined &&
              Number.isFinite(item.creativity_score) &&
              item.why ? (
              <div className="mt-4">
                <p className="font-body text-xs md:text-sm text-brand-black/75 italic leading-snug border-l-2 border-brand-purple pl-3">
                  {item.why}
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {item.platform === "instagram" ? (
                <span className="font-display text-base md:text-lg font-black tabular-nums text-brand-black">
                  {item.likes.toLocaleString()}{" "}
                  <span className="font-body font-normal text-xs uppercase tracking-[0.14em] text-brand-black/55">
                    likes
                  </span>
                </span>
              ) : (
                <span className="font-display text-base md:text-lg font-black tabular-nums text-brand-black">
                  {item.plays.toLocaleString()}{" "}
                  <span className="font-body font-normal text-xs uppercase tracking-[0.14em] text-brand-black/55">
                    plays
                  </span>
                </span>
              )}
              {item.platform === "instagram" && item.plays > 0 ? (
                <span className="font-body text-xs text-brand-black/55 tabular-nums">
                  {item.plays.toLocaleString()} plays
                </span>
              ) : null}
              {item.platform !== "instagram" && item.likes > 0 ? (
                <span className="font-body text-xs text-brand-black/55 tabular-nums">
                  {item.likes.toLocaleString()} likes
                </span>
              ) : null}
              {item.comments && item.comments > 0 ? (
                <span className="font-body text-xs text-brand-black/55 tabular-nums">
                  {item.comments.toLocaleString()} comments
                </span>
              ) : null}
              {dateLabel ? (
                <span className="font-body text-xs text-brand-black/60">
                  Posted {dateLabel}
                </span>
              ) : null}
            </div>

            <div className="mt-4">
              <a
                href={item.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-purple hover:text-brand-black transition-colors"
              >
                {item.platform === "instagram"
                  ? "View on Instagram"
                  : "Watch on TikTok"}
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <div className="md:order-last w-40 sm:w-48 md:w-[200px] shrink-0">
            {item.platform === "instagram" ? (
              <InstagramEmbedPreview
                postUrl={item.video_url}
                shortcode={item.video_id}
                thumbnailUrl={item.thumbnail_url}
                caption={item.caption}
              />
            ) : (
              <TikTokEmbedPreview
                videoUrl={item.video_url}
                videoId={item.video_id}
                thumbnailUrl={item.thumbnail_url}
                caption={item.caption}
              />
            )}
          </div>
        </div>
      </div>
    </Reveal>
  );
}

/** Updated-on label, "May 2026" style. Sourced from generated_at. */
function formatUpdated(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function BestOnSocialArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = loadListArticleBySlug(slug);
  if (!article) notFound();

  const introParagraphs = article.intro
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // For business articles only, fan out one getBusiness call per item
  // in parallel so we can render real photos + tiers. For post articles
  // we keep the existing compact card layout.
  const businessMode = !isPostArticle(article);
  const items = article.items;

  type EnrichedBusiness = {
    name: string;
    neighborhood: string;
    category: import("@/lib/data/schemas").Category;
    hero_photo: string | null;
    instagram?: string | null;
    website?: string | null;
    tier: import("@/lib/data/schemas").Tier;
  } | null;

  let enrichedBySlug: Map<string, EnrichedBusiness> = new Map();
  if (businessMode) {
    const slugs = (items as ListArticleItem[]).map((i) => i.business_slug);
    const results = await Promise.all(slugs.map((s) => getBusiness(s)));
    enrichedBySlug = new Map(
      results.map((art, i) => {
        if (!art) return [slugs[i], null] as const;
        return [
          slugs[i],
          {
            name: art.business.name,
            neighborhood: art.business.neighborhood,
            category: art.business.category,
            hero_photo:
              art.business.hero_photo ?? art.business.photos[0]?.url ?? null,
            instagram: art.business.instagram ?? null,
            website: art.business.website ?? null,
            tier: art.score.tier,
          },
        ] as const;
      }),
    );
  }

  // Hero photo: the #1-ranked business in business articles, otherwise null.
  const heroBusiness = businessMode
    ? enrichedBySlug.get((items[0] as ListArticleItem).business_slug)
    : null;
  const heroPhoto = heroBusiness?.hero_photo ?? null;
  const heroAlt = heroBusiness
    ? `${heroBusiness.name}, ${heroBusiness.neighborhood}`
    : article.title;

  const itemNoun = isPostArticle(article)
    ? items.length === 1
      ? "post"
      : "posts"
    : items.length === 1
      ? "business"
      : "businesses";
  const updated = formatUpdated(article.generated_at);
  const metaRow = [
    "Spring 2026",
    updated ? `Updated ${updated}` : null,
    `${items.length} ${itemNoun}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-6 py-10 md:py-14">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="font-body text-xs md:text-sm text-brand-black/60"
          >
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-brand-purple">
                  Pittsburgh
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li>
                <Link
                  href="/best-on-social"
                  className="hover:text-brand-purple"
                >
                  Best on Social
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li>
                <span>{article.title}</span>
              </li>
            </ol>
          </nav>

          {/* Hero (business articles get a real photo; post articles
              keep a quiet text-only hero without a photo slot). */}
          {businessMode ? (
            <ListHero
              heroPhoto={heroPhoto}
              heroAlt={heroAlt}
              kicker="The Series · Spring 2026"
              title={article.title}
              dek={
                article.subtitle ??
                introParagraphs[0]?.split(/(?<=[.!?])\s/)[0] ??
                null
              }
              meta={metaRow}
            />
          ) : (
            <header className="mt-6 md:mt-8">
              <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
                The Series · Spring 2026
              </p>
              <h1 className="mt-3 font-display font-black uppercase tracking-[-0.02em] text-brand-black text-[clamp(2rem,6vw,4.25rem)] leading-[0.95] [text-wrap:balance]">
                {article.title}
              </h1>
              {article.subtitle ? (
                <p className="mt-4 font-body text-base md:text-lg text-brand-black/70 leading-relaxed max-w-2xl [text-wrap:balance]">
                  {article.subtitle}
                </p>
              ) : null}
              <p className="mt-5 font-body text-xs uppercase tracking-[0.16em] text-brand-black/55">
                {metaRow}
              </p>
            </header>
          )}

          {/* Intro paragraphs, tighter typography for editorial body. */}
          <Reveal as="div" className="block">
            <div className="mt-10 md:mt-12 space-y-4 md:space-y-5 max-w-2xl">
              {introParagraphs.map((p, i) => (
                <p
                  key={i}
                  className={
                    i === 0
                      ? "font-body text-lg md:text-xl text-brand-black leading-relaxed first-letter:font-display first-letter:text-5xl md:first-letter:text-6xl first-letter:font-black first-letter:float-left first-letter:mr-2 first-letter:leading-[0.85] first-letter:text-brand-purple"
                      : "font-body text-base md:text-lg text-brand-black/85 leading-relaxed"
                  }
                >
                  {p}
                </p>
              ))}
            </div>
          </Reveal>

          {/* The list. Business mode gets the new ListItem layout;
              post mode keeps the compact card. */}
          <section className="mt-14 md:mt-20">
            <div className="border-y-2 border-brand-black py-3 mb-10 md:mb-14 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black">
                The list
              </h2>
              <span className="font-body text-xs text-brand-black/55 uppercase tracking-[0.14em]">
                {items.length} {itemNoun}
                {article.query
                  ? ` · ranked by ${String(article.query.ranking).replace(/_/g, " ")}`
                  : isPostArticle(article)
                    ? " · ranked by plays"
                    : ""}
              </span>
            </div>

            {businessMode ? (
              <ol className="space-y-24 md:space-y-32">
                {(items as ListArticleItem[]).map((item) => (
                  <ListItem
                    key={item.business_slug}
                    item={item}
                    business={enrichedBySlug.get(item.business_slug) ?? null}
                  />
                ))}
              </ol>
            ) : (
              <div className="space-y-8 md:space-y-10">
                {(items as PostArticleItem[]).map((item) => (
                  <PostItemCard
                    key={`${item.creator_handle}-${item.video_url}`}
                    item={item}
                  />
                ))}
              </div>
            )}
          </section>

          {/* How we picked this. Small methodology box. */}
          <aside className="mt-20 md:mt-24 border-t border-brand-black/15 pt-8">
            <div className="bg-brand-cream rounded-sm p-6 md:p-8">
              <h3 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-purple">
                How we picked this
              </h3>
              <p className="mt-3 font-body text-sm md:text-base text-brand-black/85 leading-relaxed max-w-2xl">
                Signal Pittsburgh ranks the conversation, not taste. Every list
                pulls from reviews, photos, Instagram cadence, and what
                creators in the city actually filmed this quarter. Editorial
                picks, not announcements.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Link
                  href="/how-we-rank"
                  className="inline-flex items-center gap-1 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-black hover:text-brand-purple transition-colors"
                >
                  Full methodology
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/request"
                  className="inline-flex items-center gap-1 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-black hover:text-brand-purple transition-colors"
                >
                  Submit a business
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </aside>

          {/* Subscribe footer */}
          <div className="mt-16 md:mt-20">
            <SubscribeFooter businessName="this list" />
          </div>
        </article>
      </main>

      <Colophon />
    </>
  );
}
