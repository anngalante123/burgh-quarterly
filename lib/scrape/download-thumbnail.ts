import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * downloadThumbnail, fetch an Instagram-CDN-signed displayUrl
 * server-side and save it to public/post-thumbs/<shortcode>.<ext> so
 * the site serves it from our own domain.
 *
 * IG's CDN URLs are short-lived AND blocked from cross-origin hot-
 * linking, so the only reliable visual is one we host ourselves.
 *
 * Returns the public-relative URL ('/post-thumbs/abc.jpg') on success,
 * null if the fetch failed (image expired, network error, etc.).
 */

const PUBLIC_DIR = join(process.cwd(), "public", "post-thumbs");

/** Lightweight LRU-ish memo to avoid re-fetching identical URLs across
 *  generator runs in the same process. */
const memo = new Map<string, string | null>();

export async function downloadThumbnail(
  displayUrl: string,
  shortcode: string,
): Promise<string | null> {
  if (memo.has(shortcode)) return memo.get(shortcode) ?? null;

  await mkdir(PUBLIC_DIR, { recursive: true });

  // Fast path: if we've already pulled this shortcode (any extension), reuse.
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const p = join(PUBLIC_DIR, `${shortcode}.${ext}`);
    if (existsSync(p)) {
      const url = `/post-thumbs/${shortcode}.${ext}`;
      memo.set(shortcode, url);
      return url;
    }
  }

  try {
    const res = await fetch(displayUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      memo.set(shortcode, null);
      return null;
    }
    const ct = (res.headers.get("content-type") ?? "image/jpeg").toLowerCase();
    let ext = "jpg";
    if (ct.includes("png")) ext = "png";
    else if (ct.includes("webp")) ext = "webp";
    else if (ct.includes("gif")) ext = "gif";
    const buf = Buffer.from(await res.arrayBuffer());
    const filename = `${shortcode}.${ext}`;
    await writeFile(join(PUBLIC_DIR, filename), buf);
    const url = `/post-thumbs/${filename}`;
    memo.set(shortcode, url);
    return url;
  } catch {
    memo.set(shortcode, null);
    return null;
  }
}
