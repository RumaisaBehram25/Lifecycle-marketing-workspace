import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BrazeCustomEvent {
  id: string;
  client_id: string;
  braze_event_id: string;
  event_name: string;
  event_description?: string;
  event_type?: string;
  category?: string;
  platform?: string;
  properties?: string; // JSON string
  properties_count?: number;
  synced_at?: string;
}

export interface UseBrazeCustomEventsOptions {
  clientId?: string;
  enabled?: boolean;
}

/**
 * Fetch synced Braze custom events from braze_custom_events table.
 * Events are synced from Braze /events/list endpoint by sync-braze function.
 * Used for campaign/canvas custom event targeting and validation.
 */
export function useBrazeCustomEvents(options: UseBrazeCustomEventsOptions = {}) {
  const { clientId, enabled = true } = options;

  return useQuery({
    queryKey: ['braze-custom-events', clientId],
    queryFn: async () => {
      if (!clientId) return [] as BrazeCustomEvent[];

      const pageSize = 1000;
      const out: BrazeCustomEvent[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('braze_custom_events')
          .select('*')
          .eq('client_id', clientId)
          .order('event_name', { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        const chunk = (data ?? []) as BrazeCustomEvent[];
        out.push(...chunk);
        if (chunk.length < pageSize) break;
      }
      return out;
    },
    enabled: !!clientId && enabled,
    staleTime: 60_000,
  });
}

/**
 * Helper to parse event properties from JSON string.
 */
export function parseEventProperties(propertiesJson?: string | null): Array<Record<string, unknown>> {
  if (!propertiesJson) return [];
  try {
    const parsed = JSON.parse(propertiesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Get a single event by name.
 */
export async function fetchBrazeEventByName(clientId: string, eventName: string): Promise<BrazeCustomEvent | null> {
  const { data, error } = await supabase
    .from('braze_custom_events')
    .select('*')
    .eq('client_id', clientId)
    .eq('event_name', eventName)
    .maybeSingle();

  if (error) throw error;
  return data as BrazeCustomEvent | null;
}

/**
 * Check if custom events have been synced for a client.
 */
export async function hasBrazeCustomEventsSynced(clientId: string): Promise<boolean> {
  const { data, error, count } = await supabase
    .from('braze_custom_events')
    .select('id', { count: 'exact' })
    .eq('client_id', clientId)
    .limit(1);

  if (error) throw error;
  return (count ?? 0) > 0;
}
