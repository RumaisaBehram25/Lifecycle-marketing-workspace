import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type BrazeCustomEventTableRow = {
  event_name: string;
  /** From GET /events payload when available. */
  get_events_status: string | null;
  /** True when `events_get_json` is stored. */
  get_events_synced: boolean;
  /** Number of `braze_custom_event_series` rows (one row per `bucket_at` day). */
  data_series_buckets: number;
  /**
   * Min/max **measurement day** from `bucket_at` (UTC calendar date), not `synced_at`.
   */
  data_series_first_day_utc: string | null;
  data_series_last_day_utc: string | null;
};

function pickStatusFromGetJson(json: unknown): string | null {
  if (json == null || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const s = o.status ?? o.event_status;
  if (s == null) return null;
  const t = String(s).trim();
  return t || null;
}

/** Normalize `bucket_at` to `YYYY-MM-DD` in UTC for comparison (Braze daily buckets). */
function bucketAtToUtcDayKey(bucketAt: unknown): string | null {
  if (bucketAt == null) return null;
  const s = String(bucketAt).trim();
  const head = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * One card per custom event: GET /events signal + `braze_custom_event_series` bucket stats.
 */
export function useBrazeCustomEventsTableRows(clientId: string | undefined) {
  return useQuery({
    queryKey: ['braze-custom-events-table', clientId] as const,
    queryFn: async (): Promise<BrazeCustomEventTableRow[]> => {
      if (!clientId) return [];

      const pageSize = 500;
      const eventRows: Array<{
        event_name: string;
        events_get_json: unknown;
      }> = [];

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await (supabase as any)
          .from('braze_custom_events')
          .select('event_name, events_get_json')
          .eq('client_id', clientId)
          .order('event_name', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const chunk = (data ?? []) as typeof eventRows;
        eventRows.push(...chunk);
        if (chunk.length < pageSize) break;
      }

      /** Per-event: bucket row count + min/max **day** from `bucket_at` (not `synced_at`). */
      const seriesByEvent = new Map<
        string,
        { buckets: number; firstDay: string | null; lastDay: string | null }
      >();
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await (supabase as any)
          .from('braze_custom_event_series')
          .select('event_name, bucket_at')
          .eq('client_id', clientId)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const chunk = (data ?? []) as Array<{ event_name?: string | null; bucket_at?: string | null }>;
        for (const r of chunk) {
          const n = String(r.event_name ?? '').trim();
          if (!n) continue;
          const day = bucketAtToUtcDayKey(r.bucket_at);
          const prev = seriesByEvent.get(n) ?? {
            buckets: 0,
            firstDay: null as string | null,
            lastDay: null as string | null,
          };
          prev.buckets++;
          if (day) {
            if (!prev.firstDay || day < prev.firstDay) prev.firstDay = day;
            if (!prev.lastDay || day > prev.lastDay) prev.lastDay = day;
          }
          seriesByEvent.set(n, prev);
        }
        if (chunk.length < pageSize) break;
      }

      return eventRows.map((row) => {
        const name = String(row.event_name ?? '').trim() || '—';
        const gj = row.events_get_json;
        const hasGet = gj != null && typeof gj === 'object';
        const ser = seriesByEvent.get(name);
        return {
          event_name: name,
          get_events_status: pickStatusFromGetJson(gj),
          get_events_synced: hasGet,
          data_series_buckets: ser?.buckets ?? 0,
          data_series_first_day_utc: ser?.firstDay ?? null,
          data_series_last_day_utc: ser?.lastDay ?? null,
        };
      });
    },
    enabled: Boolean(clientId),
    staleTime: 60_000,
  });
}
