const THRESHOLD = 0.01;

/** Compare two metric maps (same keys). Logs a dev warning when relative diff > 1%. */
export function warnIfMetricsDiverge(
  a: Record<string, number>,
  b: Record<string, number>,
  context: string
): void {
  if (import.meta.env.PROD) return;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    if (x === 0 && y === 0) continue;
    const max = Math.max(Math.abs(x), Math.abs(y), 1);
    if (Math.abs(x - y) / max > THRESHOLD) {
      console.warn(
        `[workspace-metrics] >${(THRESHOLD * 100).toFixed(0)}% divergence on "${k}" (${context})`,
        { a: x, b: y }
      );
    }
  }
}
