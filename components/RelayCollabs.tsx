import manifest from "@/content/relay-collabs/manifest.json";
import { Reveal } from "@/components/motion/Reveal";

/**
 * Two ways to surface the photo-shoot proof from Relay's creator
 * collabs:
 *
 *   - <RelayCollabStrip />      Compact 3-photo strip for the
 *                               GetFeaturedCTA. Acts as social proof:
 *                               "creators have already filmed these
 *                               Pittsburgh small businesses."
 *
 *   - <RelayCollabGallery />    Bigger 12-photo grid for the homepage.
 *                               Treats the collabs as content, with a
 *                               section header.
 *
 * Photo source: 18 hand-curated images from Relay's 70-photo collab
 * archive, downsized to 1200px max, ~150-300 KB each. Manifest at
 * content/relay-collabs/manifest.json maps each file to its business
 * and creator. Photos live in public/relay-collabs/.
 *
 * The selection per render is pseudo-randomized so the strip doesn't
 * always show the same first 3; that work happens inside this server
 * component with a slug-stable seed so we don't violate render
 * determinism within a single request.
 */

type CollabEntry = (typeof manifest)[number];

function shuffle<T>(arr: readonly T[], seed: number): T[] {
  // Lightweight deterministic shuffle so the strip rotates per slug
  // without changing within a single request.
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
  if (!input) {
    // No anchor — use the day so it rotates daily but stays stable
    // across renders within a day.
    return Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  }
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function RelayCollabStrip({ anchor }: { anchor?: string }) {
  const picks = shuffle(manifest, hashSeed(anchor)).slice(0, 3) as CollabEntry[];

  return (
    <div className="mt-5 border-t border-brand-purple/20 pt-4">
      <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-purple/80 mb-3">
        Recently filmed by Pittsburgh creators
      </p>
      <ul className="grid grid-cols-3 gap-2">
        {picks.map((p) => (
          <li key={p.file} className="relative">
            <div className="aspect-square overflow-hidden bg-brand-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/relay-collabs/${p.file}`}
                alt={`${p.business} — filmed by ${p.creator}`}
                className="h-full w-full object-cover"
                loading="lazy"
                width={400}
                height={400}
              />
            </div>
            <p className="mt-1.5 font-body text-[0.62rem] leading-tight text-brand-black/65 line-clamp-1">
              {p.business}
            </p>
            <p className="font-body text-[0.58rem] leading-tight text-brand-black/45 line-clamp-1">
              @{normalizeHandle(p.creator)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RelayCollabGallery() {
  // Show 12 — fills a 4-column grid cleanly on desktop and 2-col on
  // mobile. Rotates daily via the no-anchor seed.
  const picks = shuffle(manifest, hashSeed()).slice(0, 12) as CollabEntry[];

  return (
    <Reveal as="section" className="block">
      <div className="border-y border-brand-black/15 py-10 md:py-14">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6 md:mb-8">
          <div>
            <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple mb-1.5">
              The publisher · Relay
            </p>
            <h2 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-2xl md:text-3xl leading-[1.05]">
              Pittsburgh creators have already
              <br className="hidden sm:block" /> filmed{" "}
              <span className="bg-brand-lime px-1.5 box-decoration-clone">
                these places.
              </span>
            </h2>
          </div>
          <a
            href="https://run-relay.com/apply"
            target="_blank"
            rel="noopener noreferrer"
            className="font-display text-[0.62rem] md:text-xs font-semibold uppercase tracking-[0.22em] text-brand-purple hover:text-brand-black focus:outline-none focus-visible:underline"
          >
            Get matched &rarr;
          </a>
        </div>
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
          {picks.map((p) => (
            <li key={p.file} className="relative">
              <div className="aspect-square overflow-hidden bg-brand-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/relay-collabs/${p.file}`}
                  alt={`${p.business} — filmed by ${p.creator}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  width={600}
                  height={600}
                />
              </div>
              <p className="mt-2 font-body text-xs md:text-sm text-brand-black/75 line-clamp-1">
                {p.business}
              </p>
              <p className="font-body text-[0.65rem] md:text-xs text-brand-black/45 line-clamp-1">
                @{normalizeHandle(p.creator)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

/**
 * Best-effort normalization of the creator name into a handle-ish form.
 * The raw filenames mix real names ("Sarah Krut") with handles
 * ("kbrunnerr"). For the strip caption we want something IG-shaped,
 * so we lowercase and strip spaces. If the original already looks like
 * a handle, leave it alone.
 */
function normalizeHandle(raw: string): string {
  const cleaned = raw
    .replace(/\([^)]*\)/g, "") // drop "(Xtreme.eats)" parentheticals
    .trim();
  if (/^[a-z][a-z0-9_.]*$/i.test(cleaned)) return cleaned.toLowerCase();
  return cleaned.toLowerCase().replace(/\s+/g, "");
}
