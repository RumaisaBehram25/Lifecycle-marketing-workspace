/**
 * Core Braze Saved Segment names for Segment mix (and setup scripts).
 * Must match the segment titles in Braze exactly — analytics rows use these as `segment_name`.
 */
export const BRAZE_SEGMENT_MIX_CORE_NAMES = ['all email subscriber', 'active subscriber', 'churned'] as const;

export type BrazeSegmentMixCoreName = (typeof BRAZE_SEGMENT_MIX_CORE_NAMES)[number];

const CORE_ORDER = new Map<string, number>(
  BRAZE_SEGMENT_MIX_CORE_NAMES.map((n, i) => [n.toLowerCase(), i]),
);

/** Order for Segment mix UI: core trio first (when present), then largest-first. */
export function compareSegmentMixRows(
  a: { name: string; value: number },
  b: { name: string; value: number },
): number {
  const ai = CORE_ORDER.get(a.name.trim().toLowerCase()) ?? 1000;
  const bi = CORE_ORDER.get(b.name.trim().toLowerCase()) ?? 1000;
  if (ai !== bi) return ai - bi;
  return b.value - a.value;
}

/** Older CSV / copy used these titles; map to current Braze `segment_name` values for starring + charts. */
const LEGACY_TO_BRAZE_SEGMENT_MIX_NAME: Record<string, string> = {
  'All Email Subscribers': 'all email subscriber',
  'Active Subscribers (opened in 90d)': 'active subscriber',
  'Churned (no open in 180d)': 'churned',
  'All mailable users': 'all email subscriber',
};

/** Remap legacy starred names, dedupe, preserve first-seen order. */
export function migrateStarredSegmentMixNames(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const t = raw.trim();
    const mapped = LEGACY_TO_BRAZE_SEGMENT_MIX_NAME[t] ?? t;
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped);
  }
  return out;
}

/**
 * First-visit default stars: prefer the core trio in product order (using each name as it appears in analytics),
 * then largest other segments up to `maxCount`.
 */
export function buildDefaultStarredSegmentMixNames(
  segmentNames: string[],
  segmentSummaryRow: Record<string, unknown> | null,
  maxCount: number,
): string[] {
  if (!segmentSummaryRow || segmentNames.length === 0 || maxCount <= 0) return [];
  const byLower = new Map<string, string>();
  for (const n of segmentNames) {
    const k = n.trim().toLowerCase();
    if (!byLower.has(k)) byLower.set(k, n);
  }
  const out: string[] = [];
  const usedLower = new Set<string>();
  for (const core of BRAZE_SEGMENT_MIX_CORE_NAMES) {
    const actual = byLower.get(core.toLowerCase());
    if (!actual) continue;
    const v = Number(segmentSummaryRow[actual] ?? 0);
    if (!Number.isFinite(v) || v < 0) continue;
    out.push(actual);
    usedLower.add(actual.trim().toLowerCase());
    if (out.length >= maxCount) return out;
  }
  const rest = segmentNames
    .filter((n) => !usedLower.has(n.trim().toLowerCase()))
    .map((name) => ({ name, value: Number(segmentSummaryRow[name] ?? 0) }))
    .filter((r) => Number.isFinite(r.value) && r.value >= 0)
    .sort((a, b) => b.value - a.value);
  for (const r of rest) {
    if (out.length >= maxCount) break;
    out.push(r.name);
  }
  return out;
}
