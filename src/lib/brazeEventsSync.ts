import { supabase } from '@/integrations/supabase/client';

export interface BrazeEventSyncStatus {
  hasSynced: boolean;
  eventCount: number;
  lastSyncedAt?: string;
  message: string;
}

/**
 * Check if Braze custom events have been synced for a workspace.
 * If not synced, provides guidance on how to sync them.
 */
export async function checkBrazeEventsSyncStatus(clientId: string): Promise<BrazeEventSyncStatus> {
  try {
    const { data, error, count } = await supabase
      .from('braze_custom_events')
      .select('synced_at', { count: 'exact' })
      .eq('client_id', clientId)
      .order('synced_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    const eventCount = count ?? 0;
    const hasSynced = eventCount > 0;
    const lastSyncedAt = (data?.[0]?.synced_at as string | undefined) ?? undefined;

    if (!hasSynced) {
      return {
        hasSynced: false,
        eventCount: 0,
        message: 'Custom events have not been synced yet. Run "Sync All from Braze" on the Dashboard to fetch event metadata from Braze.',
      };
    }

    const syncDate = new Date(lastSyncedAt!);
    const daysSinceSync = Math.floor((Date.now() - syncDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceSync > 7) {
      return {
        hasSynced: true,
        eventCount,
        lastSyncedAt,
        message: `Custom events synced ${daysSinceSync} days ago (${syncDate.toLocaleDateString()}). Consider running a fresh sync to get the latest events.`,
      };
    }

    return {
      hasSynced: true,
      eventCount,
      lastSyncedAt,
      message: `${eventCount} custom event(s) synced as of ${syncDate.toLocaleDateString()}.`,
    };
  } catch (err) {
    console.error('[Events Sync Status] Error:', err);
    return {
      hasSynced: false,
      eventCount: 0,
      message: 'Error checking event sync status. Ensure Braze is connected and try again.',
    };
  }
}

/**
 * Get all available event names for a client, useful for dropdowns/autocomplete.
 */
export async function getBrazeEventNames(clientId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('braze_custom_events')
      .select('event_name')
      .eq('client_id', clientId)
      .order('event_name', { ascending: true });

    if (error) throw error;
    return (data ?? [])
      .map((row) => (row as { event_name: string }).event_name)
      .filter((name) => name && name.trim().length > 0)
      .filter((name, index, self) => self.indexOf(name) === index); // Deduplicate
  } catch (err) {
    console.error('[Get Event Names] Error:', err);
    return [];
  }
}

/**
 * Trigger a sync of Braze custom events via the sync-braze edge function.
 * Typically called after connecting Braze platform or as a manual refresh.
 */
export async function triggerBrazeEventSync(
  clientId: string,
  platformId: string,
): Promise<{ success: boolean; message: string; eventCount?: number }> {
  try {
    console.log('[Event Sync] Triggering custom events sync for client:', clientId);

    const { data, error } = await supabase.functions.invoke('sync-braze', {
      body: {
        clientId,
        platformId,
        // Note: Full sync will include events. For events-only, could add a flag.
        // For now, full sync is recommended to get all data in sync.
      },
    });

    if (error) {
      console.error('[Event Sync] Error:', error);
      return {
        success: false,
        message: `Sync failed: ${error.message || 'Unknown error'}`,
      };
    }

    // Check how many events were synced
    const eventCount = (data?.data?.counts?.events_synced as number | undefined) ?? 0;

    return {
      success: true,
      message: eventCount > 0
        ? `Successfully synced ${eventCount} custom event(s) from Braze`
        : 'Sync completed. No new custom events found.',
      eventCount,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Event Sync] Exception:', err);
    return {
      success: false,
      message: `Sync error: ${errorMsg}`,
    };
  }
}

/**
 * Validate that a custom event exists before using it in campaign logic.
 */
export async function validateCustomEventExists(
  clientId: string,
  eventName: string,
): Promise<{ exists: boolean; eventId?: string }> {
  try {
    const { data, error } = await supabase
      .from('braze_custom_events')
      .select('braze_event_id')
      .eq('client_id', clientId)
      .eq('event_name', eventName)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return {
        exists: true,
        eventId: (data as { braze_event_id: string }).braze_event_id,
      };
    }

    return { exists: false };
  } catch (err) {
    console.error('[Validate Event] Error:', err);
    return { exists: false };
  }
}
