import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import {
  authErrorResponse,
  validateAuth,
  validateClientAccessForEdge,
} from "../_shared/auth.ts";
import {
  mergePreviewImagePicks,
  pickBestImageUrlFromHtml,
  pickBestPreviewImageFromCandidateUrls,
} from "../_shared/campaignPreviewImage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const FALLBACK_BRAZE_REST_URL = "https://rest.iad-06.braze.com";
const MAX_HTML_SIZE = 300_000;
const MAX_MESSAGES_JSON = 250_000;

function normalizeRestEndpointUrl(raw: unknown): string {
  const s = String(raw ?? "").trim().replace(/\/+$/, "");
  return s.length > 0 ? s : String(Deno.env.get("BRAZE_REST_URL") || FALLBACK_BRAZE_REST_URL);
}

async function brazeFetch(endpoint: string, apiKey: string, restEndpoint: string): Promise<unknown> {
  const url = `${String(restEndpoint).replace(/\/+$/, "")}/${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Braze API error ${response.status}: ${errorText.slice(0, 240)}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** True when channel is clearly not email (still allow empty / unknown channel). */
function brazeMessageIsNonEmail(ch: string): boolean {
  if (!ch) return false;
  const c = ch.toLowerCase();
  if (c === "email" || c.includes("email")) return false;
  return (
    c.includes("push") ||
    c.includes("in_app") ||
    c.includes("in-app") ||
    c === "content_card" ||
    c === "webhook" ||
    c === "sms" ||
    c === "whatsapp"
  );
}

function brazeAlertToString(alert: unknown): string | undefined {
  if (typeof alert === "string" && alert.trim()) return alert.trim();
  if (alert && typeof alert === "object") {
    const o = alert as Record<string, unknown>;
    if (typeof o.body === "string" && o.body.trim()) return o.body.trim();
    if (typeof o.alert === "string" && o.alert.trim()) return o.alert.trim();
  }
  return undefined;
}

function truncateHtml(html: string | undefined): string | undefined {
  if (!html) return undefined;
  if (MAX_HTML_SIZE === 0 || html.length <= MAX_HTML_SIZE) return html;
  return html.slice(0, MAX_HTML_SIZE) + "<!-- truncated -->";
}

function truncateCampaignMessagesForStorage(
  messages: Record<string, unknown>,
  maxTotal: number,
): Record<string, unknown> {
  let total = 0;
  const BODY_KEYS = ["body", "html_body", "html_content", "html", "amp_body", "plain_text_body"];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(messages)) {
    if (total >= maxTotal) break;
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      out[k] = v;
      continue;
    }
    const m = { ...(v as Record<string, unknown>) };
    for (const key of BODY_KEYS) {
      const s = m[key];
      if (typeof s !== "string" || !s.length) continue;
      const remaining = maxTotal - total;
      if (remaining <= 0) {
        m[key] = "";
        continue;
      }
      if (s.length > remaining) {
        m[key] = s.slice(0, remaining) + "<!-- truncated -->";
        total = maxTotal;
      } else {
        total += s.length;
      }
    }
    out[k] = m;
  }
  return out;
}

/** Braze `/campaigns/details` may nest under `campaign` — merge for sync-parity. */
function normalizeBrazeCampaignDetailsPayload(json: Record<string, unknown>): Record<string, unknown> {
  const nested = json.campaign;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...json, ...(nested as Record<string, unknown>) };
  }
  return json;
}

function emailBodyLooksLikeHtml(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  return /<(?:[a-z][\w-]*|\/[a-z][\w-]*|!doctype)/i.test(t);
}

/** Braze may nest copy under `messages.{id}.email` (same fields as top-level). */
function collectEmailHtmlStringsFromMessageVariant(msg: Record<string, unknown>): string[] {
  const out: string[] = [];
  const pushFrom = (m: Record<string, unknown>) => {
    if (typeof m.html_body === "string" && m.html_body.trim()) out.push(m.html_body.trim());
    if (typeof m.html_content === "string" && m.html_content.trim()) out.push(m.html_content.trim());
    if (typeof m.html === "string" && m.html.trim()) out.push(m.html.trim());
    if (typeof m.body === "string" && m.body.trim()) {
      const b = m.body.trim();
      if (emailBodyLooksLikeHtml(b)) out.push(b);
    }
  };
  pushFrom(msg);
  const nested = msg.email;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    pushFrom(nested as Record<string, unknown>);
  }
  return out;
}

/**
 * Mirrors `sync-braze` campaign detail enrichment: image URL, email HTML, push copy, messages.
 */
function extractCreativeFromDetails(details: Record<string, unknown>): {
  preview_image_url?: string;
  email_html_preview?: string;
  subject?: string;
  preheader?: string;
  push_title?: string;
  push_body?: string;
  messages_truncated?: Record<string, unknown>;
} {
  let preview_image_url: string | undefined;
  const imageCandidates: string[] = [];
  let emailHtmlPreview: string | undefined;
  let subject: string | undefined;
  let preheader: string | undefined;
  let push_title: string | undefined;
  let push_body: string | undefined;
  let messages_truncated: Record<string, unknown> | undefined;

  if (details.messages && typeof details.messages === "object" && !Array.isArray(details.messages)) {
    const msgEntries = Object.values(details.messages) as Array<Record<string, unknown>>;

    for (const msg of msgEntries) {
      if (msg.subject && !subject) subject = String(msg.subject);
    }
    for (const msg of msgEntries) {
      if (msg.preheader && !preheader) preheader = String(msg.preheader);
    }

    for (const msg of msgEntries) {
      const ch = String(msg.channel ?? "").toLowerCase();
      const isPush =
        ch.includes("push") || ch === "android_push" || ch === "ios_push" || ch === "web_push";
      const isInApp = ch.includes("in_app") || ch.includes("in-app") || ch === "content_card";
      if (isPush || isInApp) {
        const titleCandidate =
          (typeof msg.title === "string" && msg.title) ||
          (typeof msg.header === "string" && msg.header) ||
          undefined;
        const bodyCandidate =
          brazeAlertToString(msg.alert) ||
          (typeof msg.body === "string" ? msg.body : undefined) ||
          (typeof msg.message === "string" ? msg.message : undefined);
        if (titleCandidate && !push_title) push_title = titleCandidate;
        if (bodyCandidate && !push_body) push_body = bodyCandidate;
      }
      const img =
        msg.big_image || msg.image_url || msg.thumbnail_url || msg.url;
      if (typeof img === "string" && (img.startsWith("http") || img.startsWith("//"))) {
        imageCandidates.push(img.startsWith("//") ? `https:${img}` : img);
      }
    }

    for (const msg of msgEntries) {
      const ch = String(msg.channel ?? "").toLowerCase();
      if (brazeMessageIsNonEmail(ch)) continue;
      const img = msg.image_url || msg.thumbnail_url || msg.big_image || msg.url;
      if (typeof img === "string" && (img.startsWith("http") || img.startsWith("//"))) {
        imageCandidates.push(img.startsWith("//") ? `https:${img}` : img);
      }
    }

    const emailHtmlCandidates: string[] = [];
    for (const msg of msgEntries) {
      const ch = String(msg.channel ?? "").toLowerCase();
      if (brazeMessageIsNonEmail(ch)) continue;
      for (const c of collectEmailHtmlStringsFromMessageVariant(msg)) {
        emailHtmlCandidates.push(c);
      }
    }
    const htmlLike = emailHtmlCandidates.filter((c) => emailBodyLooksLikeHtml(c));
    const bestHtml =
      htmlLike.length > 0 ? htmlLike.sort((a, b) => b.length - a.length)[0] : undefined;
    if (bestHtml) {
      emailHtmlPreview = truncateHtml(bestHtml);
    }

    for (const msg of msgEntries) {
      const ch = String(msg.channel ?? "").toLowerCase();
      if (ch !== "sms") continue;
      if (!push_body) {
        const b = (typeof msg.body === "string" && msg.body) || brazeAlertToString(msg.alert);
        if (typeof b === "string" && b.trim()) push_body = b.trim();
      }
      if (!push_title) {
        const t =
          (typeof msg.title === "string" && msg.title) ||
          (typeof msg.name === "string" && msg.name);
        if (typeof t === "string" && t.trim()) push_title = t.trim();
      }
    }
  }

  const jsonPick = pickBestPreviewImageFromCandidateUrls(imageCandidates);
  const htmlPick = emailHtmlPreview ? pickBestImageUrlFromHtml(emailHtmlPreview) : undefined;
  preview_image_url = mergePreviewImagePicks(jsonPick, htmlPick);

  if (
    details.messages &&
    typeof details.messages === "object" &&
    !Array.isArray(details.messages)
  ) {
    messages_truncated = truncateCampaignMessagesForStorage(
      details.messages as Record<string, unknown>,
      MAX_MESSAGES_JSON,
    );
  }

  return {
    ...(preview_image_url ? { preview_image_url } : {}),
    ...(emailHtmlPreview ? { email_html_preview: emailHtmlPreview } : {}),
    ...(subject ? { subject } : {}),
    ...(preheader ? { preheader } : {}),
    ...(push_title ? { push_title } : {}),
    ...(push_body ? { push_body } : {}),
    ...(messages_truncated ? { messages_truncated } : {}),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authResult = await validateAuth(req);
    if (!authResult.success) {
      return authErrorResponse(authResult.error!, authResult.status!, corsHeaders);
    }

    const body = (await req.json()) as {
      clientId?: string;
      platformId?: string;
      brazeCampaignId?: string;
      persist?: boolean;
    };

    const clientId = String(body.clientId ?? "").trim();
    const platformId = String(body.platformId ?? "").trim();
    const brazeCampaignId = String(body.brazeCampaignId ?? "").trim();
    const persist = body.persist === true;

    if (!clientId || !platformId || !brazeCampaignId) {
      return new Response(
        JSON.stringify({ error: "clientId, platformId, and brazeCampaignId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const accessResult = await validateClientAccessForEdge(
      supabase,
      authResult.userId!,
      clientId,
    );
    if (!accessResult.success) {
      return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
    }

    const { data: platform, error: platformError } = await supabase
      .from("client_platforms")
      .select("*")
      .eq("id", platformId)
      .single();

    if (platformError || !platform) {
      return new Response(JSON.stringify({ error: "Platform connection not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (String(platform.client_id) !== clientId) {
      return authErrorResponse(
        "Platform connection does not belong to this client",
        400,
        corsHeaders,
      );
    }

    if (platform.platform !== "braze") {
      return new Response(JSON.stringify({ error: "This endpoint only supports Braze" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = platform.api_key as string | null;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key configured for this platform" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const addCfg = ((platform.additional_config as Record<string, unknown> | null) ?? {}) as Record<
      string,
      unknown
    >;
    const brazeRestEndpoint = normalizeRestEndpointUrl(
      Deno.env.get("BRAZE_REST_URL") || addCfg.rest_endpoint || FALLBACK_BRAZE_REST_URL,
    );

    const rawJson = (await brazeFetch(
      `campaigns/details?campaign_id=${encodeURIComponent(brazeCampaignId)}`,
      apiKey,
      brazeRestEndpoint,
    )) as Record<string, unknown>;

    const details = normalizeBrazeCampaignDetailsPayload(rawJson);
    const extracted = extractCreativeFromDetails(details);

    let persisted = false;
    if (persist && (extracted.preview_image_url || extracted.email_html_preview || extracted.messages_truncated)) {
      const { data: existing, error: selErr } = await supabase
        .from("braze_campaigns")
        .select("raw_details, subject, preheader, creative_preview")
        .eq("client_id", clientId)
        .eq("braze_campaign_id", brazeCampaignId)
        .maybeSingle();

      if (!selErr && existing) {
        const prevRd =
          existing.raw_details && typeof existing.raw_details === "object"
            ? (existing.raw_details as Record<string, unknown>)
            : {};
        const nextRd: Record<string, unknown> = { ...prevRd };
        if (extracted.preview_image_url) nextRd.preview_image_url = extracted.preview_image_url;
        if (extracted.email_html_preview) nextRd.email_html_preview = extracted.email_html_preview;
        if (extracted.push_title) nextRd.push_title = extracted.push_title;
        if (extracted.push_body) nextRd.push_body = extracted.push_body;
        if (extracted.messages_truncated) nextRd.messages = extracted.messages_truncated;

        const patch: Record<string, unknown> = {
          raw_details: nextRd,
          synced_at: new Date().toISOString(),
        };
        if (extracted.subject && !existing.subject) patch.subject = extracted.subject;
        if (extracted.preheader && !existing.preheader) patch.preheader = extracted.preheader;
        if (!existing.creative_preview) {
          const cp =
            (extracted.subject && String(extracted.subject).trim()) ||
            (extracted.push_title && String(extracted.push_title).trim()) ||
            (extracted.preheader && String(extracted.preheader).trim()) ||
            undefined;
          if (cp) patch.creative_preview = cp.slice(0, 280);
        }

        const { error: upErr } = await supabase
          .from("braze_campaigns")
          .update(patch)
          .eq("client_id", clientId)
          .eq("braze_campaign_id", brazeCampaignId);

        persisted = !upErr;
        if (upErr) {
          console.warn("[braze-campaign-creative] persist failed:", upErr.message);
        }
      }
    }

    return new Response(
      JSON.stringify({
        preview_image_url: extracted.preview_image_url ?? null,
        email_html_preview: extracted.email_html_preview ?? null,
        subject: extracted.subject ?? null,
        preheader: extracted.preheader ?? null,
        persisted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[braze-campaign-creative]", msg);
    return new Response(JSON.stringify({ error: msg.slice(0, 500) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
