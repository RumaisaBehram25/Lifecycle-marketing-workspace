import type { CampaignChannelUi } from '@/lib/campaignDisplay';

/** Stats shape from `braze_campaigns` for the modal. */
export interface BrazeCampaignStatsSource {
  deliveries?: number | null;
  sends?: number | null;
  opens?: number | null;
  clicks?: number | null;
  open_rate?: number | string | null;
  click_rate?: number | string | null;
  unsubs?: number | null;
}

export function resolveReachDisplay(row: BrazeCampaignStatsSource): {
  value: number;
  label: 'Deliveries' | 'Sends';
} {
  const d = row.deliveries ?? 0;
  const s = row.sends ?? 0;
  if (d > 0) return { value: d, label: 'Deliveries' };
  if (s > 0) return { value: s, label: 'Sends' };
  return { value: 0, label: 'Deliveries' };
}

function formatRateForDisplay(v: number | string | null | undefined): string | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/%/g, ''));
  if (!Number.isFinite(n)) return null;
  const pct = n <= 1 && n >= 0 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

export type ModalStatRow = { id: string; label: string; value: string };

/**
 * Channel-aware stat tiles: email shows opens/open rate; push/sms/in-app omit them.
 * Hides numeric zeros unless every core metric is zero (then show all + processing note).
 */
export function buildCampaignModalStatRows(
  channel: CampaignChannelUi,
  row: BrazeCampaignStatsSource,
): { rows: ModalStatRow[]; showProcessingNote: boolean } {
  const reach = resolveReachDisplay(row);
  const opens = row.opens ?? 0;
  const clicks = row.clicks ?? 0;
  const unsubs = row.unsubs ?? 0;
  const openRate = formatRateForDisplay(row.open_rate);
  const clickRate = formatRateForDisplay(row.click_rate);

  const isEmail = channel === 'email';

  const tiles: ModalStatRow[] = [
    { id: 'reach', label: reach.label, value: reach.value.toLocaleString() },
  ];

  if (isEmail) {
    tiles.push({ id: 'opens', label: 'Opens', value: opens.toLocaleString() });
    if (openRate) tiles.push({ id: 'open_rate', label: 'Open rate', value: openRate });
  }

  tiles.push({ id: 'clicks', label: 'Clicks', value: clicks.toLocaleString() });
  if (clickRate) tiles.push({ id: 'click_rate', label: 'Click rate', value: clickRate });

  if (isEmail || unsubs > 0) {
    tiles.push({ id: 'unsubs', label: 'Unsubs', value: unsubs.toLocaleString() });
  }

  const numericTileIds = new Set(['reach', 'opens', 'clicks', 'unsubs']);
  const numericValues = tiles
    .filter(t => numericTileIds.has(t.id))
    .map(t => parseInt(t.value.replace(/,/g, ''), 10));
  const allNumericZero = numericValues.length > 0 && numericValues.every(n => n === 0);

  const rows = tiles.filter(t => {
    if (t.id === 'open_rate' || t.id === 'click_rate') return true;
    if (t.id === 'reach') return true;
    const n = parseInt(t.value.replace(/,/g, ''), 10);
    if (Number.isNaN(n)) return true;
    if (n !== 0) return true;
    return allNumericZero;
  });

  return { rows, showProcessingNote: allNumericZero };
}
