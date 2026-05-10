import { ImageResponse } from "next/og";

/**
 * Default OG image for the publication. Used on the homepage and any
 * route that doesn't define its own opengraph-image.tsx. Built to feel
 * like a magazine masthead, not a SaaS share card.
 */

export const runtime = "nodejs";
export const alt = "Signal Pittsburgh — Pittsburgh small businesses, ranked on social.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLORS = {
  black: "#0F0F0F",
  offWhite: "#F5F0FA",
  lime: "#C6F432",
} as const;

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: COLORS.black,
          color: COLORS.offWhite,
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
            gap: "24px",
            marginBottom: "auto",
          }}
        >
          <svg width="72" height="72" viewBox="0 0 64 64">
            <rect width="64" height="64" fill={COLORS.lime} />
            <rect x="10" y="42" width="10" height="14" fill={COLORS.black} />
            <rect x="24" y="30" width="10" height="26" fill={COLORS.black} />
            <rect x="38" y="14" width="10" height="42" fill={COLORS.black} />
          </svg>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div
              style={{
                color: COLORS.lime,
                fontSize: "40px",
                fontWeight: 900,
                letterSpacing: "-1px",
                lineHeight: 1,
              }}
            >
              SIGNAL PITTSBURGH
            </div>
            <div
              style={{
                color: COLORS.offWhite,
                opacity: 0.55,
                fontSize: "16px",
                fontWeight: 600,
                letterSpacing: "4px",
              }}
            >
              PGH · SIGNAL INDEX · SPRING 2026
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: "92px",
            fontWeight: 900,
            letterSpacing: "-2px",
            lineHeight: 0.98,
            display: "flex",
            flexWrap: "wrap",
          }}
        >
          Pittsburgh small businesses,&nbsp;
          <span style={{ background: COLORS.lime, color: COLORS.black, padding: "0 12px", display: "flex" }}>
            ranked on social.
          </span>
        </div>
      </div>
    ),
  );
}
