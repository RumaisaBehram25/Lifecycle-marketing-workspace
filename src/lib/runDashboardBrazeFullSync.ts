import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const CAMPAIGN_SYNC_MAX_ROUNDS = 30;
const SEGMENT_DETAILS_RESUME_MAX_ROUNDS = 50;
const CANVAS_DETAILS_RESUME_MAX_ROUNDS = 50;
const CANVAS_DETAILS_RESUME_PAUSE_MS = 1500;

/** Invalidate caches touched by the three-phase Dashboard Braze sync. */
export function invalidateAfterBrazeFullSync(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['braze_campaigns'] });
  queryClient.invalidateQueries({ queryKey: ['braze_canvases'] });
  queryClient.invalidateQueries({ queryKey: ['analytics'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard-braze'] });
  queryClient.invalidateQueries({ queryKey: ['doublegood-platforms'] });
  queryClient.invalidateQueries({ queryKey: ['braze_segments_sync'] });
  queryClient.invalidateQueries({ queryKey: ['braze-segments-panel'] });
  queryClient.invalidateQueries({ queryKey: ['braze-custom-events'] });
  queryClient.invalidateQueries({ queryKey: ['braze-custom-events-panel'] });
  queryClient.invalidateQueries({ queryKey: ['braze-custom-events-table'] });
  queryClient.invalidateQueries({ queryKey: ['braze-custom-event-detail'] });
  queryClient.invalidateQueries({ queryKey: ['data-visibility'] });
  queryClient.invalidateQueries({ queryKey: ['data-visibility-canvas'] });
  queryClient.invalidateQueries({ queryKey: ['data-visibility-segments'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard-top-canvases'] });
}

export type BrazeFullSyncStatusFn = (message: string) => void;

export type RunDashboardBrazeFullSyncResult = {
  campaignRounds: number;
  touchpointChunks: number;
  /** Batches that ran to merge remaining `/segments/details` export rows (after per-invoke cap in main sync). */
  segmentDetailsResumeRounds: number;
  /** Total segment rows updated across resume batches. */
  segmentDetailsResumeTotalProcessed: number;
  /** `canvas_only` Edge invocations (chunked /canvas/details + step rows). */
  canvasDetailsResumeRounds: number;
  /** GET canvas/details success count across all canvas resume rounds. */
  canvasDetailsFetchedTotal: number;
  /** braze_canvas_steps rows upserted across all canvas resume rounds. */
  canvasStepsUpsertedTotal: number;
  /** True when the user stopped sync between edge-function calls (in-flight invoke may still finish). */
  cancelled?: boolean;
};

export type RunDashboardBrazeSegmentSyncResult = {
  /** Rows from `segments/list` (directory). */
  segmentsSynced: number;
  /** Size snapshot rows from `segments/data_series` when list has no size (needs `segments.data_series`). */
  segmentAnalyticsRowsUpserted: number;
  /** Rows merged with `segments/details` export during the main `segments_only` invoke (needs `segments.details`). */
  segmentDetailsRowsUpdated: number;
  /** How many `segments/data_series` calls were used for audience size fallback. */
  segmentDataSeriesCalls: number;
  /** Extra Edge batches that merged `/segments/details` for rows still missing export after the main pass. */
  segmentDetailsResumeRounds: number;
  /** Additional rows updated across those resume batches (same merge logic as main sync). */
  segmentDetailsResumeTotalProcessed: number;
};

/**
 * Single entry point: campaigns → segments (same as “Sync Segments”) → custom events (same as “Sync custom events”) →
 * KPI/metrics (skip canvas list + skip duplicate segment/event early phases) → canvas details batches (same as “Sync Canvases”).
 */
export async function runDashboardBrazeFullSync(options: {
  clientId: string;
  platformId: string;
  onStatus?: BrazeFullSyncStatusFn;
  /** When set, React Query caches are invalidated after each phase (matches prior Dashboard behavior). */
  queryClient?: QueryClient;
  /** Checked between edge invocations; current request cannot be aborted mid-flight. */
  shouldAbort?: () => boolean;
  /** Reserved for callers that run a lifecycle-only pipeline (unused in this implementation). */
  lifecycleOnly?: boolean;
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
      return {
        campaignRounds: campaignRound,
        touchpointChunks: 0,
        segmentDetailsResumeRounds: 0,
        segmentDetailsResumeTotalProcessed: 0,
        canvasDetailsResumeRounds: 0,
        canvasDetailsFetchedTotal: 0,
        canvasStepsUpsertedTotal: 0,
        cancelled: true,
      };
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
    return {
      campaignRounds: campaignRound,
      touchpointChunks: 0,
      segmentDetailsResumeRounds: 0,
      segmentDetailsResumeTotalProcessed: 0,
      canvasDetailsResumeRounds: 0,
      canvasDetailsFetchedTotal: 0,
      canvasStepsUpsertedTotal: 0,
      cancelled: true,
    };
  }

  onStatus('Syncing segments…');
  const segmentPass = await runDashboardBrazeSegmentSync({
    clientId,
    platformId,
    queryClient,
  });
  bump();

  if (shouldAbort()) {
    onStatus('Sync stopped');
    return {
      campaignRounds: campaignRound,
      touchpointChunks: 0,
      segmentDetailsResumeRounds: segmentPass.segmentDetailsResumeRounds,
      segmentDetailsResumeTotalProcessed: segmentPass.segmentDetailsResumeTotalProcessed,
      canvasDetailsResumeRounds: 0,
      canvasDetailsFetchedTotal: 0,
      canvasStepsUpsertedTotal: 0,
      cancelled: true,
    };
  }

  onStatus('Syncing custom events…');
  await runDashboardBrazeEventsSync({
    clientId,
    platformId,
    queryClient,
  });
  bump();

  if (shouldAbort()) {
    onStatus('Sync stopped');
    return {
      campaignRounds: campaignRound,
      touchpointChunks: 0,
      segmentDetailsResumeRounds: segmentPass.segmentDetailsResumeRounds,
      segmentDetailsResumeTotalProcessed: segmentPass.segmentDetailsResumeTotalProcessed,
      canvasDetailsResumeRounds: 0,
      canvasDetailsFetchedTotal: 0,
      canvasStepsUpsertedTotal: 0,
      cancelled: true,
    };
  }

  onStatus('Syncing KPI & metrics…');
  const { error: fullErr } = await supabase.functions.invoke('sync-braze', {
    body: {
      clientId,
      platformId,
      skip_canvas_sync: true,
      skip_early_segments_and_events: true,
      auto_star_segments: false,
    },
  });
  if (fullErr) throw fullErr;
  bump();

  const canvasResume =
    shouldAbort() ?
      { rounds: 0, detailsFetched: 0, stepsUpserted: 0 }
    : await runBrazeCanvasDetailsResumeBatches({
        clientId,
        platformId,
        shouldAbort,
        onStatus,
      });
  bump();

  return {
    campaignRounds: campaignRound,
    touchpointChunks: 0,
    segmentDetailsResumeRounds: segmentPass.segmentDetailsResumeRounds,
    segmentDetailsResumeTotalProcessed: segmentPass.segmentDetailsResumeTotalProcessed,
    canvasDetailsResumeRounds: canvasResume.rounds,
    canvasDetailsFetchedTotal: canvasResume.detailsFetched,
    canvasStepsUpsertedTotal: canvasResume.stepsUpserted,
  };
}

/**
 * After the main `sync-braze` run, fill in `raw.braze_export_segment_details` for any rows
 * the Edge function could not finish in one invocation (same export merge as the main segment phase).
 */
export async function runBrazeSegmentDetailsResumeBatches(options: {
  clientId: string;
  platformId: string;
  onStatus?: BrazeFullSyncStatusFn;
  shouldAbort?: () => boolean;
}): Promise<{ rounds: number; totalProcessed: number }> {
  const { clientId, platformId, onStatus = () => {}, shouldAbort = () => false } = options;
  let rounds = 0;
  let totalProcessed = 0;
  while (rounds < SEGMENT_DETAILS_RESUME_MAX_ROUNDS) {
    if (shouldAbort()) break;
    rounds += 1;
    const { data, error } = await supabase.functions.invoke('sync-braze', {
      body: { clientId, platformId, segment_details_resume: true },
    });
    if (error) throw error;
    const counts = (
      data?.data as
        | {
            counts?: {
              segment_details_resume_processed?: number;
              segment_details_resume_pending_approx?: number;
            };
          }
        | undefined
    )?.counts;
    const processed = counts?.segment_details_resume_processed ?? 0;
    const pendingApprox = counts?.segment_details_resume_pending_approx ?? 0;
    totalProcessed += processed;
    onStatus(
      `Segment details (resume): +${processed} merged (~${pendingApprox} remaining, batch ${rounds})`,
    );
    if (pendingApprox <= 0) break;
    if (processed <= 0) break;
  }
  return { rounds, totalProcessed };
}

/**
 * Chunked `canvas_only` sync: each invoke fetches at most BRAZE_SYNC_CANVAS_DETAILS_PER_RUN canvas
 * details; loop until pending is 0 or no progress.
 */
export async function runBrazeCanvasDetailsResumeBatches(options: {
  clientId: string;
  platformId: string;
  onStatus?: BrazeFullSyncStatusFn;
  shouldAbort?: () => boolean;
}): Promise<{ rounds: number; detailsFetched: number; stepsUpserted: number }> {
  const { clientId, platformId, onStatus = () => {}, shouldAbort = () => false } = options;
  let rounds = 0;
  let detailsFetched = 0;
  let stepsUpserted = 0;
  onStatus('Fetching canvas list…');
  while (rounds < CANVAS_DETAILS_RESUME_MAX_ROUNDS) {
    if (shouldAbort()) break;
    rounds += 1;
    const { data, error } = await supabase.functions.invoke('sync-braze', {
      body: { clientId, platformId, canvas_only: true },
    });
    if (error) throw error;
    const payload = data as {
      data?: {
        counts?: {
          canvas_list_synced?: number;
          canvas_details_fetched?: number;
          canvas_details_pending_approx?: number;
          canvas_steps_upserted?: number;
        };
      };
    };
    const counts = payload?.data?.counts;
    const df = counts?.canvas_details_fetched ?? 0;
    const st = counts?.canvas_steps_upserted ?? 0;
    const pending = counts?.canvas_details_pending_approx ?? 0;
    const list = counts?.canvas_list_synced ?? 0;
    detailsFetched += df;
    stepsUpserted += st;
    onStatus(
      `Canvas details (batch ${rounds}): ${df} fetched · ~${pending} pending · ${st} steps · list upsert ${list}`,
    );
    if (pending <= 0) break;
    if (df <= 0) break;
    await new Promise((r) => setTimeout(r, CANVAS_DETAILS_RESUME_PAUSE_MS));
  }
  onStatus('Canvas enrichment done ✓');
  return { rounds, detailsFetched, stepsUpserted };
}

/** Segments-only sync from Braze API + auto-star segments in `data_visibility` for Dashboard/Settings visibility. */
export async function runDashboardBrazeSegmentSync(options: {
  clientId: string;
  platformId: string;
  queryClient?: QueryClient;
}): Promise<RunDashboardBrazeSegmentSyncResult> {
  const { clientId, platformId, queryClient } = options;
  const { data, error } = await supabase.functions.invoke('sync-braze', {
    body: {
      clientId,
      platformId,
      segments_only: true,
      auto_star_segments: true,
    },
  });
  if (error) throw error;

  const resume = await runBrazeSegmentDetailsResumeBatches({ clientId, platformId });

  if (queryClient) invalidateAfterBrazeFullSync(queryClient);

  const counts = (data?.data as {
    counts?: {
      segments_synced?: number;
      segment_analytics_rows_upserted?: number;
      segment_details_rows_updated?: number;
      segment_data_series_calls?: number;
    };
  } | undefined)?.counts;
  return {
    segmentsSynced: counts?.segments_synced ?? 0,
    segmentAnalyticsRowsUpserted: counts?.segment_analytics_rows_upserted ?? 0,
    segmentDetailsRowsUpdated: counts?.segment_details_rows_updated ?? 0,
    segmentDataSeriesCalls: counts?.segment_data_series_calls ?? 0,
    segmentDetailsResumeRounds: resume.rounds,
    segmentDetailsResumeTotalProcessed: resume.totalProcessed,
  };
}

export type RunDashboardBrazeEventsSyncResult = {
  customEventsSynced: number;
  customEventsGetRowsUpdated: number;
  customEventSeriesPointsUpserted: number;
  customEventDataSeriesApiCalls: number;
};

/** Custom events only: `events/list`, GET `/events`, `/events/data_series` (Edge `events_only: true`). */
export async function runDashboardBrazeEventsSync(options: {
  clientId: string;
  platformId: string;
  queryClient?: QueryClient;
}): Promise<RunDashboardBrazeEventsSyncResult> {
  const { clientId, platformId, queryClient } = options;
  const { data, error } = await supabase.functions.invoke('sync-braze', {
    body: { clientId, platformId, events_only: true },
  });
  if (error) throw error;

  if (queryClient) {
    queryClient.invalidateQueries({ queryKey: ['braze-custom-events'] });
    queryClient.invalidateQueries({ queryKey: ['braze-custom-events-panel'] });
    queryClient.invalidateQueries({ queryKey: ['braze-custom-events-table'] });
    queryClient.invalidateQueries({ queryKey: ['braze-custom-event-detail'] });
  }

  const counts = (
    data?.data as
      | {
          counts?: {
            custom_events_synced?: number;
            custom_events_get_rows_updated?: number;
            custom_event_series_points_upserted?: number;
            custom_event_data_series_api_calls?: number;
          };
        }
      | undefined
  )?.counts;

  return {
    customEventsSynced: counts?.custom_events_synced ?? 0,
    customEventsGetRowsUpdated: counts?.custom_events_get_rows_updated ?? 0,
    customEventSeriesPointsUpserted: counts?.custom_event_series_points_upserted ?? 0,
    customEventDataSeriesApiCalls: counts?.custom_event_data_series_api_calls ?? 0,
  };
}
