import { campaignImageDisplayUrl } from '@/lib/campaignCreativeImageUrl';
import { preloadedUrls } from '@/lib/campaignImagePreloadRegistry';

const PRELOAD_LINK_ATTR = 'data-campaign-image-preload';

/** Remove previous list-injected preload hints so refreshes / filter changes do not accumulate. */
function clearInjectedPreloadLinks(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`link[rel="preload"][${PRELOAD_LINK_ATTR}]`).forEach(el => el.remove());
}

/**
 * Injects `<link rel="preload" as="image">` for the first `limit` unique display URLs (order preserved).
 * Uses {@link campaignImageDisplayUrl} so `href` matches `<img src>` exactly.
 */
export function injectPreloadLinks(
  displayUrls: ReadonlyArray<string | undefined | null>,
  limit = 10,
): void {
  if (typeof document === 'undefined') return;
  clearInjectedPreloadLinks();
  const seen = new Set<string>();
  const top: string[] = [];
  for (const raw of displayUrls) {
    const u = typeof raw === 'string' ? raw.trim() : '';
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    top.push(u);
    if (top.length >= limit) break;
  }
  for (const href of top) {
    if (preloadedUrls.has(href)) continue;
    preloadedUrls.add(href);
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = href;
    link.setAttribute(PRELOAD_LINK_ATTR, '1');
    document.head.appendChild(link);
  }
}

export type CampaignRowForImagePreload = {
  preview_image_url?: string | null;
};

/**
 * Warms the HTTP cache for all campaign hero images: `<link rel=preload>` for the first rows, then
 * batched `new Image()` for every unique display URL. Deduplicates via {@link preloadedUrls}.
 */
export function preloadCampaignImages(
  campaigns: ReadonlyArray<CampaignRowForImagePreload>,
  options?: { linkPreloadLimit?: number; imageConcurrency?: number },
): void {
  if (typeof window === 'undefined') return;

  const linkLimit = options?.linkPreloadLimit ?? 10;
  const concurrency = options?.imageConcurrency ?? 8;

  const displayOrdered: string[] = [];
  const seen = new Set<string>();

  for (const c of campaigns) {
    const raw = c.preview_image_url?.trim();
    if (!raw) continue;
    const display = campaignImageDisplayUrl(raw, 'default');
    if (!display) continue;
    if (seen.has(display)) continue;
    seen.add(display);
    displayOrdered.push(display);
  }

  if (displayOrdered.length === 0) return;

  injectPreloadLinks(displayOrdered, linkLimit);

  void (async () => {
    for (let i = 0; i < displayOrdered.length; i += concurrency) {
      const batch = displayOrdered.slice(i, i + concurrency);
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
}
