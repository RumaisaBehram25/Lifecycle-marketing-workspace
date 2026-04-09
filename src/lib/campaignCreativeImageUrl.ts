/** Supabase Storage public object URLs include this path segment (Image Transformation query params apply). */
const PUBLIC_OBJECT_SEGMENT = '/storage/v1/object/public/';

export type CampaignImageDisplayVariant = 'thumbnail' | 'default' | 'detail';

const WIDTH_PX: Record<CampaignImageDisplayVariant, number> = {
  thumbnail: 400,
  default: 800,
  detail: 1200,
};

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
 * Appends CDN-style params for Supabase Image Transformation on public bucket URLs only.
 * External URLs (Braze, imgix, etc.) are returned unchanged.
 */
export function campaignImageDisplayUrl(
  url: string | null | undefined,
  variant: CampaignImageDisplayVariant = 'default',
): string | undefined {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return undefined;
  if (!isSupabaseStoragePublicObjectUrl(raw)) return raw;
  try {
    const abs = raw.startsWith('//') ? `https:${raw}` : raw;
    const u = new URL(abs);
    u.searchParams.set('width', String(WIDTH_PX[variant]));
    u.searchParams.set('quality', '80');
    u.searchParams.set('format', 'webp');
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Unique `detail` Image-Transform URLs for Supabase public campaign creatives (same as modal hero `img` src).
 */
export function collectCampaignBucketDetailImageUrls(
  previewUrls: ReadonlyArray<string | undefined | null>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of previewUrls) {
    const t = typeof raw === 'string' ? raw.trim() : '';
    if (!t || !isSupabaseStoragePublicObjectUrl(t)) continue;
    const u = campaignImageDisplayUrl(t, 'detail');
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

/**
 * Defer until the browser is idle, then batch-fetch images so HTTP cache is warm before scroll/modal.
 * Non-bucket URLs are skipped (external Braze/imgix URLs are unchanged by {@link campaignImageDisplayUrl} but not preloaded here).
 */
export function schedulePreloadCampaignBucketDetailImages(
  previewUrls: ReadonlyArray<string | undefined | null>,
  concurrency = 8,
): void {
  const urls = collectCampaignBucketDetailImageUrls(previewUrls);
  if (urls.length === 0) return;

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
