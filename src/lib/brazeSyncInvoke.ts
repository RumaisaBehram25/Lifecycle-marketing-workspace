import { FunctionsHttpError } from '@supabase/supabase-js';

const EDGE_FETCH_HINT =
  ' Use the Supabase anon JWT in VITE_SUPABASE_PUBLISHABLE_KEY (Dashboard → Settings → API; starts with eyJ), not sb_publishable_… keys. Deploy sync-braze to the same project and ensure *.supabase.co is reachable.';

export type BrazeSyncInvokeBody = {
  success?: boolean;
  partial?: boolean;
  stopped_reason?: string | null;
  warning?: string;
  data?: unknown;
} | null;

type EdgeErrorPayload = {
  error?: string;
  success?: boolean;
};

type BrazeSyncCounts = {
  canvases_found?: number;
  canvases_minimal_upserted?: number;
  canvases_detail_enriched?: number;
  canvases_enabled?: number;
  campaigns_found?: number;
  campaigns_processed?: number;
  campaigns_enabled?: number;
  campaign_analytics_rows_upserted?: number;
  kpi_series_points?: number;
  segments_synced?: number;
  segment_analytics_rows_upserted?: number;
  email_events_ingested?: number;
  scheduled_broadcasts?: number;
  /** gzip JSON mirrors under braze-sync/{clientId}/… when BRAZE_SYNC_PAYLOADS_TO_S3 is enabled */
  s3_braze_payload_uploads?: number;
};

function messageOf(error: unknown): string {
  if (error == null) return 'Unknown error';
  if (
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) || 'Unknown error';
  } catch {
    return 'Unknown error';
  }
}

async function parseEdgeErrorPayload(error: unknown): Promise<EdgeErrorPayload | null> {
  if (!(error instanceof FunctionsHttpError) || !error.context) return null;
  const ctx = error.context;
  try {
    const clone = ctx.clone();
    const json = (await clone.json()) as EdgeErrorPayload;
    if (json && typeof json === 'object') return json;
  } catch {
    // Fall through to text parse.
  }
  try {
    const clone = ctx.clone();
    const text = await clone.text();
    if (!text) return null;
    const parsed = JSON.parse(text) as EdgeErrorPayload;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return null;
  }
  return null;
}

/** User-facing message for failed `supabase.functions.invoke('sync-braze', …)`. */
export async function formatBrazeSyncInvokeError(error: unknown): Promise<string> {
  const msg = messageOf(error);
  if (msg.includes('Failed to send a request to the Edge Function')) {
    return `${msg}${EDGE_FETCH_HINT}`;
  }

  const payload = await parseEdgeErrorPayload(error);
  const edgeError = String(payload?.error ?? '').trim();
  const combined = `${msg} ${edgeError}`.trim();

  if (/Access denied to this client/i.test(combined)) {
    return 'This user is not mapped to the selected workspace client yet. Open the workspace once, then reconnect Braze and run sync again.';
  }
  if (/Platform connection not found|does not belong to this client/i.test(combined)) {
    return 'Braze connection mismatch for this workspace. Reconnect Braze from Platforms for this account, then sync again.';
  }
  if (/No API key configured/i.test(combined)) {
    return 'Braze API key is missing for this workspace connection. Reconnect Braze and paste a valid REST API key.';
  }
  if (/Braze API error 401|Braze API error 403/i.test(combined)) {
    return 'Braze rejected the API key (401/403). Use a REST API key with access to campaigns, canvases, KPI, segments, and email exports.';
  }
  if (/Braze API error 404/i.test(combined)) {
    return 'Braze endpoint or API path is not available (404). Verify the REST API URL (e.g. `rest.iad-xx.braze.com`) for this account.';
  }
  if (/Braze API error 429/i.test(combined)) {
    return 'Braze rate-limited this sync (429). Wait a minute and run sync again.';
  }

  if (error instanceof FunctionsHttpError && error.context) {
    const status = error.context.status;
    if (status === 504 || status === 546) {
      return 'The Braze sync hit the server time limit and the connection closed. Try again in a moment; redeploying the latest sync-braze function improves this.';
    }
  }
  if (msg.includes('non-2xx') || /edge function/i.test(msg)) {
    return edgeError
      ? `Braze sync failed: ${edgeError}`
      : 'The Braze sync failed or timed out on the server. Try again in a minute. If it keeps happening, redeploy the sync-braze edge function.';
  }
  return msg;
}

