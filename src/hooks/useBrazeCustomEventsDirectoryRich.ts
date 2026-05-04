import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Row for Dashboard custom-events browse (same role as `BrazeSegmentDirectoryRichRow`). */
export type BrazeCustomEventDirectoryRichRow = {
  id: string;
  braze_event_id: string;
  event_name: string;
  /** Short description for cards (full text in DB). */
  event_description: string;
  synced_at: string | null;
};

type SyncRow = {
  id?: string | null;
  braze_event_id?: string | null;
  event_name?: string | null;
  event_description?: string | null;
  synced_at?: string | null;
};

/**
 * Paginated custom events from `braze_custom_events` — same feeding pattern as
 * `useBrazeSegmentsDirectoryRich` (range pagination, ordered by name).
 */
export function useBrazeCustomEventsDirectoryRich(clientId: string | undefined) {
  return useQuery({
    queryKey: ['braze-custom-events', clientId, 'rich'] as const,
    queryFn: async (): Promise<BrazeCustomEventDirectoryRichRow[]> => {
      if (!clientId) return [];
      const pageSize = 500;
      const out: BrazeCustomEventDirectoryRichRow[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await (supabase as any)
          .from('braze_custom_events')
          .select('id, braze_event_id, event_name, event_description, synced_at')
          .eq('client_id', clientId)
          .order('event_name', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = (data ?? []) as SyncRow[];
        for (const row of rows) {
          const id = String(row.id ?? '').trim();
          if (!id) continue;
          out.push({
            id,
            braze_event_id: String(row.braze_event_id ?? '').trim(),
            event_name: String(row.event_name ?? '').trim() || 'Event',
            event_description: String(row.event_description ?? ''),
            synced_at: row.synced_at ?? null,
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
