import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeTouchpointsChunk } from '@/lib/touchpointsSyncClient';

const CAMPAIGN_SYNC_MAX_ROUNDS = 30;
const TOUCHPOINTS_MAX_ROUNDS = 50;

/** Invalidate caches touched by the three-phase Dashboard Braze sync. */
export function invalidateAfterBrazeFullSync(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['braze_campaigns'] });
  queryClient.invalidateQueries({ queryKey: ['braze_canvases'] });
  queryClient.invalidateQueries({ queryKey: ['analytics'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard-braze'] });
  queryClient.invalidateQueries({ queryKey: ['doublegood-platforms'] });
  queryClient.invalidateQueries({ queryKey: ['braze_segments_sync'] });
  queryClient.invalidateQueries({ queryKey: ['data-visibility'] });
  queryClient.invalidateQueries({ queryKey: ['data-visibility-canvas'] });
  queryClient.invalidateQueries({ queryKey: ['data-visibility-segments'] });
}

export type BrazeFullSyncStatusFn = (message: string) => void;

export type RunDashboardBrazeFullSyncResult = {
  campaignRounds: number;
  touchpointChunks: number;
  /** True when the user stopped sync between edge-function calls (in-flight invoke may still finish). */
  cancelled?: boolean;
};

/**
 * Single entry point: campaigns-only rounds → touchpoint chunks → full sync-braze
 * (Campaigns + Lifecycle canvas data + Analytics KPI/segments/email, same as Dashboard “Sync All”).
 */
export async function runDashboardBrazeFullSync(options: {
  clientId: string;
  platformId: string;
  onStatus?: BrazeFullSyncStatusFn;
  /** When set, React Query caches are invalidated after each phase (matches prior Dashboard behavior). */
  queryClient?: QueryClient;
  /** Checked between edge invocations; current request cannot be aborted mid-flight. */
  shouldAbort?: () => boolean;
}): Promise<RunDashboardBrazeFullSyncResult> {
  const { clientId, platformId, onStatus = () => {}, queryClient, shouldAbort = () => false } = options;
  const bump = () => {
    if (queryClient) invalidateAfterBrazeFullSync(queryClient);
  };
  let campaignRound = 0;
  let totalCampaignsProcessed = 0;

  onStatus('Syncing campaigns…');
  while (campaignRound < CAMPAIGN_SYNC_MAX_ROUNDS) {
    if (shouldAbort()) {
      bump();
      onStatus('Sync stopped');
      return { campaignRounds: campaignRound, touchpointChunks: 0, cancelled: true };
    }
    campaignRound++;
    const { data, error } = await supabase.functions.invoke('sync-braze', {
      body: { clientId, platformId, campaigns_only: true },
    });
    if (error) throw error;
    const processed =
      (data?.data as { counts?: { campaigns_processed?: number } } | undefined)?.counts
        ?.campaigns_processed ?? 0;
    totalCampaignsProcessed += processed;
    onStatus(`Campaigns: ${totalCampaignsProcessed} synced (round ${campaignRound})`);
    if (processed === 0) break;
  }
  bump();

  if (shouldAbort()) {
    onStatus('Sync stopped');
    return { campaignRounds: campaignRound, touchpointChunks: 0, cancelled: true };
  }

  onStatus('Syncing canvas touchpoints…');
  let touchpointOffset: number | undefined = 0;
  let touchpointRound = 0;
  while (touchpointRound < TOUCHPOINTS_MAX_ROUNDS) {
    if (shouldAbort()) {
      bump();
      onStatus('Sync stopped');
      return { campaignRounds: campaignRound, touchpointChunks: touchpointRound, cancelled: true };
    }
    touchpointRound++;
    const { data: d, error } = await invokeTouchpointsChunk({
      clientId,
      platformId,
      canvasOffset: touchpointOffset,
      lifecycleOnly: true,
      lifecycleRecentDays: 365,
    });
    if (error) throw error;
    if (!d?.success) break;
    const done = d.done === true || (d.total != null && d.offset != null && d.offset >= d.total);
    onStatus(`Canvas touchpoints: ${d.offset ?? 0}/${d.total ?? '?'}`);
    if (done) break;
    if (d.offset === touchpointOffset) break;
    touchpointOffset = d.offset ?? undefined;
  }
  bump();

  if (shouldAbort()) {
    onStatus('Sync stopped');
    return { campaignRounds: campaignRound, touchpointChunks: touchpointRound, cancelled: true };
  }

  onStatus('Syncing KPI & metrics…');
  const { error: fullErr } = await supabase.functions.invoke('sync-braze', {
    body: { clientId, platformId, skip_canvas_sync: true },
  });
  if (fullErr) throw fullErr;
  bump();

  return { campaignRounds: campaignRound, touchpointChunks: touchpointRound };
}
