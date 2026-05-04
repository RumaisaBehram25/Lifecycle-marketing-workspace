import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type BrazeSegmentPanelEnrichment = {
  listCount: number;
  withDetailsCount: number;
  analyticsSnapshotRows: number;
  segmentsWithSize: number;
  lastListSyncedAt: string | null;
  latestAnalyticsDate: string | null;
  /** Latest known audience size per Braze segment id (from `braze_segment_analytics`). */
  sizeBySegmentId: Map<string, number>;
};

function buildLatestSizeMap(
  rows: Array<{ segment_id?: string | null; size?: number | null; date?: string | null }>,
): { sizeBySegmentId: Map<string, number>; latestAnalyticsDate: string | null } {
  const bySeg = new Map<string, { date: string; size: number }>();
  let latestAnalyticsDate: string | null = null;
  for (const r of rows) {
    const sid = String(r.segment_id ?? '').trim();
    if (!sid) continue;
    const d = String(r.date ?? '');
    if (d && (!latestAnalyticsDate || d > latestAnalyticsDate)) latestAnalyticsDate = d;
    const sz = r.size;
    if (sz == null || Number.isNaN(Number(sz))) continue;
    const prev = bySeg.get(sid);
    if (!prev || d > prev.date) {
      bySeg.set(sid, { date: d, size: Number(sz) });
    }
  }
  const sizeBySegmentId = new Map<string, number>();
  for (const [sid, v] of bySeg) {
    sizeBySegmentId.set(sid, v.size);
  }
  return { sizeBySegmentId, latestAnalyticsDate };
}

/**
 * Summary counts + per-segment sizes for the Dashboard Segments card (`braze_segments_sync` +
 * `braze_segment_analytics`).
 */
export function useBrazeSegmentPanelEnrichment(clientId: string | undefined) {
  return useQuery({
    queryKey: ['braze-segments-panel', clientId] as const,
    queryFn: async (): Promise<BrazeSegmentPanelEnrichment> => {
      if (!clientId) {
        return {
          listCount: 0,
          withDetailsCount: 0,
          analyticsSnapshotRows: 0,
          segmentsWithSize: 0,
          lastListSyncedAt: null,
          latestAnalyticsDate: null,
          sizeBySegmentId: new Map(),
        };
      }

      const [listCountRes, detailsCountRes, analyticsRes, lastSyncRes] = await Promise.all([
        supabase
          .from('braze_segments_sync')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId),
        supabase
          .from('braze_segments_sync')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .not('raw->braze_export_segment_details', 'is', null),
        (async () => {
          const pageSize = 1000;
          const all: Array<{ segment_id?: string | null; size?: number | null; date?: string | null }> =
            [];
          for (let from = 0; ; from += pageSize) {
            const { data, error } = await supabase
              .from('braze_segment_analytics')
              .select('segment_id, size, date')
              .eq('client_id', clientId)
              .range(from, from + pageSize - 1);
            if (error) return { data: null, error };
            const chunk = data ?? [];
            all.push(...(chunk as typeof all));
            if (chunk.length < pageSize) break;
          }
          return { data: all, error: null };
        })(),
        supabase
          .from('braze_segments_sync')
          .select('synced_at')
          .eq('client_id', clientId)
          .order('synced_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (listCountRes.error) throw listCountRes.error;
      if (detailsCountRes.error) throw detailsCountRes.error;
      if (analyticsRes.error) throw analyticsRes.error;
      if (lastSyncRes.error) throw lastSyncRes.error;

      const rows = (analyticsRes.data ?? []) as Array<{
        segment_id?: string | null;
        size?: number | null;
        date?: string | null;
      }>;
      const { sizeBySegmentId, latestAnalyticsDate } = buildLatestSizeMap(rows);

      const lastRow = lastSyncRes.data as { synced_at?: string } | null;

      return {
        listCount: listCountRes.count ?? 0,
        withDetailsCount: detailsCountRes.count ?? 0,
        analyticsSnapshotRows: rows.length,
        segmentsWithSize: sizeBySegmentId.size,
        lastListSyncedAt: lastRow?.synced_at ?? null,
        latestAnalyticsDate,
        sizeBySegmentId,
      };
    },
    enabled: Boolean(clientId),
    staleTime: 60_000,
  });
}
