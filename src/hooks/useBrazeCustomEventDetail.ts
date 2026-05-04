import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type BrazeCustomEventSeriesDbRow = {
  bucket_at: string;
  event_count: number;
  unit: string;
  series_ending_at: string | null;
  synced_at: string | null;
};

export type BrazeCustomEventDetailData = {
  event_name: string;
  /** braze_custom_events.synced_at (directory row). */
  events_list_synced_at: string | null;
  get_events_status: string | null;
  data_series_buckets: number;
  series: BrazeCustomEventSeriesDbRow[];
  totals: {
    bucket_rows: number;
    sum_counts: number;
    first_bucket_at: string | null;
    last_bucket_at: string | null;
  };
};

function pickStatusFromGetJson(json: unknown): string | null {
  if (json == null || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const s = o.status ?? o.event_status;
  if (s == null) return null;
  const t = String(s).trim();
  return t || null;
}

/**
 * Full detail for one event: `braze_custom_events` row + all `braze_custom_event_series` rows
 * (same data as the SQL snippets for a single event_name + client_id).
 */
export function useBrazeCustomEventDetail(
  clientId: string | undefined,
  eventName: string | null,
  open: boolean,
) {
  return useQuery({
    queryKey: ['braze-custom-event-detail', clientId, eventName] as const,
    queryFn: async (): Promise<BrazeCustomEventDetailData | null> => {
      if (!clientId || !eventName) return null;

      const { data: dir, error: dirErr } = await (supabase as any)
        .from('braze_custom_events')
        .select('event_name, synced_at, events_get_json')
        .eq('client_id', clientId)
        .eq('event_name', eventName)
        .maybeSingle();

      if (dirErr) throw dirErr;

      const series: BrazeCustomEventSeriesDbRow[] = [];
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await (supabase as any)
          .from('braze_custom_event_series')
          .select('bucket_at, event_count, unit, series_ending_at, synced_at')
          .eq('client_id', clientId)
          .eq('event_name', eventName)
          .order('bucket_at', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const chunk = (data ?? []) as Array<Record<string, unknown>>;
        for (const r of chunk) {
          series.push({
            bucket_at: String(r.bucket_at ?? ''),
            event_count: Number(r.event_count ?? 0),
            unit: String(r.unit ?? 'day'),
            series_ending_at: r.series_ending_at != null ? String(r.series_ending_at) : null,
            synced_at: r.synced_at != null ? String(r.synced_at) : null,
          });
        }
        if (chunk.length < pageSize) break;
      }

      const gj = dir?.events_get_json;

      if (!dir && series.length === 0) {
        return null;
      }

      let sumCounts = 0;
      let first: string | null = null;
      let last: string | null = null;
      for (const r of series) {
        sumCounts += Number.isFinite(r.event_count) ? r.event_count : 0;
        const b = r.bucket_at;
        if (b) {
          if (!first || b < first) first = b;
          if (!last || b > last) last = b;
        }
      }

      const name = String(dir?.event_name ?? eventName);

      return {
        event_name: name,
        events_list_synced_at: dir?.synced_at != null ? String(dir.synced_at) : null,
        get_events_status: pickStatusFromGetJson(gj ?? null),
        data_series_buckets: series.length,
        series,
        totals: {
          bucket_rows: series.length,
          sum_counts: sumCounts,
          first_bucket_at: first,
          last_bucket_at: last,
        },
      };
    },
    enabled: Boolean(clientId && eventName && open),
    staleTime: 30_000,
  });
}
