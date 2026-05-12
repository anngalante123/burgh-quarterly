import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Signal Pittsburgh",
    short_name: "Signal PGH",
    description:
      "The businesses Pittsburgh is talking about, ranked every quarter.",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F0FA",
    theme_color: "#0F0F0F",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
  };
}
