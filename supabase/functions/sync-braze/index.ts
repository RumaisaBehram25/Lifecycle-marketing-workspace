import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { validateAuth, validateClientAccessForEdge, authErrorResponse } from "../_shared/auth.ts";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

// Reduced batch size and limits for memory safety
const BATCH_SIZE = 3;
const MAX_HTML_SIZE = 50000;
const FALLBACK_BRAZE_REST_URL = "https://rest.iad-06.braze.com";

function clampIntEnv(key: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(key);
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Full detail + analytics fetch for top N canvases (list still syncs all). Default lowered to avoid ~150s Edge HTTP limit. */
const MAX_CANVASES_TO_PROCESS = clampIntEnv("BRAZE_SYNC_MAX_CANVAS_DETAIL", 50, 1, 300);
const MAX_CAMPAIGNS_TO_PROCESS = clampIntEnv("BRAZE_SYNC_MAX_CAMPAIGNS", 35, 1, 200);
const MAX_SEGMENT_PAGES = clampIntEnv("BRAZE_SYNC_MAX_SEGMENT_PAGES", 40, 1, 200);
const MAX_EMAIL_EVENT_PAGES = clampIntEnv("BRAZE_SYNC_MAX_EMAIL_PAGES", 35, 1, 120);

/** Supabase Edge gateway ~150s; stop heavy work before that and return 200 with partial counts. */
function maxSyncWallMs(): number {
  const raw = Deno.env.get("BRAZE_SYNC_MAX_WALL_MS");
  const n = raw ? Number(raw) : 135000;
  if (!Number.isFinite(n)) return 135000;
  return Math.min(145000, Math.max(60000, Math.floor(n)));
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
  if (html.length <= MAX_HTML_SIZE) return html;
  return html.slice(0, MAX_HTML_SIZE) + '<!-- truncated -->';
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

/** Prefer unique_*; otherwise max of totals (push / IAM) to avoid double-counting. */
function variationOpens(v: Record<string, unknown>): number {
  const uo = firstFiniteNumber(v, ['unique_opens']);
  if (uo > 0) return uo;
  return Math.max(
    firstFiniteNumber(v, ['opens']),
    firstFiniteNumber(v, ['direct_opens']),
    firstFiniteNumber(v, ['total_opens']),
    firstFiniteNumber(v, ['read']),
  );
}

function variationClicks(v: Record<string, unknown>): number {
  const uc = firstFiniteNumber(v, ['unique_clicks']);
  if (uc > 0) return uc;
  return Math.max(
    firstFiniteNumber(v, ['clicks']),
    firstFiniteNumber(v, ['body_clicks']),
    firstFiniteNumber(v, ['total_clicks']),
    firstFiniteNumber(v, ['first_button_clicks']),
    firstFiniteNumber(v, ['second_button_clicks']),
  );
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
        const imp = Math.max(
          firstFiniteNumber(v, ['unique_impressions']),
          firstFiniteNumber(v, ['impressions']),
          firstFiniteNumber(v, ['total_impressions']),
        );
        const sendAdd = s > 0 ? s : imp;
        const delAdd = d > 0 ? d : (imp > 0 ? imp : sendAdd);
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await validateAuth(req);
    if (!authResult.success) {
      return authErrorResponse(authResult.error!, authResult.status!, corsHeaders);
    }

    const { clientId, platformId, restEndpoint } = await req.json();

    if (!clientId || !platformId) {
      throw new Error('clientId and platformId are required');
    }

    if (!authResult.userId) {
      return authErrorResponse('Unauthorized', 401, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const accessResult = await validateClientAccessForEdge(
      supabase,
      authResult.userId,
      clientId,
    );
    if (!accessResult.success) {
      return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
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

    console.log("[Braze Sync] START — clientId=", clientId, "REST=", brazeRestEndpoint);
    console.log(
      "[Braze Sync] KPI scope:",
      brazeKpiAppId ? `app_id=${brazeKpiAppId} (from additional_config.braze_kpi_app_id)` : "workspace aggregate — no app_id (omit braze_kpi_app_id for full-workspace KPI)",
    );

    // === Create sync run entry ===
    const syncStart = Date.now();
    const { data: syncRun } = await supabase
      .from('braze_sync_runs')
      .insert({ client_id: clientId, platform_id: platformId, status: 'running' })
      .select('id')
      .single();
    const syncRunId = syncRun?.id as string | undefined;
    const nowIso = new Date().toISOString();

    const maxWallMs = maxSyncWallMs();
    const syncOverBudget = () => Date.now() - syncStart > maxWallMs;
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

    // === PHASE KPI (early): braze_kpi_series — runs before heavy canvas/campaign work to survive ~150s Edge limit ===
    console.log("[SYNC] Starting: kpi_metrics");
    console.log('[START] KPI series (braze_kpi_series) — DAU / MAU / new_users');
    let kpiSeriesPoints = 0;
    let kpiLatestDau = 0;
    let kpiLatestMau = 0;
    let kpiNewUsers30Sum = 0;
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

    // === PHASE 1: Fetch ALL canvas IDs with names (lightweight) — paginate until empty ===
    console.log('[SYNC] Starting: canvases');
    console.log('[Braze Sync] Fetching canvas list (paginated, include_archived=false)...');
    const allCanvasList: CanvasListItem[] = [];
    const seenIds = new Set<string>();
    let canvasPage = 0;

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

    // === PHASE 1b: Upsert every canvas from list (minimal row) so DB count matches Braze ===
    let canvasMinimalUpserted = 0;
    const minimalChunks: CanvasListItem[][] = [];
    for (let i = 0; i < allCanvasList.length; i += 40) {
      minimalChunks.push(allCanvasList.slice(i, i + 40));
    }
    for (const chunk of minimalChunks) {
      const minimalRows = chunk.map((c) => {
        const enabledList = inferCanvasEnabledFromListItem(c);
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
          raw_variants: [] as unknown[],
          raw_steps: {} as Record<string, unknown>,
          total_steps: 0,
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

    // === PHASE EMAIL (early): hard bounces + unsubscribes — before heavy canvas/campaign/segment work ===
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

    // === PHASE 2: Score and prioritize canvases ===
    console.log('Phase 2: Scoring canvases by lifecycle priority...');
    const scoredCanvases = allCanvasList
      .filter(c => !c.draft && !c.archived)
      .map(c => ({
        canvas: c,
        priority: getCanvasPriority(c.name),
      }))
      .sort((a, b) => b.priority - a.priority);

    // Log top scoring canvases for debugging
    console.log('Top 20 priority canvases:', scoredCanvases.slice(0, 20).map(s => `${s.priority}: ${s.canvas.name}`));

    const canvasesToProcess = scoredCanvases.slice(0, MAX_CANVASES_TO_PROCESS).map(s => s.canvas);
    console.log(`Will process top ${canvasesToProcess.length} canvases`);

    // === PHASE 3: Process canvases in small batches with immediate checkpointing ===
    console.log('Phase 3: Processing canvas details in batches of 3...');
    let processedCount = 0;
    let enabledCount = 0;

    // Build template map first (limited to 30 templates for memory)
    const templateHtmlMap = new Map<string, { subject: string; preheader: string; html: string }>();
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

    // Process canvases in batches
    for (let i = 0; i < canvasesToProcess.length; i += BATCH_SIZE) {
      if (syncOverBudget()) {
        console.warn(
          "[Braze Sync] Time budget: stopping canvas detail enrichment early (remaining canvases skipped)",
        );
        syncPartial = true;
        syncStoppedReason = "time_budget";
        break;
      }
      const batch = canvasesToProcess.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(canvasesToProcess.length / BATCH_SIZE)}`);

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

          // Activity metrics
          let entries_last_30d = 0;
          let entries_last_60d = 0;
          let sends_last_30d = 0;
          let last_activity_at: string | undefined;

          try {
            // Fetch canvas details
            const details = (await brazeFetch(
              `canvas/details?canvas_id=${c.id}`,
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

            // Entry type
            entryType = details.schedule_type || details.entry_schedule?.type;

            // Trigger event name
            if (details.entry_schedule?.trigger_event_name) {
              triggerEventName = details.entry_schedule.trigger_event_name;
            } else if (details.trigger_events?.length > 0) {
              triggerEventName = details.trigger_events
                .map((t: unknown) => (typeof t === 'string' ? t : (t as Record<string, string>).name || (t as Record<string, string>).event_name))
                .join(', ');
            } else if (details.entry_rules?.trigger?.custom_event?.custom_event_name) {
              triggerEventName = details.entry_rules.trigger.custom_event.custom_event_name;
            }

            // Segment name
            entrySegmentName = details.entry_audience_name || details.entry_segment?.name || details.entry_schedule?.segment?.name;

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

            // Parse variants
            if (details.variants?.length > 0) {
              for (const v of details.variants) {
                variants.push({
                  name: v.name || 'Variant',
                  percentage: v.percentage || 100,
                  first_step_id: v.first_step_id || null,
                });
              }
            }

            // Parse steps (skip HTML to save memory - store template IDs)
            if (details.steps?.length > 0) {
              for (const s of details.steps) {
                if (!s.id) continue;

                const messages: Array<Record<string, unknown>> = [];
                if (s.messages && typeof s.messages === 'object') {
                  const entries = Array.isArray(s.messages)
                    ? (s.messages as unknown[]).map((m, idx) => [`message_${idx}`, m])
                    : Object.entries(s.messages);

                  for (const [msgKey, msgData] of entries) {
                    const msg = msgData as Record<string, unknown>;
                    const inferredChannel = typeof msgKey === 'string' ? msgKey : undefined;
                    const channel = (msg.channel as string) || inferredChannel || (s.channels?.[0] as string) || 'email';

                    const templateId = msg.email_template_id || msg.template_id;
                    let subject = msg.subject as string | undefined;
                    let preheader = msg.preheader as string | undefined;
                    let html: string | undefined;

                    if (channel === 'email' && templateId && templateHtmlMap.has(templateId as string)) {
                      const tpl = templateHtmlMap.get(templateId as string)!;
                      html = tpl.html;
                      subject = subject || tpl.subject;
                      preheader = preheader || tpl.preheader;
                    } else if (channel === 'email') {
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

                const nextPaths: Array<{ name: string; next_step_id: string; percentage?: number }> = [];
                if (s.next_paths?.length > 0) {
                  for (const p of s.next_paths) {
                    nextPaths.push({
                      name: p.name || 'Path',
                      next_step_id: p.next_step_id || '',
                      percentage: p.percentage,
                    });
                  }
                }

                const nextStepIds = Array.isArray(s.next_step_ids) && s.next_step_ids.length > 0
                  ? s.next_step_ids
                  : nextPaths.map(p => p.next_step_id).filter(Boolean);

                steps[s.id] = {
                  id: s.id,
                  name: s.name || s.type || 'Step',
                  type: s.type || 'message',
                  channel: s.channels?.[0] || messages[0]?.channel,
                  delay_seconds: s.delay?.value,
                  delay_formatted: s.delay ? formatDelay(s.delay.value) : undefined,
                  next_step_ids: nextStepIds,
                  next_paths: nextPaths.length > 0 ? nextPaths : undefined,
                  messages: messages.length > 0 ? messages : undefined,
                };
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch details for canvas ${c.id}:`, err);
          }

          // Fetch activity data if canvas is enabled
          if (enabled) {
            try {
              const now = new Date();
              const end = now.toISOString().split('T')[0];
              const start60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

              const analyticsData = await brazeFetch(
                `canvas/data_series?canvas_id=${c.id}&length=60&ending_at=${end}T00:00:00Z`,
                apiKey,
                brazeRestEndpoint
              );

              if (analyticsData.data?.length > 0) {
                const dataSeries = analyticsData.data as Array<{ time: string; total_stats?: { entries?: number }; entries?: number }>;
                
                for (let j = 0; j < dataSeries.length; j++) {
                  const day = dataSeries[j];
                  const entries = day.total_stats?.entries ?? day.entries ?? 0;
                  entries_last_60d += entries;
                  if (j < 30) entries_last_30d += entries;
                  
                  if (entries > 0 && !last_activity_at) {
                    last_activity_at = day.time;
                  }
                }

                // Estimate sends from the data
                sends_last_30d = Math.floor(entries_last_30d * 0.9); // Rough estimate
              }
            } catch (err) {
              console.warn(`Failed to fetch analytics for canvas ${c.id}:`, err);
            }
          }

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
            last_activity_at,
          };
        })
      );

      // Immediately upsert this batch to the database (checkpointing)
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          const c = result.value;
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
            total_steps: c.total_steps || 0,
            raw_variants: c.variants || [],
            raw_steps: c.steps || {},
            conversion_events: c.conversion_events || [],
            entry_filters: c.entry_filters || [],
            exception_events: c.exception_events || [],
            entries_last_30d: c.entries_last_30d || 0,
            entries_last_60d: c.entries_last_60d || 0,
            sends_last_30d: c.sends_last_30d || 0,
            last_activity_at: c.last_activity_at || null,
            synced_at: nowIso,
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
            console.warn(`Canvas upsert failed for ${c.id}:`, upsertErr.message);
            pushDbErr("braze_canvases(detail)", upsertErr);
          } else {
            processedCount++;
            if (c.enabled) enabledCount++;
          }
        }
      }

      // Release memory between batches
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`Processed ${processedCount} canvases, ${enabledCount} enabled`);

    // === PHASE 4: Fetch and process campaigns ===
    let campaignsProcessedCount = 0;
    let campaignsEnabledCount = 0;
    const allCampaignList: CampaignListItem[] = [];

    if (!syncOverBudget()) {
    console.log('Phase 4: Fetching all campaign IDs...');
    const seenCampaignIds = new Set<string>();
    let campaignPage = 0;

    while (campaignPage < 50) {
      if (syncOverBudget()) {
        console.warn(
          "[Braze Sync] Time budget: stopping campaign list pagination early",
        );
        syncPartial = true;
        syncStoppedReason = "time_budget";
        break;
      }
      try {
        const campaignsData = (await brazeFetch(
          `campaigns/list?page=${campaignPage}&include_archived=false&sort_direction=desc`,
          apiKey,
          brazeRestEndpoint
        )) as Record<string, unknown>;
        const rawCampaigns = getBrazeListArray(campaignsData, [
          "campaigns",
          "items",
          "data",
        ]);
        console.log(`Campaign page ${campaignPage}: ${rawCampaigns.length} items`);

        if (rawCampaigns.length === 0) break;

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

        campaignPage++;
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        logger.error(`Failed to fetch campaign page ${campaignPage}:`, err);
        break;
      }
    }

    console.log(`Total campaigns found: ${allCampaignList.length}`);

    const campaignsToProcess = allCampaignList.slice(0, MAX_CAMPAIGNS_TO_PROCESS);
    console.log(`Will process ${campaignsToProcess.length} campaigns`);

    console.log('Phase 4b: Processing campaign details in batches of 3...');
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

          // Fetch campaign details
          try {
            const details = await brazeFetch(
              `campaigns/details?campaign_id=${encodeURIComponent(campaignId)}`,
              apiKey,
              brazeRestEndpoint
            );

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
                if (
                  typeof img === "string" &&
                  (img.startsWith("http") || img.startsWith("//")) &&
                  !preview_image_url
                ) {
                  preview_image_url = img.startsWith("//") ? `https:${img}` : img;
                }
              }

              // Email hero images (Braze often nests these only on email messages)
              for (const msg of msgEntries) {
                const ch = String(msg.channel ?? "").toLowerCase();
                if (!preview_image_url && (ch === "email" || ch.includes("email"))) {
                  const img =
                    msg.image_url ||
                    msg.thumbnail_url ||
                    msg.big_image ||
                    msg.url;
                  if (
                    typeof img === "string" &&
                    (img.startsWith("http") || img.startsWith("//"))
                  ) {
                    preview_image_url = img.startsWith("//") ? `https:${img}` : img;
                    break;
                  }
                }
              }
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
            raw_details: rawDetails,
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

      // Release memory between batches
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`Processed ${campaignsProcessedCount} campaigns, ${campaignsEnabledCount} enabled/sent`);
    } else {
      console.warn("[Braze Sync] Time budget: skipping campaign sync");
      syncPartial = true;
      syncStoppedReason = "time_budget";
    }

    // === PHASE 6: Segment directory → public.braze_segments_sync (not braze_segments) ===
    console.log("[SYNC] Starting: segments");
    console.log('[START] segments/list → braze_segments_sync');
    let segmentsSynced = 0;
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
    let scheduledBroadcastsCount = 0;
    let apiScheduledListed = 0;
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

    // === Update schema_cache with summary (no full canvas data) ===
    const schemaCache = {
      cache_version: 10,
      saved_at: nowIso,
      rest_endpoint: brazeRestEndpoint,
      canvas_list_total: allCanvasList.length,
      canvas_minimal_upserted: canvasMinimalUpserted,
      canvases_count: processedCount,
      canvases_enabled_count: enabledCount,
      campaigns_count: campaignsProcessedCount,
      campaigns_enabled_count: campaignsEnabledCount,
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
      `[Braze Sync] Done in ${syncDuration}ms: canvas_list=${allCanvasList.length} minimal=${canvasMinimalUpserted} detail_enriched=${processedCount} enabled=${enabledCount} campaigns=${campaignsProcessedCount}`,
    );
    console.log(
      JSON.stringify({
        event: 'braze_sync_row_counts',
        client_id: clientId,
        platform_id: platformId,
        canvas_list_total: allCanvasList.length,
        canvas_minimal_upserted: canvasMinimalUpserted,
        canvases_detail_enriched: processedCount,
        canvases_enabled_detail: enabledCount,
        campaigns_processed: campaignsProcessedCount,
        campaigns_found: allCampaignList.length,
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
      processedCount > 0;

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
            canvases_enabled: enabledCount,
            campaigns_found: allCampaignList.length,
            campaigns_processed: campaignsProcessedCount,
            campaigns_enabled: campaignsEnabledCount,
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
