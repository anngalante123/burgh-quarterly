import type { MetadataRoute } from "next";

/**
 * Robots policy.
 *
 * We do NOT want Google indexing the preview URL (burgh-quarterly.vercel.app).
 * Only the future custom domain should be indexed. We detect the .vercel.app
 * hostname and emit a blanket Disallow there. On any other host we assume it's
 * the production custom domain and allow crawling + point at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://burgh-quarterly.vercel.app";

  let hostname = "";
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    hostname = "";
  }

  if (hostname.includes(".vercel.app")) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
