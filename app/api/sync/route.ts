import { NextRequest } from "next/server";
import { syncOneRecord } from "./syncOneRecord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel Pro (and Node streaming) — raise in route + vercel.json if you need Pro 900s. */
export const maxDuration = 300;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-client-info, apikey, x-supabase-client-platform",
} as const;

function encodeSseEvent(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  );
}

function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ""
  );
}

type SyncRequestBody = {
  clientId?: string;
  platformId?: string;
  ids?: string[];
  /** When true, only `previousFailedIds` are processed (idempotent retry). */
  retryFailedOnly?: boolean;
  previousFailedIds?: string[];
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!supabaseUrl || !anonKey) {
    return Response.json(
      {
        error:
          "Server missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and anon publishable key.",
      },
      { status: 500, headers: corsHeaders },
    );
  }

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) {
    return Response.json(
      { error: "Missing Authorization header" },
      { status: 401, headers: corsHeaders },
    );
  }

  let body: SyncRequestBody;
  try {
    body = (await request.json()) as SyncRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }

  const clientId = String(body.clientId ?? "").trim();
  const platformId = String(body.platformId ?? "").trim();
  if (!clientId || !platformId) {
    return Response.json(
      { error: "clientId and platformId are required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const retryFailedOnly = Boolean(body.retryFailedOnly);
  const previousFailed = Array.isArray(body.previousFailedIds)
    ? body.previousFailedIds.map((x) => String(x).trim()).filter(Boolean)
    : [];

  const idsFromBody = Array.isArray(body.ids)
    ? body.ids.map((x) => String(x).trim()).filter(Boolean)
    : [];

  const queue: string[] = retryFailedOnly
    ? previousFailed.length > 0
      ? previousFailed
      : idsFromBody
    : idsFromBody;

  if (queue.length === 0) {
    return Response.json(
      {
        error: retryFailedOnly
          ? "retryFailedOnly requires previousFailedIds or ids listing rows to retry"
          : "ids must be a non-empty array of canvas record ids",
      },
      { status: 400, headers: corsHeaders },
    );
  }

  const total = queue.length;
  const ctx = {
    supabaseUrl,
    anonKey,
    authorization,
    clientId,
    platformId,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const failed: string[] = [];
      let processed = 0;

      const enqueue = (payload: unknown) => {
        controller.enqueue(encodeSseEvent(payload));
      };

      try {
        for (const id of queue) {
          try {
            await syncOneRecord(id, ctx);
            processed += 1;
            enqueue({
              id,
              status: "ok" as const,
              processed,
              total,
            });
          } catch (err) {
            failed.push(id);
            processed += 1;
            enqueue({
              id,
              status: "error" as const,
              processed,
              total,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        enqueue({
          done: true as const,
          processed,
          failed,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { ...SSE_HEADERS, ...corsHeaders },
  });
}
