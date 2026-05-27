import type { MetadataRoute } from "next";
import { getAllBusinessSlugs } from "@/lib/data/load-business";
import { listAllListSlugs } from "@/lib/data/load-list";

// Business slugs come from Neon at request time, so we don't want
// Next caching this at build time.
export const dynamic = "force-dynamic";

const STATIC_ROUTES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1.0 },
  { path: "/about", priority: 0.7 },
  { path: "/how-we-rank", priority: 0.8 },
  { path: "/leaderboard", priority: 0.7 },
  { path: "/best-on-social", priority: 0.7 },
  { path: "/underrated", priority: 0.7 },
  { path: "/request", priority: 0.7 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://burgh-quarterly.vercel.app";
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: route.priority,
  }));

  let businessEntries: MetadataRoute.Sitemap = [];
  let listEntries: MetadataRoute.Sitemap = [];

  try {
    const businessSlugs = await getAllBusinessSlugs();
    businessEntries = businessSlugs.map((slug) => ({
      url: `${baseUrl}/business/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch (err) {
    // If Neon is unreachable, fall back to static routes only rather than
    // failing the whole sitemap response.
    console.error("[sitemap] failed to load business slugs:", err);
  }

  try {
    const listSlugs = listAllListSlugs();
    listEntries = listSlugs.map((slug) => ({
      url: `${baseUrl}/best-on-social/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch (err) {
    console.error("[sitemap] failed to load list slugs:", err);
  }

  return [...staticEntries, ...businessEntries, ...listEntries];
}
