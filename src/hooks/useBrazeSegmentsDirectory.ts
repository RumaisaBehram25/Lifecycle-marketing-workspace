import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Segment row for UI — `id` is Braze segment id (matches `data_visibility.item_id`). */
export type BrazeSegmentDirectoryRow = { id: string; name: string };

/**
 * Segments synced from Braze `segments/list` into `braze_segments_sync`.
 * (Legacy `schema_cache.segments` is not populated by sync — use this instead.)
 */
export function useBrazeSegmentsDirectory(clientId: string | undefined) {
  return useQuery({
    queryKey: ['braze_segments_sync', clientId] as const,
    queryFn: async (): Promise<BrazeSegmentDirectoryRow[]> => {
      if (!clientId) return [];
      const pageSize = 1000;
      const out: BrazeSegmentDirectoryRow[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('braze_segments_sync')
          .select('braze_segment_id, name')
          .eq('client_id', clientId)
          .order('name', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data ?? [];
        for (const row of rows) {
          out.push({
            id: String((row as { braze_segment_id: string }).braze_segment_id),
            name: String((row as { name: string }).name ?? 'Segment'),
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