/** Optional second line when the edge function returns 200 with `partial: true`. */
export function brazeSyncPartialDescription(data: BrazeSyncInvokeBody): string | undefined {
  if (data?.warning) return data.warning;

  const inner = data?.data as {
    counts?: BrazeSyncCounts;
    api_parsed?: {
      kpi_points?: number;
      canvas_list?: number;
      campaign_list?: number;
      email_records?: number;
      segment_rows?: number;
      segment_sizes?: number;
      scheduled_broadcasts?: number;
    };
    db_errors?: string[];
  };

  const ap = inner?.api_parsed;
  const counts = inner?.counts;
  const parsedSummary = ap
    ? `Parsed: KPI ${ap.kpi_points ?? 0}, canvases ${ap.canvas_list ?? 0}, campaigns ${ap.campaign_list ?? 0}, email ${ap.email_records ?? 0}, segments ${ap.segment_rows ?? 0} (sizes ${ap.segment_sizes ?? 0}), scheduled ${ap.scheduled_broadcasts ?? 0}.`
    : undefined;
  if (ap && counts) {
    const parsedAny =
      (ap.kpi_points ?? 0) > 0 ||
      (ap.canvas_list ?? 0) > 0 ||
      (ap.campaign_list ?? 0) > 0 ||
      (ap.email_records ?? 0) > 0 ||
      (ap.segment_rows ?? 0) > 0 ||
      (ap.segment_sizes ?? 0) > 0 ||
      (ap.scheduled_broadcasts ?? 0) > 0;
    const storedAny =
      (counts.kpi_series_points ?? 0) > 0 ||
      (counts.canvases_minimal_upserted ?? 0) > 0 ||
      (counts.segments_synced ?? 0) > 0 ||
      (counts.segment_analytics_rows_upserted ?? 0) > 0 ||
      (counts.email_events_ingested ?? 0) > 0 ||
      (counts.scheduled_broadcasts ?? 0) > 0 ||
      (counts.campaigns_processed ?? 0) > 0 ||
      (counts.campaign_analytics_rows_upserted ?? 0) > 0 ||
      (counts.s3_braze_payload_uploads ?? 0) > 0;
    if (parsedAny && !storedAny) {
      if (inner.db_errors && inner.db_errors.length > 0) {
        return `${parsedSummary ?? ''} Data was read from Braze but database writes failed: ${inner.db_errors.slice(0, 2).join(' · ')}`.trim();
      }
      return `${parsedSummary ?? ''} Braze returned rows but nothing was stored. See Edge logs (sync-braze) for skipped rows or DB constraints.`.trim();
    }
  }

  const inferredNoData =
    !!counts &&
    (counts.canvases_found ?? 0) === 0 &&
    (counts.campaigns_found ?? 0) === 0 &&
    (counts.kpi_series_points ?? 0) === 0 &&
    (counts.segments_synced ?? 0) === 0 &&
    (counts.segment_analytics_rows_upserted ?? 0) === 0 &&
    (counts.email_events_ingested ?? 0) === 0 &&
    (counts.scheduled_broadcasts ?? 0) === 0;
  if (inferredNoData) {
    return `${parsedSummary ?? ''} Braze returned 0 rows from all sync endpoints. Check REST API URL cluster and API key permissions, then re-run sync.`.trim();
  }

  if (!data?.partial) return undefined;
  if (
    data.stopped_reason === 'time_budget' &&
    (counts?.segment_analytics_rows_upserted ?? 0) === 0 &&
    (ap?.segment_rows ?? 0) > 0 &&
    (ap?.segment_sizes ?? 0) === 0
  ) {
    return `${parsedSummary ?? ''} Segment directory synced without sizes on segments/list (normal for Braze). Enable Segment analytics tracking on your mix segments, add the REST permission "segments.data_series" to this key, then re-sync—the sync will fill sizes via /segments/data_series. Otherwise import segment analytics CSV; mix labels stay on older data until new rows write.`.trim();
  }
  if (data.stopped_reason === 'time_budget') {
    return 'Synced within the server time limit. Run sync again to refresh more data.';
  }
  if (data.stopped_reason === 'no_data') {
    return 'Braze returned 0 rows from all sync endpoints. Check REST API URL cluster and API key permissions, then re-run sync.';
  }
  return 'Some sync steps were skipped.';
}
