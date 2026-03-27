import { FunctionsHttpError } from '@supabase/supabase-js';

const EDGE_FETCH_HINT =
  ' Use the Supabase anon JWT in VITE_SUPABASE_PUBLISHABLE_KEY (Dashboard → Settings → API; starts with eyJ), not sb_publishable_… keys. Deploy sync-braze to the same project and ensure *.supabase.co is reachable.';

export type BrazeSyncInvokeBody = {
  success?: boolean;
  partial?: boolean;
  stopped_reason?: string | null;
  data?: unknown;
} | null;

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

/** User-facing message for failed `supabase.functions.invoke('sync-braze', …)`. */
export function formatBrazeSyncInvokeError(error: unknown): string {
  const msg = messageOf(error);
  if (msg.includes('Failed to send a request to the Edge Function')) {
    return `${msg}${EDGE_FETCH_HINT}`;
  }
  if (error instanceof FunctionsHttpError && error.context) {
    const status = error.context.status;
    if (status === 504 || status === 546) {
      return 'The Braze sync hit the server time limit and the connection closed. Try again in a moment; redeploying the latest sync-braze function improves this.';
    }
  }
  if (msg.includes('non-2xx') || /edge function/i.test(msg)) {
    return 'The Braze sync failed or timed out on the server. Try again in a minute. If it keeps happening, redeploy the sync-braze edge function.';
  }
  return msg;
}

/** Optional second line when the edge function returns 200 with `partial: true`. */
export function brazeSyncPartialDescription(data: BrazeSyncInvokeBody): string | undefined {
  if (!data?.partial) return undefined;
  if (data.stopped_reason === 'time_budget') {
    return 'Synced within the server time limit. Run sync again to refresh more data.';
  }
  return 'Some sync steps were skipped.';
}
