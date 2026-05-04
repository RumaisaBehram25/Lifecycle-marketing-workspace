import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Full row from `braze_segments_sync` for Dashboard cards + detail drawer (includes `raw` merge). */
export type BrazeSegmentDirectoryRichRow = {
  id: string;
  name: string;
  tags: string[];
  raw: Record<string, unknown> | null;
  syncedAt: string;
};

type SyncRow = {
  braze_segment_id?: string | null;
  name?: string | null;
  tags?: string[] | null;
  raw?: unknown;
  synced_at?: string | null;
};

/**
 * Same source as `useBrazeSegmentsDirectory`, plus `tags`, `raw` (list + `braze_export_segment_details`), `synced_at`.
 * Uses service-compatible typing (`braze_segments_sync` may be absent from generated types).
 */
export function useBrazeSegmentsDirectoryRich(clientId: string | undefined) {
  return useQuery({
    queryKey: ['braze_segments_sync', clientId, 'rich'] as const,
    queryFn: async (): Promise<BrazeSegmentDirectoryRichRow[]> => {
      if (!clientId) return [];
      const pageSize = 500;
      const out: BrazeSegmentDirectoryRichRow[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await (supabase as any)
          .from('braze_segments_sync')
          .select('braze_segment_id, name, tags, raw, synced_at')
          .eq('client_id', clientId)
          .order('name', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = (data ?? []) as SyncRow[];
        for (const row of rows) {
          const id = String(row.braze_segment_id ?? '').trim();
          if (!id) continue;
          const rawObj =
            row.raw && typeof row.raw === 'object' && !Array.isArray(row.raw)
              ? (row.raw as Record<string, unknown>)
              : null;
          out.push({
            id,
            name: String(row.name ?? 'Segment'),
            tags: Array.isArray(row.tags) ? row.tags.map((t) => String(t)) : [],
            raw: rawObj,
            syncedAt: String(row.synced_at ?? ''),
          });
        }
        if (rows.length < pageSize) break;
      }
      return out;
    },
    enabled: Boolean(clientId),
    staleTime: 60_000,
  });
}
