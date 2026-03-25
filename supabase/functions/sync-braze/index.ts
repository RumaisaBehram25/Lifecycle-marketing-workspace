import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { validateAuth, validateClientAccess, authErrorResponse } from "../_shared/auth.ts";
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
const MAX_CANVASES_TO_PROCESS = 100;
const MAX_CAMPAIGNS_TO_PROCESS = 100;

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

// Retry wrapper with exponential back-off
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`Retrying after ${delay}ms (attempt ${attempt + 1}/${retries})...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

async function brazeFetch(endpoint: string, apiKey: string, restEndpoint: string) {
  return withRetry(async () => {
    const url = `${restEndpoint}/${endpoint}`;
    console.log(`Fetching Braze: ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

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
        throw new Error(`Braze API error ${response.status}: ${errorText.slice(0, 200)}`);
      }
      return response.json();
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
  raw_details?: Record<string, unknown>;
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
  return s.length > 0 ? s : "https://rest.iad-01.braze.com";
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
  }
  if (Array.isArray(json.results)) return json.results;
  return [];
}

function kpiNumericFromRow(
  row: Record<string, unknown>,
  metric: "dau" | "mau" | "new_users",
): number {
  if (metric === "dau") {
    const v =
      row.dau ??
      row.DAU ??
      row.daily_active_users ??
      row.unique_users;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (metric === "mau") {
    const v = row.mau ?? row.MAU ?? row.monthly_active_users;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  const v =
    row.new_users ??
    row.new_users_count ??
    row.daily_new_users;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

    const accessResult = await validateClientAccess(authResult.userClient!, clientId);
    if (!accessResult.success) {
      return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: platform, error: platformError } = await supabase
      .from('client_platforms')
      .select('*')
      .eq('id', platformId)
      .single();

    if (platformError || !platform) {
      throw new Error('Platform connection not found');
    }

    if (platform.platform !== 'braze') {
      throw new Error('This endpoint only supports Braze');
    }

    const apiKey = platform.api_key;
    if (!apiKey) {
      throw new Error('No API key configured for this platform');
    }

    const brazeRestEndpoint = normalizeRestEndpointUrl(
      restEndpoint ||
        (platform.additional_config as Record<string, unknown>)?.rest_endpoint ||
        "https://rest.iad-01.braze.com",
    );

    const addCfg = ((platform.additional_config as Record<string, unknown> | null) ?? {}) as Record<
      string,
      unknown
    >;
    const brazeKpiAppId = String(addCfg.braze_app_id ?? addCfg.app_id ?? '').trim();
    const kpiAppQuery = brazeKpiAppId ? `&app_id=${encodeURIComponent(brazeKpiAppId)}` : '';

    console.log("Starting Braze sync for client:", clientId, "REST:", brazeRestEndpoint);

    // === Create sync run entry ===
    const syncStart = Date.now();
    const { data: syncRun } = await supabase
      .from('braze_sync_runs')
      .insert({ client_id: clientId, platform_id: platformId, status: 'running' })
      .select('id')
      .single();
    const syncRunId = syncRun?.id as string | undefined;

    // === PHASE 1: Fetch ALL canvas IDs with names (lightweight) ===
    console.log('Phase 1: Fetching all canvas IDs...');
    const allCanvasList: CanvasListItem[] = [];
    const seenIds = new Set<string>();
    let canvasPage = 0;

    while (canvasPage < 50) {
      try {
        const canvasesData = await brazeFetch(
          `canvas/list?page=${canvasPage}&include_archived=false&limit=100`,
          apiKey,
          brazeRestEndpoint
        );
        const canvases = canvasesData.canvases || [];
        console.log(`Canvas page ${canvasPage}: ${canvases.length} items`);

        if (canvases.length === 0) break;

        for (const c of canvases) {
          if (!seenIds.has(c.id)) {
            seenIds.add(c.id);
            allCanvasList.push(c);
          }
        }

        canvasPage++;
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        logger.error(`Failed to fetch canvas page ${canvasPage}:`, err);
        break;
      }
    }

    console.log(`Total canvases found: ${allCanvasList.length}`);

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
    const nowIso = new Date().toISOString();
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
      const batch = canvasesToProcess.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(canvasesToProcess.length / BATCH_SIZE)}`);

      const batchResults = await Promise.allSettled(
        batch.map(async (c): Promise<ProcessedCanvas | null> => {
          const variants: ProcessedCanvas['variants'] = [];
          const steps: Record<string, unknown> = {};

          const enabledFromList = isTruthy(c.enabled ?? c.is_active ?? c.active ?? (c.status === 'active'));
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
            const details = await brazeFetch(`canvas/details?canvas_id=${c.id}`, apiKey, brazeRestEndpoint);

            enabled = isTruthy(
              details.enabled ?? details.canvas?.enabled ?? details.is_active ?? details.active ?? enabledFromList
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
            tags: c.tags || [],
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

          if (upsertErr) {
            console.warn(`Canvas upsert failed for ${c.id}:`, upsertErr.message);
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
    console.log('Phase 4: Fetching all campaign IDs...');
    const allCampaignList: CampaignListItem[] = [];
    const seenCampaignIds = new Set<string>();
    let campaignPage = 0;

    while (campaignPage < 50) {
      try {
        const campaignsData = (await brazeFetch(
          `campaigns/list?page=${campaignPage}&include_archived=false&sort_direction=desc`,
          apiKey,
          brazeRestEndpoint
        )) as Record<string, unknown>;
        const rawCampaigns =
          (campaignsData.campaigns as unknown[]) ||
          (campaignsData.items as unknown[]) ||
          brazeExportDataArray(campaignsData);
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
            tags: (row.tags as string[]) || [],
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
    let campaignsProcessedCount = 0;
    let campaignsEnabledCount = 0;
    const campaignDataSeriesEndingAt = encodeURIComponent(nowIso);

    for (let i = 0; i < campaignsToProcess.length; i += BATCH_SIZE) {
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
          for (const row of rowsToUpsert) {
            const { error: oneErr } = await supabase
              .from("braze_campaigns")
              .upsert(row, { onConflict: "client_id,braze_campaign_id" });
            if (oneErr) {
              console.warn("Campaign upsert failed:", oneErr.message, row.braze_campaign_id);
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

    // === PHASE 5: KPI series (DAU, MAU, new users) — up to 100 days each ===
    let kpiSeriesPoints = 0;
    const endingAtEnc = encodeURIComponent(new Date().toISOString());
    if (brazeKpiAppId) {
      console.log('KPI data_series: using app_id from platform additional_config:', brazeKpiAppId);
    } else {
      console.log('KPI data_series: workspace aggregate (set additional_config.braze_app_id to scope one app)');
    }
    const kpiMetrics: Array<{ metric: 'dau' | 'mau' | 'new_users'; path: string }> = [
      { metric: 'dau', path: `kpi/dau/data_series?length=100&ending_at=${endingAtEnc}${kpiAppQuery}` },
      { metric: 'mau', path: `kpi/mau/data_series?length=100&ending_at=${endingAtEnc}${kpiAppQuery}` },
      { metric: 'new_users', path: `kpi/new_users/data_series?length=100&ending_at=${endingAtEnc}${kpiAppQuery}` },
    ];
    for (const { metric, path } of kpiMetrics) {
      try {
        const kpiJson = (await brazeFetch(path, apiKey, brazeRestEndpoint)) as Record<
          string,
          unknown
        >;
        const series = brazeExportDataArray(kpiJson) as Array<Record<string, unknown>>;
        const rows = series
          .map((row) => {
            const d = seriesDateFromBrazeKpi(row.time ?? row.date ?? row.day);
            if (!d) return null;
            const v = kpiNumericFromRow(row, metric);
            return {
              client_id: clientId,
              metric,
              series_date: d,
              value: Number.isFinite(v) ? v : 0,
              synced_at: nowIso,
            };
          })
          .filter(Boolean) as Array<{
            client_id: string;
            metric: string;
            series_date: string;
            value: number;
            synced_at: string;
          }>;
        if (rows.length > 0) {
          const { error: kpiErr } = await supabase.from('braze_kpi_series').upsert(rows, {
            onConflict: 'client_id,metric,series_date',
          });
          if (kpiErr) console.warn('braze_kpi_series upsert:', kpiErr.message);
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
        }
      } catch (e) {
        console.warn(`KPI ${metric} sync failed (check API key permissions):`, e);
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    // === PHASE 6: Segment directory (paginated) ===
    let segmentsSynced = 0;
    try {
      let segPage = 1;
      while (segPage < 80) {
        const segJson = await brazeFetch(
          `segments/list?page=${segPage}&sort_direction=desc`,
          apiKey,
          brazeRestEndpoint
        );
        const segs = (segJson.segments || []) as Array<Record<string, unknown>>;
        if (segs.length === 0) break;
        const rows = segs
          .map((s) => {
            const id = String(s.id ?? s.segment_id ?? '');
            if (!id) return null;
            return {
              client_id: clientId,
              braze_segment_id: id,
              name: String(s.name || 'Segment'),
              tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
              raw: s as Record<string, unknown>,
              synced_at: nowIso,
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;
        if (rows.length > 0) {
          const { error: segErr } = await supabase.from('braze_segments_sync').upsert(rows, {
            onConflict: 'client_id,braze_segment_id',
          });
          if (segErr) console.warn('braze_segments_sync upsert:', segErr.message);
          else segmentsSynced += rows.length;
        }
        segPage++;
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (e) {
      console.warn('Segment list sync failed:', e);
    }

    // === PHASE 7: Hard bounces & unsubscribes (paginated, last 30 days) ===
    let emailEventsSynced = 0;
    const endDateStr = new Date().toISOString().slice(0, 10);
    const startDateStr = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    async function syncEmailEventPages(
      eventType: 'hard_bounce' | 'unsubscribe',
      apiSuffix: string,
      timeField: 'hard_bounced_at' | 'unsubscribed_at'
    ) {
      let offset = 0;
      const limit = 500;
      for (let p = 0; p < 25; p++) {
        try {
          const q = `${apiSuffix}?start_date=${startDateStr}&end_date=${endDateStr}&limit=${limit}&offset=${offset}&sort_direction=desc`;
          const j = await brazeFetch(q, apiKey, brazeRestEndpoint);
          const emails = (j.emails || []) as Array<Record<string, string | undefined>>;
          if (emails.length === 0) break;
          const rows = emails
            .map((e) => {
              const em = (e.email || '').trim();
              if (!em) return null;
              const at = e[timeField] || nowIso;
              return {
                client_id: clientId,
                event_type: eventType,
                email: em,
                occurred_at: at,
              };
            })
            .filter(Boolean) as Array<Record<string, unknown>>;
          if (rows.length > 0) {
            const { error: evErr } = await supabase.from('braze_email_events').insert(rows, {
              ignoreDuplicates: true,
            });
            if (!evErr) emailEventsSynced += rows.length;
            else console.warn('braze_email_events insert:', evErr.message);
          }
          if (emails.length < limit) break;
          offset += limit;
        } catch (err) {
          console.warn(`${eventType} sync page failed:`, err);
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    await syncEmailEventPages('hard_bounce', 'email/hard_bounces', 'hard_bounced_at');
    await syncEmailEventPages('unsubscribe', 'email/unsubscribes', 'unsubscribed_at');

    // === PHASE 8: Upcoming scheduled campaigns & Canvases ===
    let scheduledBroadcastsCount = 0;
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
        brazeExportDataArray(schJson);
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
            tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
            synced_at: nowIso,
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;
      if (srows.length > 0) {
        const { error: schErr } = await supabase
          .from("braze_scheduled_broadcasts")
          .insert(srows);
        if (schErr) console.warn('braze_scheduled_broadcasts insert:', schErr.message, schErr);
        else {
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
      cache_version: 9,
      saved_at: nowIso,
      rest_endpoint: brazeRestEndpoint,
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
        additional_config: { rest_endpoint: brazeRestEndpoint },
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

    console.log(`Braze sync complete in ${syncDuration}ms: ${processedCount} canvases, ${enabledCount} enabled, ${campaignsProcessedCount} campaigns`);
    console.log(
      JSON.stringify({
        event: 'braze_sync_row_counts',
        client_id: clientId,
        platform_id: platformId,
        canvases_processed: processedCount,
        canvases_found: allCanvasList.length,
        campaigns_processed: campaignsProcessedCount,
        campaigns_found: allCampaignList.length,
        kpi_series_points_upserted: kpiSeriesPoints,
        scheduled_broadcasts_inserted: scheduledBroadcastsCount,
        segments_synced: segmentsSynced,
        email_events_ingested: emailEventsSynced,
        duration_ms: syncDuration,
      }),
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          sync_run_id: syncRunId,
          saved_at: nowIso,
          duration_ms: syncDuration,
          counts: {
            canvases_found: allCanvasList.length,
            canvases_processed: processedCount,
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
