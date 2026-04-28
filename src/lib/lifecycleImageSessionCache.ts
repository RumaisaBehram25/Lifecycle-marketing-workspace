/**
 * Lifecycle journey touchpoint image URL cache.
 *
 * PURPOSE
 * -------
 * After `raw_steps` loads for a canvas, all touchpoint image URLs are extracted and persisted
 * here (localStorage, keyed by workspace clientId + canvas DB id).
 *
 * On subsequent visits (same session OR new tab):
 *   - `warmAllCachedLifecycleImages()` is called at Lifecycle component mount (before any DB call).
 *   - All previously-seen image URLs are fired as `new Image()` immediately, warming the browser
 *     HTTP cache BEFORE the user even sees the journey cards.
 *   - Result: opening a journey card is visually instant — images are already in HTTP cache.
 *
 * STORAGE
 * -------
 * Uses localStorage (survives tab close / browser restart) with a per-entry TTL of 24 hours.
 * Keys are scoped to clientId so multi-workspace setups don't cross-contaminate.
 * Storage is capped to 60 canvases per client; oldest entries are evicted first.
 */

import { preloadedUrls } from '@/lib/campaignImagePreloadRegistry';

const STORAGE_KEY_PREFIX = 'lifecycle:img-cache:v1';
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES_PER_CLIENT = 60;

interface CacheEntry {
  /** Resolved/display image URLs (already passed through campaignImageDisplayUrl). */
  urls: string[];
  /** Unix ms timestamp when this entry was written. */
  ts: number;
}

type CacheStore = Record<string, CacheEntry>;

function storageKey(clientId: string): string {
  return `${STORAGE_KEY_PREFIX}:${clientId}`;
}

function readStore(clientId: string): CacheStore {
  try {
    const raw = localStorage.getItem(storageKey(clientId));
    if (!raw) return {};
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

function writeStore(clientId: string, store: CacheStore): void {
  try {
    localStorage.setItem(storageKey(clientId), JSON.stringify(store));
  } catch {
    // Storage quota exceeded or private mode — silently ignore.
  }
}

/**
 * Persist resolved image URLs for a canvas.
 * Called after `preloadJourneyStepImages` extracts URLs from `raw_steps`.
 */
export function saveLifecycleCanvasImageUrls(
  clientId: string,
  canvasDbId: string,
  urls: string[],
): void {
  if (!clientId || !canvasDbId || urls.length === 0) return;

  const store = readStore(clientId);
  const now = Date.now();

  // Prune expired entries.
  for (const key of Object.keys(store)) {
    if (now - (store[key]?.ts ?? 0) > ENTRY_TTL_MS) {
      delete store[key];
    }
  }

  // Evict oldest entries when at cap.
  const keys = Object.keys(store);
  if (keys.length >= MAX_ENTRIES_PER_CLIENT) {
    const sorted = keys.sort((a, b) => (store[a]?.ts ?? 0) - (store[b]?.ts ?? 0));
    for (let i = 0; i < sorted.length - MAX_ENTRIES_PER_CLIENT + 1; i++) {
      delete store[sorted[i]];
    }
  }

  store[canvasDbId] = { urls, ts: now };
  writeStore(clientId, store);
}

/**
 * Collect all cached image URLs for this client (excluding expired entries).
 * Returns deduplicated list in insertion order (canvas entries are ordered by recency).
 */
export function getAllCachedLifecycleImageUrls(clientId: string): string[] {
  if (!clientId) return [];
  const store = readStore(clientId);
  const now = Date.now();
  const out: string[] = [];
  const seen = new Set<string>();

  // Sort entries newest-first so most-recently used canvases are warmed first.
  const entries = Object.entries(store)
    .filter(([, e]) => now - (e?.ts ?? 0) <= ENTRY_TTL_MS)
    .sort(([, a], [, b]) => (b?.ts ?? 0) - (a?.ts ?? 0));

  for (const [, entry] of entries) {
    for (const url of entry.urls) {
      if (url && !seen.has(url)) {
        seen.add(url);
        out.push(url);
      }
    }
  }

  return out;
}

/**
 * Fire `new Image()` for all cached lifecycle image URLs immediately.
 *
 * Call this at Lifecycle mount (useLayoutEffect) — it runs synchronously before paint
 * so the browser can start fetching images before the user sees the page.
 *
 * Uses `preloadedUrls` registry to deduplicate so warm images are never re-fetched.
 * Skips images already in the registry (previously warmed this session).
 *
 * @param clientId  The workspace client ID (used to scope the cache).
 * @param concurrency  Max concurrent Image() fetches per batch (default 16).
 */
export function warmAllCachedLifecycleImages(clientId: string, concurrency = 16): void {
  if (typeof window === 'undefined' || !clientId) return;

  const urls = getAllCachedLifecycleImageUrls(clientId).filter(
    (url) => !preloadedUrls.has(url),
  );
  if (urls.length === 0) return;

  // Mark all as in-flight immediately so parallel callers don't double-fetch.
  for (const url of urls) preloadedUrls.add(url);

  // Load in batches to avoid overwhelming the browser connection pool.
  void (async () => {
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      await Promise.all(
        batch.map(
          (url) =>
            new Promise<void>((resolve) => {
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

/**
 * Clear all cached lifecycle image URLs for a client (e.g. after a Braze sync that invalidates creatives).
 */
export function clearLifecycleImageCache(clientId: string): void {
  try {
    localStorage.removeItem(storageKey(clientId));
  } catch {
    /* ignore */
  }
}
