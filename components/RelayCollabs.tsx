import manifest from "@/content/relay-collabs/manifest.json";
import { Reveal } from "@/components/motion/Reveal";
import { familyForBusinessCategory } from "@/lib/data/category-family";
import type { Category } from "@/lib/data/schemas";

/**
 * Two surfaces for the Relay creator-collab proof:
 *
 *   - <RelayCollabStrip />     Compact 3-tile strip appended to the
 *                              GetFeaturedCTA. Brutalist hard-shadow
 *                              tiles in alternating lime/purple,
 *                              numbered, hover-reveal credits.
 *
 *   - <RelayCollabGallery />   Magazine-style bento on the homepage:
 *                              one hero photo, varied tile sizes,
 *                              same brutalist treatment at gallery
 *                              scale. Reads as an editorial feature
 *                              ("Pittsburgh's most photographed small
 *                              businesses this season") rather than a
 *                              SaaS grid.
 *
 * Visual language follows DESIGN.md: square corners, brutalist offset
 * shadow as the depth signal, lime + purple as the accent colors,
 * Unbounded for the numbered display type. Hover/focus reveals the
 * creator credit so the resting state is photo-first.
 */

type CollabEntry = (typeof manifest)[number];

function shuffle<T>(arr: readonly T[], seed: number): T[] {
  const out = [...arr];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function hashSeed(input?: string): number {
  if (!input) return Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function normalizeHandle(raw: string): string {
  const cleaned = raw.replace(/\([^)]*\)/g, "").trim();
  if (/^[a-z][a-z0-9_.]*$/i.test(cleaned)) return cleaned.toLowerCase();
  return cleaned.toLowerCase().replace(/\s+/g, "");
}

/* ---------------------------------------------------------- *
 *  Tile primitive
 *  Brutalist offset hard-shadow, numbered corner stamp,
 *  hover-reveal credit overlay. The shadow color alternates
 *  lime/purple by index so the gallery reads as one composition
 *  rather than 12 identical tiles.
 * ---------------------------------------------------------- */
function CollabTile({
  entry,
  index,
  size = "md",
}: {
  entry: CollabEntry;
  index: number;
  size?: "sm" | "md" | "lg";
}) {
  const isLime = index % 2 === 0;
  const shadowColor = isLime ? "var(--color-brand-lime)" : "var(--color-brand-purple)";
  const offset = size === "lg" ? "10px" : size === "sm" ? "5px" : "7px";

  const numSize =
    size === "lg"
      ? "text-2xl md:text-3xl"
      : size === "sm"
        ? "text-[0.7rem] md:text-xs"
        : "text-base md:text-lg";

  return (
    <figure className="group relative h-full w-full">
      {/* Hard-shadow offset tile */}
      <div
        className="relative h-full w-full overflow-hidden bg-brand-black/5"
        style={{ boxShadow: `${offset} ${offset} 0 0 ${shadowColor}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/relay-collabs/${entry.file}`}
          alt={`${entry.business}, filmed by ${entry.creator}`}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          loading="lazy"
          width={size === "lg" ? 1200 : 600}
          height={size === "lg" ? 1200 : 600}
        />

        {/* Number stamp, corner */}
        <span
          className={`absolute top-2 left-2 md:top-3 md:left-3 ${numSize} font-display font-black tabular-nums leading-none text-brand-lavender drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]`}
          aria-hidden="true"
        >
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* Credit overlay, slides up on hover */}
        <figcaption
          className="absolute inset-x-0 bottom-0 translate-y-full transition-transform duration-300 ease-out group-hover:translate-y-0 group-focus-within:translate-y-0 bg-brand-black/85 px-3 py-2 md:px-4 md:py-3"
        >
          <p className="font-display text-[0.7rem] md:text-xs font-bold uppercase tracking-[0.12em] text-brand-lavender line-clamp-1">
            {entry.business}
          </p>
          <p className="font-body text-[0.62rem] md:text-[0.7rem] text-brand-lime line-clamp-1">
            @{normalizeHandle(entry.creator)}
          </p>
        </figcaption>
      </div>
    </figure>
  );
}

/* ---------------------------------------------------------- *
 *  Strip, compact, 3 tiles
 *  Tries to pick photos from the same editorial family as the
 *  current business (bars get bars, cafes get cafes, etc). Falls
 *  back to the broader photo pool when the family doesn't have
 *  enough collab photos to fill three slots.
 * ---------------------------------------------------------- */
export function RelayCollabStrip({
  anchor,
  category,
}: {
  anchor?: string;
  /** Optional category of the business this strip sits next to. When
   *  provided, the strip prefers photos from the same family so a
   *  bar's page shows bars and a cafe's page shows cafes. */
  category?: Category | null;
}) {
  // Map the business's category to its editorial family, then map
  // each manifest entry to its own family; keep entries in the same
  // family.
  const targetFamily = category
    ? familyForBusinessCategory(category).key
    : null;

  const sameFamily = targetFamily
    ? (manifest as CollabEntry[]).filter(
        (m) =>
          (m as { category?: string }).category &&
          familyForBusinessCategory(
            (m as { category: Category }).category,
          ).key === targetFamily,
      )
    : [];

  // Need at least 3 same-family photos to feel intentional. Otherwise
  // fall back to the global pool so we never render < 3 tiles.
  const pool = sameFamily.length >= 3 ? sameFamily : (manifest as CollabEntry[]);
  const picks = shuffle(pool, hashSeed(anchor)).slice(0, 3) as CollabEntry[];

  // Editorial kicker reflects which case fired.
  const kicker =
    pool === sameFamily
      ? `Recently filmed · Pittsburgh ${familyLabelShort(targetFamily)}`
      : "Recently filmed · Pittsburgh creators";

  return (
    <div className="mt-6 border-t border-brand-purple/25 pt-5">
      <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-purple/80 mb-3">
        {kicker}
      </p>
      <div className="grid grid-cols-3 gap-2.5 md:gap-3">
        {picks.map((p, i) => (
          <div key={p.file} className="aspect-square">
            <CollabTile entry={p} index={i} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Short label for the family kicker. */
function familyLabelShort(famKey: string | null): string {
  switch (famKey) {
    case "restaurants":
      return "restaurants";
    case "cafes":
      return "cafes";
    case "bars":
      return "bars";
    case "sweets":
      return "sweets";
    case "boutiques":
      return "boutiques";
    case "salons":
      return "salons";
    case "fitness":
      return "fitness";
    case "spa":
      return "spas";
    case "tattoo":
      return "tattoo studios";
    default:
      return "businesses";
  }
}

/* ---------------------------------------------------------- *
 *  Gallery, magazine-bento
 *  Layout on md+:
 *    [ 01 (hero, 2x2) ][ 02 ][ 03 ]
 *    [               ][ 04 ][ 05 ]
 *    [ 06 ][ 07 ][ 08 (2x1) ]
 *    [ 09 ][ 10 ][ 11 ][ 12 ]
 *  On sm:  2-col uniform grid, all the brutalist treatment
 *  preserved (alternating shadow colors).
 * ---------------------------------------------------------- */
export function RelayCollabGallery() {
  const picks = shuffle(manifest, hashSeed()).slice(0, 12) as CollabEntry[];

  return (
    <Reveal as="section" className="block">
      <div className="border-y-2 border-brand-black py-10 md:py-14">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-8 md:mb-10">
          <div className="max-w-2xl">
            <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple mb-2">
              The publisher · Relay · Spring 2026
            </p>
            <h2 className="font-display font-black uppercase tracking-[-0.015em] text-brand-black text-3xl md:text-5xl leading-[0.95]">
              Twelve Pittsburgh places creators
              <br className="hidden sm:block" /> already{" "}
              <span className="bg-brand-lime px-1.5 box-decoration-clone">
                filmed this season.
              </span>
            </h2>
            <p className="mt-3 font-body text-sm md:text-base text-brand-black/65 leading-relaxed">
              No fee, no agency. Pittsburgh creators registered on
              Relay so they could feature local small businesses.
              Hover any tile to see who shot what.
            </p>
          </div>
          <a
            href="https://run-relay.com/try"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-brand-purple text-brand-lavender font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] px-5 py-3 md:px-7 md:py-4 hover:bg-brand-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime"
            style={{ boxShadow: "5px 5px 0 0 var(--color-brand-lime)" }}
          >
            Get filmed
            <span aria-hidden="true">→</span>
          </a>
        </div>

        {/* Magazine bento grid (md+). Mobile collapses to a uniform 2-col. */}
        <div
          className="grid gap-4 md:gap-5"
          style={{
            gridTemplateColumns: "repeat(4, 1fr)",
            gridAutoRows: "min(22vw, 220px)",
          }}
        >
          {picks.map((p, i) => {
            // Bento sizing: tile 0 is 2x2 (hero), tile 7 is 2x1 (wide).
            // Everything else is 1x1. This produces a layout that fills
            // without holes when 12 tiles are in play.
            let className = "";
            if (i === 0) className = "col-span-2 row-span-2";
            else if (i === 7) className = "col-span-2 row-span-1";
            // On small screens, force all tiles square 2-col grid.
            return (
              <div
                key={p.file}
                className={`relative ${className} max-md:col-span-2 max-md:row-span-1 max-md:aspect-square`}
              >
                <CollabTile entry={p} index={i} size={i === 0 ? "lg" : "md"} />
              </div>
            );
          })}
        </div>
      </div>
    </Reveal>
  );
}
