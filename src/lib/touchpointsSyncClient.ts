import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const TOUCHPOINTS_INVOKE_TIMEOUT_MS = 180_000;
const TOUCHPOINTS_INVOKE_MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableInvokeError(error: unknown): boolean {
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return true;
  if (error instanceof FunctionsHttpError && error.context && typeof error.context.status === 'number') {
    const s = error.context.status;
    return s === 502 || s === 503 || s === 504 || s === 546;
  }
  return false;
}

async function invokeSyncBrazeTouchpoints(body: Record<string, unknown>): Promise<{
  data: TouchpointsSyncResponse | null;
  error: Error | null;
}> {
  let lastError: unknown;
  for (let attempt = 0; attempt < TOUCHPOINTS_INVOKE_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      await supabase.auth.refreshSession().catch(() => undefined);
    }
    const { data, error } = await supabase.functions.invoke('sync-braze', {
      body,
      timeout: TOUCHPOINTS_INVOKE_TIMEOUT_MS,
    });
    if (!error) {
      if (data == null || typeof data !== 'object') {
        return { data: null, error: new Error('sync-braze returned an empty response') };
      }
      return { data: data as TouchpointsSyncResponse, error: null };
    }
    lastError = error;
    if (!isRetryableInvokeError(error)) {
      return { data: null, error: error as Error };
    }
  }
  return { data: null, error: lastError as Error };
}

export type TouchpointsSyncResponse = {
  success?: boolean;
  done?: boolean;
  offset?: number;
  total?: number;
  processed?: number;
  counts?: { canvases_detail_enriched?: number; total?: number };
};

/**
 * One incremental touchpoints chunk (Edge Function). Uses Next.js `/api/sync-touchpoints`
 * when `VITE_NEXT_API_ORIGIN` is set (e.g. http://localhost:3000 with `npm run dev:all`),
 * otherwise `supabase.functions.invoke('sync-braze')`.
 */
export async function invokeTouchpointsChunk(options: {
  clientId: string;
  platformId: string;
  canvasOffset?: number;
  lifecycleOnly?: boolean;
  lifecycleRecentDays?: number;
}): Promise<{ data: TouchpointsSyncResponse | null; error: Error | null }> {
  const { clientId, platformId, canvasOffset, lifecycleOnly, lifecycleRecentDays } = options;
  const origin = (import.meta.env.VITE_NEXT_API_ORIGIN as string | undefined)?.trim();

  const body: Record<string, unknown> = {
    clientId,
    platformId,
    touchpoints_only: true,
  };
  if (typeof canvasOffset === 'number' && Number.isFinite(canvasOffset)) {
    body.canvas_offset = canvasOffset;
  }
  if (lifecycleOnly === true) body.lifecycle_only = true;
  if (typeof lifecycleRecentDays === 'number' && Number.isFinite(lifecycleRecentDays)) {
    body.lifecycle_recent_days = Math.max(30, Math.min(1095, Math.floor(lifecycleRecentDays)));
  }

  if (origin) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      return { data: null, error: new Error('Not signed in') };
    }
    const url = `${origin.replace(/\/$/, '')}/api/sync-touchpoints`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId,
          platformId,
          ...(lifecycleOnly === true ? { lifecycle_only: true } : {}),
          ...(typeof lifecycleRecentDays === 'number' && Number.isFinite(lifecycleRecentDays)
            ? { lifecycle_recent_days: Math.max(30, Math.min(1095, Math.floor(lifecycleRecentDays))) }
            : {}),
          ...(typeof canvasOffset === 'number' && Number.isFinite(canvasOffset)
            ? { canvas_offset: canvasOffset }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as TouchpointsSyncResponse & {
        error?: string;
      };
      if (!res.ok) {
        return {
          data: null,
          error: new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`),
        };
      }
      return { data, error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { data: null, error: new Error(`sync-touchpoints fetch failed: ${message}`) };
    }
  }

  return invokeSyncBrazeTouchpoints(body);
}

const FULL_BRAZE_SYNC_TIMEOUT_MS = 300_000;

/**
 * Full `sync-braze` run (not touchpoints_only): KPI, canvas list, Phase 3 detail, Phase 1c canvas/data_series
 * metrics (revenue_last_30d, conversions, opens, clicks, entries, sends), campaigns, etc.
 * Use this to backfill `braze_canvases` analytics columns for the Lifecycle Flow Performance chart.
 */
export async function invokeFullBrazeSync(options: {
  clientId: string;
  platformId: string;
}): Promise<{ data: Record<string, unknown> | null; error: Error | null }> {
  const { clientId, platformId } = options;
  const { data, error } = await supabase.functions.invoke('sync-braze', {
    body: { clientId, platformId },
    timeout: FULL_BRAZE_SYNC_TIMEOUT_MS,
  });
  if (error) {
    return { data: null, error: error as Error };
  }
  if (data == null || typeof data !== 'object') {
    return { data: null, error: new Error('sync-braze returned an empty response') };
  }
  return { data: data as Record<string, unknown>, error: null };
}
