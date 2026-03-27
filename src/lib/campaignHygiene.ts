/**
 * Campaign cleanup patterns + Braze campaign directory (API sync, then CSV fallback).
 */

import { supabase } from '@/integrations/supabase/client';

export const DASHBOARD_CAMPAIGN_HYGIENE_QK = 'dashboard-campaign-hygiene' as const;

export type CampaignHygieneDirectoryRow = {
  name: string;
  status: string;
  tags: unknown;
  updated_at: string | null;
  /** Braze / export id — included in cleanup pattern matching (names alone often omit “test” / “warm”). */
  campaign_id?: string;
  channel?: string | null;
};

export const CAMPAIGN_CLEANUP_REGEX =
  /\b(test|demo|sandbox|staging|cleanup)\b|(ip\s*\/?\s*warm|ip\s*warming|warming|warmup|warm[\s_-]?up)/i;

export function campaignCleanupSearchText(r: Record<string, unknown>): string {
  const name = String(r.name ?? '');
  const cid = String(r.campaign_id ?? r.braze_campaign_id ?? '');
  const t = r.tags;
  let tagStr = '';
  if (Array.isArray(t)) tagStr = t.map((x) => String(x)).join(' ');
  else if (t != null && t !== '') tagStr = String(t);
  const status = String(r.status ?? '');
  const channel = String(r.channel ?? '');
  return `${name} ${cid} ${tagStr} ${status} ${channel}`;
}

export function isCampaignCleanupFlagged(r: Record<string, unknown>): boolean {
  return CAMPAIGN_CLEANUP_REGEX.test(campaignCleanupSearchText(r));
}

export async function fetchCampaignHygieneDirectory(clientId: string): Promise<CampaignHygieneDirectoryRow[]> {
  const { data: apiRows, error } = await supabase
    .from('braze_campaigns')
    .select('name,status,tags,updated_at,braze_campaign_id,channel')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false, nullsFirst: false });

  if (error) throw error;

  if (apiRows && apiRows.length > 0) {
    return apiRows.map((r) => ({
      name: String((r as { name?: string | null }).name ?? 'Campaign'),
      status: String((r as { status?: string | null }).status ?? '—'),
      tags: (r as { tags?: unknown }).tags ?? [],
      updated_at: (r as { updated_at?: string | null }).updated_at ?? null,
      campaign_id: String((r as { braze_campaign_id?: string | null }).braze_campaign_id ?? ''),
      channel: (r as { channel?: string | null }).channel ?? null,
    }));
  }

  const { data: csvRows, error: csvErr } = await supabase
    .from('braze_campaign_analytics')
    .select('campaign_id, campaign_name, date, created_at, channel')
    .eq('client_id', clientId)
    .order('date', { ascending: false })
    .limit(8000);

  if (csvErr) throw csvErr;

  const byCampaignId = new Map<
    string,
    { name: string; lastDate: string; created_at: string | null; channel: string }
  >();

  for (const raw of csvRows ?? []) {
    const r = raw as {
      campaign_id?: string | null;
      campaign_name?: string | null;
      date?: string | null;
      created_at?: string | null;
      channel?: string | null;
    };
    const id = String(r.campaign_id ?? '').trim();
    if (!id) continue;
    if (byCampaignId.has(id)) continue;
    const cn = String(r.campaign_name ?? '').trim();
    const d = r.date ? String(r.date).slice(0, 10) : '';
    byCampaignId.set(id, {
      name: cn || id,
      lastDate: d,
      created_at: r.created_at ? String(r.created_at) : null,
      channel: String(r.channel ?? '').trim(),
    });
  }

  return [...byCampaignId.entries()]
    .sort(([, a], [, b]) => b.lastDate.localeCompare(a.lastDate))
    .map(([campaignId, v]) => ({
      name: v.name,
      status: 'From analytics CSV',
      tags: [],
      updated_at: v.lastDate ? `${v.lastDate}T12:00:00.000Z` : v.created_at,
      campaign_id: campaignId,
      channel: v.channel || null,
    }));
}
