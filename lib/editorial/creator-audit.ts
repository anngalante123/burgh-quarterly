import type { BusinessArtifact } from "@/lib/data/load-business";
import type { SocialRecord } from "@/lib/data/load-social";

/**
 * Creator-Ready Audit, pass/fail checks that Google Maps doesn't audit.
 * Each check is boolean, derived from record + social. Fails carry a
 * one-line fix suggestion.
 *
 * The full audit block is the honest version of the Relay pitch: it
 * surfaces the exact gaps Relay solves, without naming Relay. A reader
 * who sees 8 pass / 2 fail on their own business sees a roadmap.
 */

export type AuditCheck = {
  id: string;
  label: string;
  pass: boolean;
  fix?: string;
};

export type CreatorAudit = {
  checks: AuditCheck[];
  passed: number;
  failed: number;
  total: number;
};

export function buildCreatorAudit(
  artifact: BusinessArtifact,
  social: SocialRecord,
): CreatorAudit {
  const meta = artifact.meta;
  const ig = social.ig;

  const checks: AuditCheck[] = [
    {
      id: "photos-count",
      label: "300+ photos on Google",
      pass: meta.imagesCount >= 300,
      fix:
        meta.imagesCount < 300
          ? `At ${meta.imagesCount.toLocaleString()}. Upload 10 high-quality owner photos this week.`
          : undefined,
    },
    {
      id: "photo-categories",
      label: "5+ photo categories tagged",
      pass: meta.imageCategories.length >= 5,
      fix:
        meta.imageCategories.length < 5
          ? `Only ${meta.imageCategories.length} tagged, Google needs variety (menu, vibe, food, exterior, etc).`
          : undefined,
    },
    {
      id: "website",
      label: "Website on Google listing",
      pass: meta.hasWebsite,
      fix: !meta.hasWebsite
        ? "Add a website link in the Google Business profile."
        : undefined,
    },
    {
      id: "phone",
      label: "Phone number on Google",
      pass: meta.hasPhone,
      fix: !meta.hasPhone
        ? "Publish a phone number, Google de-ranks listings without one."
        : undefined,
    },
    {
      id: "hours",
      label: "Opening hours published",
      pass: meta.hasOpeningHours,
      fix: !meta.hasOpeningHours
        ? "Fill in every day's hours, 'hours unavailable' caps discovery."
        : undefined,
    },
    {
      id: "ig-handle",
      label: "Instagram handle indexed",
      pass: !!ig,
      fix: !ig
        ? "Make sure your IG handle is linked on Google and your website."
        : undefined,
    },
    {
      id: "ig-business",
      label: "Instagram is a business account",
      pass: ig ? !!ig.is_business_account : false,
      fix:
        ig && !ig.is_business_account
          ? "Switch to a business account in IG settings, unlocks insights and creator tags."
          : undefined,
    },
    {
      id: "ig-bio",
      label: "Instagram bio written",
      pass: ig ? !!ig.biography && ig.biography.length > 10 : false,
      fix:
        ig && (!ig.biography || ig.biography.length <= 10)
          ? "Write a one-line bio: what you are + where + a link."
          : undefined,
    },
    {
      id: "ig-posts-30d",
      label: "Instagram posted this month",
      pass: ig ? ig.posts_30d > 0 : false,
      fix:
        ig && ig.posts_30d === 0
          ? "Post one photo or story this week, dormant accounts fall out of the feed."
          : undefined,
    },
    {
      id: "ig-reels-30d",
      label: "Instagram reel this month",
      pass: ig ? ig.reels_30d > 0 : false,
      fix:
        ig && ig.reels_30d === 0
          ? "Film one 15-second reel, reels pick up signal faster than static posts."
          : undefined,
    },
  ];

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  return { checks, passed, failed, total: checks.length };
}
