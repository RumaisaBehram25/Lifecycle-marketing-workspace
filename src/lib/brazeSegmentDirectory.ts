import { supabase } from '@/integrations/supabase/client';

export type BrazeSegmentDirectorySource = 'sync' | 'csv' | null;

export type BrazeSegmentDirectoryCount = {
  count: number;
  source: BrazeSegmentDirectorySource;
};

/** Distinct segment IDs from uploaded segment analytics CSV (no segments/list sync). */
export async function countDistinctSegmentsFromAnalytics(clientId: string): Promise<number> {
  const { data: rows, error } = await supabase
    .from('braze_segment_analytics')
    .select('segment_id')
    .eq('client_id', clientId)
    .limit(15000);
  if (error) throw error;
  const ids = new Set<string>();
  for (const r of rows ?? []) {
    const id = String((r as { segment_id?: string | null }).segment_id ?? '').trim();
    if (id) ids.add(id);
  }
  return ids.size;
}

/**
 * Prefer `braze_segments_sync` (segments/list API). If empty, count distinct `segment_id` in
 * `braze_segment_analytics` so members who upload segment CSV see a non-zero directory count.
 */
export async function resolveBrazeSegmentDirectoryCount(clientId: string): Promise<BrazeSegmentDirectoryCount> {
  const { count, error } = await supabase
    .from('braze_segments_sync')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  if (error) throw error;
  const syncN = count ?? 0;
  if (syncN > 0) return { count: syncN, source: 'sync' };

  const csvN = await countDistinctSegmentsFromAnalytics(clientId);
  if (csvN > 0) return { count: csvN, source: 'csv' };
  return { count: 0, source: null };
}
