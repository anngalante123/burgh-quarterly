import { ImageResponse } from "next/og";
import { loadBusinessBySlug } from "@/lib/data/load-business";
import { familyForBusinessCategory } from "@/lib/data/category-family";

/**
 * Dynamic per-business OG image. Generates a 1200x630 share card for
 * every /business/[slug] URL: business name, tier badge, rank, family.
 *
 * Renders in the Vercel runtime via Next.js's built-in ImageResponse.
 * Uses system-fallback fonts (Helvetica/Arial Black + Helvetica) so
 * we don't have to ship Unbounded as a fetched font for v1; the
 * editorial-publication aesthetic still reads because the layout,
 * color, and the lime signal-bar mark do the heavy lifting.
 */

export const runtime = "nodejs";
export const alt = "Signal Pittsburgh";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLORS = {
  black: "#0F0F0F",
  lavender: "#F5F0FA",
  lime: "#C6F432",
  purple: "#AB35EE",
  cream: "#F5F8E8",
} as const;

const TIER_LABEL: Record<string, string> = {
  icons: "ICON OF THE BURGH",
  ones_to_watch: "ONE TO WATCH",
  neighborhood_staples: "NEIGHBORHOOD STAPLE",
};

const TIER_COLOR: Record<string, { bg: string; fg: string }> = {
  icons: { bg: COLORS.lime, fg: COLORS.black },
  ones_to_watch: { bg: COLORS.purple, fg: COLORS.lavender },
  neighborhood_staples: { bg: COLORS.cream, fg: COLORS.black },
};

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const art = await loadBusinessBySlug(slug);

  // Fallback card if the slug is unknown or data is missing
  if (!art) {
    return new ImageResponse(<DefaultCard />);
  }

  const { business, score } = art;
  const family = familyForBusinessCategory(business.category);
  const familyShort = (family.label || "Pittsburgh").replace(
    /^Pittsburgh\s+/,
    "",
  );
  const tierLabel = TIER_LABEL[score.tier] ?? "RECORD";
  const tierColors = TIER_COLOR[score.tier] ?? {
    bg: COLORS.lavender,
    fg: COLORS.black,
  };
  const rankCategory = score.rank_category ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: COLORS.black,
          color: COLORS.lavender,
          display: "flex",
          flexDirection: "column",
          padding: "60px 72px",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        {/* Masthead row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "auto",
          }}
        >
          <SignalMark />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <div
              style={{
                color: COLORS.lime,
                fontSize: "32px",
                fontWeight: 900,
                letterSpacing: "-1px",
                lineHeight: 1,
              }}
            >
              SIGNAL PITTSBURGH
            </div>
            <div
              style={{
                color: COLORS.lavender,
                opacity: 0.55,
                fontSize: "14px",
                fontWeight: 600,
                letterSpacing: "4px",
              }}
            >
              PGH · SIGNAL INDEX · SPRING 2026
            </div>
          </div>
        </div>

        {/* Business name */}
        <div
          style={{
            display: "flex",
            fontSize: business.name.length > 24 ? "82px" : "104px",
            fontWeight: 900,
            letterSpacing: "-2px",
            lineHeight: 0.95,
            marginBottom: "40px",
            color: COLORS.lavender,
          }}
        >
          {business.name}
        </div>

        {/* Rank + tier row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              background: tierColors.bg,
              color: tierColors.fg,
              padding: "10px 18px",
              fontSize: "18px",
              fontWeight: 800,
              letterSpacing: "3px",
              display: "flex",
            }}
          >
            {tierLabel}
          </div>
          {rankCategory !== null ? (
            <div
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: COLORS.lavender,
                opacity: 0.85,
                display: "flex",
              }}
            >
              #{rankCategory} in {familyShort.toUpperCase()}
            </div>
          ) : null}
        </div>
      </div>
    ),
  );
}

function SignalMark() {
  return (
    <svg width="56" height="56" viewBox="0 0 64 64">
      <rect width="64" height="64" fill={COLORS.lime} />
      <rect x="10" y="42" width="10" height="14" fill={COLORS.black} />
      <rect x="24" y="30" width="10" height="26" fill={COLORS.black} />
      <rect x="38" y="14" width="10" height="42" fill={COLORS.black} />
    </svg>
  );
}

function DefaultCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: COLORS.black,
        color: COLORS.lavender,
        display: "flex",
        flexDirection: "column",
        padding: "72px",
        fontFamily: "Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "20px",
          marginBottom: "auto",
        }}
      >
        <SignalMark />
        <div
          style={{
            color: COLORS.lime,
            fontSize: "32px",
            fontWeight: 900,
            letterSpacing: "-1px",
            display: "flex",
          }}
        >
          SIGNAL PITTSBURGH
        </div>
      </div>
      <div
        style={{
          fontSize: "84px",
          fontWeight: 900,
          letterSpacing: "-2px",
          lineHeight: 1,
          display: "flex",
        }}
      >
        Pittsburgh small businesses, ranked on social.
      </div>
    </div>
  );
}
