import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const COLORS = {
  black: "#0F0F0F",
  lime: "#C6F432",
} as const;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: COLORS.black,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="128" height="128" viewBox="0 0 64 64">
          <rect width="64" height="64" fill={COLORS.lime} />
          <rect x="10" y="42" width="10" height="14" fill={COLORS.black} />
          <rect x="24" y="30" width="10" height="26" fill={COLORS.black} />
          <rect x="38" y="14" width="10" height="42" fill={COLORS.black} />
        </svg>
      </div>
    ),
    { ...size },
  );
}
