import { getModalOptimizedImageUrl } from '@/lib/campaignDisplay';

export type CachedCreativePayload = {
  preview_image_url?: string;
  email_html_preview?: string;
};

const STORAGE_PREFIX = 'braze_creative_v1';
const MAX_ENTRIES = 80;
const IDLE_WARM_BATCH = 12;

export function brazeCreativeSessionStorageKey(clientId: string, platformId: string): string {
  return `${STORAGE_PREFIX}:${clientId}:${platformId}`;
}

function trimOldestEntries(obj: Record<string, CachedCreativePayload>, max: number) {
  const keys = Object.keys(obj);
  if (keys.length <= max) return;
  for (let i = 0; i < keys.length - max; i++) {
    delete obj[keys[i]];
  }
}

/**
 * Load persisted edge-function creative payloads (HTML + preview image URL) for this workspace.
 */
export function loadBrazeCreativeSessionCache(
  clientId: string,
  platformId: string,
): Map<string, CachedCreativePayload> {
  const map = new Map<string, CachedCreativePayload>();
  try {
    const raw = sessionStorage.getItem(brazeCreativeSessionStorageKey(clientId, platformId));
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const v = value as Record<string, unknown>;
      const preview_image_url =
        typeof v.preview_image_url === 'string' ? v.preview_image_url : undefined;
      const email_html_preview =
        typeof v.email_html_preview === 'string' ? v.email_html_preview : undefined;
      map.set(id, { preview_image_url, email_html_preview });
    }
  } catch {
    /* ignore corrupt storage */
  }
  return map;
}

/**
 * Persist one campaign's creative; trims oldest entries if over cap.
 */
export function saveBrazeCreativeSessionEntry(
  clientId: string,
  platformId: string,
  campaignId: string,
  payload: CachedCreativePayload,
): void {
  try {
    const key = brazeCreativeSessionStorageKey(clientId, platformId);
    const existing = sessionStorage.getItem(key);
    const obj: Record<string, CachedCreativePayload> = existing ? JSON.parse(existing) : {};
    obj[campaignId] = { ...payload };
    trimOldestEntries(obj, MAX_ENTRIES);
    sessionStorage.setItem(key, JSON.stringify(obj));
  } catch {
    try {
      const key = brazeCreativeSessionStorageKey(clientId, platformId);
      const existing = sessionStorage.getItem(key);
      const obj: Record<string, CachedCreativePayload> = existing ? JSON.parse(existing) : {};
      obj[campaignId] = { preview_image_url: payload.preview_image_url };
      trimOldestEntries(obj, MAX_ENTRIES);
      sessionStorage.setItem(key, JSON.stringify(obj));
    } catch {
      /* quota or private mode */
    }
  }
}

/** Start loading preview image into the browser HTTP cache (modal-sized URL when possible). */
export function warmCreativePreviewImage(previewImageUrl: string | undefined | null): void {
  const u = typeof previewImageUrl === 'string' ? previewImageUrl.trim() : '';
  if (!u) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = getModalOptimizedImageUrl(u);
}

export function warmCachedCreativePayload(payload: CachedCreativePayload): void {
  warmCreativePreviewImage(payload.preview_image_url);
}

/**
 * After hydrating the in-memory map, warm a limited batch of preview URLs so reopening modals hits disk cache.
 */
/** Memory map + sessionStorage + image warm-up (call with client/platform from when the request started). */
export function commitCreativeToCaches(
  memoryMap: Map<string, CachedCreativePayload>,
  clientId: string,
  platformId: string,
  campaignId: string,
  payload: CachedCreativePayload,
): void {
  memoryMap.set(campaignId, payload);
  saveBrazeCreativeSessionEntry(clientId, platformId, campaignId, payload);
  warmCachedCreativePayload(payload);
}

export function warmSessionCacheImagesIdle(map: Map<string, CachedCreativePayload>): void {
  const urls: string[] = [];
  for (const p of map.values()) {
    const u = p.preview_image_url?.trim();
    if (u) urls.push(getModalOptimizedImageUrl(u));
  }
  const slice = urls.slice(0, IDLE_WARM_BATCH);
  if (slice.length === 0) return;

  const start = () => {
    slice.forEach((url, i) => {
      window.setTimeout(() => {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
      }, i * 45);
    });
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => start(), { timeout: 2500 });
  } else {
    setTimeout(start, 0);
  }
}
