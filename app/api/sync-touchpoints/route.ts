import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** One chunk per request (50 canvases max); safe under default Vercel limits. */
export const maxDuration = 300;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-client-info, x-supabase-client-platform",
} as const;

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

type Body = {
  clientId?: string;
  platformId?: string;
  /** Omit to resume from `client_sync_progress` on the server. */
  canvas_offset?: number;
  lifecycle_only?: boolean;
  lifecycle_recent_days?: number;
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Proxies one incremental Braze touchpoints chunk to `sync-braze` (same contract as direct invoke).
 * Use with `dev:all` (Next on :3000) when the SPA should call the same origin as other sync routes.
 */
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
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

  const payload: Record<string, unknown> = {
    clientId,
    platformId,
    touchpoints_only: true,
  };
  if (body.lifecycle_only === true) payload.lifecycle_only = true;
  if (typeof body.lifecycle_recent_days === "number" && Number.isFinite(body.lifecycle_recent_days)) {
    payload.lifecycle_recent_days = Math.max(30, Math.min(1095, Math.floor(body.lifecycle_recent_days)));
  }
  if (typeof body.canvas_offset === "number" && Number.isFinite(body.canvas_offset)) {
    payload.canvas_offset = Math.max(0, Math.floor(body.canvas_offset));
  }

  const base = supabaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/functions/v1/sync-braze`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return Response.json(data, { status: res.status, headers: corsHeaders });
}
