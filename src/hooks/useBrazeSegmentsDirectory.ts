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
      const { data, error } = await supabase
        .from('braze_segments_sync')
        .select('braze_segment_id, name')
        .eq('client_id', clientId)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: String((row as { braze_segment_id: string }).braze_segment_id),
        name: String((row as { name: string }).name ?? 'Segment'),
      }));
    },
    enabled: Boolean(clientId),
    staleTime: 60_000,
  });
}
