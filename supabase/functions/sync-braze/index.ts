import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { validateAuth, validateClientAccessForEdge, authErrorResponse } from "../_shared/auth.ts";
import {
  mergePreviewImagePicks,
  pickBestImageUrlFromHtml,
  pickBestPreviewImageFromCandidateUrls,
} from "../_shared/campaignPreviewImage.ts";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

// Parallel Braze API calls per batch
const BATCH_SIZE = 10;
const FALLBACK_BRAZE_REST_URL = "https://rest.iad-06.braze.com";

function clampIntEnv(key: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(key);
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * Touchpoints-only: canvases per invoke. Default 12 — each canvas may call Braze templates/email/info many times;
 * chunks of 50 routinely exceed the Edge ~150s wall → HTTP 546 + Shutdown. Override BRAZE_SYNC_TOUCHPOINTS_CHUNK_SIZE (3–50).
 */
const TOUCHPOINTS_CHUNK_SIZE = clampIntEnv("BRAZE_SYNC_TOUCHPOINTS_CHUNK_SIZE", 12, 3, 50);

/** Stored HTML in canvas/campaign payloads (raw_steps, templates). Default 300 000 chars (~300 KB). Set BRAZE_SYNC_MAX_HTML_CHARS=0 to store full HTML with no limit. */
const MAX_HTML_SIZE = clampIntEnv("BRAZE_SYNC_MAX_HTML_CHARS", 300000, 100, 10000000);
/** Per-canvas email template/info fetches during touchpoints_only (subjects + HTML). Override via BRAZE_SYNC_MAX_TOUCHPOINT_TEMPLATES. */
const MAX_TOUCHPOINT_EMAIL_TEMPLATES = clampIntEnv(
  "BRAZE_SYNC_MAX_TOUCHPOINT_TEMPLATES",
  45,
  5,
  120,
);

/** Full detail fetch for up to N non-archived canvases (after forced IDs). Default 5000. Override via BRAZE_SYNC_MAX_CANVAS_DETAIL; raise BRAZE_SYNC_MAX_WALL_MS if needed. */
const MAX_CANVASES_TO_PROCESS = clampIntEnv("BRAZE_SYNC_MAX_CANVAS_DETAIL", 5000, 1, 20000);
/** When true, skip Phase 3 detail fetch for draft canvases (legacy behavior). Default: drafts compete for the same detail cap as live canvases so `raw_steps` / touchpoints can populate. */
const EXCLUDE_DRAFT_FROM_CANVAS_DETAIL =
  Deno.env.get("BRAZE_SYNC_EXCLUDE_DRAFT_CANVAS_DETAIL") === "true";
const MAX_CAMPAIGNS_TO_PROCESS = clampIntEnv("BRAZE_SYNC_MAX_CAMPAIGNS", 5000, 1, 10000);
/** Rolled-up daily row from campaigns/data_series (one row per campaign per day; merges with CSV by conflict key). */
const BRAZE_SYNC_CAMPAIGN_ANALYTICS_VARIATION = "__braze_sync_aggregate__";
const MAX_SEGMENT_PAGES = clampIntEnv("BRAZE_SYNC_MAX_SEGMENT_PAGES", 40, 1, 200);
const MAX_EMAIL_EVENT_PAGES = clampIntEnv("BRAZE_SYNC_MAX_EMAIL_PAGES", 35, 1, 120);
/** Per-client retention deletes at start of each sync (0 = disabled). Frees rows in braze_email_events / braze_sync_runs / braze_kpi_series. */
const PRUNE_EMAIL_EVENTS_DAYS = clampIntEnv("BRAZE_SYNC_PRUNE_EMAIL_EVENTS_DAYS", 90, 0, 1095);
const PRUNE_SYNC_RUN_DAYS = clampIntEnv("BRAZE_SYNC_PRUNE_SYNC_RUN_DAYS", 45, 0, 1095);
/** Delete braze_kpi_series where series_date is older than N days (0 = do not prune KPI). */
const PRUNE_KPI_SERIES_DAYS = clampIntEnv("BRAZE_SYNC_PRUNE_KPI_SERIES_DAYS", 0, 0, 2000);

/** Supabase Edge gateway ~150s hard limit; prune + DB tail must fit inside the same request. Cap well below 150s so we return 200 with partial before 504. Override via BRAZE_SYNC_MAX_WALL_MS (ms). */
function maxSyncWallMs(): number {
  const raw = Deno.env.get("BRAZE_SYNC_MAX_WALL_MS");
  const n = raw ? Number(raw) : 120000;
  if (!Number.isFinite(n)) return 120000;
  return Math.min(130000, Math.max(60000, Math.floor(n)));
}

/** Braze kpi (dau, mau, new_users) data_series length = calendar days before ending_at (Braze max 100). */
const KPI_LENGTH_DAU = 30;
const KPI_LENGTH_NEW_USERS = 30;
/** MAU series is typically compared over ~90d in Braze; CRM charts slice last 90d from DB. */
const KPI_LENGTH_MAU = 90;

// Priority scoring for lifecycle canvas detection
function getCanvasPriority(name: string): number {
  const nameLower = name.toLowerCase();
  const nameUpper = name.toUpperCase();
  
  // Priority 1: Lifecycle patterns (score 100+)
  if (nameLower.includes('lifecycle')) return 150;
  if (/^\d{8}\s*\|\s*marketing\s*\|\s*lifecycle/i.test(name)) return 140;
  if (nameLower.includes('welcome') && (nameLower.includes('free') || nameLower.includes('paid') || nameLower.includes('activation') || nameLower.includes('trial'))) return 130;
  if (nameLower.includes('retention')) return 120;
  if (nameLower.includes('abandoned') || nameLower.includes('abandon')) return 115;
  if (nameLower.includes('reactivation')) return 110;
  if (nameLower.includes('pre-churn') || nameLower.includes('prechurn')) return 105;
  if (nameLower.includes('post cancellation') || nameLower.includes('post-cancellation')) return 100;
  
  // Priority 2: Recent dates (2025/2026) or enabled (score 50-90)
  if (/^2026\d{4}/i.test(name) || /^2026\d{2}\d{2}/i.test(name)) return 90;
  if (/^2025\d{4}/i.test(name) || /^2025\d{2}\d{2}/i.test(name)) return 85;
  if (/^20250\d{3}/i.test(name) || /^20260\d{3}/i.test(name)) return 80;
  if (nameLower.includes('marketing') && nameLower.includes('campaign')) return 60;
  if (nameLower.includes('transactional')) return 55;
  
  // Priority 3: Skip patterns (score 0-10)
  if (nameLower.includes('testing') || nameLower.includes('test ')) return 5;
  if (nameUpper.includes('[DO NOT EDIT]')) return 3;
  if (nameLower.includes('complete') && !nameLower.includes('lifecycle')) return 2;
  if (/^201\d{5}/i.test(name) || /^202[0-3]\d{4}/i.test(name)) return 10; // Older dates
  
  // Default: medium priority
  return 40;
}

// Truncate HTML to prevent memory issues
function truncateHtml(html: string | undefined): string | undefined {
  if (!html) return undefined;
  if (MAX_HTML_SIZE === 0 || html.length <= MAX_HTML_SIZE) return html;
  return html.slice(0, MAX_HTML_SIZE) + '<!-- truncated -->';
}

/** Persist Braze `messages` for dashboard parsing; cap total stored HTML-ish chars. */
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

// Retry wrapper with exponential back-off (avoid angle-bracket generics on the function name for older bundlers).
async function withRetry(
  fn: () => Promise<unknown>,
  retries = 3,
  baseDelay = 500,
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(
          "Retrying after " +
            String(delay) +
            "ms (attempt " +
            String(attempt + 1) +
            "/" +
            String(retries) +
            ")...",
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

async function brazeFetch(endpoint: string, apiKey: string, restEndpoint: string) {
  return withRetry(async () => {
    const url = `${restEndpoint}/${endpoint}`;
    console.log(`[Braze Sync] GET ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);

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
        console.error(
          `[Braze Sync] HTTP ${response.status} ${url} — ${errorText.slice(0, 500)}`,
        );
        throw new Error(`Braze API error ${response.status}: ${errorText.slice(0, 200)}`);
      }
      const body: unknown = await response.json();
      console.log(
        "[API RESPONSE]",
        endpoint,
        response.status,
        JSON.stringify(body).slice(0, 200),
      );
      return body;
    } finally {
      clearTimeout(timeout);
    }
  });
}

function formatDelay(seconds: number | undefined): string {
  if (!seconds || seconds === 0) return '0h';
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

const isTruthy = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';

/**
 * Braze /canvas/list rows often omit `enabled`; infer from status / draft / archived so
 * partial syncs (minimal upsert only) still populate `enabled` for the dashboard.
 */
function inferCanvasEnabledFromListItem(c: CanvasListItem): boolean {
  if (c.draft === true) return false;
  if (c.archived === true) return false;
  if (isTruthy(c.enabled ?? c.is_active ?? c.active)) return true;
  const st = String(c.status ?? "").trim().toLowerCase();
  if (st === "active" || st === "live" || st === "running" || st === "enabled") return true;
  if (st === "stopped" || st === "not_running" || st === "paused" || st === "draft") return false;
  // Non-draft, non-archived rows in the live list are treated as active unless status says otherwise.
  return true;
}

const toDateMs = (v: unknown): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v * 1000;
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
};

const toIso = (v: unknown): string | undefined => {
  const ms = toDateMs(v);
  return ms ? new Date(ms).toISOString() : undefined;
};

interface CanvasListItem {
  id: string;
  name: string;
  draft?: boolean;
  enabled?: boolean;
  is_active?: boolean;
  active?: boolean;
  status?: string;
  last_entry?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  description?: string;
  archived?: boolean;
}

interface ProcessedCanvas {
  id: string;
  name: string;
  description?: string;
  draft?: boolean;
  enabled?: boolean;
  archived?: boolean;
  schedule_type?: string;
  first_entry?: string;
  last_entry?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  variants: Array<{ name: string; percentage: number; first_step_id: string | null }>;
  steps: Record<string, unknown>;
  total_steps: number;
  entry_type?: string;
  entry_segment_name?: string;
  trigger_event_name?: string;
  exception_events?: string[];
  conversion_events?: Array<{ name: string; window_seconds?: number; type?: string }>;
  entry_filters?: Array<{ type: string; property?: string; value?: string; comparator?: string }>;
  entries_last_30d?: number;
  entries_last_60d?: number;
  sends_last_30d?: number;
  revenue_last_30d?: number;
  conversions_last_30d?: number;
  opens_last_30d?: number;
  clicks_last_30d?: number;
  last_activity_at?: string;
}

interface CampaignListItem {
  id: string;
  name: string;
  is_api_campaign?: boolean;
  last_sent?: string;
  tags?: string[];
  /** Original list row for debugging */
  _raw?: Record<string, unknown>;
}

interface ProcessedCampaign {
  id: string;
  name: string;
  channel?: string;
  subject?: string;
  preheader?: string;
  status: string;
  sent_date?: string;
  opens: number;
  clicks: number;
  deliveries: number;
  sends: number;
  bounces: number;
  spam_reports: number;
  open_rate: number | null;
  click_rate: number | null;
  unsubs: number;
  segment?: string;
  tags?: string[];
  /** Short line for dashboard cards (subject, push title, or description). */
  creative_preview?: string;
  raw_details?: Record<string, unknown>;
}

/** Braze push `alert` may be a string or nested object. */
function brazeAlertToString(alert: unknown): string | undefined {
  if (typeof alert === "string" && alert.trim()) return alert.trim();
  if (alert && typeof alert === "object") {
    const o = alert as Record<string, unknown>;
    if (typeof o.body === "string" && o.body.trim()) return o.body.trim();
    if (typeof o.alert === "string" && o.alert.trim()) return o.alert.trim();
  }
  return undefined;
}

/** Avoid storing plain-text `body` as `email_html_preview` — it breaks dashboard iframe previews. */
function emailBodyLooksLikeHtml(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  return /<(?:[a-z][\w-]*|\/[a-z][\w-]*|!doctype)/i.test(t);
}

function numFromDay(day: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = day[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const ts = day.total_stats as Record<string, unknown> | undefined;
    if (ts && typeof ts[k] === 'number' && Number.isFinite(ts[k] as number)) return ts[k] as number;
  }
  return 0;
}

function firstFiniteNumber(o: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

/** Match top-level day fallback: Braze often nests unique_opens / unique_clicks on message rows. */
function variationOpens(v: Record<string, unknown>): number {
  return firstFiniteNumber(v, ['unique_opens', 'opens']);
}

function variationClicks(v: Record<string, unknown>): number {
  return firstFiniteNumber(v, ['unique_clicks', 'clicks']);
}

/**
 * Braze `campaigns/data_series` nests sends/opens/etc. under `messages.{channel}[].`
 * Top-level keys like `messages_sent` are not used for multichannel responses.
 */
function aggregateCampaignDayFromBraze(day: Record<string, unknown>): {
  sends: number;
  deliveries: number;
  opens: number;
  clicks: number;
  bounces: number;
  spam_reports: number;
  unsubs: number;
} {
  let sends = 0;
  let deliveries = 0;
  let opens = 0;
  let clicks = 0;
  let bounces = 0;
  let spam_reports = 0;
  let unsubs = 0;

  const messages = day.messages;
  if (messages && typeof messages === 'object' && !Array.isArray(messages)) {
    for (const channelList of Object.values(messages as Record<string, unknown>)) {
      const arr = Array.isArray(channelList) ? channelList : [];
      for (const raw of arr) {
        if (!raw || typeof raw !== 'object') continue;
        const v = raw as Record<string, unknown>;
        const s = Math.max(
          firstFiniteNumber(v, ['sent']),
          firstFiniteNumber(v, ['sent_to_carrier']),
        );
        const d = Math.max(
          firstFiniteNumber(v, ['delivered']),
          firstFiniteNumber(v, ['messages_delivered']),
          firstFiniteNumber(v, ['successful_deliveries']),
        );
        const sendAdd = s;
        const delAdd = d > 0 ? d : s;
        sends += sendAdd;
        deliveries += delAdd;
        opens += variationOpens(v);
        clicks += variationClicks(v);
        bounces += firstFiniteNumber(v, [
          'bounces',
          'hard_bounces',
          'rejected',
          'failed',
          'delivery_failed',
          'total_bounces',
        ]);
        spam_reports += firstFiniteNumber(v, ['reported_spam', 'spam_reports', 'spam']);
        unsubs += firstFiniteNumber(v, ['unsubscribes', 'unsubs', 'opt_out']);
      }
    }
  }

  if (sends === 0 && deliveries === 0 && opens === 0) {
    sends = numFromDay(day, ['messages_sent', 'sent', 'dispatch']);
    deliveries = numFromDay(day, ['deliveries', 'successful_deliveries', 'messages_delivered']);
    opens = numFromDay(day, ['unique_opens', 'opens']);
    clicks = numFromDay(day, ['unique_clicks', 'clicks']);
    bounces = numFromDay(day, ['hard_bounces', 'bounces', 'total_bounces']);
    spam_reports = numFromDay(day, ['spam_reports', 'reported_spam', 'spam']);
    unsubs = numFromDay(day, ['unsubscribes', 'unsubs']);
  }

  const ur = day.unique_recipients;
  if (typeof ur === 'number' && Number.isFinite(ur) && deliveries === 0 && sends > 0) {
    deliveries = ur;
  }

  return { sends, deliveries, opens, clicks, bounces, spam_reports, unsubs };
}

/** UTC calendar date arithmetic for Braze daily buckets (YYYY-MM-DD). */
function addCalendarDaysUtc(ymd: string, deltaDays: number): string {
  const parts = ymd.split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return ymd;
  const [y, m, d] = parts;
  const t = Date.UTC(y, m - 1, d) + deltaDays * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

function dateKeyFromCanvasDataSeriesDay(day: Record<string, unknown>): string | null {
  return seriesDateFromBrazeKpi(
    day.time ?? day.date ?? (day as { day?: unknown }).day,
  );
}

/** Braze allows at most 14 days per `length`; use 13 and two windows to approximate a 30d rollup. */
const CANVAS_DATA_SERIES_LENGTH = 13;

function buildCanvasDataSeriesPath(canvasId: string, endingAtYmd: string): string {
  const sp = new URLSearchParams();
  sp.set("canvas_id", canvasId);
  sp.set("length", String(CANVAS_DATA_SERIES_LENGTH));
  sp.set("ending_at", `${endingAtYmd}T00:00:00Z`);
  sp.set("include_variant_breakdown", "false");
  return `canvas/data_series?${sp.toString()}`;
}

/** Revenue + conversions on a canvas data_series day (top-level or messages.*). */
function canvasDayRevenueAndConversions(day: Record<string, unknown>): { revenue: number; conversions: number } {
  const topRev = numFromDay(day, ["revenue", "total_revenue", "purchase_revenue", "money_spent", "total_money_spent"]);
  const topConv = numFromDay(day, [
    "conversions",
    "total_conversions",
    "primary_conversions",
    "unique_conversions",
  ]);
  let msgRev = 0;
  let msgConv = 0;
  const messages = day.messages;
  if (messages && typeof messages === "object" && !Array.isArray(messages)) {
    for (const channelList of Object.values(messages as Record<string, unknown>)) {
      const arr = Array.isArray(channelList) ? channelList : [];
      for (const raw of arr) {
        if (!raw || typeof raw !== "object") continue;
        const v = raw as Record<string, unknown>;
        msgRev += firstFiniteNumber(v, ["revenue", "purchase_revenue", "total_revenue"]);
        msgConv += firstFiniteNumber(v, ["conversions", "total_conversions"]);
      }
    }
  }
  return {
    revenue: Math.max(topRev, msgRev),
    conversions: Math.max(topConv, msgConv),
  };
}

function canvasTotalStatNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Largest numeric value among keys (Braze sometimes uses alternate field names or string numbers in `total_stats`). */
function maxCanvasTotalStatForKeys(o: Record<string, unknown>, keys: readonly string[]): number {
  let m = 0;
  for (const k of keys) {
    m = Math.max(m, canvasTotalStatNumber(o[k]));
  }
  return m;
}

const CANVAS_TOTAL_STATS_REVENUE_KEYS = [
  "revenue",
  "total_revenue",
  "purchase_revenue",
  "money_spent",
  "total_money_spent",
] as const;

const CANVAS_TOTAL_STATS_CONVERSION_KEYS = [
  "conversions",
  "total_conversions",
  "primary_conversions",
  "unique_conversions",
] as const;

const CANVAS_TOTAL_STATS_ENTRY_KEYS = [
  "entries",
  "unique_recipients",
  "messages_sent",
  "sent",
] as const;

/**
 * One canvas/data_series JSON body. Braze returns daily rows under `data.stats[]` with metrics in
 * `total_stats` (e.g. `total_stats.revenue`). Also merges top-level / `messages.*` revenue when
 * `total_stats` is sparse, so sync → `braze_canvases.revenue_last_30d` → Analytics stays aligned.
 */
function parseCanvasDataSeriesResponse(analyticsData: unknown): {
  revenue: number;
  entries: number;
  conversions: number;
  opens: number;
  clicks: number;
  last_activity_at: string | undefined;
} {
  const j = analyticsData as Record<string, unknown>;
  let stats: Array<Record<string, unknown>> = [];
  const data = j.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const s = (data as Record<string, unknown>).stats;
    if (Array.isArray(s)) stats = s as Array<Record<string, unknown>>;
  }
  if (stats.length === 0 && Array.isArray(j.stats)) {
    stats = j.stats as Array<Record<string, unknown>>;
  }

  let revenue = 0;
  let entries = 0;
  let conversions = 0;
  let opens = 0;
  let clicks = 0;
  let last_activity_at: string | undefined;
  let latestDay = "";

  for (const day of stats) {
    const ts = day.total_stats;
    const tso =
      ts && typeof ts === "object" && !Array.isArray(ts)
        ? (ts as Record<string, unknown>)
        : null;

    const revFromTs = tso ? maxCanvasTotalStatForKeys(tso, CANVAS_TOTAL_STATS_REVENUE_KEYS) : 0;
    const convFromTs = tso ? maxCanvasTotalStatForKeys(tso, CANVAS_TOTAL_STATS_CONVERSION_KEYS) : 0;
    const { revenue: revFromDay, conversions: convFromDay } = canvasDayRevenueAndConversions(day);
    revenue += Math.max(revFromTs, revFromDay);
    conversions += Math.max(convFromTs, convFromDay);

    let ent = 0;
    if (tso) {
      ent = maxCanvasTotalStatForKeys(tso, CANVAS_TOTAL_STATS_ENTRY_KEYS);
      entries += ent;
      opens += maxCanvasTotalStatForKeys(tso, ["unique_opens", "opens"]);
      clicks += maxCanvasTotalStatForKeys(tso, ["unique_clicks", "clicks"]);
    } else {
      const d = day as Record<string, unknown>;
      ent = maxCanvasTotalStatForKeys(d, CANVAS_TOTAL_STATS_ENTRY_KEYS);
      entries += ent;
      opens += maxCanvasTotalStatForKeys(d, ["unique_opens", "opens"]);
      clicks += maxCanvasTotalStatForKeys(d, ["unique_clicks", "clicks"]);
    }

    if (ent > 0) {
      const dk = dateKeyFromCanvasDataSeriesDay(day);
      if (dk && dk >= latestDay) {
        latestDay = dk;
        last_activity_at =
          typeof day.time === "string" && day.time ? day.time : dk;
      }
    }
  }

  return { revenue, entries, conversions, opens, clicks, last_activity_at };
}

function pickLatestIsoTime(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return ta >= tb ? a : b;
}

/** Two 13-day windows (ending today vs ending 13d ago) merged into braze_canvases rollup columns. */
async function fetchMergedCanvasDataSeriesForDb(
  canvasId: string,
  apiKey: string,
  brazeRestEndpoint: string,
): Promise<{
  entries_last_30d: number;
  entries_last_60d: number;
  sends_last_30d: number;
  revenue_last_30d: number;
  conversions_last_30d: number;
  opens_last_30d: number;
  clicks_last_30d: number;
  last_activity_at: string | undefined;
}> {
  const end1 = new Date().toISOString().slice(0, 10);
  const end2 = addCalendarDaysUtc(end1, -13);

  let a = {
    revenue: 0,
    entries: 0,
    conversions: 0,
    opens: 0,
    clicks: 0,
    last_activity_at: undefined as string | undefined,
  };
  let b = { ...a };

  try {
    const body1 = await brazeFetch(
      buildCanvasDataSeriesPath(canvasId, end1),
      apiKey,
      brazeRestEndpoint,
    );
    a = parseCanvasDataSeriesResponse(body1);
  } catch (e) {
    console.warn(`[Braze Sync] canvas/data_series first window failed id=${canvasId}:`, e);
  }
  try {
    const body2 = await brazeFetch(
      buildCanvasDataSeriesPath(canvasId, end2),
      apiKey,
      brazeRestEndpoint,
    );
    b = parseCanvasDataSeriesResponse(body2);
  } catch (e) {
    console.warn(`[Braze Sync] canvas/data_series second window failed id=${canvasId}:`, e);
  }

  const entriesTot = a.entries + b.entries;
  return {
    entries_last_30d: entriesTot,
    entries_last_60d: entriesTot,
    sends_last_30d: entriesTot,
    revenue_last_30d: a.revenue + b.revenue,
    conversions_last_30d: a.conversions + b.conversions,
    opens_last_30d: a.opens + b.opens,
    clicks_last_30d: a.clicks + b.clicks,
    last_activity_at: pickLatestIsoTime(a.last_activity_at, b.last_activity_at),
  };
}

function isoDateOnly(time: string | undefined): string | null {
  if (!time) return null;
  const d = time.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/** Avoid double slashes in Braze REST URLs (breaks fetch → 0 campaigns written). */
function normalizeRestEndpointUrl(raw: unknown): string {
  const s = String(raw ?? "").trim().replace(/\/+$/, "");
  return s.length > 0 ? s : String(Deno.env.get("BRAZE_REST_URL") || FALLBACK_BRAZE_REST_URL);
}

/** Braze KPI series may use ISO strings, unix seconds, or millis — isoDateOnly alone dropped rows. */
function seriesDateFromBrazeKpi(time: unknown): string | null {
  if (time == null) return null;
  if (typeof time === "number") {
    const ms = time > 1e12 ? time : time * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(time).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const ms = Date.parse(s);
  if (!Number.isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
  return null;
}

/** YYYY-MM-DD for a `campaigns/data_series` day object. */
function campaignDataSeriesDayDate(day: Record<string, unknown>): string | null {
  return seriesDateFromBrazeKpi(
    day.time ?? day.date ?? (day as { day?: unknown }).day,
  );
}

function campaignIdFromListItem(c: Record<string, unknown>): string {
  const raw =
    c.id ??
    c.campaign_id ??
    c.api_id ??
    c.campaign_api_id;
  if (raw == null) return "";
  return String(raw).trim();
}

/** Braze export endpoints sometimes nest arrays as `data` or `data.data`. */
function brazeExportDataArray(json: Record<string, unknown>): unknown[] {
  const d = json.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    const inner = d as Record<string, unknown>;
    if (Array.isArray(inner.data)) return inner.data;
    if (Array.isArray(inner.series)) return inner.series;
    if (Array.isArray(inner.results)) return inner.results;
    if (Array.isArray(inner.points)) return inner.points;
    if (Array.isArray(inner.values)) return inner.values;
  }
  if (Array.isArray(json.results)) return json.results;
  if (Array.isArray(json.series)) return json.series;
  if (Array.isArray(json.points)) return json.points;
  return [];
}

/** Used when inferring a synthetic message row from step-level fields. */
function isMessagingChannelForSync(raw: string): boolean {
  const c = String(raw).toLowerCase().trim();
  if (!c) return false;
  if (c === "email") return true;
  if (c.includes("push")) return true;
  if (c.includes("sms")) return true;
  if (c.includes("in_app") || c.includes("in-app")) return true;
  if (c === "trigger_in_app_message") return true;
  if (c.includes("content_card")) return true;
  return false;
}

function firstChannelFromStepRow(s: Record<string, unknown>): string | undefined {
  if (typeof s.channel === "string" && s.channel.trim()) return s.channel.trim();
  const ch = s.channels;
  if (Array.isArray(ch) && ch.length > 0) {
    const a = String(ch[0]).trim();
    return a || undefined;
  }
  if (ch && typeof ch === "object" && !Array.isArray(ch)) {
    const keys = Object.keys(ch as Record<string, unknown>);
    const hit = keys.find((k) => isMessagingChannelForSync(k));
    const pick = hit ?? keys[0];
    return pick?.trim() || undefined;
  }
  return undefined;
}

function brazeMessageTemplateId(msg: Record<string, unknown>): string | undefined {
  const raw =
    msg.email_template_id ??
    msg.template_id ??
    msg.linked_email_template_id ??
    msg.html_template_id ??
    msg.email_template_api_id;
  if (raw == null) return undefined;
  const id = String(raw).trim();
  return id || undefined;
}

function pushTemplateIdsFromChannelsObject(
  ch: unknown,
  pushId: (raw: unknown) => void,
): void {
  if (!ch || typeof ch !== "object" || Array.isArray(ch)) return;
  for (const chVal of Object.values(ch as Record<string, unknown>)) {
    if (!chVal || typeof chVal !== "object" || Array.isArray(chVal)) continue;
    const cv = chVal as Record<string, unknown>;
    pushId(cv.email_template_id ?? cv.template_id ?? cv.linked_email_template_id ?? cv.html_template_id);
  }
}

/** Braze often nests creative under `channels.email` / `channels.ios_push` instead of `messages[]`. */
function appendMessagesFromChannelsObject(
  s: Record<string, unknown>,
  messages: Array<Record<string, unknown>>,
  templateHtmlMap: Map<string, { subject: string; preheader: string; html: string }>,
): void {
  const ch = s.channels;
  if (!ch || typeof ch !== "object" || Array.isArray(ch)) return;
  for (const [chKey, chVal] of Object.entries(ch as Record<string, unknown>)) {
    if (!chVal || typeof chVal !== "object" || Array.isArray(chVal)) continue;
    if (!isMessagingChannelForSync(chKey)) continue;
    const cv = chVal as Record<string, unknown>;
    const templateId = brazeMessageTemplateId(cv);
    let subject = cv.subject as string | undefined;
    let preheader = cv.preheader as string | undefined;
    let html: string | undefined;
    const isEmail = chKey.toLowerCase() === "email" || chKey.toLowerCase().includes("email");
    if (isEmail && templateId && templateHtmlMap.has(templateId)) {
      const tpl = templateHtmlMap.get(templateId)!;
      html = tpl.html || undefined;
      subject = subject || tpl.subject || undefined;
      preheader = preheader || tpl.preheader || undefined;
    } else if (isEmail) {
      html = truncateHtml((cv.body as string) || (cv.html_body as string));
    }
    const channel =
      chKey.toLowerCase().includes("push") && !chKey.toLowerCase().includes("email")
        ? chKey.includes("ios")
          ? "ios_push"
          : chKey.includes("android")
            ? "android_push"
            : "push"
        : isEmail
          ? "email"
          : chKey;
    messages.push({
      channel,
      subject,
      preheader,
      title: cv.title || cv.header,
      body: cv.message || cv.body || cv.alert || cv.plaintext_body,
      html_content: html,
      image_url: cv.image_url || cv.big_image,
      buttons: cv.buttons,
    });
  }
}

/**
 * One Braze `steps` (or similar) field: array of step objects, or id-keyed object where
 * inner objects may omit `id` (id is the map key).
 */
/** Braze step rows may use `id`, `api_id`, `canvas_step_id`, etc. */
function ensureStepRowHasId(row: Record<string, unknown>, mapKey?: string): Record<string, unknown> {
  const pick = (): string => {
    for (const k of [
      "id",
      "api_id",
      "step_api_id",
      "canvas_step_id",
      "step_id",
      "identifier",
      "step_identifier",
    ] as const) {
      const v = row[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    if (mapKey != null && String(mapKey).trim() !== "") return String(mapKey).trim();
    return "";
  };
  const id = pick();
  if (id && (row.id == null || String(row.id).trim() === "")) {
    row.id = id;
  }
  return row;
}

function stepRowsFromUnknown(raw: unknown): Array<Record<string, unknown>> {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((row) => ensureStepRowHasId({ ...row }));
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const acc: Array<Record<string, unknown>> = [];
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v == null || typeof v !== "object" || Array.isArray(v)) continue;
      const row = ensureStepRowHasId({ ...(v as Record<string, unknown>) }, k);
      if (row.id == null || String(row.id).trim() === "") {
        row.id = k;
      }
      acc.push(row);
    }
    return acc;
  }
  return [];
}

/** Steps often live under each Canvas variant, not on the canvas root (Braze export shape). */
function pushStepsFromVariantsInto(
  sources: unknown[],
  container: Record<string, unknown> | undefined,
): void {
  if (!container || typeof container !== "object") return;
  const vars = container.variants;
  if (!Array.isArray(vars)) return;
  for (const v of vars) {
    if (v == null || typeof v !== "object" || Array.isArray(v)) continue;
    const vr = v as Record<string, unknown>;
    sources.push(vr.steps, vr.scheduled_steps);
  }
}

/** True if this step row already carries email (or other) message creative from Braze. */
function canvasDetailStepRowHasMessageCreative(row: Record<string, unknown>): boolean {
  const topSub =
    (typeof row.subject === "string" && row.subject.trim() !== "") ||
    (typeof row.title === "string" && row.title.trim() !== "");
  if (topSub) return true;
  const m = row.messages;
  if (m == null || typeof m !== "object") return false;
  const entries = Array.isArray(m)
    ? (m as unknown[])
    : Object.values(m as Record<string, unknown>);
  for (const item of entries) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const body = String(o.body ?? o.html_body ?? o.message ?? o.alert ?? "").trim();
    const sub = String(o.subject ?? "").trim();
    const html = String(o.html_body ?? "").trim();
    if (body || sub || html) return true;
  }
  return false;
}

function canvasDetailStepRowCreativeScore(row: Record<string, unknown>): number {
  try {
    return JSON.stringify(row.messages ?? {}).length;
  } catch {
    return 0;
  }
}

/**
 * Merge steps from every known `canvas/details` shape; dedupe by step id.
 *
 * Prefer the **richest** row per id: Braze sometimes emits the same step id twice (e.g. a stub
 * under `variants[].steps` and the full payload on root `steps`). First-wins alone stored
 * `messages: [{ channel: "email" }]` with no subject/body and broke Lifecycle previews.
 *
 * Braze **Export Canvas Details** often puts the flow under `legacy_response` (with `steps[]`
 * there), while newer wrappers use `canvas`, `data`, `scheduled_steps`, etc. Missing
 * `legacy_response` caused empty `raw_steps` and 0 touchpoints in the app.
 */
function collectCanvasDetailStepRows(
  details: Record<string, unknown>,
  canvasNested: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> {
  const dataObj = details.data as Record<string, unknown> | undefined;
  const dataCanvas = dataObj?.canvas as Record<string, unknown> | undefined;
  /** Some responses use `data` as the canvas document without a nested `canvas` key. */
  const dataAsCanvas =
    dataObj && typeof dataObj === "object" && dataCanvas == null
      ? dataObj
      : undefined;

  const sources: unknown[] = [
    details.steps,
    // Canvas Flow (V2) uses `components[]` instead of `steps[]`
    (details as { components?: unknown }).components,
    canvasNested?.steps,
    (canvasNested as { components?: unknown } | undefined)?.components,
    canvasNested?.scheduled_steps,
    (details as { scheduled_steps?: unknown }).scheduled_steps,
    dataObj?.steps,
    (dataObj as { components?: unknown } | undefined)?.components,
    dataObj && typeof dataObj === "object"
      ? (dataObj as { scheduled_steps?: unknown }).scheduled_steps
      : undefined,
    dataCanvas?.steps,
    (dataCanvas as { components?: unknown } | undefined)?.components,
    dataCanvas?.scheduled_steps,
    dataAsCanvas?.steps,
    (dataAsCanvas as { components?: unknown } | undefined)?.components,
    dataAsCanvas && typeof dataAsCanvas === "object"
      ? (dataAsCanvas as { scheduled_steps?: unknown }).scheduled_steps
      : undefined,
    (details as { message?: unknown }).message &&
    typeof (details as { message?: unknown }).message === "object"
      ? ((details as { message: Record<string, unknown> }).message.steps)
      : undefined,
    (details as { message?: unknown }).message &&
    typeof (details as { message?: unknown }).message === "object"
      ? ((details as { message: Record<string, unknown> }).message as { scheduled_steps?: unknown })
          .scheduled_steps
      : undefined,
  ];

  pushStepsFromVariantsInto(sources, details as Record<string, unknown>);
  pushStepsFromVariantsInto(sources, canvasNested);
  pushStepsFromVariantsInto(sources, dataObj);
  pushStepsFromVariantsInto(sources, dataCanvas);
  pushStepsFromVariantsInto(sources, dataAsCanvas);

  const legacyBlobs: unknown[] = [
    (details as { legacy_response?: unknown }).legacy_response,
    dataObj?.legacy_response,
    dataCanvas?.legacy_response,
    canvasNested?.legacy_response,
    dataAsCanvas?.legacy_response,
  ];
  for (const leg of legacyBlobs) {
    if (leg && typeof leg === "object" && !Array.isArray(leg)) {
      const o = leg as Record<string, unknown>;
      sources.push(o.steps, o.scheduled_steps);
      pushStepsFromVariantsInto(sources, o);
    }
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const raw of sources) {
    for (const row of stepRowsFromUnknown(raw)) {
      const id = String(
        row.id ??
          row.api_id ??
          (row as { step_api_id?: unknown }).step_api_id ??
          row.step_id ??
          (row as { canvas_step_id?: unknown }).canvas_step_id ??
          "",
      ).trim();
      if (!id) continue;
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, row);
        continue;
      }
      const prevRich = canvasDetailStepRowHasMessageCreative(prev);
      const nextRich = canvasDetailStepRowHasMessageCreative(row);
      if (!prevRich && nextRich) {
        byId.set(id, row);
      } else if (prevRich && nextRich) {
        if (canvasDetailStepRowCreativeScore(row) > canvasDetailStepRowCreativeScore(prev)) {
          byId.set(id, row);
        }
      }
    }
  }
  return Array.from(byId.values());
}

/** Top-level + nested `canvas` / `data.canvas` shapes from Braze `canvas/details`. */
function canvasDetailRoots(details: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();
  const push = (raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const r = raw as Record<string, unknown>;
    if (seen.has(r)) return;
    seen.add(r);
    out.push(r);
  };
  push(details);
  push(details.canvas);
  const data = details.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    push(data);
    push((data as Record<string, unknown>).canvas);
  }
  return out;
}

const CANVAS_STEP_CONTAINER_KEYS = new Set([
  "steps",
  "scheduled_steps",
  "canvas_steps",
  "flow_steps",
  "message_steps",
  "all_steps",
]);

function mergeCanvasStepRows(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const keyCount = (r: Record<string, unknown>) => Object.keys(r).length;
  const msgLen = (x: unknown): number =>
    Array.isArray(x)
      ? x.length
      : x && typeof x === "object"
        ? Object.keys(x as object).length
        : 0;
  const base =
    keyCount(a) + msgLen(a.messages) >= keyCount(b) + msgLen(b.messages)
      ? { ...b, ...a }
      : { ...a, ...b };
  const ma = a.messages;
  const mb = b.messages;
  if (ma != null && mb != null) {
    base.messages = msgLen(mb) >= msgLen(ma) ? mb : ma;
  }
  return ensureStepRowHasId(base);
}

function mergeStepRowIntoMap(
  map: Map<string, Record<string, unknown>>,
  row: Record<string, unknown>,
): void {
  const id = String(
    row.id ??
      row.api_id ??
      (row as { step_api_id?: unknown }).step_api_id ??
      row.step_id ??
      (row as { canvas_step_id?: unknown }).canvas_step_id ??
      "",
  ).trim();
  if (!id) return;
  const normalized = ensureStepRowHasId({ ...row });
  const prev = map.get(id);
  if (!prev) {
    map.set(id, normalized);
    return;
  }
  map.set(id, mergeCanvasStepRows(prev, normalized));
}

function deepHarvestCanvasStepsIntoMap(
  node: unknown,
  map: Map<string, Record<string, unknown>>,
  visited: WeakSet<object>,
  depth: number,
): void {
  if (depth > 22 || node == null) return;
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const x of node) deepHarvestCanvasStepsIntoMap(x, map, visited, depth + 1);
    return;
  }
  const o = node as Record<string, unknown>;
  if (visited.has(o)) return;
  visited.add(o);
  for (const [k, v] of Object.entries(o)) {
    if (v == null || typeof v !== "object") continue;
    const lk = k.toLowerCase();
    const looksLikeStepContainer =
      CANVAS_STEP_CONTAINER_KEYS.has(k) ||
      (lk.endsWith("_steps") && k !== "total_steps");
    if (looksLikeStepContainer) {
      for (const row of stepRowsFromUnknown(v)) {
        mergeStepRowIntoMap(map, row);
      }
    }
    deepHarvestCanvasStepsIntoMap(v, map, visited, depth + 1);
  }
}

function neighborStepIdsFromRow(s: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (x: unknown) => {
    if (x == null) return;
    if (Array.isArray(x)) {
      for (const y of x) {
        const t = String(y).trim();
        if (t) out.push(t);
      }
      return;
    }
    const t = String(x).trim();
    if (t) out.push(t);
  };
  push(s.next_step_ids);
  push((s as { nextStepIds?: unknown }).nextStepIds);
  push(s.next_step_id);
  push((s as { nextStepId?: unknown }).nextStepId);
  const paths = s.next_paths;
  if (Array.isArray(paths)) {
    for (const p of paths) {
      if (!p || typeof p !== "object") continue;
      const pr = p as Record<string, unknown>;
      push(
        pr.next_step_id ??
          pr.nextStepId ??
          pr.next_canvas_step_id ??
          pr.step_id,
      );
    }
  }
  const branches = (s as { branches?: unknown }).branches;
  if (Array.isArray(branches)) {
    for (const b of branches) {
      if (!b || typeof b !== "object") continue;
      const br = b as Record<string, unknown>;
      push(br.next_step_id);
      push(br.next_step_ids);
    }
  }
  return [...new Set(out)];
}

function bfsOrderedStepsFromStepMap(
  stepMap: Map<string, Record<string, unknown>>,
  entryIds: string[],
): Array<Record<string, unknown>> {
  const ordered: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const queue = [...new Set(entryIds.map((x) => String(x).trim()).filter(Boolean))];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const row = stepMap.get(id);
    if (row) {
      ordered.push(row);
      for (const n of neighborStepIdsFromRow(row)) {
        if (!seen.has(n)) queue.push(n);
      }
    }
  }
  const orphanKeys = [...stepMap.keys()].filter((k) => !seen.has(k)).sort();
  for (const k of orphanKeys) {
    const row = stepMap.get(k);
    if (row) ordered.push(row);
  }
  return ordered;
}

function collectVariantEntryStepIdsFromDetails(
  details: Record<string, unknown>,
  canvasNested: Record<string, unknown> | undefined,
): string[] {
  const out: string[] = [];
  const pushFromVariant = (vr: Record<string, unknown>) => {
    const multi = vr.first_step_ids ?? vr.firstStepIds;
    if (Array.isArray(multi)) {
      for (const x of multi) {
        const t = String(x).trim();
        if (t) out.push(t);
      }
    }
    const one =
      vr.first_step_id ??
      vr.firstStepId ??
      vr.first_canvas_step_id ??
      vr.first_step_api_id ??
      vr.entry_step_id;
    if (one != null && String(one).trim()) out.push(String(one).trim());
  };
  const walkContainer = (container: Record<string, unknown> | undefined) => {
    if (!container) return;
    const vars = container.variants;
    if (!Array.isArray(vars)) return;
    for (const v of vars) {
      if (v != null && typeof v === "object" && !Array.isArray(v)) {
        pushFromVariant(v as Record<string, unknown>);
      }
    }
  };
  const rootFirst = (c: Record<string, unknown>) => {
    const multi = c.first_step_ids ?? c.firstStepIds;
    if (Array.isArray(multi)) {
      for (const x of multi) {
        const t = String(x).trim();
        if (t) out.push(t);
      }
    }
    const one =
      c.first_step_id ??
      c.firstStepId ??
      c.first_canvas_step_id ??
      c.entry_step_id;
    if (one != null && String(one).trim()) out.push(String(one).trim());
  };

  walkContainer(details);
  walkContainer(canvasNested);
  const dataObj = details.data as Record<string, unknown> | undefined;
  const dataCanvas = dataObj?.canvas as Record<string, unknown> | undefined;
  const dataAsCanvas =
    dataObj && typeof dataObj === "object" && dataCanvas == null
      ? dataObj
      : undefined;
  walkContainer(dataObj);
  walkContainer(dataCanvas);
  walkContainer(dataAsCanvas);
  rootFirst(details);
  if (canvasNested) rootFirst(canvasNested);
  if (dataObj) rootFirst(dataObj);
  if (dataCanvas) rootFirst(dataCanvas);
  if (dataAsCanvas) rootFirst(dataAsCanvas);

  const legacyBlobs: unknown[] = [
    (details as { legacy_response?: unknown }).legacy_response,
    dataObj?.legacy_response,
    dataCanvas?.legacy_response,
    canvasNested?.legacy_response,
    dataAsCanvas?.legacy_response,
  ];
  for (const leg of legacyBlobs) {
    if (leg && typeof leg === "object" && !Array.isArray(leg)) {
      const o = leg as Record<string, unknown>;
      walkContainer(o);
      rootFirst(o);
    }
  }
  return [...new Set(out.map((x) => x.trim()).filter(Boolean))];
}

/**
 * Like {@link collectCanvasDetailStepRows} but also harvests id-keyed step maps from nested JSON
 * and walks the full graph from variant `first_step_id` / `first_step_ids` via `next_step_ids` /
 * `next_paths`, so canvases with 100+ steps are not reduced to a single array element.
 */
function collectCanvasDetailStepRowsExpanded(
  details: Record<string, unknown>,
  canvasNested: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> {
  const linear = collectCanvasDetailStepRows(details, canvasNested);
  const map = new Map<string, Record<string, unknown>>();
  for (const row of linear) {
    mergeStepRowIntoMap(map, row);
  }
  const visited = new WeakSet<object>();
  deepHarvestCanvasStepsIntoMap(details, map, visited, 0);
  if (canvasNested) {
    const visitedCanvas = new WeakSet<object>();
    deepHarvestCanvasStepsIntoMap(canvasNested, map, visitedCanvas, 0);
  }

  const entryIds = collectVariantEntryStepIdsFromDetails(details, canvasNested);
  if (entryIds.length > 0 && map.size > 0) {
    return bfsOrderedStepsFromStepMap(map, entryIds);
  }
  if (map.size > 0) {
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);
  }
  return linear;
}

function summarizeEntryRulesTrigger(entryRules: unknown): string | undefined {
  if (!entryRules || typeof entryRules !== "object" || Array.isArray(entryRules)) return undefined;
  const er = entryRules as Record<string, unknown>;
  const trig = er.trigger;
  if (trig && typeof trig === "object" && !Array.isArray(trig)) {
    const t = trig as Record<string, unknown>;
    const ce = t.custom_event as Record<string, unknown> | undefined;
    if (typeof ce?.custom_event_name === "string" && ce.custom_event_name.trim()) {
      return ce.custom_event_name.trim();
    }
    for (const k of ["event_name", "api_trigger_event_name", "trigger_event_name", "name"] as const) {
      const v = t[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  if (Array.isArray(er.triggers)) {
    const parts: string[] = [];
    for (const item of er.triggers) {
      const s = summarizeEntryRulesTrigger({ trigger: item });
      if (s) parts.push(s);
    }
    if (parts.length > 0) return [...new Set(parts)].join(", ");
  }
  return undefined;
}

/**
 * Channel + minimal `messages` rows for Lifecycle `isMessagingTouchpointStep` / `getLifecycleStepChannel`.
 * No bodies, HTML, or template ids — only enough for UI classification.
 */
function buildMinimalTouchpointMessagesArray(
  s: Record<string, unknown>,
  fallbackChannel: string | undefined,
): Array<{ channel: string }> {
  const out: Array<{ channel: string }> = [];

  const pushCh = (ch: string | undefined) => {
    const c = String(ch ?? "").trim();
    if (!c) return;
    out.push({ channel: c });
  };

  if (s.messages && typeof s.messages === "object") {
    if (Array.isArray(s.messages)) {
      for (const msgData of s.messages) {
        if (!msgData || typeof msgData !== "object" || Array.isArray(msgData)) continue;
        const msg = msgData as Record<string, unknown>;
        const ch = (msg.channel as string) || fallbackChannel;
        if (ch) pushCh(ch);
      }
    } else {
      for (const [msgKey, msgData] of Object.entries(
        s.messages as Record<string, unknown>,
      )) {
        const msg =
          msgData != null && typeof msgData === "object" && !Array.isArray(msgData)
            ? (msgData as Record<string, unknown>)
            : {};
        let ch = (msg.channel as string) || undefined;
        if (!ch && isMessagingChannelForSync(msgKey)) ch = msgKey;
        if (!ch) ch = fallbackChannel;
        if (ch) pushCh(ch);
      }
    }
  }

  if (out.length === 0 && s.message && typeof s.message === "object" && !Array.isArray(s.message)) {
    const msg = s.message as Record<string, unknown>;
    const ch =
      (msg.channel as string) ||
      (Array.isArray(s.channels) && s.channels[0] ? String(s.channels[0]) : undefined) ||
      (typeof s.channel === "string" ? s.channel : undefined) ||
      fallbackChannel;
    if (ch) pushCh(ch);
  }

  if (out.length === 0) {
    const stCh =
      (typeof s.channel === "string" ? s.channel : undefined) ||
      (Array.isArray(s.channels) && s.channels[0] ? String(s.channels[0]) : undefined) ||
      fallbackChannel;
    if (stCh && isMessagingChannelForSync(stCh)) pushCh(stCh);
  }

  if (
    out.length === 0 &&
    (s.email_template_id || s.template_id || s.subject || s.title)
  ) {
    pushCh("email");
  }

  return out;
}

/**
 * Lightweight `raw_steps` for `touchpoints_only`: connectivity + step metadata only (no message bodies / HTML).
 * Avoids retaining references into the large canvas/details JSON after `details` is released.
 */
function buildMinimalTouchpointStepsFromRows(
  detailStepRows: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const steps: Record<string, unknown> = {};
  for (const s of detailStepRows) {
    const stepId = String(
      s.id ??
        s.api_id ??
        s.step_id ??
        (s as { canvas_step_id?: unknown }).canvas_step_id ??
        (s as { step_api_id?: unknown }).step_api_id ??
        "",
    ).trim();
    if (!stepId) continue;

    const nextPaths: Array<{ name: string; next_step_id: string; percentage?: number }> = [];
    if (Array.isArray(s.next_paths) && s.next_paths.length > 0) {
      for (const p of s.next_paths as unknown[]) {
        const pr = p as Record<string, unknown>;
        const nid = String(
          pr.next_step_id ?? pr.nextStepId ?? pr.next_canvas_step_id ?? "",
        ).trim();
        nextPaths.push({
          name: (pr.name as string) || "Path",
          next_step_id: nid,
          percentage: typeof pr.percentage === "number" ? pr.percentage : undefined,
        });
      }
    }
    const nextStepIdsFromPaths = nextPaths.map((p) => p.next_step_id).filter(Boolean);
    const nextStepIds = Array.isArray(s.next_step_ids) && s.next_step_ids.length > 0
      ? (s.next_step_ids as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : nextStepIdsFromPaths;

    const delayObj = s.delay as { value?: number } | undefined;
    const delaySecondsParsed =
      typeof delayObj?.value === "number"
        ? delayObj.value
        : typeof (s as { delay_seconds?: number }).delay_seconds === "number"
          ? (s as { delay_seconds: number }).delay_seconds
          : typeof (s as { wait_seconds?: number }).wait_seconds === "number"
            ? (s as { wait_seconds: number }).wait_seconds
            : undefined;

    const rawStepType = String(s.type ?? "message");
    let resolvedChannel: string | undefined =
      typeof s.channel === "string" && s.channel.trim() !== ""
        ? s.channel.trim()
        : undefined;
    if (!resolvedChannel) {
      resolvedChannel = (s.channels?.[0] as string | undefined) || undefined;
    }
    if (!resolvedChannel && rawStepType.includes("/")) {
      const tail = rawStepType.split("/").pop()?.toLowerCase() ?? "";
      if (
        tail === "email" ||
        tail === "sms" ||
        tail === "webhook" ||
        tail.includes("push") ||
        tail.includes("in_app") ||
        tail.includes("in-app")
      ) {
        resolvedChannel = tail;
      }
    }

    const minimalMessages = buildMinimalTouchpointMessagesArray(s, resolvedChannel);

    const stepObj: Record<string, unknown> = {
      id: stepId,
      name: (s.name || s.type || "Step") as string,
      type: rawStepType,
      channel: resolvedChannel,
      delay_seconds: delaySecondsParsed,
      delay_formatted:
        typeof delaySecondsParsed === "number"
          ? formatDelay(delaySecondsParsed)
          : undefined,
      next_step_ids: nextStepIds,
      next_paths: nextPaths.length > 0 ? nextPaths : undefined,
    };
    if (minimalMessages.length > 0) {
      stepObj.messages = minimalMessages;
    }
    steps[stepId] = stepObj;
  }
  return steps;
}

/** Entry / trigger fields from `canvas/details` (roots + nested canvas/data). */
function extractCanvasEntryMetadataFromDetails(
  details: Record<string, unknown>,
): {
  schedule_type?: string;
  entry_type?: string;
  trigger_event_name?: string;
  entry_segment_name?: string;
} {
  const roots = canvasDetailRoots(details);

  let entryType: string | undefined;
  for (const r of roots) {
    if (typeof r.schedule_type === "string" && r.schedule_type.trim()) {
      entryType = r.schedule_type.trim();
      break;
    }
    const es = r.entry_schedule as Record<string, unknown> | undefined;
    if (typeof es?.type === "string" && es.type.trim()) {
      entryType = es.type.trim();
      break;
    }
  }

  let triggerEventName: string | undefined;
  for (const r of roots) {
    const es = r.entry_schedule as Record<string, unknown> | undefined;
    if (typeof es?.trigger_event_name === "string" && es.trigger_event_name.trim()) {
      triggerEventName = es.trigger_event_name.trim();
      break;
    }
  }
  if (!triggerEventName) {
    for (const r of roots) {
      const te = r.trigger_events;
      if (Array.isArray(te) && te.length > 0) {
        const joined = te
          .map((t: unknown) =>
            typeof t === "string"
              ? t
              : String(
                  (t as Record<string, string>).name ||
                    (t as Record<string, string>).event_name ||
                    "",
                ),
          )
          .filter(Boolean)
          .join(", ");
        if (joined) {
          triggerEventName = joined;
          break;
        }
      }
    }
  }
  if (!triggerEventName) {
    for (const r of roots) {
      const fromRules = summarizeEntryRulesTrigger(r.entry_rules);
      if (fromRules) {
        triggerEventName = fromRules;
        break;
      }
    }
  }

  let entrySegmentName: string | undefined;
  for (const r of roots) {
    if (typeof r.entry_audience_name === "string" && r.entry_audience_name.trim()) {
      entrySegmentName = r.entry_audience_name.trim();
      break;
    }
  }
  if (!entrySegmentName) {
    for (const r of roots) {
      const seg = r.entry_segment as Record<string, unknown> | undefined;
      if (typeof seg?.name === "string" && seg.name.trim()) {
        entrySegmentName = seg.name.trim();
        break;
      }
    }
  }
  if (!entrySegmentName) {
    for (const r of roots) {
      const ea = r.entry_audience as Record<string, unknown> | undefined;
      if (typeof ea?.name === "string" && ea.name.trim()) {
        entrySegmentName = ea.name.trim();
        break;
      }
    }
  }
  if (!entrySegmentName) {
    for (const r of roots) {
      const es = r.entry_schedule as Record<string, unknown> | undefined;
      const seg = es?.segment as Record<string, unknown> | undefined;
      if (typeof seg?.name === "string" && seg.name.trim()) {
        entrySegmentName = seg.name.trim();
        break;
      }
    }
  }

  return {
    schedule_type: entryType,
    entry_type: entryType,
    trigger_event_name: triggerEventName,
    entry_segment_name: entrySegmentName,
  };
}

function collectEmailTemplateIdsFromDetailRows(
  detailStepRows: Array<Record<string, unknown>>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const pushId = (raw: unknown) => {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const s of detailStepRows) {
    if (s.messages && typeof s.messages === "object") {
      const entries = Array.isArray(s.messages)
        ? (s.messages as unknown[])
        : Object.values(s.messages as Record<string, unknown>);
      for (const msgData of entries) {
        if (!msgData || typeof msgData !== "object" || Array.isArray(msgData)) continue;
        const msg = msgData as Record<string, unknown>;
        pushId(brazeMessageTemplateId(msg));
      }
    }
    if (s.message && typeof s.message === "object" && !Array.isArray(s.message)) {
      const msg = s.message as Record<string, unknown>;
      pushId(brazeMessageTemplateId(msg));
    }
    pushTemplateIdsFromChannelsObject(s.channels, pushId);
    pushId(s.email_template_id);
    pushId(s.template_id);
    pushId(s.linked_email_template_id);
    pushId(s.html_template_id);
  }
  return out;
}

async function fetchEmailTemplatesByIds(
  ids: string[],
  apiKey: string,
  brazeRestEndpoint: string,
  maxTemplates: number,
): Promise<Map<string, { subject: string; preheader: string; html: string }>> {
  const map = new Map<string, { subject: string; preheader: string; html: string }>();
  const slice = ids.slice(0, maxTemplates);
  for (let i = 0; i < slice.length; i += BATCH_SIZE) {
    const batch = slice.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (email_template_id) => {
        try {
          const d = (await brazeFetch(
            `templates/email/info?email_template_id=${encodeURIComponent(email_template_id)}`,
            apiKey,
            brazeRestEndpoint,
          )) as Record<string, unknown>;
          const htmlRaw = d.body as string | undefined;
          const htmlContent = truncateHtml(htmlRaw) ?? "";
          const subject = String(d.subject ?? "");
          const preheader = String(d.preheader ?? "");
          if (htmlContent || subject || preheader) {
            map.set(email_template_id, { subject, preheader, html: htmlContent });
          }
        } catch (e) {
          console.warn(`[Braze Sync] template fetch failed id=${email_template_id}:`, (e as Error)?.message ?? e);
        }
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
  }
  return map;
}

/**
 * Normalized `raw_steps` from canvas detail step rows + optional template map (shared by full sync and touchpoints_only).
 */
function buildRawStepsFromDetailRows(
  detailStepRows: Array<Record<string, unknown>>,
  templateHtmlMap: Map<string, { subject: string; preheader: string; html: string }>,
  logCanvasId?: string,
): Record<string, unknown> {
  const steps: Record<string, unknown> = {};
  for (const s of detailStepRows) {
    const stepId = String(
      s.id ??
        s.api_id ??
        s.step_id ??
        (s as { canvas_step_id?: unknown }).canvas_step_id ??
        (s as { step_api_id?: unknown }).step_api_id ??
        "",
    ).trim();
    if (!stepId) {
      if (logCanvasId) {
        console.warn(
          `[Braze Sync] canvas ${logCanvasId}: skip step without id (keys=${Object.keys(s).slice(0, 14).join(",")})`,
        );
      }
      continue;
    }

    const messages: Array<Record<string, unknown>> = [];
    if (s.messages && typeof s.messages === "object") {
      const entries = Array.isArray(s.messages)
        ? (s.messages as unknown[]).map((m, idx) => [`message_${idx}`, m])
        : Object.entries(s.messages);

      for (const [msgKey, msgData] of entries) {
        const msg = msgData as Record<string, unknown>;
        const inferredChannel = typeof msgKey === "string" ? msgKey : undefined;
        let channel =
          (msg.channel as string) || inferredChannel || firstChannelFromStepRow(s) || "";
        if (!channel && inferredChannel && isMessagingChannelForSync(inferredChannel)) {
          channel = inferredChannel;
        }
        if (!channel) channel = "email";

        const templateId = brazeMessageTemplateId(msg);
        let subject = msg.subject as string | undefined;
        let preheader = msg.preheader as string | undefined;
        let html: string | undefined;

        if (channel === "email" && templateId && templateHtmlMap.has(templateId)) {
          const tpl = templateHtmlMap.get(templateId)!;
          html = tpl.html || undefined;
          subject = subject || tpl.subject || undefined;
          preheader = preheader || tpl.preheader || undefined;
        } else if (channel === "email") {
          html = truncateHtml((msg.body as string) || (msg.html_body as string));
        }

        messages.push({
          channel,
          subject,
          preheader,
          title: msg.title || msg.header,
          body: msg.message || msg.alert || msg.body || msg.plaintext_body,
          html_content: html,
          image_url: msg.image_url || msg.big_image,
          buttons: msg.buttons,
        });
      }
    }

    if (messages.length === 0 && s.message && typeof s.message === "object") {
      const msg = s.message as Record<string, unknown>;
      const channel =
        (msg.channel as string) ||
        (typeof s.channels === "object" && Array.isArray(s.channels) ? String(s.channels[0]) : "") ||
        (s.channel as string) ||
        "email";
      messages.push({
        channel,
        subject: msg.subject as string | undefined,
        preheader: msg.preheader as string | undefined,
        title: msg.title || msg.header,
        body: msg.message || msg.body || msg.alert,
        html_content: truncateHtml((msg.body as string) || (msg.html_body as string)),
      });
    }

    const hasSubstantiveMessage = messages.some(
      (m) =>
        (typeof m.subject === "string" && m.subject.trim() !== "") ||
        (typeof m.html_content === "string" && m.html_content.trim() !== "") ||
        (typeof m.body === "string" && m.body.trim() !== "") ||
        (typeof m.title === "string" && m.title.trim() !== ""),
    );
    const chObj = s.channels;
    const needsChannelCreative =
      chObj && typeof chObj === "object" && !Array.isArray(chObj) && !hasSubstantiveMessage;
    if (needsChannelCreative) {
      if (messages.length > 0) messages.length = 0;
      appendMessagesFromChannelsObject(s, messages, templateHtmlMap);
    }

    if (messages.length === 0) {
      const stCh = firstChannelFromStepRow(s) ?? "";
      if (stCh && isMessagingChannelForSync(stCh)) {
        // Log exactly what messages/channels look like so we can diagnose missing subjects.
        if (logCanvasId) {
          const messagesSnap = s.messages == null
            ? "null"
            : JSON.stringify(s.messages).slice(0, 600);
          const channelsSnap = s.channels == null
            ? "null"
            : JSON.stringify(s.channels).slice(0, 300);
          console.warn(
            `[Braze Sync][empty-msg] canvas=${logCanvasId} step=${stepId} name=${JSON.stringify(s.name)} channel=${stCh}` +
            ` messages=${messagesSnap} channels=${channelsSnap}`,
          );
        }
        messages.push({ channel: stCh });
      }
    }

    if (
      messages.length === 0 &&
      (s.email_template_id || s.template_id || s.linked_email_template_id || s.html_template_id ||
        s.subject || s.title)
    ) {
      const tid = brazeMessageTemplateId(s);
      let subject = (s.subject || s.title) as string | undefined;
      let preheader = s.preheader as string | undefined;
      let html: string | undefined;
      if (tid && templateHtmlMap.has(String(tid))) {
        const tpl = templateHtmlMap.get(String(tid))!;
        html = tpl.html || undefined;
        subject = subject || tpl.subject || undefined;
        preheader = preheader || tpl.preheader || undefined;
      }
      messages.push({
        channel: "email",
        subject,
        preheader,
        html_content: html,
      });
    }

    const nextPaths: Array<{ name: string; next_step_id: string; percentage?: number }> = [];
    if (Array.isArray(s.next_paths) && s.next_paths.length > 0) {
      for (const p of s.next_paths) {
        const pr = p as Record<string, unknown>;
        const nid = String(
          pr.next_step_id ?? pr.nextStepId ?? pr.next_canvas_step_id ?? "",
        ).trim();
        nextPaths.push({
          name: (pr.name as string) || "Path",
          next_step_id: nid,
          percentage: typeof pr.percentage === "number" ? pr.percentage : undefined,
        });
      }
    }

    const delayObj = s.delay as { value?: number } | undefined;
    const delaySecondsParsed =
      typeof delayObj?.value === "number"
        ? delayObj.value
        : typeof (s as { delay_seconds?: number }).delay_seconds === "number"
          ? (s as { delay_seconds: number }).delay_seconds
          : typeof (s as { wait_seconds?: number }).wait_seconds === "number"
            ? (s as { wait_seconds: number }).wait_seconds
            : undefined;

    const nextStepIdsFromPaths = nextPaths.map((p) => p.next_step_id).filter(Boolean);
    const nextStepIds = Array.isArray(s.next_step_ids) && s.next_step_ids.length > 0
      ? (s.next_step_ids as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : nextStepIdsFromPaths;

    const rawStepType = String(s.type ?? "message");
    let resolvedChannel = (firstChannelFromStepRow(s) || messages[0]?.channel) as string | undefined;
    if (!resolvedChannel && rawStepType.includes("/")) {
      const tail = rawStepType.split("/").pop()?.toLowerCase() ?? "";
      if (
        tail === "email" ||
        tail === "sms" ||
        tail === "webhook" ||
        tail.includes("push") ||
        tail.includes("in_app") ||
        tail.includes("in-app")
      ) {
        resolvedChannel = tail;
      }
    }

    steps[stepId] = {
      id: stepId,
      name: (s.name || s.type || "Step") as string,
      type: rawStepType,
      channel: resolvedChannel,
      delay_seconds: delaySecondsParsed,
      delay_formatted:
        typeof delaySecondsParsed === "number" ? formatDelay(delaySecondsParsed) : undefined,
      next_step_ids: nextStepIds,
      next_paths: nextPaths.length > 0 ? nextPaths : undefined,
      messages: messages.length > 0 ? messages : undefined,
    };
  }
  return steps;
}

/** List endpoints may use `canvases`, `campaigns`, or nest under `data`. */
function getBrazeListArray(
  raw: Record<string, unknown>,
  keys: string[],
): unknown[] {
  for (const k of keys) {
    const v = raw[k];
    if (Array.isArray(v)) return v;
  }
  const nested = raw.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>;
    for (const k of keys) {
      const v = inner[k];
      if (Array.isArray(v)) return v;
    }
    if (Array.isArray(inner.data)) return inner.data;
    if (Array.isArray(inner.results)) return inner.results;
  }
  if (Array.isArray(nested)) return nested;
  const fromExport = brazeExportDataArray(raw);
  return fromExport;
}

function normalizeStringArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>).map((x) => String(x));
  }
  return [];
}

function kpiNumericFromRow(
  row: Record<string, unknown>,
  metric: "dau" | "mau" | "new_users",
): number {
  const stats = row.stats as Record<string, unknown> | undefined;
  const data = row.data as Record<string, unknown> | undefined;
  const pick = (keys: string[]): number => {
    for (const k of keys) {
      for (const src of [row, stats, data]) {
        if (!src || typeof src !== "object") continue;
        const v = (src as Record<string, unknown>)[k];
        if (v === undefined || v === null) continue;
        const n = typeof v === "string" ? Number(v.trim()) : Number(v);
        if (Number.isFinite(n)) return n;
      }
    }
    return 0;
  };
  if (metric === "dau") {
    return pick([
      "dau",
      "DAU",
      "daily_active_users",
      "unique_users",
      "daily_active",
    ]);
  }
  if (metric === "mau") {
    return pick(["mau", "MAU", "monthly_active_users", "monthly_active"]);
  }
  const nu = pick([
    "new_users",
    "new_users_count",
    "daily_new_users",
    "new_user_count",
    "signups",
  ]);
  if (nu !== 0) return nu;
  const val = row.value ?? stats?.value ?? data?.value;
  const n = typeof val === "string" ? Number(val.trim()) : Number(val);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalizes Braze KPI `data_series` JSON into dated points. Handles:
 * - `data: [ { time, dau|mau|new_users } ]`
 * - Parallel arrays under `data`: time + metric arrays (some API variants)
 */
function normalizeBrazeKpiSeries(
  json: Record<string, unknown>,
  metric: "dau" | "mau" | "new_users",
): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];
  const rows = brazeExportDataArray(json) as Array<Record<string, unknown>>;
  if (rows.length === 0 && json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
    const d = json.data as Record<string, unknown>;
    const times = (d.time ?? d.times ?? d.dates ?? d.date) as unknown;
    const valKey =
      metric === "dau" ? "dau" : metric === "mau" ? "mau" : "new_users";
    const vals =
      (d[valKey] as unknown) ??
      (d[metric] as unknown) ??
      (d.values as unknown) ??
      (d.series as unknown);
    if (Array.isArray(times) && Array.isArray(vals) && times.length === vals.length) {
      for (let i = 0; i < times.length; i++) {
        const date = seriesDateFromBrazeKpi(times[i]);
        const v = Number(vals[i]);
        if (date && Number.isFinite(v)) out.push({ date, value: v });
      }
      if (out.length > 0) return out;
    }
  }
  for (const row of rows) {
    const date = seriesDateFromBrazeKpi(row.time ?? row.date ?? row.day);
    if (!date) continue;
    const value = kpiNumericFromRow(row, metric);
    out.push({ date, value });
  }
  return out;
}

function extractEmailEventRecords(j: Record<string, unknown>): Array<Record<string, unknown>> {
  const emails = j.emails;
  if (Array.isArray(emails)) return emails as Array<Record<string, unknown>>;
  const bounced = j.bounces ?? j.bounced_emails;
  if (Array.isArray(bounced)) return bounced as Array<Record<string, unknown>>;
  const unsub = j.unsubscribes ?? j.unsubscribed_emails;
  if (Array.isArray(unsub)) return unsub as Array<Record<string, unknown>>;
  const recipients = j.recipients;
  if (Array.isArray(recipients)) {
    return recipients as Array<Record<string, unknown>>;
  }
  if (Array.isArray(j.data)) {
    const arr = j.data as unknown[];
    if (
      arr.length > 0 &&
      arr[0] &&
      typeof arr[0] === "object" &&
      ("email" in (arr[0] as object) ||
        "address" in (arr[0] as object) ||
        "hard_bounced_at" in (arr[0] as object) ||
        "unsubscribed_at" in (arr[0] as object))
    ) {
      return arr as Array<Record<string, unknown>>;
    }
  }
  const fromData = brazeExportDataArray(j);
  if (fromData.length > 0) return fromData as Array<Record<string, unknown>>;
  return [];
}

function pickEmailEventTime(
  e: Record<string, unknown>,
  preferred: "hard_bounce" | "unsubscribe",
): string {
  const keys =
    preferred === "hard_bounce"
      ? [
          "hard_bounced_at",
          "hard_bounce_at",
          "bounced_at",
          "bounce_date",
          "event_time",
          "created_at",
          "date",
        ]
      : [
          "unsubscribed_at",
          "unsubscribe_at",
          "opt_out_at",
          "event_time",
          "created_at",
          "date",
        ];
  for (const k of keys) {
    const v = e[k];
    if (v === undefined || v === null) continue;
    const iso = toIso(v);
    if (iso) return iso;
    if (typeof v === "string" && v.trim() !== "") {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return new Date(t).toISOString();
    }
  }
  return new Date().toISOString();
}

function pickEmailAddress(e: Record<string, unknown>): string {
  const raw =
    e.email ??
    e.address ??
    e.user_email ??
    e.recipient ??
    e.email_address ??
    e.recipient_address ??
    e.to_address ??
    e.destination ??
    (e.user as Record<string, unknown> | undefined)?.email;
  return String(raw ?? "").trim();
}

async function pruneBrazeStorageForClient(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
): Promise<void> {
  const cid = String(clientId);
  try {
    if (PRUNE_EMAIL_EVENTS_DAYS > 0) {
      const cutoff = new Date(Date.now() - PRUNE_EMAIL_EVENTS_DAYS * 86400000).toISOString();
      const { error } = await supabase.from("braze_email_events").delete().eq("client_id", cid).lt(
        "occurred_at",
        cutoff,
      );
      if (error) console.warn("[Braze Sync] prune braze_email_events:", error.message);
      else {
        console.log(
          `[Braze Sync] Pruned braze_email_events for client (occurred_at < ${PRUNE_EMAIL_EVENTS_DAYS}d ago)`,
        );
      }
    }
    if (PRUNE_SYNC_RUN_DAYS > 0) {
      const cutoff = new Date(Date.now() - PRUNE_SYNC_RUN_DAYS * 86400000).toISOString();
      const { error } = await supabase.from("braze_sync_runs").delete().eq("client_id", cid).lt(
        "started_at",
        cutoff,
      );
      if (error) console.warn("[Braze Sync] prune braze_sync_runs:", error.message);
      else {
        console.log(
          `[Braze Sync] Pruned braze_sync_runs for client (started_at < ${PRUNE_SYNC_RUN_DAYS}d ago)`,
        );
      }
    }
    if (PRUNE_KPI_SERIES_DAYS > 0) {
      const cutoffDate = new Date(Date.now() - PRUNE_KPI_SERIES_DAYS * 86400000).toISOString().slice(0, 10);
      const { error } = await supabase.from("braze_kpi_series").delete().eq("client_id", cid).lt(
        "series_date",
        cutoffDate,
      );
      if (error) console.warn("[Braze Sync] prune braze_kpi_series:", error.message);
      else {
        console.log(`[Braze Sync] Pruned braze_kpi_series for client (series_date before ${cutoffDate})`);
      }
    }
  } catch (e) {
    console.warn("[Braze Sync] pruneBrazeStorageForClient:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  /** Declared on the handler (not inside `try`) so segment/scheduled counters stay in scope for schema_cache and response. */
  let segmentsSynced = 0;
  let scheduledBroadcastsCount = 0;
  let apiScheduledListed = 0;

  try {
    const body = (await req.json()) as {
      clientId?: string;
      platformId?: string;
      restEndpoint?: string;
      force_canvas_ids?: unknown;
      touchpoints_only?: unknown;
      campaigns_only?: unknown;
      canvas_offset?: unknown;
      /** Test mode: parse a single canvas and return debug data without writing to DB. */
      mode?: string;
      canvas_id?: string;
      /** Required for test mode when calling outside of a user session. Must match SUPABASE_SERVICE_ROLE_KEY. */
      service_key?: string;
    };

    const isTestMode = body.mode === "test";

    // Test mode requires BRAZE_SYNC_TEST_SECRET (set via `supabase secrets set`).
    // Normal mode requires a signed-in user JWT.
    const testSecret = Deno.env.get("BRAZE_SYNC_TEST_SECRET") ?? "";
    const testModeKeyValid =
      isTestMode &&
      testSecret.length > 0 &&
      body.service_key === testSecret;

    let authResult: Awaited<ReturnType<typeof validateAuth>> | null = null;
    if (!testModeKeyValid) {
      authResult = await validateAuth(req);
      if (!authResult.success) {
        return authErrorResponse(authResult.error!, authResult.status!, corsHeaders);
      }
    }

    const { clientId, platformId, restEndpoint } = body;
    const touchpointsOnly = body.touchpoints_only === true;
    const campaignsOnly = body.campaigns_only === true;
    const forceCanvasIds: string[] = Array.isArray(body.force_canvas_ids)
      ? body.force_canvas_ids.map((x) => String(x).trim()).filter(Boolean)
      : [];

    console.log(`[Braze Sync] Mode: ${campaignsOnly ? 'CAMPAIGNS_ONLY' : touchpointsOnly ? 'TOUCHPOINTS_ONLY' : 'FULL'} | clientId=${clientId} | platformId=${platformId}`);

    if (!clientId || !platformId) {
      throw new Error('clientId and platformId are required');
    }

    if (!testModeKeyValid && !authResult?.userId) {
      return authErrorResponse('Unauthorized', 401, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Service role = full access; skip per-user client membership check for test mode.
    if (!testModeKeyValid) {
      const accessResult = await validateClientAccessForEdge(
        supabase,
        authResult!.userId!,
        clientId!,
      );
      if (!accessResult.success) {
        return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
      }
    }

    const { data: platform, error: platformError } = await supabase
      .from('client_platforms')
      .select('*')
      .eq('id', platformId)
      .single();

    if (platformError || !platform) {
      throw new Error('Platform connection not found');
    }

    if (String(platform.client_id) !== String(clientId)) {
      return authErrorResponse(
        'Platform connection does not belong to this client',
        400,
        corsHeaders,
      );
    }

    if (platform.platform !== 'braze') {
      throw new Error('This endpoint only supports Braze');
    }

    const apiKey = platform.api_key;
    if (!apiKey) {
      throw new Error('No API key configured for this platform');
    }

    // Precedence: explicit request override > global env default > saved per-platform endpoint.
    // This prevents stale user-level `additional_config.rest_endpoint` from overriding
    // your project-wide BRAZE_REST_URL (admin may work while members still point to old cluster).
    const brazeRestEndpoint = normalizeRestEndpointUrl(
      restEndpoint ||
        Deno.env.get("BRAZE_REST_URL") ||
        (platform.additional_config as Record<string, unknown>)?.rest_endpoint ||
        FALLBACK_BRAZE_REST_URL,
    );

    const addCfg = ((platform.additional_config as Record<string, unknown> | null) ?? {}) as Record<
      string,
      unknown
    >;
    // KPI: default to workspace aggregate (all apps). Only pass app_id when
    // additional_config.braze_kpi_app_id is set (do not reuse braze_app_id; that often
    // scopes KPI too low vs workspace totals the user sees in Braze).
    const brazeKpiAppId = String(addCfg.braze_kpi_app_id ?? "").trim();
    const kpiAppQuery = brazeKpiAppId ? `&app_id=${encodeURIComponent(brazeKpiAppId)}` : "";

    // ── TEST MODE ──────────────────────────────────────────────────────────────
    // Pass { mode: "test", canvas_id: "<id>" } to parse one canvas and return
    // the raw debug data without writing anything to the database.
    if (body.mode === "test") {
      const testCanvasId = (body.canvas_id ?? "").trim();
      if (!testCanvasId) {
        return new Response(
          JSON.stringify({ error: "canvas_id is required for test mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.log(`[Braze Sync][TEST] canvas_id=${testCanvasId}`);
      const details = (await brazeFetch(
        `canvas/details?canvas_id=${encodeURIComponent(testCanvasId)}`,
        apiKey,
        brazeRestEndpoint,
      )) as Record<string, unknown>;

      const canvasNested = details.canvas as Record<string, unknown> | undefined;
      const detailStepRows = collectCanvasDetailStepRows(details, canvasNested);
      const templateIds = collectEmailTemplateIdsFromDetailRows(detailStepRows);
      const touchTemplateMap = await fetchEmailTemplatesByIds(
        templateIds, apiKey, brazeRestEndpoint, 10,
      );
      const stepsObj = buildRawStepsFromDetailRows(detailStepRows, touchTemplateMap, testCanvasId);

      // Sample the first 5 raw step rows so we can see exactly what comes from the API.
      const rawSamples = detailStepRows.slice(0, 5).map((s) => ({
        id: s.id ?? s.api_id ?? s.step_id,
        name: s.name,
        type: s.type,
        channel: s.channel,
        has_messages: s.messages != null,
        messages_is_array: Array.isArray(s.messages),
        messages_keys: (s.messages && !Array.isArray(s.messages) && typeof s.messages === "object")
          ? Object.keys(s.messages as Record<string, unknown>).slice(0, 5)
          : null,
        messages_first_value: (s.messages && !Array.isArray(s.messages) && typeof s.messages === "object")
          ? JSON.stringify(Object.values(s.messages as Record<string, unknown>)[0]).slice(0, 500)
          : s.messages != null ? JSON.stringify(s.messages).slice(0, 500) : null,
        has_channels: s.channels != null,
        channels_keys: (s.channels && typeof s.channels === "object" && !Array.isArray(s.channels))
          ? Object.keys(s.channels as Record<string, unknown>)
          : null,
      }));

      // Sample the first 5 parsed (built) steps.
      const parsedSamples = Object.entries(stepsObj).slice(0, 5).map(([k, v]) => ({
        id: k,
        step: JSON.parse(JSON.stringify(v)), // clone to include all fields
      }));

      // Variants with first_step_id
      const variants = Array.isArray(details.variants)
        ? (details.variants as Array<Record<string, unknown>>).map((v) => ({
            name: v.name,
            percentage: v.percentage,
            first_step_id: v.first_step_id ?? v.firstStepId ?? v.first_canvas_step_id ?? null,
          }))
        : null;

      // Channel breakdown of all parsed steps
      const channelCounts: Record<string, number> = {};
      for (const [, v] of Object.entries(stepsObj)) {
        const s = v as Record<string, unknown>;
        const ch = String(s.channel ?? "unknown");
        channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
      }

      // Steps with empty next_step_ids (terminal steps)
      const terminalSteps = Object.entries(stepsObj)
        .filter(([, v]) => {
          const s = v as Record<string, unknown>;
          return !Array.isArray(s.next_step_ids) || (s.next_step_ids as unknown[]).length === 0;
        })
        .map(([k, v]) => ({ id: k, name: (v as Record<string, unknown>).name, channel: (v as Record<string, unknown>).channel }));

      return new Response(
        JSON.stringify({
          canvas_id: testCanvasId,
          details_top_keys: Object.keys(details).sort(),
          canvas_nested_keys: canvasNested ? Object.keys(canvasNested).sort() : null,
          detail_step_rows_count: detailStepRows.length,
          template_ids_found: templateIds,
          templates_loaded: touchTemplateMap.size,
          parsed_steps_count: Object.keys(stepsObj).length,
          variants,
          channel_breakdown: channelCounts,
          terminal_steps: terminalSteps,
          raw_step_samples: rawSamples,
          parsed_step_samples: parsedSamples,
        }, null, 2),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // ── END TEST MODE ──────────────────────────────────────────────────────────

    console.log("[Braze Sync] START — clientId=", clientId, "REST=", brazeRestEndpoint);
    if (touchpointsOnly) {
      console.log(
        "[Braze Sync] TOUCHPOINTS_ONLY: canvas list + Phase 3 for ALL canvases (total_steps/raw_steps only); no cap, no time budget; skipping KPI, email, campaigns, segments, scheduled_broadcasts",
      );
    }
    if (forceCanvasIds.length > 0) {
      console.log(
        "[Braze Sync] force_canvas_ids:",
        forceCanvasIds.length,
        forceCanvasIds,
        "(these canvases will always get Phase 3 detail, in addition to top-N by priority)",
      );
    }
    console.log(
      "[Braze Sync] KPI scope:",
      brazeKpiAppId ? `app_id=${brazeKpiAppId} (from additional_config.braze_kpi_app_id)` : "workspace aggregate — no app_id (omit braze_kpi_app_id for full-workspace KPI)",
    );

    // Wall clock starts before prune so budget includes prune + sync-run insert + all phases (avoids 504 when prune is slow).
    const syncStart = Date.now();
    const maxWallMs = maxSyncWallMs();
    const syncOverBudgetPreview = () => Date.now() - syncStart > maxWallMs;

    /** When set, skip KPI / email / campaigns / segments / scheduled_broadcasts; canvas list + Phase 3 for forced IDs only. */
    const FORCE_CANVAS_FAST_PATH =
      !touchpointsOnly && forceCanvasIds.length > 0 && forceCanvasIds.length < 10;

    /** KPI, Phase 1b, email, Phase 4+ — skipped for fast path or touchpoints-only sync. */
    const skipHeavySyncPhases = FORCE_CANVAS_FAST_PATH || touchpointsOnly || campaignsOnly;

    if (!skipHeavySyncPhases) {
      await pruneBrazeStorageForClient(supabase, String(clientId));
    } else if (FORCE_CANVAS_FAST_PATH) {
      console.log(
        "[Braze Sync] FORCE_CANVAS_FAST_PATH: skipping storage prune, KPI, email events, full canvas minimal upsert, campaigns, segments, scheduled_broadcasts",
      );
    } else if (touchpointsOnly) {
      console.log(
        "[Braze Sync] TOUCHPOINTS_ONLY: skipping storage prune and all phases except canvas list + Phase 3",
      );
    }

    if (!touchpointsOnly && syncOverBudgetPreview()) {
      console.warn("[Braze Sync] Wall budget exhausted during prune; returning partial without main sync.");
      const nowIsoEarly = new Date().toISOString();
      return new Response(
        JSON.stringify({
          success: true,
          partial: true,
          stopped_reason: "time_budget",
          warning: "Sync stopped: storage prune used the full time budget. Run sync again.",
          data: { saved_at: nowIsoEarly, duration_ms: Date.now() - syncStart, counts: {} },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // === Create sync run entry ===
    const { data: syncRun } = await supabase
      .from('braze_sync_runs')
      .insert({ client_id: clientId, platform_id: platformId, status: 'running' })
      .select('id')
      .single();
    const syncRunId = syncRun?.id as string | undefined;
    const nowIso = new Date().toISOString();

    let canvasMinimalUpserted = 0;
    let campaignsProcessedCount = 0;
    let campaignsEnabledCount = 0;
    let campaignAnalyticsRowsUpserted = 0;
    let allCampaignList: CampaignListItem[] = [];
    let kpiSeriesPoints = 0;
    let kpiLatestDau = 0;
    let kpiLatestMau = 0;
    let kpiNewUsers30Sum = 0;

    const syncOverBudget = () =>
      touchpointsOnly ? false : Date.now() - syncStart > maxWallMs;
    let syncPartial = false;
    let syncStoppedReason: string | null = null;
    let emailHardBounceRows = 0;
    let emailUnsubRows = 0;
    let emailEventsSynced = 0;
    const dbWriteErrors: string[] = [];
    const pushDbErr = (label: string, err: { message?: string } | null | undefined) => {
      const m = err?.message;
      if (m && dbWriteErrors.length < 12) dbWriteErrors.push(`${label}: ${m}`);
    };
    /** Rows parsed from Braze before DB — distinguishes API shape issues vs write failures */
    let apiKpiPointsParsed = 0;
    let apiEmailRecordsSeen = 0;
    let apiSegmentsListed = 0;
    console.log("[Braze Sync] Wall time budget (ms):", maxWallMs, "max_canvas_detail:", MAX_CANVASES_TO_PROCESS);
    console.log(
      "[Braze Sync] Phase 3 drafts:",
      EXCLUDE_DRAFT_FROM_CANVAS_DETAIL ? "excluded (BRAZE_SYNC_EXCLUDE_DRAFT_CANVAS_DETAIL=true)" : "included in detail queue",
    );
    console.log(
      "[Braze Sync] Retention prune (per client): email_events_days=",
      PRUNE_EMAIL_EVENTS_DAYS,
      "sync_runs_days=",
      PRUNE_SYNC_RUN_DAYS,
      "kpi_series_days=",
      PRUNE_KPI_SERIES_DAYS,
      "(0=off)",
    );

    // === PHASE KPI (early): braze_kpi_series — runs before heavy canvas/campaign work to survive ~150s Edge limit ===
    if (!skipHeavySyncPhases) {
    console.log("[SYNC] Starting: kpi_metrics");
    console.log('[START] KPI series (braze_kpi_series) — DAU / MAU / new_users');
    const endingAtEncKpi = encodeURIComponent(new Date().toISOString());
    const kpiMetricsEarly: Array<{ metric: 'dau' | 'mau' | 'new_users'; path: string }> = [
      { metric: 'dau', path: `kpi/dau/data_series?length=${KPI_LENGTH_DAU}&ending_at=${endingAtEncKpi}${kpiAppQuery}` },
      { metric: 'mau', path: `kpi/mau/data_series?length=${KPI_LENGTH_MAU}&ending_at=${endingAtEncKpi}${kpiAppQuery}` },
      { metric: 'new_users', path: `kpi/new_users/data_series?length=${KPI_LENGTH_NEW_USERS}&ending_at=${endingAtEncKpi}${kpiAppQuery}` },
    ];
    for (const { metric, path } of kpiMetricsEarly) {
      try {
        console.log(`[START] KPI fetch metric=${metric}`);
        console.log(`[Braze Sync] KPI request: ${path.split('?')[0]} params=${path.split('?')[1] ?? ''}`);
        const kpiJson = (await brazeFetch(path, apiKey, brazeRestEndpoint)) as Record<string, unknown>;
        const rawSnippet = JSON.stringify(kpiJson).slice(0, 300);
        if (metric === 'new_users') {
          console.log('[Braze Sync] New users raw response:', rawSnippet);
        } else if (metric === 'dau') {
          console.log('[Braze Sync] DAU raw response:', rawSnippet);
        } else {
          console.log('[Braze Sync] MAU raw response:', rawSnippet);
        }
        const msg = kpiJson.message;
        if (msg != null && String(msg).toLowerCase() !== 'success') {
          console.warn(`[Braze Sync] KPI ${metric} API message:`, msg);
        }
        const points = normalizeBrazeKpiSeries(kpiJson, metric);
        apiKpiPointsParsed += points.length;
        console.log(
          `[API] kpi_${metric} parsed_series_points:`,
          points.length,
          'raw_data_array_len:',
          brazeExportDataArray(kpiJson).length,
        );
        console.log(
          `[Braze Sync] KPI ${metric}: parsed_points=${points.length} response_keys=${Object.keys(kpiJson).join(',')}`,
        );
        if (points.length > 0) {
          const sortedDesc = [...points].sort((a, b) => b.date.localeCompare(a.date));
          if (metric === 'dau') kpiLatestDau = sortedDesc[0]?.value ?? 0;
          if (metric === 'mau') kpiLatestMau = sortedDesc[0]?.value ?? 0;
          if (metric === 'new_users') {
            kpiNewUsers30Sum = points.reduce(
              (s, p) => s + (Number.isFinite(p.value) ? p.value : 0),
              0,
            );
          }
          const sample = points.slice(-3);
          console.log(`[Braze Sync] KPI ${metric}: sample_tail=`, JSON.stringify(sample));
        }
        const rows = points.map((p) => ({
          client_id: clientId,
          metric,
          series_date: p.date,
          value: Number.isFinite(p.value) ? p.value : 0,
          synced_at: nowIso,
        }));
        if (rows.length > 0) {
          console.log('[DB WRITE] braze_kpi_series attempting to write:', rows.length, 'rows metric=', metric);
          const { error: kpiErr } = await supabase.from('braze_kpi_series').upsert(rows, {
            onConflict: 'client_id,metric,series_date',
          });
          console.log(
            "[DB WRITE]",
            "braze_kpi_series",
            "error:",
            kpiErr?.message ?? "none",
            "rows:",
            rows.length,
          );
          console.log('[DB RESULT] braze_kpi_series error:', kpiErr?.message ?? 'none');
          if (kpiErr) {
            console.warn('braze_kpi_series upsert:', kpiErr.message);
            pushDbErr('braze_kpi_series', kpiErr);
          }
          else {
            kpiSeriesPoints += rows.length;
            const sortedTip = [...rows].sort((a, b) => {
              const c = String(b.series_date).localeCompare(String(a.series_date));
              return c !== 0 ? c : Number(b.value) - Number(a.value);
            });
            const tip = sortedTip[0];
            console.log(
              `KPI ${metric}: upserted ${rows.length} rows; latest_stored_date=${tip?.series_date} value=${tip?.value}`,
            );
          }
        } else {
          console.warn(
            `[Braze Sync] KPI ${metric}: no rows after normalize — check kpi.${metric}.data_series permission and response shape`,
          );
        }
      } catch (e) {
        console.error(`[Braze Sync] KPI ${metric} sync failed:`, e);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    }

    // === PHASE 1: Fetch ALL canvas IDs with names (lightweight) — paginate until empty ===
    console.log('[SYNC] Starting: canvases');
    const allCanvasList: CanvasListItem[] = [];
    const seenIds = new Set<string>();
    let canvasPage = 0;

    if (campaignsOnly) {
      console.log('[Braze Sync] CAMPAIGNS_ONLY: skipping canvas list fetch and all canvas phases');
    } else {
    console.log('[Braze Sync] Fetching canvas list (paginated, include_archived=false)...');
    while (canvasPage < 50) {
      try {
        const canvasesData = (await brazeFetch(
          `canvas/list?page=${canvasPage}&include_archived=false&limit=100`,
          apiKey,
          brazeRestEndpoint
        )) as Record<string, unknown>;
        const canvases = getBrazeListArray(canvasesData, [
          "canvases",
          "canvas",
          "items",
        ]) as CanvasListItem[];
        console.log(
          `[Braze Sync] Canvases page ${canvasPage} — count:`,
          canvases.length,
        );
        if (canvasPage === 0) {
          console.log(
            '[Braze Sync] Canvases page 0 raw (truncated):',
            JSON.stringify(canvasesData).slice(0, 300),
          );
        }

        if (canvases.length === 0) break;

        for (const rawC of canvases) {
          const c = rawC as CanvasListItem;
          const cid = String(c?.id ?? (rawC as Record<string, unknown>)?.canvas_id ?? "").trim();
          if (!cid) continue;
          const normalized: CanvasListItem = {
            ...c,
            id: cid,
            name: c?.name || "Canvas",
          };
          if (!seenIds.has(cid)) {
            seenIds.add(cid);
            allCanvasList.push(normalized);
          }
        }

        canvasPage++;
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        logger.error(`Failed to fetch canvas page ${canvasPage}:`, err);
        break;
      }
    }

    console.log(
      `Total canvases found (list API, paginated): ${allCanvasList.length}`,
    );
    } // end else (!campaignsOnly) — canvas list fetch

    // === PHASE 1b: Upsert every canvas from list (minimal row) so DB count matches Braze ===
    // Runs even when FORCE_CANVAS_FAST_PATH (so canvas/data_series .update has rows to target).
    if (!touchpointsOnly && !campaignsOnly) {
    const minimalChunks: CanvasListItem[][] = [];
    for (let i = 0; i < allCanvasList.length; i += 40) {
      minimalChunks.push(allCanvasList.slice(i, i + 40));
    }
    for (const chunk of minimalChunks) {
      const minimalRows = chunk.map((c) => {
        const enabledList = inferCanvasEnabledFromListItem(c);
        // Phase 1: list/metadata only. Never set raw_steps, total_steps, or raw_variants here — those
        // belong to Phase 3 only; writing empty values would wipe good detail rows every sync.
        return {
          client_id: clientId,
          braze_canvas_id: c.id,
          name: c.name || "Canvas",
          description: c.description ?? null,
          draft: c.draft ?? false,
          enabled: enabledList,
          archived: c.archived ?? false,
          tags: normalizeStringArray(c.tags),
          created_in_braze: c.created_at || null,
          updated_in_braze: c.updated_at || null,
          synced_at: nowIso,
        };
      });
      if (minimalRows.length === 0) continue;
      const { error: minErr } = await supabase
        .from("braze_canvases")
        .upsert(minimalRows, { onConflict: "client_id,braze_canvas_id" });
      console.log(
        "[DB WRITE]",
        "braze_canvases",
        "error:",
        minErr?.message ?? "none",
        "rows:",
        minimalRows.length,
      );
      if (minErr) {
        console.warn("Canvas minimal batch upsert failed:", minErr.message);
        pushDbErr("braze_canvases(minimal)", minErr);
      } else {
        canvasMinimalUpserted += minimalRows.length;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    console.log(
      `Canvas minimal upsert: attempted ${allCanvasList.length}, saved ${canvasMinimalUpserted}`,
    );
    }

    // === PHASE EMAIL (early): hard bounces + unsubscribes — before heavy canvas/campaign/segment work ===
    if (!skipHeavySyncPhases) {
    const endDateStrEmail = new Date().toISOString().slice(0, 10);
    const startDateStrEmail = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    console.log(
      "[START] email hard_bounces + unsubscribes (early) → braze_email_events date range:",
      startDateStrEmail,
      "..",
      endDateStrEmail,
    );

    async function syncEmailEventPagesEarly(
      eventType: "hard_bounce" | "unsubscribe",
      apiSuffix: string,
    ): Promise<number> {
      console.log(
        "[SYNC] Starting:",
        eventType === "hard_bounce" ? "hard_bounces" : "unsubscribes",
      );
      console.log(`[START] fetching ${eventType} (${apiSuffix})`);
      let insertedTotal = 0;
      let offset = 0;
      const limit = 500;
      for (let p = 0; p < MAX_EMAIL_EVENT_PAGES; p++) {
        if (syncOverBudget()) {
          console.warn(
            `[Braze Sync] Time budget: stopping ${eventType} pagination early`,
          );
          syncPartial = true;
          syncStoppedReason = "time_budget";
          break;
        }
        try {
          const q =
            `${apiSuffix}?start_date=${startDateStrEmail}&end_date=${endDateStrEmail}&limit=${limit}&offset=${offset}&sort_direction=desc`;
          const fullUrl = `${String(brazeRestEndpoint).replace(/\/+$/, "")}/${q}`;
          if (p === 0) {
            console.log(`[API] ${eventType} exact URL (page 0):`, fullUrl);
          }
          console.log(
            `[Braze Sync] Email ${eventType}: GET ${apiSuffix} offset=${offset} limit=${limit} range=${startDateStrEmail}..${endDateStrEmail}`,
          );
          const j = (await brazeFetch(q, apiKey, brazeRestEndpoint)) as Record<string, unknown>;
          const records = extractEmailEventRecords(j);
          apiEmailRecordsSeen += records.length;
          const rawEmailsLen = Array.isArray(j.emails) ? j.emails.length : null;
          const rawBouncesLen = Array.isArray((j as { bounces?: unknown }).bounces)
            ? (j as { bounces: unknown[] }).bounces.length
            : null;
          console.log(
            `[API] ${eventType} count: emails=${rawEmailsLen ?? "n/a"} bounces=${rawBouncesLen ?? "n/a"} extracted=${records.length}`,
          );
          if (p === 0) {
            const label =
              eventType === "hard_bounce"
                ? "[Braze Sync] Hard bounces raw response:"
                : "[Braze Sync] Unsubscribes raw response:";
            console.log(label, JSON.stringify(j).slice(0, 300));
            console.log(
              `[Braze Sync] Email ${eventType}: raw_keys=${Object.keys(j).join(",")} record_count=${records.length}`,
            );
            if (records[0]) {
              console.log(`[Braze Sync] Email ${eventType}: sample_record=`, JSON.stringify(records[0]));
            }
          }
          if (records.length === 0) break;
          const rows = records
            .map((e) => {
              const em = pickEmailAddress(e);
              if (!em) return null;
              const at = pickEmailEventTime(e, eventType);
              return {
                client_id: clientId,
                event_type: eventType,
                email: em,
                occurred_at: at,
              };
            })
            .filter(Boolean) as Array<Record<string, unknown>>;
          if (records.length > 0 && rows.length === 0) {
            console.warn(
              `[Braze Sync] Email ${eventType}: ${records.length} records from API but 0 rows to insert — missing email field on records (check Braze response shape).`,
            );
          }
          if (rows.length > 0) {
            console.log("[DB WRITE] braze_email_events attempting to write:", rows.length, "rows", eventType, "page", p);
            const { error: evErr } = await supabase.from("braze_email_events").insert(rows, {
              ignoreDuplicates: true,
            });
            console.log(
              "[DB WRITE]",
              "braze_email_events",
              "error:",
              evErr?.message ?? "none",
              "rows:",
              rows.length,
            );
            console.log("[DB RESULT] braze_email_events error:", evErr?.message ?? "none");
            if (!evErr) {
              insertedTotal += rows.length;
              console.log(`[Braze Sync] Email ${eventType}: inserted ${rows.length} rows (page ${p})`);
            } else {
              console.warn("[Braze Sync] braze_email_events insert:", evErr.message);
              pushDbErr("braze_email_events", evErr);
            }
          }
          if (records.length < limit) break;
          offset += limit;
        } catch (err) {
          console.error(`[Braze Sync] ${eventType} sync page failed:`, err);
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      return insertedTotal;
    }

    emailHardBounceRows = await syncEmailEventPagesEarly("hard_bounce", "email/hard_bounces");
    emailUnsubRows = await syncEmailEventPagesEarly("unsubscribe", "email/unsubscribes");
    emailEventsSynced = emailHardBounceRows + emailUnsubRows;
    console.log(
      `[Braze Sync] Email events (early phase): hard_bounce_rows=${emailHardBounceRows} unsub_rows=${emailUnsubRows}`,
    );
    }

    // === PHASE 2: Resolve forced canvases; score rest unless FORCE_CANVAS_FAST_PATH ===
    /** Forced IDs always get Phase 3 (deduped); rest filled from priority slice up to MAX (full sync only). */
    const forcedIdSet = new Set<string>();
    const forcedCanvases: CanvasListItem[] = [];
    for (const fid of forceCanvasIds) {
      const found = allCanvasList.find((c) => String(c.id) === String(fid));
      if (found) {
        if (!forcedIdSet.has(found.id)) {
          forcedIdSet.add(found.id);
          forcedCanvases.push(found);
          console.log(
            `[Braze Sync][Phase3] force-included canvas id=${found.id} name=${JSON.stringify(found.name)} priority=${getCanvasPriority(found.name)}`,
          );
        }
      } else {
        console.warn(
          `[Braze Sync][Phase3] force_canvas_ids: no canvas with id "${fid}" in canvas/list results — skipped`,
        );
      }
    }

    /** Start index into allCanvasList for this touchpoints_only chunk (incremental sync). */
    let touchpointsStartOffsetForChunk = 0;
    let canvasesToProcess: CanvasListItem[];

    if (touchpointsOnly) {
      const { data: progressRow } = await supabase
        .from("client_sync_progress")
        .select("last_offset")
        .eq("client_id", clientId)
        .eq("platform_id", platformId)
        .eq("sync_kind", "braze_touchpoints")
        .maybeSingle();
      const dbLast = typeof progressRow?.last_offset === "number" ? progressRow.last_offset : 0;
      const b = body as { canvas_offset?: unknown };
      const hasExplicitOffset =
        typeof b.canvas_offset === "number" && Number.isFinite(b.canvas_offset);
      const resolvedOffset = hasExplicitOffset
        ? Math.max(0, Math.floor(b.canvas_offset as number))
        : dbLast;
      touchpointsStartOffsetForChunk = Math.min(resolvedOffset, allCanvasList.length);
      if (allCanvasList.length > 0 && touchpointsStartOffsetForChunk >= allCanvasList.length) {
        console.warn(
          "[Braze Sync] TOUCHPOINTS_ONLY: stored offset >= canvas list length — resetting to 0 (complete a full cycle or clear client_sync_progress)",
        );
        touchpointsStartOffsetForChunk = 0;
      }
      const sliceEnd = Math.min(
        touchpointsStartOffsetForChunk + TOUCHPOINTS_CHUNK_SIZE,
        allCanvasList.length,
      );
      canvasesToProcess = allCanvasList.slice(touchpointsStartOffsetForChunk, sliceEnd);
      console.log(
        `[Braze Sync] TOUCHPOINTS_ONLY: offset=${touchpointsStartOffsetForChunk} chunk=${canvasesToProcess.length}/${allCanvasList.length} (max ${TOUCHPOINTS_CHUNK_SIZE} per request; omit canvas_offset to resume from client_sync_progress)`,
      );
    } else if (FORCE_CANVAS_FAST_PATH) {
      canvasesToProcess = forcedCanvases;
      console.log(
        `[Braze Sync] FORCE_CANVAS_FAST_PATH: Phase 3 queue = ${canvasesToProcess.length} canvas(es) (forced only; requested ${forceCanvasIds.length} id(s)).`,
      );
    } else {
      console.log("Phase 2: Scoring canvases by lifecycle priority...");
      if (EXCLUDE_DRAFT_FROM_CANVAS_DETAIL) {
        console.log(
          "[Braze Sync] BRAZE_SYNC_EXCLUDE_DRAFT_CANVAS_DETAIL=true: draft canvases will not receive Phase 3 detail / raw_steps",
        );
      }
      const scoredCanvases = allCanvasList
        .filter((c) => !c.archived && (!EXCLUDE_DRAFT_FROM_CANVAS_DETAIL || !c.draft))
        .map((c) => ({
          canvas: c,
          priority: getCanvasPriority(c.name),
        }))
        .sort((a, b) => b.priority - a.priority);

      console.log(
        "Top 20 priority canvases:",
        scoredCanvases.slice(0, 20).map((s) => `${s.priority}: ${s.canvas.name}`),
      );

      const restAfterForced = scoredCanvases
        .map((s) => s.canvas)
        .filter((c) => !forcedIdSet.has(c.id));
      const scoredSlice = restAfterForced.slice(0, MAX_CANVASES_TO_PROCESS);
      canvasesToProcess = [...forcedCanvases, ...scoredSlice];

      const cutoffPriority =
        scoredCanvases.length >= MAX_CANVASES_TO_PROCESS
          ? scoredCanvases[MAX_CANVASES_TO_PROCESS - 1].priority
          : null;
      const cutoffName =
        scoredCanvases.length >= MAX_CANVASES_TO_PROCESS
          ? scoredCanvases[MAX_CANVASES_TO_PROCESS - 1].canvas.name
          : null;

      console.log("[Braze Sync][Phase3][debug] canvas list + detail selection:", {
        allCanvasList_length: allCanvasList.length,
        scored_eligible: scoredCanvases.length,
        max_detail_cap: MAX_CANVASES_TO_PROCESS,
        forced_count: forcedCanvases.length,
        scored_slice_count: scoredSlice.length,
        canvasesToProcess_length: canvasesToProcess.length,
        cutoff_priority_at_rank_max: cutoffPriority,
        cutoff_name_at_rank_max: cutoffName,
      });

      const alexTestMatcher = (n: string) => /alex\s*test/i.test(n);
      const alexMatches = scoredCanvases.filter((s) => alexTestMatcher(s.canvas.name));
      for (const s of alexMatches) {
        const rank = scoredCanvases.findIndex((x) => x.canvas.id === s.canvas.id) + 1;
        const inQueue = canvasesToProcess.some((c) => c.id === s.canvas.id);
        console.log("[Braze Sync][Phase3][debug] name matches /Alex Test/i:", {
          id: s.canvas.id,
          name: s.canvas.name,
          priority: s.priority,
          rank_in_priority_list: rank,
          in_phase3_detail_queue: inQueue,
          force_included: forcedIdSet.has(s.canvas.id),
        });
        if (!inQueue) {
          console.warn(
            `[Braze Sync][Phase3][debug] Canvas ${JSON.stringify(s.canvas.name)} NOT in detail queue — rank ${rank}, priority ${s.priority}` +
              (cutoffPriority != null
                ? ` (lowest priority that made the priority-slice-only cut: ${cutoffPriority}, "${cutoffName}")`
                : ""),
          );
        }
      }
      if (alexMatches.length === 0) {
        console.log(
          "[Braze Sync][Phase3][debug] No canvas name matched /alex\\s*test/i — if testing \"[Alex Test] Canvas\", rename or use force_canvas_ids with its braze canvas id",
        );
      }

      console.log(
        `[Braze Sync][Phase3] detail queue: ${canvasesToProcess.length} canvas(es) (${forcedCanvases.length} forced + ${scoredSlice.length} from priority slice)`,
      );
    }

    // === PHASE 3: Process canvases in small batches with immediate checkpointing ===
    const phase3BatchSize = touchpointsOnly ? 1 : BATCH_SIZE;
    console.log(
      touchpointsOnly
        ? "Phase 3 (touchpoints_only): one canvas at a time — full step/message shape + per-canvas template fetch + entry metadata"
        : `Phase 3: Processing canvas details in batches of ${phase3BatchSize}...`,
    );
    let processedCount = 0;
    let enabledCount = 0;
    let phase3CanvasesWithRawSteps = 0;
    let phase3DbWritesWithRawSteps = 0;
    /** Touchpoints slice: canvases completed this invoke (for cursor when stopping early on wall budget). */
    let touchpointsHandledInSlice = 0;

    // Build template map first (limited to 30 templates for memory). Touchpoints_only fetches templates per canvas instead.
    const templateHtmlMap = new Map<string, { subject: string; preheader: string; html: string }>();
    if (!touchpointsOnly && !campaignsOnly) {
      try {
        const templatesData = await brazeFetch('templates/email/list?limit=30', apiKey, brazeRestEndpoint);
        const templateList = templatesData.templates || [];
        
        for (let i = 0; i < Math.min(templateList.length, 30); i += BATCH_SIZE) {
          const batch = templateList.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(batch.map(async (t: { email_template_id: string }) => {
            try {
              const details = await brazeFetch(`templates/email/info?email_template_id=${t.email_template_id}`, apiKey, brazeRestEndpoint);
              const htmlContent = truncateHtml(details.body);
              if (htmlContent) {
                templateHtmlMap.set(t.email_template_id, {
                  subject: details.subject || '',
                  preheader: details.preheader || '',
                  html: htmlContent,
                });
              }
            } catch { /* skip */ }
          }));
          await new Promise(r => setTimeout(r, 50));
        }
        console.log(`Loaded ${templateHtmlMap.size} templates for enrichment`);
      } catch (e) {
        console.warn('Failed to load templates:', e);
      }
    }

    if (touchpointsOnly) {
      touchpointsHandledInSlice = 0;
      /** Stop before platform hard kill (546); leave headroom for progress upsert + JSON response. */
      const touchpointsWallDeadline = syncStart + maxSyncWallMs() - 14_000;
      for (let ti = 0; ti < canvasesToProcess.length; ti++) {
        if (Date.now() >= touchpointsWallDeadline) {
          console.warn(
            `[Braze Sync][Phase3][touchpoints] wall budget: stopping early after ${touchpointsHandledInSlice}/${canvasesToProcess.length} in this slice (resume at offset ${touchpointsStartOffsetForChunk + touchpointsHandledInSlice})`,
          );
          break;
        }
        const c = canvasesToProcess[ti];
        console.log(
          `[Braze Sync][Phase3][touchpoints] ${ti + 1}/${canvasesToProcess.length} id=${c.id} name=${JSON.stringify(c.name)}`,
        );
        let details: Record<string, unknown> | null = null;
        try {
          details = (await brazeFetch(
            `canvas/details?canvas_id=${encodeURIComponent(c.id)}`,
            apiKey,
            brazeRestEndpoint,
          )) as Record<string, unknown>;
          const canvasNested = details.canvas as Record<string, unknown> | undefined;
          const entryMeta = extractCanvasEntryMetadataFromDetails(details);
          const detailStepRows = collectCanvasDetailStepRowsExpanded(details, canvasNested);
          const templateIds = collectEmailTemplateIdsFromDetailRows(detailStepRows);
          if (templateIds.length > MAX_TOUCHPOINT_EMAIL_TEMPLATES) {
            console.warn(
              `[Braze Sync][Phase3][touchpoints] id=${c.id}: ${templateIds.length} unique email templates; fetching first ${MAX_TOUCHPOINT_EMAIL_TEMPLATES} (raise BRAZE_SYNC_MAX_TOUCHPOINT_TEMPLATES if needed)`,
            );
          }
          const touchTemplateMap = await fetchEmailTemplatesByIds(
            templateIds,
            apiKey,
            brazeRestEndpoint,
            MAX_TOUCHPOINT_EMAIL_TEMPLATES,
          );
          let stepsObj: Record<string, unknown> = buildRawStepsFromDetailRows(
            detailStepRows,
            touchTemplateMap,
            c.id,
          );
          const stepsFound = detailStepRows.length;
          detailStepRows.length = 0;
          details = null;

          const totalSteps = Object.keys(stepsObj).length;
          const { error: upsertErr } = await supabase.rpc("upsert_braze_canvas_touchpoints", {
            p_client_id: clientId,
            p_braze_canvas_id: c.id,
            p_name: c.name || "Canvas",
            p_total_steps: totalSteps,
            p_raw_steps: stepsObj,
            p_trigger_event_name: entryMeta.trigger_event_name ?? null,
            p_entry_segment_name: entryMeta.entry_segment_name ?? null,
            p_entry_type: entryMeta.entry_type ?? null,
            p_schedule_type: entryMeta.schedule_type ?? null,
          });
          stepsObj = {} as Record<string, unknown>;
          if (!upsertErr) {
            processedCount++;
            phase3DbWritesWithRawSteps++;
            phase3CanvasesWithRawSteps++;
            console.log(
              `[Sync] Canvas ${JSON.stringify(c.name ?? "Canvas")}: ${stepsFound} steps found, ${totalSteps} touchpoints upserted`,
            );
          } else {
            console.warn(
              `[Braze Sync][Phase3][touchpoints] upsert failed id=${c.id}`,
              upsertErr.message,
            );
            pushDbErr("braze_canvases(touchpoints)", upsertErr);
          }
        } catch (e) {
          console.warn(`[Braze Sync][Phase3][touchpoints] canvas id=${c.id} failed:`, e);
        }
        touchpointsHandledInSlice++;
        await new Promise((r) => setTimeout(r, 200));
      }
    } else {
    // Process canvases in batches
    for (let i = 0; i < canvasesToProcess.length; i += phase3BatchSize) {
      if (syncOverBudget()) {
        console.warn(
          "[Braze Sync] Time budget: stopping canvas detail enrichment early (remaining canvases skipped)",
        );
        syncPartial = true;
        syncStoppedReason = "time_budget";
        break;
      }
      const batch = canvasesToProcess.slice(i, i + phase3BatchSize);
      console.log(
        `[Braze Sync][Phase3] batch ${Math.floor(i / phase3BatchSize) + 1}/${Math.ceil(canvasesToProcess.length / phase3BatchSize)} (${batch.length} canvas(es))`,
      );
      for (const c of batch) {
        const pr = getCanvasPriority(c.name);
        const forced = forcedIdSet.has(c.id);
        console.log(
          `[Braze Sync][Phase3] detail-fetch queued: id=${c.id} name=${JSON.stringify(c.name)} priority=${pr} force_included=${forced}`,
        );
      }

      const batchResults = await Promise.allSettled(
        batch.map(async (c): Promise<ProcessedCanvas | null> => {
          const variants: ProcessedCanvas['variants'] = [];
          const steps: Record<string, unknown> = {};

          const enabledFromList = inferCanvasEnabledFromListItem(c);
          let enabled = enabledFromList;

          let firstEntryIso = toIso(c.last_entry);
          let lastEntryIso = toIso(c.last_entry);

          let entryType: string | undefined;
          let entrySegmentName: string | undefined;
          let triggerEventName: string | undefined;
          let exceptionEvents: string[] = [];
          let conversionEvents: ProcessedCanvas['conversion_events'] = [];
          let entryFilters: ProcessedCanvas['entry_filters'] = [];

          // Activity metrics (canvas/data_series — also persisted for Analytics revenue merge)
          let entries_last_30d = 0;
          let entries_last_60d = 0;
          let sends_last_30d = 0;
          let revenue_last_30d = 0;
          let conversions_last_30d = 0;
          let opens_last_30d = 0;
          let clicks_last_30d = 0;
          let last_activity_at: string | undefined;

          try {
            // Braze REST: GET {restEndpoint}/canvas/details?canvas_id={id} (JSON body; steps via collectCanvasDetailStepRowsExpanded)
            const details = (await brazeFetch(
              `canvas/details?canvas_id=${encodeURIComponent(c.id)}`,
              apiKey,
              brazeRestEndpoint,
            )) as Record<string, unknown>;
            const canvasNested = details.canvas as Record<string, unknown> | undefined;

            enabled = isTruthy(
              details.enabled ??
                canvasNested?.enabled ??
                canvasNested?.is_active ??
                canvasNested?.active ??
                details.is_active ??
                details.active ??
                enabledFromList,
            );

            firstEntryIso = toIso(details.first_entry ?? details.first_entry_at) ?? firstEntryIso;
            lastEntryIso = toIso(details.last_entry ?? details.last_entry_at) ?? lastEntryIso;

            const entryMetaFromApi = extractCanvasEntryMetadataFromDetails(details);
            entryType = entryMetaFromApi.entry_type;
            triggerEventName = entryMetaFromApi.trigger_event_name;
            entrySegmentName = entryMetaFromApi.entry_segment_name;

            // Exception events
            if (details.exception_events?.length > 0) {
              exceptionEvents = details.exception_events.map((e: unknown) =>
                (typeof e === 'string' ? e : (e as Record<string, string>).name || (e as Record<string, string>).custom_event_name || 'Exception')
              );
            }

            // Conversion events
            if (details.conversion_behaviors?.length > 0) {
              conversionEvents = details.conversion_behaviors.map((cv: Record<string, unknown>) => ({
                name: (cv.type as string) || 'Conversion',
                window_seconds: cv.window_conversion_production_seconds as number,
                type: cv.type as string,
              }));
            }

            // Entry filters
            if (details.entry_audience_filters?.length > 0) {
              entryFilters = details.entry_audience_filters.map((f: Record<string, unknown>) => ({
                type: (f.type as string) || 'filter',
                property: f.property as string,
                value: f.value?.toString(),
                comparator: f.comparator as string,
              }));
            }

            // Parse variants (Braze field names vary: first_step_id, firstStepId, first_canvas_step_id)
            if (details.variants?.length > 0) {
              const rootFirst =
                (details as { first_step_id?: string }).first_step_id ||
                (canvasNested as { first_step_id?: string } | undefined)?.first_step_id ||
                "";
              for (const v of details.variants) {
                const vr = v as Record<string, unknown>;
                const fid =
                  (vr.first_step_id as string | undefined) ||
                  (vr.firstStepId as string | undefined) ||
                  (vr.first_canvas_step_id as string | undefined) ||
                  (vr.first_step_api_id as string | undefined) ||
                  (typeof rootFirst === "string" && rootFirst ? rootFirst : undefined);
                variants.push({
                  name: (v.name as string) || "Variant",
                  percentage: typeof v.percentage === "number" ? v.percentage : 100,
                  first_step_id: fid ? String(fid).trim() : null,
                });
              }
            }

            // Parse steps (skip HTML to save memory - store template IDs)
            const detailStepRows = collectCanvasDetailStepRowsExpanded(details, canvasNested);

            const detailKeys = Object.keys(details).sort();
            console.log(
              `[Braze Sync][Phase3][parse-debug] name=${JSON.stringify(c.name)} canvas_id=${c.id} ` +
                `detailStepRows=${detailStepRows.length} details.top_level_keys=${JSON.stringify(detailKeys)}`,
            );
            if (detailStepRows.length > 0) {
              const first = detailStepRows[0] as Record<string, unknown>;
              console.log(
                `[Braze Sync][Phase3][parse-debug] first_step_sample=${JSON.stringify(first).slice(0, 1200)}`,
              );
            }

            if (detailStepRows.length > 0) {
              Object.assign(
                steps,
                buildRawStepsFromDetailRows(detailStepRows, templateHtmlMap, c.id),
              );
            } else {
              console.warn(
                `[Braze Sync][Phase3] canvas/details returned 0 step rows: id=${c.id} name=${JSON.stringify(c.name)} — check collectCanvasDetailStepRowsExpanded / nested legacy_response`,
              );
            }

            const parsedStepKeys = Object.keys(steps).length;
            if (detailStepRows.length > 0 && parsedStepKeys === 0) {
              console.warn(
                `[Braze Sync][Phase3] id=${c.id} name=${JSON.stringify(c.name)}: API had ${detailStepRows.length} step row(s) but parsed 0 steps (missing step ids?)`,
              );
            } else if (parsedStepKeys > 0) {
              console.log(
                `[Braze Sync][Phase3] id=${c.id} raw_steps keys=${parsedStepKeys} (source rows=${detailStepRows.length})`,
              );
            }
          } catch (err) {
            console.warn(
              `[Braze Sync][Phase3] canvas/details request FAILED: id=${c.id} name=${JSON.stringify(c.name)}`,
              err,
            );
          }

          // canvas/data_series metrics are written in the post–Phase 3 sweep (all non-archived canvases).

          return {
            id: c.id,
            name: c.name,
            description: c.description,
            draft: c.draft,
            enabled,
            archived: c.archived,
            schedule_type: entryType,
            first_entry: firstEntryIso,
            last_entry: lastEntryIso,
            tags: c.tags,
            created_at: c.created_at,
            updated_at: c.updated_at,
            variants,
            steps,
            total_steps: Object.keys(steps).length,
            entry_type: entryType,
            entry_segment_name: entrySegmentName,
            trigger_event_name: triggerEventName,
            exception_events: exceptionEvents.length > 0 ? exceptionEvents : undefined,
            conversion_events: conversionEvents && conversionEvents.length > 0 ? conversionEvents : undefined,
            entry_filters: entryFilters && entryFilters.length > 0 ? entryFilters : undefined,
            entries_last_30d,
            entries_last_60d,
            sends_last_30d,
            revenue_last_30d,
            conversions_last_30d,
            opens_last_30d,
            clicks_last_30d,
            last_activity_at,
          };
        })
      );

      for (let bi = 0; bi < batchResults.length; bi++) {
        const br = batchResults[bi];
        const bc = batch[bi];
        if (br.status === "rejected") {
          console.error(
            `[Braze Sync][Phase3] detail promise REJECTED: id=${bc?.id} name=${JSON.stringify(bc?.name)}`,
            br.reason,
          );
        }
      }

      // Immediately upsert this batch to the database (checkpointing)
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          const c = result.value;
          const stepsObj =
            c.steps && typeof c.steps === "object" && !Array.isArray(c.steps)
              ? (c.steps as Record<string, unknown>)
              : {};
          const hasIncomingSteps = Object.keys(stepsObj).length > 0;

          const row = {
                client_id: clientId,
                braze_canvas_id: c.id,
                name: c.name,
                description: c.description || null,
                draft: c.draft ?? false,
                enabled: c.enabled ?? false,
                archived: c.archived ?? false,
                schedule_type: c.schedule_type || null,
                entry_type: c.entry_type || null,
                trigger_event_name: c.trigger_event_name || null,
                entry_segment_name: c.entry_segment_name || null,
                tags: normalizeStringArray(c.tags),
                first_entry: c.first_entry || null,
                last_entry: c.last_entry || null,
                created_in_braze: c.created_at || null,
                updated_in_braze: c.updated_at || null,
                raw_variants: c.variants || [],
                conversion_events: c.conversion_events || [],
                entry_filters: c.entry_filters || [],
                exception_events: c.exception_events || [],
                entries_last_30d: c.entries_last_30d || 0,
                entries_last_60d: c.entries_last_60d || 0,
                sends_last_30d: c.sends_last_30d || 0,
                revenue_last_30d: c.revenue_last_30d ?? 0,
                conversions_last_30d: c.conversions_last_30d ?? 0,
                opens_last_30d: c.opens_last_30d ?? 0,
                clicks_last_30d: c.clicks_last_30d ?? 0,
                last_activity_at: c.last_activity_at || null,
                synced_at: nowIso,
                ...(hasIncomingSteps
                  ? {
                      total_steps:
                        typeof c.total_steps === "number"
                          ? c.total_steps
                          : Object.keys(stepsObj).length,
                      raw_steps: stepsObj,
                    }
                  : {}),
              };

          const { error: upsertErr } = await supabase
            .from('braze_canvases')
            .upsert(row, { onConflict: 'client_id,braze_canvas_id' });

          console.log(
            "[DB WRITE]",
            "braze_canvases",
            "error:",
            upsertErr?.message ?? "none",
            "rows:",
            1,
          );
          if (upsertErr) {
            console.warn(
              `[Braze Sync][Phase3] DB upsert FAILED: braze_canvas_id=${c.id} name=${JSON.stringify(c.name)}`,
              upsertErr.message,
            );
            pushDbErr("braze_canvases(detail)", upsertErr);
          } else {
            processedCount++;
            if (c.enabled) enabledCount++;
            if (c.steps && Object.keys(c.steps).length > 0) {
              phase3CanvasesWithRawSteps++;
            }
            if (hasIncomingSteps) {
              phase3DbWritesWithRawSteps++;
              console.log(
                `[Braze Sync][Phase3] DB wrote raw_steps: id=${c.id} keys=${Object.keys(stepsObj).length} name=${JSON.stringify(c.name)}`,
              );
            } else {
              console.log(
                `[Braze Sync][Phase3] DB upsert metadata only (skipped raw_steps — empty): id=${c.id} name=${JSON.stringify(c.name)}`,
              );
            }
          }
        }
      }

      // Release memory between batches
      await new Promise(r => setTimeout(r, 100));
    }
    }

    let canvasDataSeriesUpdatedTotal = 0;
    // canvas/data_series → braze_canvases activity columns (all non-archived list canvases).
    // Not gated on skipHeavySyncPhases so FORCE_CANVAS_FAST_PATH still gets metrics; excluded for touchpoints_only chunks.
    if (!touchpointsOnly && allCanvasList.length > 0) {
      const seriesTargets = allCanvasList.filter((c) => !c.archived);
      let canvasDataSeriesUpdated = 0;
      let canvasDataSeriesRevenueSum = 0;
      console.log(
        `[Braze Sync] canvas/data_series sweep: ${seriesTargets.length} non-archived canvas(es)`,
      );
      const SERIES_CONCURRENCY = 4;
      for (let si = 0; si < seriesTargets.length; si += SERIES_CONCURRENCY) {
        if (syncOverBudget()) {
          syncPartial = true;
          if (!syncStoppedReason) syncStoppedReason = "time_budget";
          console.warn("[Braze Sync] canvas/data_series sweep: stopped early (wall time budget)");
          break;
        }
        const slice = seriesTargets.slice(si, si + SERIES_CONCURRENCY);
        const batchOutcomes = await Promise.all(
          slice.map(async (c) => {
            try {
              const m = await fetchMergedCanvasDataSeriesForDb(
                c.id,
                apiKey,
                brazeRestEndpoint,
              );
              console.log(
                `Canvas ${c.name}: revenue=${m.revenue_last_30d} entries=${m.entries_last_30d}`,
              );
              const { error: upErr } = await supabase
                .from("braze_canvases")
                .update({
                  entries_last_30d: m.entries_last_30d,
                  entries_last_60d: m.entries_last_60d,
                  sends_last_30d: m.sends_last_30d,
                  revenue_last_30d: m.revenue_last_30d,
                  conversions_last_30d: m.conversions_last_30d,
                  opens_last_30d: m.opens_last_30d,
                  clicks_last_30d: m.clicks_last_30d,
                  last_activity_at: m.last_activity_at ?? null,
                  synced_at: nowIso,
                })
                .eq("client_id", clientId)
                .eq("braze_canvas_id", c.id);
              if (upErr) {
                console.warn(`[Braze Sync] canvas/data_series DB update failed id=${c.id}:`, upErr.message);
                return { ok: false as const };
              }
              return { ok: true as const, revenue: Number(m.revenue_last_30d) || 0 };
            } catch (e) {
              console.warn(`[Braze Sync] canvas/data_series request failed id=${c.id}:`, e);
              return { ok: false as const };
            }
          }),
        );
        for (const o of batchOutcomes) {
          if (o.ok) {
            canvasDataSeriesUpdated += 1;
            canvasDataSeriesRevenueSum += o.revenue;
          }
        }
        await new Promise((r) => setTimeout(r, 80));
      }
      console.log(
        `[Braze Sync] canvas/data_series summary: canvases_updated=${canvasDataSeriesUpdated} total_revenue_last_30d_written=${canvasDataSeriesRevenueSum.toFixed(2)}`,
      );
      canvasDataSeriesUpdatedTotal = canvasDataSeriesUpdated;
    }

    console.log(
      `[Braze Sync] Phase 3 done: processed=${processedCount} enabled=${enabledCount} ` +
        `fulfilled_with_step_object=${phase3CanvasesWithRawSteps} db_upserts_with_raw_steps=${phase3DbWritesWithRawSteps} ` +
        `(list_total=${allCanvasList.length}, priority_detail_cap=${touchpointsOnly ? "none" : MAX_CANVASES_TO_PROCESS}, forced=${forcedCanvases.length}) canvas_data_series=${canvasDataSeriesUpdatedTotal}`,
    );

    if (touchpointsOnly) {
      const syncDurationTouch = Date.now() - syncStart;
      const totalCanvases = allCanvasList.length;
      const nextOffset = touchpointsStartOffsetForChunk + touchpointsHandledInSlice;
      const done = nextOffset >= totalCanvases;
      const { error: progErr } = await supabase.from("client_sync_progress").upsert(
        {
          client_id: clientId,
          platform_id: platformId,
          sync_kind: "braze_touchpoints",
          last_offset: done ? 0 : nextOffset,
          total_canvases: totalCanvases,
          updated_at: nowIso,
        },
        { onConflict: "client_id,platform_id,sync_kind" },
      );
      if (progErr) {
        console.warn("[Braze Sync] client_sync_progress upsert:", progErr.message);
        pushDbErr("client_sync_progress", progErr);
      }
      if (syncRunId) {
        await supabase.from("braze_sync_runs").update({
          status: "success",
          completed_at: nowIso,
          duration_ms: syncDurationTouch,
          canvases_synced: processedCount,
          campaigns_synced: 0,
        }).eq("id", syncRunId);
      }
      return new Response(
        JSON.stringify({
          success: true,
          processed: done ? totalCanvases : processedCount,
          offset: done ? totalCanvases : nextOffset,
          total: totalCanvases,
          done,
          counts: {
            canvases_detail_enriched: processedCount,
            total: totalCanvases,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Campaigns / segments / scheduled broadcasts: run on any non–touchpoints-only invocation,
    // even when FORCE_CANVAS_FAST_PATH skips KPI + email + canvas minimal upsert.
    if (!touchpointsOnly) {
    // === PHASE 4: Fetch and process campaigns ===
    console.log('Phase 4: Fetching all campaign IDs...');
    const seenCampaignIds = new Set<string>();

    const ingestCampaignListPage = async (pageNum: number): Promise<boolean> => {
      try {
        const campaignsData = (await brazeFetch(
          `campaigns/list?page=${pageNum}&include_archived=false&sort_direction=desc`,
          apiKey,
          brazeRestEndpoint
        )) as Record<string, unknown>;
        const rawCampaigns = getBrazeListArray(campaignsData, [
          "campaigns",
          "items",
          "data",
        ]);
        console.log(`Campaign page ${pageNum}: ${rawCampaigns.length} items`);
        if (rawCampaigns.length === 0) return false;
        for (const raw of rawCampaigns) {
          const row = raw as Record<string, unknown>;
          const cid = campaignIdFromListItem(row);
          if (!cid) {
            console.warn("Campaign list row missing id", Object.keys(row));
            continue;
          }
          if (seenCampaignIds.has(cid)) continue;
          seenCampaignIds.add(cid);
          const nm =
            (typeof row.name === "string" && row.name.trim()) ||
            `Campaign ${cid}`;
          allCampaignList.push({
            id: cid,
            name: nm,
            is_api_campaign: row.is_api_campaign as boolean | undefined,
            last_sent: row.last_sent as string | undefined,
            tags: normalizeStringArray(row.tags),
            _raw: row,
          });
        }
        return true;
      } catch (err) {
        logger.error(`Failed to fetch campaign page ${pageNum}:`, err);
        return false;
      }
    };

    await ingestCampaignListPage(0);

    let campaignPage = 1;
    while (campaignPage < 100) {
      if (syncOverBudget()) {
        console.warn(
          "[Braze Sync] Time budget: stopping campaign list pagination early",
        );
        syncPartial = true;
        syncStoppedReason = "time_budget";
        break;
      }
      const hadRows = await ingestCampaignListPage(campaignPage);
      if (!hadRows) break;
      campaignPage++;
    }

    console.log(`Total campaigns found: ${allCampaignList.length}`);

    // Phase 4a-pre: Insert all list campaigns with minimal data (name + sent_date) so they
    // appear in the DB even if the detail pass (capped at MAX_CAMPAIGNS_TO_PROCESS) never reaches them.
    // Uses ignoreDuplicates=true so existing rows with full details are NOT overwritten.
    if (allCampaignList.length > 0 && !syncOverBudget()) {
      const minimalRows = allCampaignList.map((c) => ({
        client_id: clientId,
        braze_campaign_id: c.id,
        name: c.name,
        status: c.last_sent ? 'sent' : 'draft',
        sent_date: toIso(c.last_sent) || null,
        synced_at: nowIso,
      }));
      for (let mi = 0; mi < minimalRows.length; mi += 100) {
        const chunk = minimalRows.slice(mi, mi + 100);
        const { error: minErr } = await supabase
          .from('braze_campaigns')
          .upsert(chunk, { onConflict: 'client_id,braze_campaign_id', ignoreDuplicates: true });
        if (minErr) {
          console.warn('[Braze Sync] Phase 4a-pre minimal campaign upsert error:', minErr.message);
        }
      }
      console.log(`[Braze Sync] Phase 4a-pre: inserted up to ${allCampaignList.length} list-only campaign rows`);
    }

    // Resumable sync: skip campaigns synced in the last 10 minutes (same sync session), skip details API for already-enriched ones
    let alreadyEnrichedIds = new Set<string>();
    let recentlySyncedIds = new Set<string>();
    try {
      const { data: rows } = await supabase
        .from('braze_campaigns')
        .select('braze_campaign_id,synced_at,raw_details')
        .eq('client_id', clientId);
      if (rows) {
        const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
        for (const r of rows as Array<{ braze_campaign_id: string; synced_at: string | null; raw_details: unknown }>) {
          // Only skip campaigns/details when we already stored creative payload (image, HTML, or messages).
          // Older rows had raw_details with description only — they need a fresh details fetch.
          if (r.raw_details != null && typeof r.raw_details === "object") {
            const rd = r.raw_details as Record<string, unknown>;
            const hasRichCreative =
              (typeof rd.email_html_preview === "string" && rd.email_html_preview.length > 0) ||
              (typeof rd.preview_image_url === "string" && rd.preview_image_url.length > 0) ||
              (rd.messages &&
                typeof rd.messages === "object" &&
                !Array.isArray(rd.messages) &&
                Object.keys(rd.messages as Record<string, unknown>).length > 0);
            if (hasRichCreative) alreadyEnrichedIds.add(r.braze_campaign_id);
          }
          if (r.synced_at && r.synced_at > tenMinAgo) recentlySyncedIds.add(r.braze_campaign_id);
        }
      }
      console.log(`[Braze Sync] ${alreadyEnrichedIds.size} have details, ${recentlySyncedIds.size} synced <10min ago (skipping)`);
    } catch (err) {
      console.warn('[Braze Sync] Could not fetch campaign sync state:', err);
    }

    const needsProcessing = allCampaignList.filter(c => !recentlySyncedIds.has(c.id));
    const campaignsToProcess = needsProcessing.slice(0, MAX_CAMPAIGNS_TO_PROCESS);
    console.log(`Will process ${campaignsToProcess.length} campaigns (${recentlySyncedIds.size} skipped, ${alreadyEnrichedIds.size} have details)`);

    if (syncOverBudget()) {
      console.warn(
        "[Braze Sync] Time budget: skipping campaign detail + DB upsert (list kept for schema_cache)",
      );
      syncPartial = true;
      if (!syncStoppedReason) syncStoppedReason = "time_budget";
    } else {
    const campaignPhaseStartMs = Date.now() - syncStart;
    console.log(`Phase 4b: Processing campaign details in batches of ${BATCH_SIZE}... (${campaignPhaseStartMs}ms elapsed, ${maxWallMs - campaignPhaseStartMs}ms remaining)`);
    const campaignDataSeriesEndingAt = encodeURIComponent(nowIso);

    for (let i = 0; i < campaignsToProcess.length; i += BATCH_SIZE) {
      if (syncOverBudget()) {
        console.warn(
          "[Braze Sync] Time budget: stopping campaign detail processing early",
        );
        syncPartial = true;
        syncStoppedReason = "time_budget";
        break;
      }
      const batch = campaignsToProcess.slice(i, i + BATCH_SIZE);
      console.log(`Processing campaign batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(campaignsToProcess.length / BATCH_SIZE)}`);

      const batchCampaignAnalyticsRows: Record<string, unknown>[] = [];

      const batchResults = await Promise.allSettled(
        batch.map(async (c): Promise<ProcessedCampaign | null> => {
          const listRow = c as unknown as Record<string, unknown>;
          const campaignId = campaignIdFromListItem(listRow);
          if (!campaignId) {
            console.warn("Skipping campaign list row with no id", listRow);
            return null;
          }
          const displayName =
            (typeof c.name === "string" && c.name.trim()) ||
            `Campaign ${campaignId}`;

          let channel: string | undefined;
          let subject: string | undefined;
          let preheader: string | undefined;
          let status = 'draft';
          let sentDate: string | undefined;
          let segment: string | undefined;
          let tags = c.tags || [];
          let rawDetails: Record<string, unknown> = {};
          let push_title: string | undefined;
          let push_body: string | undefined;
          let preview_image_url: string | undefined;
          const imageCandidates: string[] = [];
          let emailHtmlPreview: string | undefined;

          // Fetch campaign details (skip if already enriched — only refresh analytics)
          const skipDetails = alreadyEnrichedIds.has(campaignId);
          let details: Record<string, unknown> | null = null;
          try {
            if (skipDetails) {
              // Already have details — set minimal fields from list data, analytics will be refreshed below
              status = c.last_sent ? 'sent' : 'scheduled';
              sentDate = c.last_sent;
              tags = c.tags || [];
            }
            details = skipDetails
              ? null
              : ((await brazeFetch(
                  `campaigns/details?campaign_id=${encodeURIComponent(campaignId)}`,
                  apiKey,
                  brazeRestEndpoint,
                )) as Record<string, unknown> | null);

            if (details) {
            rawDetails = {
              description: details.description,
              schedule_type: details.schedule_type,
              channels: details.channels,
              first_sent: details.first_sent,
              last_sent: details.last_sent,
              is_api_campaign: details.is_api_campaign ?? c.is_api_campaign,
            };

            // Determine channel from details
            if (details.channels && Array.isArray(details.channels) && details.channels.length > 0) {
              channel = details.channels[0];
            } else if (details.channel) {
              channel = details.channel;
            } else if (details.messages) {
              // Try to infer channel from messages object keys
              const msgKeys = Object.keys(details.messages);
              if (msgKeys.length > 0) {
                const firstMsg = details.messages[msgKeys[0]];
                channel = firstMsg?.channel || msgKeys[0];
              }
            }

            // Extract subject/preheader from email messages if available
            if (details.messages && typeof details.messages === 'object') {
              const msgEntries = Object.values(details.messages) as Array<Record<string, unknown>>;
              for (const msg of msgEntries) {
                if (msg.subject) { subject = msg.subject as string; break; }
              }
              for (const msg of msgEntries) {
                if (msg.preheader) { preheader = msg.preheader as string; break; }
              }

              // Push / in-app title & body + first image URL for dashboard previews
              for (const msg of msgEntries) {
                const ch = String(msg.channel ?? "").toLowerCase();
                const isPush =
                  ch.includes("push") ||
                  ch === "android_push" ||
                  ch === "ios_push" ||
                  ch === "web_push";
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
                  msg.big_image ||
                  msg.image_url ||
                  msg.thumbnail_url ||
                  msg.url;
                if (typeof img === "string" && (img.startsWith("http") || img.startsWith("//"))) {
                  imageCandidates.push(img.startsWith("//") ? `https:${img}` : img);
                }
              }

              // Email hero images (same channel rules as HTML — `channel` may be omitted)
              for (const msg of msgEntries) {
                const ch = String(msg.channel ?? "").toLowerCase();
                if (brazeMessageIsNonEmail(ch)) continue;
                const img =
                  msg.image_url ||
                  msg.thumbnail_url ||
                  msg.big_image ||
                  msg.url;
                if (typeof img === "string" && (img.startsWith("http") || img.startsWith("//"))) {
                  imageCandidates.push(img.startsWith("//") ? `https:${img}` : img);
                }
              }

              // Email HTML for dashboard preview — collect all message HTML, prefer longest real HTML (not plain body).
              const emailHtmlCandidates: string[] = [];
              for (const msg of msgEntries) {
                const ch = String(msg.channel ?? "").toLowerCase();
                if (brazeMessageIsNonEmail(ch)) continue;
                let htmlCandidate: string | undefined;
                if (typeof msg.html_body === "string" && msg.html_body.trim()) {
                  htmlCandidate = msg.html_body.trim();
                } else if (typeof msg.html_content === "string" && msg.html_content.trim()) {
                  htmlCandidate = msg.html_content.trim();
                } else if (typeof msg.html === "string" && msg.html.trim()) {
                  htmlCandidate = msg.html.trim();
                } else if (typeof msg.body === "string" && msg.body.trim()) {
                  const b = msg.body.trim();
                  if (emailBodyLooksLikeHtml(b)) htmlCandidate = b;
                }
                if (htmlCandidate) emailHtmlCandidates.push(htmlCandidate);
              }
              const htmlLike = emailHtmlCandidates.filter((c) => emailBodyLooksLikeHtml(c));
              const bestHtml =
                htmlLike.length > 0
                  ? htmlLike.sort((a, b) => b.length - a.length)[0]
                  : undefined;
              if (bestHtml) {
                emailHtmlPreview = truncateHtml(bestHtml);
              }
              const jsonPick = pickBestPreviewImageFromCandidateUrls(imageCandidates);
              const htmlPick = emailHtmlPreview ? pickBestImageUrlFromHtml(emailHtmlPreview) : undefined;
              preview_image_url = mergePreviewImagePicks(jsonPick, htmlPick);
              // SMS copy as push-style fields when native push/in-app messages are absent
              for (const msg of msgEntries) {
                const ch = String(msg.channel ?? "").toLowerCase();
                if (ch !== "sms") continue;
                if (!push_body) {
                  const b =
                    (typeof msg.body === "string" && msg.body) ||
                    brazeAlertToString(msg.alert);
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

            // Determine status
            const lastSent = details.last_sent || c.last_sent;
            if (lastSent) {
              status = 'sent';
              sentDate = toIso(lastSent);
            } else if (details.schedule_type) {
              status = 'scheduled';
            } else {
              status = 'draft';
            }

            // Extract segment
            segment = details.segment?.name || details.segment_name || undefined;

            // Update tags from details if available
            if (details.tags && Array.isArray(details.tags)) {
              tags = details.tags;
            }
            } // end if (details)
          } catch (err) {
            console.warn(`Failed to fetch details for campaign ${campaignId}:`, err);
            // Still determine status from list data
            if (c.last_sent) {
              status = 'sent';
              sentDate = toIso(c.last_sent);
            }
          }

          rawDetails = {
            ...rawDetails,
            ...(push_title ? { push_title } : {}),
            ...(push_body ? { push_body } : {}),
            ...(preview_image_url ? { preview_image_url } : {}),
            ...(emailHtmlPreview ? { email_html_preview: emailHtmlPreview } : {}),
            ...(details &&
            details.messages &&
            typeof details.messages === "object" &&
            !Array.isArray(details.messages)
              ? {
                  messages: truncateCampaignMessagesForStorage(
                    details.messages as Record<string, unknown>,
                    250000,
                  ),
                }
              : {}),
          };

          const descPreview =
            typeof rawDetails.description === "string" ? rawDetails.description.trim() : "";
          const creative_preview =
            (subject && subject.trim()) ||
            (push_title && push_title.trim()) ||
            (preheader && preheader.trim()) ||
            (push_body && push_body.trim().slice(0, 140)) ||
            (descPreview ? descPreview.slice(0, 140) : undefined) ||
            (displayName && displayName.trim()) ||
            "Campaign";

          // Fetch analytics for sent/scheduled campaigns
          let opens = 0;
          let clicks = 0;
          let deliveries = 0;
          let sends = 0;
          let bounces = 0;
          let spam_reports = 0;
          let unsubs = 0;

          if (status === 'sent' || status === 'scheduled') {
            try {
              const analyticsData = (await brazeFetch(
                `campaigns/data_series?campaign_id=${encodeURIComponent(campaignId)}&length=60&ending_at=${campaignDataSeriesEndingAt}`,
                apiKey,
                brazeRestEndpoint
              )) as Record<string, unknown>;

              const dataSeries = Array.isArray(analyticsData.data)
                ? (analyticsData.data as Array<Record<string, unknown>>)
                : (brazeExportDataArray(analyticsData) as Array<Record<string, unknown>>);

              if (dataSeries.length > 0) {
                for (const day of dataSeries) {
                  const m = aggregateCampaignDayFromBraze(day);
                  opens += m.opens;
                  clicks += m.clicks;
                  sends += m.sends;
                  deliveries += m.deliveries;
                  bounces += m.bounces;
                  spam_reports += m.spam_reports;
                  unsubs += m.unsubs;
                  const dateStr = campaignDataSeriesDayDate(day);
                  if (!dateStr) continue;
                  const rc = canvasDayRevenueAndConversions(day);
                  batchCampaignAnalyticsRows.push({
                    client_id: clientId,
                    campaign_id: campaignId,
                    campaign_name: displayName,
                    variation_api_id: BRAZE_SYNC_CAMPAIGN_ANALYTICS_VARIATION,
                    channel: channel || "Email",
                    date: dateStr,
                    sent: m.sends,
                    delivered: m.deliveries,
                    opens: m.opens,
                    unique_opens: m.opens,
                    clicks: m.clicks,
                    unique_clicks: m.clicks,
                    bounces: m.bounces,
                    unsubscribes: m.unsubs,
                    reported_spam: m.spam_reports,
                    unique_recipients: m.deliveries,
                    conversions: rc.conversions,
                    conversions_by_send_time: 0,
                    revenue: rc.revenue,
                  });
                }
              }
            } catch (err) {
              console.warn(`Failed to fetch analytics for campaign ${campaignId}:`, err);
            }
          }

          // Compute rates
          const open_rate = deliveries > 0 ? Math.round((opens / deliveries) * 10000) / 10000 : null;
          const click_rate = deliveries > 0 ? Math.round((clicks / deliveries) * 10000) / 10000 : null;

          return {
            id: campaignId,
            name: displayName,
            channel,
            subject,
            preheader,
            status,
            sent_date: sentDate,
            opens,
            clicks,
            deliveries,
            sends,
            bounces,
            spam_reports,
            open_rate,
            click_rate,
            unsubs,
            segment,
            tags,
            creative_preview,
            // Don't overwrite raw_details when we skipped the details API call
            ...(skipDetails ? {} : { raw_details: rawDetails }),
          };
        })
      );

      // Upsert batch (single round-trip); fall back per-row if PostgREST rejects the batch
      const rowsToUpsert: Record<string, unknown>[] = [];
      for (const result of batchResults) {
        if (result.status === "rejected") {
          console.warn("Campaign batch item rejected:", result.reason);
          continue;
        }
        if (!result.value) continue;
        const c = result.value;
        rowsToUpsert.push({
          client_id: clientId,
          braze_campaign_id: c.id,
          name: c.name,
          channel: c.channel || null,
          subject: c.subject || null,
          preheader: c.preheader || null,
          status: c.status,
          sent_date: c.sent_date || null,
          opens: c.opens,
          clicks: c.clicks,
          deliveries: c.deliveries,
          sends: c.sends,
          bounces: c.bounces,
          spam_reports: c.spam_reports,
          open_rate: c.open_rate,
          click_rate: c.click_rate,
          unsubs: c.unsubs,
          segment: c.segment || null,
          tags: c.tags || [],
          creative_preview: c.creative_preview || null,
          raw_details: c.raw_details || {},
          synced_at: nowIso,
        });
      }

      if (rowsToUpsert.length > 0) {
        const { error: batchUpsertErr } = await supabase
          .from("braze_campaigns")
          .upsert(rowsToUpsert, { onConflict: "client_id,braze_campaign_id" });

        if (batchUpsertErr) {
          console.warn("Batch campaign upsert failed, retrying per row:", batchUpsertErr.message);
          pushDbErr("braze_campaigns(batch)", batchUpsertErr);
          for (const row of rowsToUpsert) {
            const { error: oneErr } = await supabase
              .from("braze_campaigns")
              .upsert(row, { onConflict: "client_id,braze_campaign_id" });
            if (oneErr) {
              console.warn("Campaign upsert failed:", oneErr.message, row.braze_campaign_id);
              pushDbErr("braze_campaigns(row)", oneErr);
            } else {
              campaignsProcessedCount++;
              const st = row.status as string;
              if (st === "sent" || st === "scheduled") campaignsEnabledCount++;
            }
          }
        } else {
          campaignsProcessedCount += rowsToUpsert.length;
          for (const row of rowsToUpsert) {
            const st = row.status as string;
            if (st === "sent" || st === "scheduled") campaignsEnabledCount++;
          }
        }
      }

      if (batchCampaignAnalyticsRows.length > 0) {
        const CA_CHUNK = 100;
        for (let ci = 0; ci < batchCampaignAnalyticsRows.length; ci += CA_CHUNK) {
          const chunk = batchCampaignAnalyticsRows.slice(ci, ci + CA_CHUNK);
          const { error: caErr } = await supabase.from("braze_campaign_analytics").upsert(chunk, {
            onConflict: "client_id,campaign_id,date,variation_api_id",
          });
          if (caErr) {
            console.warn("[Braze Sync] braze_campaign_analytics upsert:", caErr.message);
            pushDbErr("braze_campaign_analytics(batch)", caErr);
          } else {
            campaignAnalyticsRowsUpserted += chunk.length;
          }
        }
      }

      // Release memory between batches
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(
      `[Braze Sync] Campaign phase complete: processed=${campaignsProcessedCount}, enabled=${campaignsEnabledCount}, analytics_rows=${campaignAnalyticsRowsUpserted}, total_found=${allCampaignList.length}, skipped_already_enriched=${alreadyEnrichedIds.size}`,
    );
    }

    // === PHASE 6: Segment directory → public.braze_segments_sync (not braze_segments) ===
    if (campaignsOnly) {
      console.log('[Braze Sync] CAMPAIGNS_ONLY: skipping segments and scheduled broadcasts');
    } else {
    console.log("[SYNC] Starting: segments");
    console.log('[START] segments/list → braze_segments_sync');
    try {
      let segPage = 0;
      while (segPage < MAX_SEGMENT_PAGES) {
        // Always attempt at least one segment page, even near time limit.
        // Segment sync is lightweight and this avoids persistent 0 segments
        // when earlier heavy phases consume most of the wall budget.
        if (syncOverBudget() && segPage > 0) {
          console.warn(
            "[Braze Sync] Time budget: stopping segments pagination early",
          );
          syncPartial = true;
          syncStoppedReason = "time_budget";
          break;
        }
        const segJson = (await brazeFetch(
          `segments/list?page=${segPage}&sort_direction=desc&limit=100`,
          apiKey,
          brazeRestEndpoint,
        )) as Record<string, unknown>;
        const segs = getBrazeListArray(segJson, [
          "segments",
          "items",
          "data",
        ]) as Array<Record<string, unknown>>;
        apiSegmentsListed += segs.length;
        console.log(
          `[API] segments page ${segPage} segments.length:`,
          segs.length,
        );
        console.log(
          '[Braze Sync] Segments page',
          segPage,
          '— count:',
          segs.length,
        );
        if (segPage === 0) {
          console.log('[Braze Sync] Segments page 0 raw (truncated):', JSON.stringify(segJson).slice(0, 300));
        }
        // Some Braze workspaces are 1-based for list pagination. If page 0 is
        // empty, try page 1 once before concluding there are no segments.
        if (segs.length === 0 && segPage === 0) {
          console.warn("[Braze Sync] Segments page 0 empty; retrying from page 1");
          segPage = 1;
          continue;
        }
        if (segs.length === 0) break;
        const rows = segs
          .map((s) => {
            const id = String(
              s.id ??
              s.segment_id ??
              s.api_id ??
              s.segment_api_id ??
              '',
            );
            if (!id) return null;
            return {
              client_id: clientId,
              braze_segment_id: id,
              name: String(s.name ?? s.segment_name ?? s.title ?? 'Segment'),
              tags: normalizeStringArray(s.tags),
              raw: s as Record<string, unknown>,
              synced_at: nowIso,
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;
        if (rows.length > 0) {
          console.log('[DB WRITE] braze_segments_sync attempting to write:', rows.length, 'rows page=', segPage);
          const { error: segErr } = await supabase.from('braze_segments_sync').upsert(rows, {
            onConflict: 'client_id,braze_segment_id',
          });
          console.log(
            "[DB WRITE]",
            "braze_segments_sync",
            "error:",
            segErr?.message ?? "none",
            "rows:",
            rows.length,
          );
          console.log('[DB RESULT] braze_segments_sync error:', segErr?.message ?? 'none');
          if (segErr) {
            console.warn('braze_segments_sync upsert:', segErr.message);
            pushDbErr('braze_segments_sync', segErr);
          } else segmentsSynced += rows.length;
        }
        segPage++;
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (e) {
      console.error('[Braze Sync] Segment list sync failed:', e);
    }
    console.log(`[Braze Sync] Segment sync complete: ${segmentsSynced} segment rows upserted`);

    // === PHASE 8: Upcoming scheduled campaigns & Canvases ===
    try {
      const endSch = encodeURIComponent(new Date(Date.now() + 30 * 86400000).toISOString());
      const schJson = (await brazeFetch(
        `messages/scheduled_broadcasts?end_time=${endSch}`,
        apiKey,
        brazeRestEndpoint
      )) as Record<string, unknown>;
      const msgStatus = schJson.message;
      if (msgStatus != null && String(msgStatus).toLowerCase() !== 'success') {
        console.warn('scheduled_broadcasts API message:', msgStatus);
      }
      const broadcasts =
        (schJson.scheduled_broadcasts as unknown[]) ||
        (schJson.scheduled_messages as unknown[]) ||
        getBrazeListArray(schJson, ["scheduled_broadcasts", "scheduled_messages", "broadcasts", "data"]);
      apiScheduledListed = Array.isArray(broadcasts) ? broadcasts.length : 0;
      console.log(
        `scheduled_broadcasts: raw_count=${Array.isArray(broadcasts) ? broadcasts.length : 0} response_keys=${Object.keys(schJson).join(',')}`,
      );
      await supabase.from("braze_scheduled_broadcasts").delete().eq("client_id", clientId);
      const srows = broadcasts
        .map((raw, idx) => {
          const b = raw as Record<string, unknown>;
          const idRaw =
            b.id ??
            b.scheduled_broadcast_id ??
            b.schedule_id ??
            b.scheduled_message_id ??
            b.broadcast_id ??
            b.ap_id;
          let id = idRaw != null ? String(idRaw).trim() : "";
          if (!id) {
            const nm = String(b.name ?? b.title ?? "broadcast");
            const nt =
              b.next_send_time ?? b.send_time ?? b.scheduled_time ?? b.time ?? "";
            id = `derived_${idx}_${nm.slice(0, 40)}_${String(nt).slice(0, 24)}`;
          }
          const nextRaw =
            b.next_send_time ??
            b.send_time ??
            b.scheduled_time ??
            b.time ??
            b.next_send_date;
          let nextIso: string | null = null;
          if (nextRaw != null && String(nextRaw).trim() !== '') {
            const s = String(nextRaw).trim();
            if (/^\d+$/.test(s)) {
              const n = Number(s);
              const ms = n > 1e12 ? n : n * 1000;
              const d = new Date(ms);
              if (!Number.isNaN(d.getTime())) nextIso = d.toISOString();
            } else {
              const t = Date.parse(s);
              if (!Number.isNaN(t)) nextIso = new Date(t).toISOString();
            }
          }
          return {
            client_id: clientId,
            braze_id: id,
            name: String(b.name ?? b.title ?? ""),
            broadcast_type: String(b.type ?? b.channel ?? b.message_type ?? ""),
            next_send_time: nextIso,
            schedule_type: (b.schedule_type as string) || null,
            tags: normalizeStringArray(b.tags),
            synced_at: nowIso,
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;
      if (srows.length > 0) {
        const { error: schErr } = await supabase
          .from("braze_scheduled_broadcasts")
          .insert(srows);
        if (schErr) {
          console.warn('braze_scheduled_broadcasts insert:', schErr.message, schErr);
          pushDbErr('braze_scheduled_broadcasts', schErr);
        } else {
          scheduledBroadcastsCount = srows.length;
          console.log(`braze_scheduled_broadcasts: inserted ${srows.length} rows for client`);
        }
      } else {
        console.log('braze_scheduled_broadcasts: no rows to insert (API list empty or unparsed)');
      }
    } catch (e) {
      console.warn('scheduled_broadcasts sync failed:', e);
    }

    } // end else (!campaignsOnly) — segments + scheduled broadcasts
    } // end !touchpointsOnly (campaigns, segments, scheduled_broadcasts)

    // === Update schema_cache with summary + lightweight campaign list (Settings + Campaigns fallback) ===
    const schemaCacheCampaigns = allCampaignList.slice(0, 300).map((c) => ({
      id: c.id,
      name: c.name,
      last_sent: c.last_sent,
    }));

    const schemaCache = {
      cache_version: 11,
      saved_at: nowIso,
      rest_endpoint: brazeRestEndpoint,
      force_canvas_fast_path: FORCE_CANVAS_FAST_PATH,
      canvas_list_total: allCanvasList.length,
      canvas_minimal_upserted: canvasMinimalUpserted,
      canvases_count: processedCount,
      canvases_enabled_count: enabledCount,
      campaigns_count: campaignsProcessedCount,
      campaigns_enabled_count: campaignsEnabledCount,
      canvases_data_series_updated: canvasDataSeriesUpdatedTotal,
      campaign_analytics_rows_upserted: campaignAnalyticsRowsUpserted,
      /** Mirrors legacy shape: used in Settings + Campaigns when braze_campaigns rows are empty (e.g. RLS client mismatch or partial sync). */
      campaigns: schemaCacheCampaigns,
      kpi_series_points: kpiSeriesPoints,
      segments_synced: segmentsSynced,
      email_events_ingested: emailEventsSynced,
      scheduled_broadcasts: scheduledBroadcastsCount,
      last_sync: nowIso,
    };

    await supabase
      .from('client_platforms')
      .update({
        schema_cache: schemaCache,
        last_sync_at: nowIso,
        additional_config: { ...addCfg, rest_endpoint: brazeRestEndpoint },
      })
      .eq('id', platformId);

    // === Mark sync run complete ===
    const syncDuration = Date.now() - syncStart;
    if (syncRunId) {
      await supabase.from('braze_sync_runs').update({
        status: 'success',
        completed_at: nowIso,
        duration_ms: syncDuration,
        canvases_synced: processedCount,
        campaigns_synced: campaignsProcessedCount,
      }).eq('id', syncRunId);
    }

    console.log(
      `[Braze Sync] COMPLETE — summary:`,
      JSON.stringify({
        kpiLatestDau,
        kpiLatestMau,
        newUsers30dSum: kpiNewUsers30Sum,
        hardBouncesInserted: emailHardBounceRows,
        unsubscribesInserted: emailUnsubRows,
        segmentsUpserted: segmentsSynced,
        canvasesListed: allCanvasList.length,
      }),
    );
    console.log(
      `[Braze Sync] Done in ${syncDuration}ms: canvas_list=${allCanvasList.length} minimal=${canvasMinimalUpserted} detail_enriched=${processedCount} canvas_data_series=${canvasDataSeriesUpdatedTotal} enabled=${enabledCount} campaigns=${campaignsProcessedCount} campaign_analytics_rows=${campaignAnalyticsRowsUpserted}`,
    );
    console.log(
      JSON.stringify({
        event: 'braze_sync_row_counts',
        client_id: clientId,
        platform_id: platformId,
        canvas_list_total: allCanvasList.length,
        canvas_minimal_upserted: canvasMinimalUpserted,
        canvases_detail_enriched: processedCount,
        canvases_data_series_updated: canvasDataSeriesUpdatedTotal,
        canvases_enabled_detail: enabledCount,
        campaigns_processed: campaignsProcessedCount,
        campaigns_found: allCampaignList.length,
        campaign_analytics_rows_upserted: campaignAnalyticsRowsUpserted,
        kpi_series_points_upserted: kpiSeriesPoints,
        scheduled_broadcasts_inserted: scheduledBroadcastsCount,
        segments_synced: segmentsSynced,
        email_events_ingested: emailEventsSynced,
        duration_ms: syncDuration,
      }),
    );

    const storedAny =
      kpiSeriesPoints > 0 ||
      canvasMinimalUpserted > 0 ||
      segmentsSynced > 0 ||
      emailEventsSynced > 0 ||
      scheduledBroadcastsCount > 0 ||
      campaignsProcessedCount > 0 ||
      processedCount > 0 ||
      canvasDataSeriesUpdatedTotal > 0 ||
      campaignAnalyticsRowsUpserted > 0;

    const apiParsedAny =
      apiKpiPointsParsed > 0 ||
      allCanvasList.length > 0 ||
      allCampaignList.length > 0 ||
      apiEmailRecordsSeen > 0 ||
      apiSegmentsListed > 0 ||
      apiScheduledListed > 0;

    if (!apiParsedAny) {
      syncPartial = true;
      if (!syncStoppedReason) syncStoppedReason = "no_data";
      console.warn(
        "[Braze Sync] Parsed 0 rows from all Braze endpoints (HTTP OK but empty or unrecognized shape). Check REST cluster and response keys.",
      );
    } else if (apiParsedAny && !storedAny) {
      syncPartial = true;
      if (dbWriteErrors.length > 0) {
        if (!syncStoppedReason) syncStoppedReason = "db_write_failed";
        console.warn(
          "[Braze Sync] Braze returned data but nothing was persisted. DB errors:",
          dbWriteErrors,
        );
      } else {
        if (!syncStoppedReason) syncStoppedReason = "not_persisted";
        console.warn(
          "[Braze Sync] Parsed API rows but stored 0 (filters, constraints, or silent skips).",
        );
      }
    }

    let responseWarning: string | undefined;
    if (syncStoppedReason === "no_data") {
      responseWarning =
        "Braze sync completed but parsed 0 rows from all endpoints. Verify REST URL (cluster) and response shape.";
    } else if (syncStoppedReason === "db_write_failed") {
      responseWarning = `Database write failed: ${dbWriteErrors.slice(0, 3).join(" | ")}`;
    } else if (syncStoppedReason === "not_persisted") {
      responseWarning =
        "Braze returned rows but none were stored. Check Edge logs for filters (e.g. missing email on events) or DB constraints.";
    }

    return new Response(
      JSON.stringify({
        success: true,
        partial: syncPartial,
        stopped_reason: syncStoppedReason,
        warning: responseWarning,
        data: {
          sync_run_id: syncRunId,
          force_canvas_fast_path: FORCE_CANVAS_FAST_PATH,
          saved_at: nowIso,
          duration_ms: syncDuration,
          db_errors: dbWriteErrors,
          api_parsed: {
            kpi_points: apiKpiPointsParsed,
            canvas_list: allCanvasList.length,
            campaign_list: allCampaignList.length,
            email_records: apiEmailRecordsSeen,
            segment_rows: apiSegmentsListed,
            scheduled_broadcasts: apiScheduledListed,
          },
          counts: {
            canvases_found: allCanvasList.length,
            canvases_minimal_upserted: canvasMinimalUpserted,
            canvases_detail_enriched: processedCount,
            canvases_data_series_updated: canvasDataSeriesUpdatedTotal,
            canvases_enabled: enabledCount,
            campaigns_found: allCampaignList.length,
            campaigns_processed: campaignsProcessedCount,
            campaigns_enabled: campaignsEnabledCount,
            campaign_analytics_rows_upserted: campaignAnalyticsRowsUpserted,
            kpi_series_points: schemaCache.kpi_series_points,
            segments_synced: schemaCache.segments_synced,
            email_events_ingested: schemaCache.email_events_ingested,
            scheduled_broadcasts: schemaCache.scheduled_broadcasts,
          },
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    logger.error('Error syncing Braze:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
