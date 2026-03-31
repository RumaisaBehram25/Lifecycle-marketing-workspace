/**
 * Per-record Braze canvas sync: forwards to the existing `sync-braze` Edge Function
 * with `force_canvas_ids: [recordId]`. Do not change behavior here unless the
 * Edge contract changes — the streaming route only orchestrates calls.
 */
export type SyncOneRecordContext = {
  supabaseUrl: string;
  anonKey: string;
  authorization: string;
  clientId: string;
  platformId: string;
};

export async function syncOneRecord(
  recordId: string,
  ctx: SyncOneRecordContext,
): Promise<void> {
  const base = ctx.supabaseUrl.replace(/\/$/, "");
  const url = `${base}/functions/v1/sync-braze`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: ctx.authorization,
      apikey: ctx.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId: ctx.clientId,
      platformId: ctx.platformId,
      force_canvas_ids: [recordId],
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    success?: boolean;
  };

  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" && data.error.length > 0
        ? data.error
        : `sync-braze HTTP ${String(res.status)}`,
    );
  }
}
