/**
 * Normalized campaign image display URLs (`campaignImageDisplayUrl`) already requested via
 * `<link rel="preload">`, `new Image()`, or warm-up helpers — avoids duplicate fetches.
 */
export const preloadedUrls = new Set<string>();
