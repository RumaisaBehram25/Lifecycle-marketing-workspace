/** Pure helpers for User Growth — sourced from `braze_usage_analytics` rows only. */

export type UsageRow = {
  date?: string | null;
  dau?: number | null;
  mau?: number | null;
  new_users?: number | null;
};

export function dayKey(iso: string | null | undefined): string {
  return String(iso ?? '').slice(0, 10);
}

export function dayMs(d: string): number {
  const t = Date.parse(`${d}T12:00:00.000Z`);
  return Number.isNaN(t) ? 0 : t;
}

export function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

/** One row per calendar day (latest wins). Sorted ascending by date. */
export function normalizeUsageRows(rows: UsageRow[]): Array<Required<Pick<UsageRow, 'date'>> & { dau: number; mau: number; new_users: number }> {
  const map = new Map<string, { dau: number; mau: number; new_users: number }>();
  for (const r of rows) {
    const k = dayKey(r.date);
    if (!k) continue;
    map.set(k, {
      dau: num(r.dau),
      mau: num(r.mau),
      new_users: num(r.new_users),
    });
  }
  return [...map.entries()]
    .sort(([a], [b]) => dayMs(a) - dayMs(b))
    .map(([date, v]) => ({ date, ...v }));
}

export function sliceLastDays(
  sorted: ReturnType<typeof normalizeUsageRows>,
  anchorDate: string,
  n: number,
): ReturnType<typeof normalizeUsageRows> {
  const anchor = dayMs(anchorDate);
  const from = anchor - (n - 1) * 86400000;
  return sorted.filter((r) => dayMs(r.date) >= from && dayMs(r.date) <= anchor);
}

export function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Last `len` calendar days ending at anchor (inclusive), filled with 0 for missing. */
export function windowSeries(
  sorted: ReturnType<typeof normalizeUsageRows>,
  anchorDate: string,
  len: number,
  key: 'dau' | 'mau' | 'new_users',
): { date: string; value: number; dow: number }[] {
  const anchor = dayMs(anchorDate);
  const byDay = new Map(sorted.map((r) => [r.date, r]));
  const out: { date: string; value: number; dow: number }[] = [];
  for (let i = len - 1; i >= 0; i--) {
    const ms = anchor - i * 86400000;
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const date = `${y}-${m}-${day}`;
    const row = byDay.get(date);
    const value = row ? num(row[key]) : 0;
    out.push({ date, value, dow: d.getUTCDay() });
  }
  return out;
}

export function rollingMean(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    return avg(slice);
  });
}

export function pctChangeBadge(prev: number, curr: number): { text: string; positive: boolean | null } {
  if (prev <= 0 && curr <= 0) return { text: '—', positive: null };
  if (prev <= 0) return { text: '+100%', positive: true };
  const ch = ((curr - prev) / prev) * 100;
  const sign = ch >= 0 ? '+' : '';
  return { text: `${sign}${ch.toFixed(1)}%`, positive: ch > 0 ? true : ch < 0 ? false : null };
}

/** Avg MAU in last 7d vs avg in prior 7d (relative to anchor). */
export function sevenVsPriorSeven(
  sorted: ReturnType<typeof normalizeUsageRows>,
  anchorDate: string,
  key: 'dau' | 'mau',
): { recent: number; prior: number } {
  const anchor = dayMs(anchorDate);
  const recentVals: number[] = [];
  const priorVals: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(anchor - i * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const keyStr = `${y}-${m}-${day}`;
    const row = sorted.find((r) => r.date === keyStr);
    recentVals.push(row ? num(row[key]) : 0);
  }
  for (let i = 7; i < 14; i++) {
    const d = new Date(anchor - i * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const keyStr = `${y}-${m}-${day}`;
    const row = sorted.find((r) => r.date === keyStr);
    priorVals.push(row ? num(row[key]) : 0);
  }
  return { recent: avg(recentVals), prior: avg(priorVals) };
}

export function sumNewUsers30d(
  sorted: ReturnType<typeof normalizeUsageRows>,
  anchorDate: string,
): number {
  const slice = sliceLastDays(sorted, anchorDate, 30);
  return slice.reduce((s, r) => s + r.new_users, 0);
}

export function latestDayRow(sorted: ReturnType<typeof normalizeUsageRows>): ReturnType<typeof normalizeUsageRows>[0] | null {
  if (!sorted.length) return null;
  return sorted[sorted.length - 1];
}

export function trendTone(dauCh: number | null, mauCh: number | null): 'grow' | 'decline' | 'mixed' {
  if (dauCh == null || mauCh == null) return 'mixed';
  const dNeg = dauCh < 0;
  const dPos = dauCh > 0;
  const mNeg = mauCh < 0;
  const mPos = mauCh > 0;
  if (dNeg && mNeg) return 'decline';
  if (dPos && mPos) return 'grow';
  return 'mixed';
}

/** Percent change: (recentAvg - priorAvg) / priorAvg — using 7d window averages. */
export function trendPercent(sorted: ReturnType<typeof normalizeUsageRows>, anchorDate: string, key: 'dau' | 'mau'): number | null {
  const { recent, prior } = sevenVsPriorSeven(sorted, anchorDate, key);
  if (prior <= 0 && recent <= 0) return null;
  if (prior <= 0) return 100;
  return ((recent - prior) / prior) * 100;
}
