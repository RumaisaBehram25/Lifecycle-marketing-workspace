import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateAuth, validateClientAccess, authErrorResponse } from "../_shared/auth.ts";
import { AI_REPORTS_ANSWER_CONTRACT_SUMMARY } from "../_shared/ai-copilot-behavior.ts";
import { logger } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROW_CAP = 200;
/** More rows for time-series tables used in month-over-month math */
const SERIES_ROW_CAP = 500;
const JSONB_MAX = 1200;
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4000;

function clipJson(v: unknown, maxLen: number): unknown {
  if (v == null) return v;
  try {
    const s = JSON.stringify(v);
    if (s.length <= maxLen) return v;
    return s.slice(0, maxLen) + "…(truncated)";
  } catch {
    return null;
  }
}

function mapCampaignRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    channel: r.channel,
    status: r.status,
    sent_date: r.sent_date,
    raw_details: clipJson(r.raw_details, JSONB_MAX),
  };
}

function mapTouchpointFromCanvas(r: Record<string, unknown>) {
  const steps = r.raw_steps;
  return {
    canvas_id: r.braze_canvas_id,
    name: r.name,
    total_steps: r.total_steps,
    raw_steps: clipJson(steps, 4000),
  };
}

async function safeCount(
  supabase: ReturnType<typeof createClient>,
  table: string,
  clientId: string,
  clientCol = "client_id",
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(clientCol, clientId);
  if (error) {
    logger.warn(`[ai-analytics-report] count ${table}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

/** YYYY-MM from date string (campaign_analytics.date, kpi series_date, etc.) */
function monthKeyFromRowDate(d: unknown): string | null {
  if (d == null) return null;
  const s = String(d).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s.slice(0, 7);
}

function aggregateCampaignAnalyticsByMonth(rows: Record<string, unknown>[]) {
  const by = new Map<
    string,
    { delivered: number; opens: number; clicks: number; revenue: number; days: number }
  >();
  for (const r of rows) {
    const mk = monthKeyFromRowDate(r.date);
    if (!mk) continue;
    const cur = by.get(mk) ?? { delivered: 0, opens: 0, clicks: 0, revenue: 0, days: 0 };
    cur.delivered += Number(r.delivered ?? 0);
    cur.opens += Number(r.opens ?? 0);
    cur.clicks += Number(r.clicks ?? 0);
    cur.revenue += Number(r.revenue ?? 0);
    cur.days += 1;
    by.set(mk, cur);
  }
  return [...by.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, v]) => ({
      month,
      delivered: Math.round(v.delivered),
      opens: Math.round(v.opens),
      clicks: Math.round(v.clicks),
      revenue: Math.round(v.revenue * 100) / 100,
      open_rate_pct: v.delivered > 0 ? Math.round((v.opens / v.delivered) * 10000) / 100 : null,
      click_rate_pct: v.delivered > 0 ? Math.round((v.clicks / v.delivered) * 10000) / 100 : null,
      day_rows_in_sample: v.days,
    }));
}

/** One row per calendar month: per-metric sum + avg across daily points in the sample */
function aggregateKpiByMonth(
  rows: Array<{ metric?: string; series_date?: string; value?: unknown }>,
) {
  type Agg = { sum: number; n: number };
  const byMonth = new Map<string, Record<string, Agg>>();
  for (const r of rows) {
    const mk = monthKeyFromRowDate(r.series_date);
    if (!mk || !r.metric) continue;
    const met = String(r.metric);
    const v = Number(r.value ?? 0);
    if (!Number.isFinite(v)) continue;
    const bucket = byMonth.get(mk) ?? {};
    const cur = bucket[met] ?? { sum: 0, n: 0 };
    cur.sum += v;
    cur.n += 1;
    bucket[met] = cur;
    byMonth.set(mk, bucket);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, buckets]) => {
      const o: Record<string, unknown> = { month };
      for (const [met, { sum, n }] of Object.entries(buckets)) {
        o[`${met}_daily_avg_in_sample`] = n > 0 ? Math.round((sum / n) * 100) / 100 : 0;
        o[`${met}_daily_sum_in_sample`] = Math.round(sum * 100) / 100;
      }
      return o;
    });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const authResult = await validateAuth(req);
    if (!authResult.success) {
      return authErrorResponse(authResult.error!, authResult.status!, corsHeaders);
    }

    const body = await req.json().catch(() => ({})) as { client_id?: string; prompt?: string };
    const clientId = body.client_id?.trim();
    const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!clientId) {
      return new Response(JSON.stringify({ error: "client_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!userPrompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessResult = await validateClientAccess(authResult.userClient!, clientId);
    if (!accessResult.success) {
      return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured for this project" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: clientRow, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, slug, industry, is_active, website_url, brand_voice, tagline")
      .eq("id", clientId)
      .maybeSingle();
    if (clientErr) {
      logger.error("clients fetch:", clientErr);
    }

    const q = async <T>(label: string, fn: () => Promise<{ data: T | null; error: { message: string } | null }>): Promise<T[]> => {
      try {
        const r = await fn();
        if (r.error) {
          logger.warn(`[ai-analytics-report] ${label}:`, r.error.message);
          return [];
        }
        const v = r.data;
        return Array.isArray(v) ? v : v != null ? [v as unknown as T] : [];
      } catch (e) {
        logger.warn(`[ai-analytics-report] ${label} threw:`, e);
        return [];
      }
    };

    const [
      campaignsRes,
      canvasesRes,
      segmentsRes,
      segAnalyticsRes,
      kpiRes,
      customEventsRes,
      campaignAnalyticsRes,
      dataVisRes,
      prevReportsRes,
      platformsRes,
      briefsRes,
      lifecycleRes,
      usageAnalyticsRes,
      customEventSeriesRes,
      syncRunsRes,
    ] = await Promise.all([
      q("braze_campaigns", () =>
        supabase
          .from("braze_campaigns")
          .select("id, name, channel, status, sent_date, raw_details")
          .eq("client_id", clientId)
          .order("sent_date", { ascending: false })
          .limit(ROW_CAP)),
      q("braze_canvases", () =>
        supabase
          .from("braze_canvases")
          .select(
            "id, braze_canvas_id, name, total_steps, raw_steps, schedule_type, enabled, archived, tags, first_entry, last_entry, synced_at",
          )
          .eq("client_id", clientId)
          .eq("archived", false)
          .limit(ROW_CAP)),
      q("braze_segments_sync", () =>
        supabase
          .from("braze_segments_sync")
          .select("id, braze_segment_id, name, raw, synced_at")
          .eq("client_id", clientId)
          .limit(ROW_CAP)),
      q("braze_segment_analytics", () =>
        supabase
          .from("braze_segment_analytics")
          .select("segment_id, segment_name, size, date, created_at, client_id")
          .eq("client_id", clientId)
          .order("date", { ascending: false })
          .limit(ROW_CAP)),
      q("braze_kpi_series", () =>
        supabase
          .from("braze_kpi_series")
          .select("metric, series_date, value, synced_at")
          .eq("client_id", clientId)
          .order("series_date", { ascending: false })
          .limit(SERIES_ROW_CAP)),
      q("braze_custom_events", () =>
        supabase
          .from("braze_custom_events")
          .select("event_name, event_description, event_type, category, synced_at, raw")
          .eq("client_id", clientId)
          .limit(ROW_CAP)),
      q("braze_campaign_analytics", () =>
        supabase
          .from("braze_campaign_analytics")
          .select("campaign_id, campaign_name, channel, date, sent, delivered, opens, clicks, revenue")
          .eq("client_id", clientId)
          .order("date", { ascending: false })
          .limit(SERIES_ROW_CAP)),
      q("data_visibility", () =>
        supabase
          .from("data_visibility")
          .select("item_type, item_id, is_visible, client_id")
          .eq("client_id", clientId)
          .limit(ROW_CAP)),
      q("dashboard_ai_reports", () =>
        supabase
          .from("dashboard_ai_reports")
          .select("id, prompt, created_at, posted_by")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(50)),
      q("client_platforms", () =>
        supabase
          .from("client_platforms")
          .select("platform, is_connected, last_sync_at, schema_cache")
          .eq("client_id", clientId)),
      q("briefs", () =>
        supabase
          .from("briefs")
          .select("id, name, status, client_id, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(50)),
      q("lifecycle_overrides", () =>
        supabase.from("lifecycle_overrides").select("*").eq("client_id", clientId).limit(ROW_CAP)),
      q("braze_usage_analytics", () =>
        supabase
          .from("braze_usage_analytics")
          .select("*")
          .eq("client_id", clientId)
          .order("date", { ascending: false })
          .limit(SERIES_ROW_CAP)),
      q("braze_custom_event_series", () =>
        supabase
          .from("braze_custom_event_series")
          .select("event_name, unit, bucket_at, event_count, synced_at")
          .eq("client_id", clientId)
          .order("bucket_at", { ascending: false })
          .limit(SERIES_ROW_CAP)),
      q("braze_sync_runs", () =>
        supabase
          .from("braze_sync_runs")
          .select(
            "id, status, started_at, completed_at, duration_ms, canvases_synced, campaigns_synced, segments_synced, templates_synced, error_message",
          )
          .eq("client_id", clientId)
          .order("started_at", { ascending: false })
          .limit(40)),
    ]);

    const countPairs = await Promise.all([
      safeCount(supabase, "braze_campaigns", clientId),
      safeCount(supabase, "braze_canvases", clientId),
      safeCount(supabase, "braze_segments_sync", clientId),
      safeCount(supabase, "braze_segment_analytics", clientId),
      safeCount(supabase, "braze_kpi_series", clientId),
      safeCount(supabase, "braze_custom_events", clientId),
      safeCount(supabase, "braze_campaign_analytics", clientId),
      safeCount(supabase, "braze_custom_event_series", clientId),
    ]);

    const campaigns = campaignsRes.map((r) => mapCampaignRow(r as Record<string, unknown>));
    const touchpoints = canvasesRes.map((r) => mapTouchpointFromCanvas(r as Record<string, unknown>));
    const canvasList = canvasesRes.map((r) => {
      const x = r as Record<string, unknown>;
      return {
        id: x.braze_canvas_id,
        name: x.name,
        schedule_type: x.schedule_type,
        enabled: x.enabled,
        tags: x.tags,
        first_entry: x.first_entry,
        last_entry: x.last_entry,
        total_steps: x.total_steps,
      };
    });
    const segments = segmentsRes.map((r) => {
      const x = r as Record<string, unknown>;
      return {
        id: x.id,
        braze_segment_id: x.braze_segment_id,
        name: x.name,
        raw: clipJson(x.raw, JSONB_MAX),
        synced_at: x.synced_at,
      };
    });
    const segAnalytics = segAnalyticsRes.map((r) => {
      const x = r as Record<string, unknown>;
      return {
        segment_id: x.segment_id,
        segment_name: x.segment_name,
        size: x.size,
        recorded_at: x.date ?? x.created_at,
      };
    });
    const kpiSeries = kpiRes;
    const customEvents = customEventsRes.map((r) => {
      const x = r as Record<string, unknown>;
      return {
        event_name: x.event_name,
        event_description: x.event_description,
        event_type: x.event_type,
        category: x.category,
        synced_at: x.synced_at,
        raw: clipJson(x.raw, 800),
      };
    });
    const campaignAnalyticsRaw = campaignAnalyticsRes as Record<string, unknown>[];
    const campaignAnalytics = campaignAnalyticsRaw;
    const dataVisibility = dataVisRes;
    const previousReports = prevReportsRes.map((r) => {
      const x = r as Record<string, unknown>;
      return { id: x.id, prompt: x.prompt, created_at: x.created_at, posted_by: x.posted_by };
    });
    const clientPlatforms = platformsRes.map((r) => {
      const x = r as Record<string, unknown>;
      return {
        platform: x.platform,
        is_connected: x.is_connected,
        last_sync_at: x.last_sync_at,
        schema_cache: clipJson(x.schema_cache, 2000),
      };
    });
    const briefs = briefsRes;

    const campaignAnalytics_by_month = aggregateCampaignAnalyticsByMonth(campaignAnalyticsRaw);
    const kpi_by_month = aggregateKpiByMonth(
      kpiRes as Array<{ metric?: string; series_date?: string; value?: unknown }>,
    );

    const lifecycleOverrides = lifecycleRes;
    const brazeUsageAnalytics = usageAnalyticsRes;
    const customEventSeries = customEventSeriesRes;
    const brazeSyncRuns = syncRunsRes;

    const cioRows = await q("customerio_campaigns", () =>
      supabase
        .from("customerio_campaigns")
        .select("cio_campaign_id, name, state, type, created_at_cio, updated_at_cio, tags")
        .eq("client_id", clientId)
        .order("updated_at_cio", { ascending: false })
        .limit(ROW_CAP));

    const context = {
      _authoritative_data_note:
        "This object was loaded server-side from Supabase for this client_id (full database access for BRCG). The arrays below ARE the actual synced rows. If a list is empty or totals are 0, the workspace has not synced that data yet — do NOT claim you lack access or permission. For month-over-month, prefer computed_summaries when present, plus braze_campaign_analytics_sample and braze_kpi_series.",
      client: clientRow ?? { id: clientId },
      row_limits: {
        default_table_rows: ROW_CAP,
        series_table_rows: SERIES_ROW_CAP,
        jsonb_char_cap: JSONB_MAX,
      },
      table_totals: {
        braze_campaigns: countPairs[0],
        braze_canvases: countPairs[1],
        braze_segments_sync: countPairs[2],
        braze_segment_analytics: countPairs[3],
        braze_kpi_series: countPairs[4],
        braze_custom_events: countPairs[5],
        braze_campaign_analytics: countPairs[6],
        braze_custom_event_series: countPairs[7],
      },
      computed_summaries: {
        campaign_analytics_by_month: campaignAnalytics_by_month,
        kpi_series_by_month: kpi_by_month,
      },
      braze_campaigns_sample: campaigns,
      braze_canvases: canvasList,
      /** Canvas `raw_steps` — closest to “touchpoints” in this schema (no separate braze_touchpoints table). */
      braze_touchpoints_from_canvas_steps: touchpoints,
      braze_segments_sync: segments,
      braze_segment_analytics: segAnalytics,
      braze_kpi_series_raw_daily_sample: kpiSeries,
      braze_custom_events: customEvents,
      braze_campaign_analytics_daily_sample: campaignAnalytics,
      lifecycle_overrides: lifecycleOverrides,
      braze_usage_analytics_sample: brazeUsageAnalytics,
      braze_custom_event_series_sample: customEventSeries,
      braze_sync_runs_recent: brazeSyncRuns,
      data_visibility_starred_and_pins: dataVisibility,
      dashboard_ai_reports_previous: previousReports,
      client_platforms: clientPlatforms,
      briefs_recent: briefs,
      customerio_campaigns_sample: cioRows,
    };

    const system = `You are the BRCG marketing analytics assistant.

CRITICAL: The next block is VALID, LIVE DATA from this customer's Supabase workspace (queried with full service access). It is not a permission sample. You MUST analyze it directly.

Rules:
- Never say you lack access to "actual" data if this JSON contains any non-empty arrays or non-zero table_totals — use those numbers and names.
- If every list is empty and table_totals are 0, say clearly: "No rows synced for this workspace yet — run Braze sync / import CSV," not "I cannot access data."
- For month-over-month or trend questions: use computed_summaries.campaign_analytics_by_month and computed_summaries.kpi_series_by_month first, then the daily samples.
- Cite campaign names, segment names, metrics, and ISO dates from the JSON.

${AI_REPORTS_ANSWER_CONTRACT_SUMMARY}

CLIENT: ${(clientRow as { name?: string })?.name ?? "Workspace"} (id: ${clientId})

STRUCTURED DATA (authoritative):

${JSON.stringify(context, null, 0)}

PREVIOUS REPORT PROMPTS: ${JSON.stringify(previousReports, null, 0)}

Respond in clean markdown: headings, bullet lists, and markdown tables when comparing periods. End with a short bullet summary.`;

    const MAX_SYSTEM_CHARS = 175_000;
    const systemFinal =
      system.length > MAX_SYSTEM_CHARS
        ? system.slice(0, MAX_SYSTEM_CHARS) +
          "\n\n[SYSTEM CONTEXT TRUNCATED FOR API SIZE — prioritize samples above; mention gaps if needed.]"
        : system;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemFinal,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Anthropic error:", errorText);
      let detail = "AI request failed";
      try {
        const j = JSON.parse(errorText) as { error?: { message?: string } };
        detail = j.error?.message ?? detail;
      } catch {
        if (errorText.trim()) detail = errorText.trim().slice(0, 500);
      }
      return new Response(JSON.stringify({ error: detail }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text =
      Array.isArray(data.content) && data.content[0]?.type === "text"
        ? String(data.content[0].text ?? "")
        : "";

    return new Response(JSON.stringify({ report_markdown: text, model: MODEL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    logger.error("ai-analytics-report:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
