/**
 * Upgrade a Google Maps photo URL to request a larger size.
 *
 * Google's CDN serves the same photo at many sizes by mutating the
 * size suffix on the URL. The default Apify-scraped URLs end with
 * '=w408-h306-k-no' (a 408x306 thumbnail) which pixelates when
 * rendered at full card width. This helper swaps that suffix for a
 * target width/height, no re-scraping required.
 *
 * Examples:
 *   '...=w408-h306-k-no'       -> '...=w1600-h1200-k-no'
 *   '...=s512'                 -> '...=s1600'
 *   '...' (no size suffix)     -> URL returned unchanged
 *
 * Use targetWidth based on the rendered context:
 *   - Homepage featured banner / business hero: 1600
 *   - Series cards / mid-size thumbnails: 800
 *   - Top 5 leaderboard avatars: 200
 */

export function upgradeGooglePhotoSize(
  url: string | null | undefined,
  targetWidth: number,
): string | null {
  if (!url) return null;

  // Variant A: =wXXX-hYYY-k-no (Maps Places photos)
  const wh = url.match(/=w(\d+)-h(\d+)(-[a-z-]+)?$/i);
  if (wh) {
    const ratio = parseInt(wh[2], 10) / parseInt(wh[1], 10);
    const newW = targetWidth;
    const newH = Math.round(targetWidth * ratio);
    const flags = wh[3] ?? "-k-no";
    return url.replace(/=w\d+-h\d+(-[a-z-]+)?$/i, `=w${newW}-h${newH}${flags}`);
  }

  // Variant B: =sXXX (square / max-dimension)
  const s = url.match(/=s\d+$/i);
  if (s) {
    return url.replace(/=s\d+$/i, `=s${targetWidth}`);
  }

  // No size suffix recognized, return as-is.
  return url;
}
