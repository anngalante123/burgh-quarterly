/**
 * Reading-time estimator for editorial lists.
 *
 * Derives a "N min read" figure from entry count, since list pages are
 * templated: ~80 words standfirst + ~85 words per entry + ~50 words
 * closing. At 200 wpm this lands roughly:
 *   3 entries → 2 min
 *   5 entries → 3 min
 *   8 entries → 5 min
 *
 * We compute rather than hardcode so future lists with more entries
 * scale naturally.
 */
export function estimateReadingMinutes(entryCount: number): number {
  const words = 80 + entryCount * 85 + 50;
  return Math.max(2, Math.ceil(words / 200));
}
