import { preloadedUrls } from '@/lib/campaignImagePreloadRegistry';

/** Legacy public object reads (full file). */
export const SUPABASE_STORAGE_PUBLIC_OBJECT_SEGMENT = '/storage/v1/object/public/';
/** Image transformation endpoint — optimized delivery for `<img>` / previews. */
export const SUPABASE_STORAGE_RENDER_IMAGE_SEGMENT = '/storage/v1/render/image/public/';

/** Skip render/optimization for obvious non-image objects in Storage. */
const NON_IMAGE_STORAGE_PATH = /\.(pdf|csv|tsv|xlsx?|docx?|zip|txt|xml|json)$/i;

export type CampaignImageDisplayVariant = 'thumbnail' | 'default' | 'detail';

/**
 * Pass-through to `getPublicUrl(..., { transform })` for campaign creatives (typed for Storage SDK).
 * `format: 'origin'` keeps the same format as the uploaded file; omitting format opts into WebP per API defaults.
 */
export const SUPABASE_GET_PUBLIC_URL_IMAGE_TRANSFORM = {
  width: 600,
  quality: 80,
  format: 'origin' as const,
};

/** Query params applied when rewriting legacy `/object/public/` URLs to `/render/image/public/` (HTTP). */
export const SUPABASE_CAMPAIGN_IMAGE_RENDER_QUERY = {
  width: 600,
  quality: 80,
  format: 'webp' as const,
};

export function isLikelyNonImageStoragePath(pathname: string): boolean {
  return NON_IMAGE_STORAGE_PATH.test(pathname);
}

/** True for Supabase Storage public campaign URLs (legacy object or image-render path). */
export function isSupabaseStoragePublicObjectUrl(url: string): boolean {
  const t = url.trim();
  if (!t || t.startsWith('data:')) return false;
  try {
    const abs = t.startsWith('//') ? `https:${t}` : t;
    const u = new URL(abs);
    return (
      u.pathname.includes(SUPABASE_STORAGE_PUBLIC_OBJECT_SEGMENT) ||
      u.pathname.includes(SUPABASE_STORAGE_RENDER_IMAGE_SEGMENT)
    );
  } catch {
    return false;
  }
}

/**
 * Rewrites `/storage/v1/object/public/...` → `/storage/v1/render/image/public/...` with
 * `width`, `quality`, `format` (existing search params merged; same keys overwritten).
 * Non-image paths (pdf, csv, …) are left unchanged. Already-render URLs get params normalized.
 */
export function supabaseCampaignImageRenderUrl(url: string): string | undefined {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return undefined;
  if (!isSupabaseStoragePublicObjectUrl(raw)) return undefined;
  try {
    const abs = raw.startsWith('//') ? `https:${raw}` : raw;
    const u = new URL(abs);
    if (isLikelyNonImageStoragePath(u.pathname)) return undefined;

    if (u.pathname.includes(SUPABASE_STORAGE_PUBLIC_OBJECT_SEGMENT)) {
      u.pathname = u.pathname.replace(
        SUPABASE_STORAGE_PUBLIC_OBJECT_SEGMENT,
        SUPABASE_STORAGE_RENDER_IMAGE_SEGMENT,
      );
    }

    const { width, quality, format } = SUPABASE_CAMPAIGN_IMAGE_RENDER_QUERY;
    u.searchParams.set('width', String(width));
    u.searchParams.set('quality', String(quality));
    u.searchParams.set('format', format);

    return u.toString();
  } catch {
    return undefined;
  }
}

/**
 * Normalizes URLs for `<img src>`: Supabase Storage **image** public URLs use the render endpoint +
 * transform query params. Non-image Storage URLs and external URLs are unchanged.
 */
export function campaignImageDisplayUrl(
  url: string | null | undefined,
  _variant: CampaignImageDisplayVariant = 'default',
): string | undefined {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return undefined;
  if (!isSupabaseStoragePublicObjectUrl(raw)) return raw;
  try {
    const abs = raw.startsWith('//') ? `https:${raw}` : raw;
    const u = new URL(abs);
    if (isLikelyNonImageStoragePath(u.pathname)) return raw;
  } catch {
    /* fall through */
  }
  return supabaseCampaignImageRenderUrl(raw) ?? raw;
}

/**
 * Canonical **object** URL without transform params (dedup / compare). Maps render path back to `object/public`.
 */
export function plainSupabasePublicObjectUrl(url: string): string | undefined {
  const t = url.trim();
  if (!t || !isSupabaseStoragePublicObjectUrl(t)) return undefined;
  try {
    const abs = t.startsWith('//') ? `https:${t}` : t;
    const u = new URL(abs);
    let path = u.pathname;
    if (path.includes(SUPABASE_STORAGE_RENDER_IMAGE_SEGMENT)) {
      path = path.replace(SUPABASE_STORAGE_RENDER_IMAGE_SEGMENT, SUPABASE_STORAGE_PUBLIC_OBJECT_SEGMENT);
    }
    u.pathname = path;
    u.search = '';
    return u.toString();
  } catch {
    const i = t.indexOf('?');
    return i === -1 ? t : t.slice(0, i);
  }
}

/**
 * Opt-in: set `VITE_PRELOAD_CAMPAIGN_BUCKET_IMAGES=true` to run proactive `Image()` warming.
 * Uses optional `import.meta.env` so Node/tsx (e.g. backfill scripts) does not crash — Vite injects `env` in the browser build.
 */
export const isCampaignBucketPreloadEnabled =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_PRELOAD_CAMPAIGN_BUCKET_IMAGES === 'true';

/**
 * Unique display URLs for Supabase campaign creatives (optimized render URLs — matches `<img src>`).
 */
export function collectCampaignBucketDetailImageUrls(
  previewUrls: ReadonlyArray<string | undefined | null>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of previewUrls) {
    const t = typeof raw === 'string' ? raw.trim() : '';
    if (!t) continue;
    const u = campaignImageDisplayUrl(t);
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

/** Max distinct bucket URLs to preload per Campaigns visit (avoids hundreds of parallel requests). */
const MAX_CAMPAIGN_BUCKET_PRELOAD_URLS = 120;

/**
 * Defer until the browser is idle, then batch-fetch images so HTTP cache is warm before scroll/modal.
 * Non-bucket URLs are skipped (external Braze/imgix URLs are unchanged by {@link campaignImageDisplayUrl} but not preloaded here).
 * Skips URLs already in {@link preloadedUrls} from {@link campaignImagePreloadRegistry}.
 */
export function schedulePreloadCampaignBucketDetailImages(
  previewUrls: ReadonlyArray<string | undefined | null>,
  concurrency = 8,
): void {
  if (!isCampaignBucketPreloadEnabled) return;

  let urls = collectCampaignBucketDetailImageUrls(previewUrls);
  if (urls.length === 0) return;
  if (urls.length > MAX_CAMPAIGN_BUCKET_PRELOAD_URLS) {
    urls = urls.slice(0, MAX_CAMPAIGN_BUCKET_PRELOAD_URLS);
  }

  const run = (): void => {
    void (async () => {
      for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency);
        await Promise.all(
          batch.map(
            url =>
              new Promise<void>(resolve => {
                if (preloadedUrls.has(url)) {
                  resolve();
                  return;
                }
                preloadedUrls.add(url);
                const img = new Image();
                img.decoding = 'async';
                img.onload = () => resolve();
                img.onerror = () => resolve();
                img.src = url;
              }),
          ),
        );
      }
    })();
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2500 });
  } else {
    setTimeout(run, 0);
  }
}
