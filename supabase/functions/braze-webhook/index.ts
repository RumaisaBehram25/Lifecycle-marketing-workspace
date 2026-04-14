import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { logger } from "../_shared/logger.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-braze-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Verify optional shared secret. If `BRAZE_WEBHOOK_SECRET` is set, require:
 * `Authorization: Bearer <secret>` or header `x-braze-webhook-secret: <secret>`.
 */
function verifyWebhookSecret(req: Request): boolean {
  const secret = Deno.env.get("BRAZE_WEBHOOK_SECRET")?.trim();
  if (!secret) return true;

  const auth = req.headers.get("authorization")?.trim();
  const bearer = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const headerSecret = req.headers.get("x-braze-webhook-secret")?.trim();
  if (bearer === secret || headerSecret === secret) return true;
  return false;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function pickString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function pickUserId(payload: Record<string, unknown>): string | null {
  const user = asRecord(payload.user);
  const props = asRecord(payload.properties) ?? asRecord(payload.event_properties);
  return pickString(
    payload.user_id,
    payload.external_id,
    payload.external_user_id,
    user?.user_id,
    user?.external_id,
    props?.user_id,
    props?.external_id,
    props?.external_user_id,
  );
}

function pickEventName(payload: Record<string, unknown>): string | null {
  return pickString(
    payload.event_type,
    payload.event_name,
    payload.name,
    payload.type,
    payload.event,
    asRecord(payload.properties)?.event_name,
  );
}

/** Normalize Braze-style time (seconds, ms, or ISO string) to ISO string or null */
function pickOccurredAt(payload: Record<string, unknown>): string | null {
  const raw =
    payload.time ??
    payload.timestamp ??
    payload._event_timestamp ??
    payload.event_time ??
    asRecord(payload.properties)?.time;
  if (raw == null) return null;
  if (typeof raw === "string") {
    const d = Date.parse(raw);
    if (!Number.isNaN(d)) return new Date(d).toISOString();
    return null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    return new Date(ms).toISOString();
  }
  return null;
}

function pickClientId(payload: Record<string, unknown>): string | null {
  const props = asRecord(payload.properties);
  const raw = pickString(
    payload.client_id,
    props?.client_id,
    Deno.env.get("BRAZE_WEBHOOK_DEFAULT_CLIENT_ID") ?? undefined,
  );
  return raw ?? null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!verifyWebhookSecret(req)) {
    logger.warn("braze-webhook: unauthorized — secret mismatch or missing");
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    logger.error("braze-webhook: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return jsonResponse({ ok: false, error: "Server misconfiguration" }, 500);
  }

  let body: unknown;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      const text = await req.text();
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { _raw_text: text };
      }
    }
  } catch (e) {
    logger.error("braze-webhook: invalid body", e);
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const payload: Record<string, unknown> = Array.isArray(body)
    ? asRecord((body as unknown[])[0]) ?? {}
    : asRecord(body) ?? {};
  const userId = pickUserId(payload);
  const eventName = pickEventName(payload);
  const occurredAt = pickOccurredAt(payload);
  const clientId = pickClientId(payload);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const row: Record<string, unknown> = {
    payload: body as object,
    event_name: eventName,
    user_id: userId,
    occurred_at: occurredAt,
  };
  if (clientId) row.client_id = clientId;

  const { data, error } = await supabase.from("braze_events").insert(row).select("id").maybeSingle();

  if (error) {
    logger.error("braze-webhook: insert failed", error.message, { code: error.code });
    return jsonResponse(
      { ok: false, error: "Storage failed", detail: error.message },
      500,
    );
  }

  logger.info("braze-webhook: stored event", { id: data?.id, event_name: eventName });

  return jsonResponse({
    ok: true,
    id: data?.id ?? null,
    extracted: {
      user_id: userId,
      event_name: eventName,
      occurred_at: occurredAt,
    },
  });
});
