/** Supabase Storage public object URLs include this path segment. */
const PUBLIC_OBJECT_SEGMENT = '/storage/v1/object/public/';

export type CampaignImageDisplayVariant = 'thumbnail' | 'default' | 'detail';

export function isSupabaseStoragePublicObjectUrl(url: string): boolean {
  const t = url.trim();
  if (!t || t.startsWith('data:')) return false;
  try {
    const abs = t.startsWith('//') ? `https:${t}` : t;
    const u = new URL(abs);
    return u.pathname.includes(PUBLIC_OBJECT_SEGMENT);
  } catch {
    return false;
  }
}

/**
 * Normalizes URLs for `<img src>`: Supabase **public** Storage URLs are returned **without**
 * `?width=&quality=&format=`. Those params trigger Supabase Image Transformation, which returns
 * **400** when resizing is not enabled for the project. External URLs are unchanged. `variant` is unused (reserved).
 */
export function campaignImageDisplayUrl(
  url: string | null | undefined,
  _variant: CampaignImageDisplayVariant = 'default',
): string | undefined {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return undefined;
  if (!isSupabaseStoragePublicObjectUrl(raw)) return raw;
  return plainSupabasePublicObjectUrl(raw) ?? raw;
}

/**
 * Public Storage object URL without Image Transformation query params (same as `getPublicUrl`).
 */
export function plainSupabasePublicObjectUrl(url: string): string | undefined {
  const t = url.trim();
  if (!t || !isSupabaseStoragePublicObjectUrl(t)) return undefined;
  try {
    const abs = t.startsWith('//') ? `https:${t}` : t;
    const u = new URL(abs);
    u.search = '';
    return u.toString();
  } catch {
    const i = t.indexOf('?');
    return i === -1 ? t : t.slice(0, i);
  }
}

/** Opt-in: set `VITE_PRELOAD_CAMPAIGN_BUCKET_IMAGES=true` to run proactive `Image()` warming. */
export const isCampaignBucketPreloadEnabled =
  import.meta.env.VITE_PRELOAD_CAMPAIGN_BUCKET_IMAGES === 'true';

/**
 * Unique plain public-object URLs for Supabase campaign creatives (no transform query — matches prefetch target).
 */
export function collectCampaignBucketDetailImageUrls(
  previewUrls: ReadonlyArray<string | undefined | null>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of previewUrls) {
    const t = typeof raw === 'string' ? raw.trim() : '';
    if (!t) continue;
    const u = plainSupabasePublicObjectUrl(t);
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
