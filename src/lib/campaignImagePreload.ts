import { getModalOptimizedImageUrl } from '@/lib/campaignDisplay';
import { campaignImageDisplayUrl } from '@/lib/campaignCreativeImageUrl';
import { preloadedUrls } from '@/lib/campaignImagePreloadRegistry';

export type CampaignRowForImagePreload = {
  preview_image_url?: string | null;
};

/**
 * Normalized display URLs that have fully decoded at least once — keeps grid thumbnails from
 * replaying skeletons when the user pages away and back (HTTP cache is fast; React state was not).
 */
export const campaignThumbnailDisplayUrlLoaded = new Set<string>();

export function markCampaignThumbnailDisplayUrlLoaded(url: string | null | undefined): void {
  const u = typeof url === 'string' ? url.trim() : '';
  if (u) campaignThumbnailDisplayUrlLoaded.add(u);
}

export function isCampaignThumbnailDisplayUrlLoaded(url: string | null | undefined): boolean {
  const u = typeof url === 'string' ? url.trim() : '';
  return u.length > 0 && campaignThumbnailDisplayUrlLoaded.has(u);
}

/** Fingerprint for sanitized email iframe `srcDoc` — marks iframe paint so paging skips skeleton. */
export function campaignEmailIframeSrcDocCacheKey(srcDoc: string): string {
  const s = srcDoc;
  const n = s.length;
  let h = 2166136261;
  const step = Math.max(1, Math.floor(n / 4000));
  for (let i = 0; i < n; i += step) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${n}:${h >>> 0}`;
}

export const campaignEmailIframeSrcDocLoadedKeys = new Set<string>();

export function markCampaignEmailIframeSrcDocLoaded(cacheKey: string): void {
  if (cacheKey) campaignEmailIframeSrcDocLoadedKeys.add(cacheKey);
}

export function isCampaignEmailIframeSrcDocLoaded(cacheKey: string): boolean {
  return Boolean(cacheKey) && campaignEmailIframeSrcDocLoadedKeys.has(cacheKey);
}

/**
 * Tracks URLs for which a `<link rel="preload">` element has been injected by
 * {@link preloadHoveredCampaignImage}. Intentionally separate from {@link preloadedUrls}
 * (the batch-warm registry) — `preloadedUrls` marks URLs the moment `new Image()` starts,
 * not when the download completes. Using it as the dedup gate here would block the high-
 * priority preload link for images still in-flight from the background batch warm.
 */
const hoverPreloadLinkUrls = new Set<string>();

/**
 * Immediately starts a high-priority fetch for a single campaign image.
 * Call this on card hover/pointerenter so the image is ready before the user clicks.
 *
 * Uses `<link rel="preload">` (highest browser priority). Safe to call many times —
 * deduplicates via its own registry so the link is injected at most once per URL.
 */
export function preloadHoveredCampaignImage(previewImageUrl: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const raw = previewImageUrl?.trim();
  if (!raw) return;
  const url = campaignImageDisplayUrl(raw, 'default');
  if (!url) return;
  // Only skip if we already injected a <link> for this URL — NOT based on preloadedUrls,
  // which is marked before downloads complete and would silently block this preload.
  if (hoverPreloadLinkUrls.has(url)) return;
  hoverPreloadLinkUrls.add(url);
  preloadedUrls.add(url);

  // <link rel="preload"> gives the browser the highest fetch priority signal.
  // Since this fires on hover (not at page-load time), the "preloaded but not used
  // within a few seconds" browser warning does not apply.
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
}

/**
 * Warms the HTTP cache for all campaign hero images using batched `new Image()` fetches.
 * Deduplicates via {@link preloadedUrls}.
 *
 * Note: `<link rel="preload">` is intentionally NOT used here. Campaign images are only
 * consumed when the user opens a detail modal (on click), not immediately on page load.
 * Using `rel="preload"` for click-triggered resources causes browser warnings ("preloaded
 * but not used within a few seconds"). `new Image()` warms the HTTP cache just as
 * effectively without producing those warnings.
 */
export function preloadCampaignImages(
  campaigns: ReadonlyArray<CampaignRowForImagePreload>,
  options?: { imageConcurrency?: number },
): void {
  if (typeof window === 'undefined') return;

  /** Default 4 — S3/render hosts stall when too many connections compete (browser ~6 per origin). */
  const concurrency = options?.imageConcurrency ?? 4;

  const displayOrdered: string[] = [];
  const seen = new Set<string>();

  for (const c of campaigns) {
    const raw = c.preview_image_url?.trim();
    if (!raw) continue;
    const display = campaignImageDisplayUrl(raw, 'default');
    if (!display) continue;
    if (isCampaignThumbnailDisplayUrlLoaded(display)) continue;
    if (seen.has(display)) continue;
    seen.add(display);
    displayOrdered.push(display);
  }

  if (displayOrdered.length === 0) return;

  void (async () => {
    for (let i = 0; i < displayOrdered.length; i += concurrency) {
      const batch = displayOrdered.slice(i, i + concurrency);
      await Promise.all(
        batch.map(
          url =>
            new Promise<void>(resolve => {
              if (isCampaignThumbnailDisplayUrlLoaded(url)) {
                resolve();
                return;
              }
              if (preloadedUrls.has(url)) {
                resolve();
                return;
              }
              preloadedUrls.add(url);
              const img = new Image();
              img.decoding = 'async';
              img.onload = () => {
                markCampaignThumbnailDisplayUrlLoaded(url);
                resolve();
              };
              img.onerror = () => resolve();
              img.src = url;
            }),
        ),
      );
    }
  })();
}

let listWarmIdleHandle = 0;
let listWarmToken = 0;

/** Stop idle thumbnail warming (e.g. route away from Campaigns) so pending `Image()` work drains. */
export function cancelWarmCampaignListThumbnailImages(): void {
  listWarmToken += 1;
  cancelListWarmIdle();
}

function cancelListWarmIdle(): void {
  if (!listWarmIdleHandle) return;
  if (typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(listWarmIdleHandle);
  } else {
    window.clearTimeout(listWarmIdleHandle);
  }
  listWarmIdleHandle = 0;
}

function scheduleIdle(fn: () => void, timeout: number): number {
  if (typeof requestIdleCallback === 'function') {
    return requestIdleCallback(fn, { timeout }) as unknown as number;
  }
  return window.setTimeout(fn, 1) as unknown as number;
}

export type WarmCampaignListThumbnailOptions = {
  concurrency?: number;
  /** Pause between completed batches so we do not stack hundreds of pending requests. */
  batchPauseMs?: number;
  /** Hard cap on distinct URLs per warm pass (large workspaces). */
  maxUrls?: number;
};

/**
 * Low-priority background warm for a **bounded** slice of campaigns (e.g. next page).
 * Each batch **waits for onload** before starting the next — avoids browser connection-queue
 * “pending” storms from the same-origin image render API.
 */
export function warmCampaignListThumbnailImagesIdle(
  campaigns: ReadonlyArray<CampaignRowForImagePreload>,
  options?: WarmCampaignListThumbnailOptions,
): void {
  if (typeof window === 'undefined') return;
  const concurrency = Math.max(1, Math.min(6, options?.concurrency ?? 3));
  const batchPauseMs = Math.max(40, options?.batchPauseMs ?? 120);
  const maxUrls = Math.max(1, options?.maxUrls ?? 36);

  const displayOrdered: string[] = [];
  const seen = new Set<string>();
  for (const c of campaigns) {
    if (displayOrdered.length >= maxUrls) break;
    const raw = c.preview_image_url?.trim();
    if (!raw) continue;
    const display = campaignImageDisplayUrl(raw, 'default');
    if (!display) continue;
    if (seen.has(display)) continue;
    seen.add(display);
    displayOrdered.push(display);
  }

  const token = ++listWarmToken;
  cancelListWarmIdle();

  if (displayOrdered.length === 0) return;

  const loadOne = (url: string) =>
    new Promise<void>(resolve => {
      if (token !== listWarmToken) {
        resolve();
        return;
      }
      if (isCampaignThumbnailDisplayUrlLoaded(url)) {
        resolve();
        return;
      }
      if (preloadedUrls.has(url)) {
        resolve();
        return;
      }
      preloadedUrls.add(url);
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        markCampaignThumbnailDisplayUrlLoaded(url);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });

  const runAll = async () => {
    for (let startIdx = 0; startIdx < displayOrdered.length; startIdx += concurrency) {
      if (token !== listWarmToken) return;
      const batch = displayOrdered.slice(startIdx, startIdx + concurrency);
      await Promise.all(batch.map(loadOne));
      if (startIdx + concurrency < displayOrdered.length) {
        await new Promise<void>(r => window.setTimeout(r, batchPauseMs));
        if (token !== listWarmToken) return;
      }
    }
  };

  listWarmIdleHandle = scheduleIdle(() => {
    void runAll();
  }, 800);
}

const MODAL_PRELOAD_LINK_ATTR = 'data-campaign-modal-preload';

/** Remove `<link rel="preload">` tags injected for the campaign detail modal only. */
export function clearModalCreativePreloadLinks(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`link[rel="preload"][${MODAL_PRELOAD_LINK_ATTR}]`).forEach(el => el.remove());
}

/**
 * When a canvas/modal path needs many creative URLs: `<link rel="preload">` for the first
 * URL + `new Image()` for each distinct normalized URL (same transforms as modal `<img>`
 * via {@link getModalOptimizedImageUrl}).
 */
export function prefetchCampaignModalCreativeUrls(
  rawUrls: ReadonlyArray<string | null | undefined>,
): void {
  if (typeof window === 'undefined') return;
  clearModalCreativePreloadLinks();

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawUrls) {
    const r = typeof raw === 'string' ? raw.trim() : '';
    if (!r) continue;
    const d = getModalOptimizedImageUrl(r);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    normalized.push(d);
  }
  if (normalized.length === 0) return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = normalized[0];
  link.setAttribute(MODAL_PRELOAD_LINK_ATTR, '1');
  document.head.appendChild(link);

  for (const href of normalized) {
    const img = new Image();
    img.decoding = 'sync';
    img.src = href;
  }
}

/**
 * Warms the HTTP cache for lifecycle journey cards using the **same** URL normalization as
 * `<img src={campaignImageDisplayUrl(...)} />` (unlike {@link prefetchCampaignModalCreativeUrls},
 * which uses {@link getModalOptimizedImageUrl} for modal heroes).
 *
 * Loads in small batches so the first cards in path order are not starved when many touchpoints
 * share one S3 host (browser connection limits).
 */
export function prefetchLifecycleJourneyImageUrls(
  rawUrls: ReadonlyArray<string | null | undefined>,
  options?: { linkPreloadCount?: number; concurrency?: number },
): void {
  if (typeof window === 'undefined') return;

  /** Lifecycle lists can surface many S3/Storage heroes — warm the first chunk with `<link rel="preload">` so opens feel instant. */
  const linkPreloadCount = options?.linkPreloadCount ?? 18;
  const concurrency = options?.concurrency ?? 12;

  const display: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawUrls) {
    const r = typeof raw === 'string' ? raw.trim() : '';
    if (!r) continue;
    const d = campaignImageDisplayUrl(r, 'thumbnail') ?? r;
    if (seen.has(d)) continue;
    seen.add(d);
    display.push(d);
  }
  if (display.length === 0) return;

  clearModalCreativePreloadLinks();

  for (let i = 0; i < Math.min(linkPreloadCount, display.length); i++) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = display[i];
    link.setAttribute(MODAL_PRELOAD_LINK_ATTR, '1');
    document.head.appendChild(link);
  }

  void (async () => {
    for (let i = 0; i < display.length; i += concurrency) {
      const batch = display.slice(i, i + concurrency);
      await Promise.all(
        batch.map(
          (url, j) =>
            new Promise<void>(resolve => {
              if (preloadedUrls.has(url)) {
                resolve();
                return;
              }
              preloadedUrls.add(url);
              const img = new Image();
              img.decoding = 'async';
              const idx = i + j;
              if ('fetchPriority' in img && idx < linkPreloadCount) {
                (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'high';
              } else if ('fetchPriority' in img) {
                (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
              }
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = url;
            }),
        ),
      );
    }
  })();
}
