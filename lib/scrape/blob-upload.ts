/**
 * lib/scrape/blob-upload.ts
 *
 * Phase 3 helper, uploads a single source photo URL to Vercel Blob, resized
 * to 800w and 1600w JPEGs. Used by the photos_uploaded step in
 * scripts/ingest-one.ts when scraping a brand-new place_id.
 *
 * Graceful fallback:
 *   1. If BLOB_READ_WRITE_TOKEN is not set, log a single warning per process
 *      and return null. The pipeline keeps the original Google CDN URL on
 *      business_photos.url and stores blob_key=null. Anna can backfill blobs
 *      later when she provisions Vercel Blob.
 *   2. If sharp is not importable, fall back to uploading the original bytes
 *      (no resize). One warning per process. Avoids ESM/optional-binary land
 *      mines on environments that don't ship sharp's native build.
 *   3. If the network fetch fails, the upload errors, or the source isn't a
 *      valid image, return null and log. Pipeline continues.
 *
 * No em-dashes in this file. Project rule.
 */

import { put } from "@vercel/blob";

let warnedMissingToken = false;
let warnedMissingSharp = false;
let cachedSharp: SharpFactory | null | undefined = undefined;

type SharpInstance = {
  resize: (opts: { width: number; withoutEnlargement?: boolean }) => SharpInstance;
  jpeg: (opts: { quality: number; mozjpeg?: boolean }) => SharpInstance;
  toBuffer: () => Promise<Buffer>;
};
type SharpFactory = (input: Buffer) => SharpInstance;

async function loadSharp(): Promise<SharpFactory | null> {
  if (cachedSharp !== undefined) return cachedSharp;
  try {
    const mod = (await import("sharp")) as unknown as
      | { default?: SharpFactory }
      | SharpFactory;
    const fn =
      typeof mod === "function"
        ? (mod as SharpFactory)
        : ((mod as { default?: SharpFactory }).default ?? null);
    cachedSharp = fn ?? null;
  } catch {
    cachedSharp = null;
  }
  if (!cachedSharp && !warnedMissingSharp) {
    warnedMissingSharp = true;
    console.warn(
      "[blob-upload] sharp not available; uploading original-size JPEG only. Install sharp to enable 800w/1600w resize.",
    );
  }
  return cachedSharp ?? null;
}

export interface BlobUploadResult {
  blob_key: string | null;
  sizes: {
    w800: string | null;
    w1600: string | null;
  };
}

/**
 * Fetch `url`, resize to 800w + 1600w JPEGs (sharp permitting), upload to
 * Vercel Blob under `businesses/<slug>/<sortOrder>-<width>w.jpg`, and return
 * the blob keys. The "primary" blob_key is the 800w upload, since the site
 * uses 800w for cards and lists. The 1600w is available for hero contexts.
 */
export async function uploadPhotoToBlob(
  url: string,
  slug: string,
  sortOrder: number,
): Promise<BlobUploadResult> {
  const empty: BlobUploadResult = {
    blob_key: null,
    sizes: { w800: null, w1600: null },
  };

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (!warnedMissingToken) {
      warnedMissingToken = true;
      console.warn(
        "[blob-upload] BLOB_READ_WRITE_TOKEN not set; skipping blob upload. Photos will reference the source URL directly. Provision Vercel Blob to enable persistence.",
      );
    }
    return empty;
  }

  let sourceBytes: Buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(
        `[blob-upload] ${slug} sort=${sortOrder}: source fetch failed ${res.status} ${res.statusText} for ${url.slice(0, 120)}`,
      );
      return empty;
    }
    const ab = await res.arrayBuffer();
    sourceBytes = Buffer.from(ab);
  } catch (e) {
    console.warn(
      `[blob-upload] ${slug} sort=${sortOrder}: source fetch error ${(e as Error).message}`,
    );
    return empty;
  }

  const sharpFn = await loadSharp();

  async function resizeJpeg(width: number): Promise<Buffer | null> {
    if (!sharpFn) return null;
    try {
      return await sharpFn(sourceBytes)
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch (e) {
      console.warn(
        `[blob-upload] ${slug} sort=${sortOrder} w=${width}: resize failed ${(e as Error).message}`,
      );
      return null;
    }
  }

  async function tryPut(
    pathname: string,
    body: Buffer,
  ): Promise<string | null> {
    try {
      const result = await put(pathname, body, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return result.url;
    } catch (e) {
      console.warn(
        `[blob-upload] ${slug} ${pathname}: put failed ${(e as Error).message}`,
      );
      return null;
    }
  }

  const path800 = `businesses/${slug}/${sortOrder}-800w.jpg`;
  const path1600 = `businesses/${slug}/${sortOrder}-1600w.jpg`;

  let buf800: Buffer | null = await resizeJpeg(800);
  const buf1600: Buffer | null = await resizeJpeg(1600);

  // sharp absent or both resizes failed: upload the original bytes once at
  // the 800w path so the pipeline still gets a self-hosted reference. Better
  // than nothing; render layer can request the source if it needs detail.
  if (!buf800 && !buf1600) {
    buf800 = sourceBytes;
  }

  const w800 = buf800 ? await tryPut(path800, buf800) : null;
  const w1600 = buf1600 ? await tryPut(path1600, buf1600) : null;

  return {
    blob_key: w800 ?? w1600 ?? null,
    sizes: { w800, w1600 },
  };
}
