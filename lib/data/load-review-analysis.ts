/**
 * Type definitions for review analysis records.
 *
 * The DB-backed `loadReviewAnalysis()` reader lives in `./load-business.ts`
 * (consolidated there so route files only need one import path). This file
 * remains as the canonical home for the `ReviewAnalysis`, `ReviewTheme`,
 * `AnalysisPlaybookItem`, and `DiagnosisPullquote` types because the Drizzle
 * schema and several insight components import them from here.
 */

export type ReviewTheme = {
  /** Short phrase, 2-5 words. */
  phrase: string;
  /** Approximate count across the reviews. */
  frequency: number;
  /** Sentiment polarity of the theme. */
  sentiment: "positive" | "neutral" | "negative";
  /** Optional one-sentence quote from a review that illustrates this theme. */
  exampleQuote?: string;
};

export type AnalysisPlaybookItem = {
  headline: string;
  action: string;
  signal:
    | "momentum"
    | "content_canvas"
    | "community_spark"
    | "conversion_path"
    | "collab_fit";
  priority: "high" | "medium" | "low";
  /** Tight pill label for projected impact, e.g. "+8 SENTIMENT PTS" */
  impact_label?: string;
};

export type DiagnosisPullquote = {
  /** Display-scale single sentence for the hero zone. */
  line: string;
  /** The phrase from `line` to highlight. Must appear verbatim in `line`. */
  highlight: string;
};

export type ReviewAnalysis = {
  slug: string;
  themes: ReviewTheme[];
  /** One-sentence summary of what reviewers love + what they nitpick. */
  sentiment_summary: string;
  /** One quote that captures the business's appeal. */
  notable_quote: string;
  /** How many reviews were analyzed. */
  review_count: number;
  /** When the analysis was generated. */
  analyzed_at: string;
  /** Model name used. */
  model: string;

  /** 2-3 sentence editorial paragraph for this business's quarter. */
  quarter_narrative?: string;
  /** One-sentence diagnosis, the "read" for the TL;DR block. */
  tldr_read?: string;
  /** One-sentence trajectory description, the "meaning" for TL;DR. */
  tldr_meaning?: string;
  /** Three data-derived recommendations, sorted by priority. */
  playbook?: AnalysisPlaybookItem[];
  /** Display-scale diagnosis sentence for the new hero zone. */
  diagnosis_pullquote?: DiagnosisPullquote;
};

// Re-export the DB-backed loader from its new home so existing imports of
// `loadReviewAnalysis` from this path still resolve. Async now.
export { loadReviewAnalysis } from "./load-business";
