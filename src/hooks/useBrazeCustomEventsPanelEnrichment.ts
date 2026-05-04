import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type BrazeCustomEventsPanelEnrichment = {
  listCount: number;
  withEventsGetCount: number;
  dataSeriesPointRows: number;
  lastListSyncedAt: string | null;
  lastSeriesSyncedAt: string | null;
};

/**
 * Summary counts for Dashboard Custom Events (`events.list`, GET `/events`, `/events/data_series`).
 */
export function useBrazeCustomEventsPanelEnrichment(clientId: string | undefined) {
  return useQuery({
    queryKey: ['braze-custom-events-panel', clientId] as const,
    queryFn: async (): Promise<BrazeCustomEventsPanelEnrichment> => {
      if (!clientId) {
        return {
          listCount: 0,
          withEventsGetCount: 0,
          dataSeriesPointRows: 0,
          lastListSyncedAt: null,
          lastSeriesSyncedAt: null,
        };
      }

      const [listRes, getRes, seriesRes, lastListRes, lastSeriesRes] = await Promise.all([
        (supabase as any)
          .from('braze_custom_events')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId),
        (supabase as any)
          .from('braze_custom_events')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .not('events_get_json', 'is', null),
        (supabase as any)
          .from('braze_custom_event_series')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId),
        (supabase as any)
          .from('braze_custom_events')
          .select('synced_at')
          .eq('client_id', clientId)
          .order('synced_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from('braze_custom_event_series')
          .select('synced_at')
          .eq('client_id', clientId)
          .order('synced_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (listRes.error) throw listRes.error;
      if (getRes.error) throw getRes.error;
      if (seriesRes.error) throw seriesRes.error;
      if (lastListRes.error) throw lastListRes.error;
      if (lastSeriesRes.error) throw lastSeriesRes.error;

      return {
        listCount: listRes.count ?? 0,
        withEventsGetCount: getRes.count ?? 0,
        dataSeriesPointRows: seriesRes.count ?? 0,
        lastListSyncedAt: (lastListRes.data?.synced_at as string | undefined) ?? null,
        lastSeriesSyncedAt: (lastSeriesRes.data?.synced_at as string | undefined) ?? null,
      };
    },
    enabled: !!clientId,
    staleTime: 60 * 1000,
  });
}
