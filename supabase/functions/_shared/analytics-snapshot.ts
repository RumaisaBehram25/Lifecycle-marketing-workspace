/**
 * Injects analytics + related CRM tables into the ops-chat system prompt.
 * Prefer RPC `analytics_bundle_for_copilot` (exact full-table aggregates, matches Analytics tab).
 * Falls back to paginated reads if the RPC is missing.
 *
 * Edge uses the Supabase **service role** — RLS does not apply. The model must not claim
 * “no permission” or “can’t see the Analytics tab”; it receives the same underlying rows.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from "./logger.ts";

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

const BRAZE_PAGE = 800;
const BRAZE_MAX_PAGES = 200;

async function aggregateBrazeCampaignAnalyticsPaged(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{
  totals: {
    sent: number;
    delivered: number;
    opens: number;
    clicks: number;
    conversions: number;
    revenue: number;
    rowCount: number;
  };
  error?: string;
}> {
  const totals = {
    sent: 0,
    delivered: 0,
    opens: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    rowCount: 0,
  };

  try {
    for (let page = 0; page < BRAZE_MAX_PAGES; page++) {
      const from = page * BRAZE_PAGE;
      const to = from + BRAZE_PAGE - 1;
      const { data, error } = await supabase
        .from("braze_campaign_analytics")
        .select("sent, delivered, opens, clicks, conversions, revenue, sends_last_30d")
        .eq("client_id", clientId)
        .range(from, to);

      if (error) {
        return { totals, error: error.message };
      }
      const rows = data || [];
      if (rows.length === 0) break;

      for (const r of rows as Record<string, unknown>[]) {
        totals.sent += num(r.sent ?? r.sends_last_30d);
        totals.delivered += num(r.delivered);
        totals.opens += num(r.opens);
        totals.clicks += num(r.clicks);
        totals.conversions += num(r.conversions);
        totals.revenue += num(r.revenue);
      }
      totals.rowCount += rows.length;
      if (rows.length < BRAZE_PAGE) break;
    }
    return { totals };
  } catch (e) {
    logger.error("aggregateBrazeCampaignAnalyticsPaged:", e);
    return { totals, error: String(e) };
  }
}

function avgRate(rows: Record<string, unknown>[], key: string): number {
  const withVal = rows.filter((r) => num(r[key]) > 0);
  if (!withVal.length) return 0;
  return withVal.reduce((s, r) => s + num(r[key]), 0) / withVal.length;
}

/** Mirrors `src/lib/campaignDisplay.ts` normalizeCampaignChannel — used for Copilot directory counts. */
function normalizeCampaignChannelForSnapshot(
  raw: string | null | undefined,
): "email" | "sms" | "inapp" | "push" {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return "email";
  if (s === "email" || s.includes("email")) return "email";
  if (s === "sms" || s.includes("sms")) return "sms";
  if (
    s.includes("in_app") ||
    s.includes("in-app") ||
    s === "content_card" ||
    s === "inapp"
  ) {
    return "inapp";
  }
  if (s.includes("push") || s.includes("android") || s.includes("ios") || s.includes("web_push")) {
    return "push";
  }
  return "email";
}

function formatJsonRows(label: string, rows: unknown[], maxLines: number): string {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `\n### ${label}\n- No rows for this client.\n`;
  }
  let s = `\n### ${label} (${rows.length} row(s) in bundle)\n`;
  const slice = rows.slice(0, maxLines);
  for (const raw of slice) {
    const line = JSON.stringify(raw);
    s += `- ${line.length > 520 ? `${line.slice(0, 520)}…` : line}\n`;
  }
  if (rows.length > maxLines) {
    s += `- _…${rows.length - maxLines} more row(s) omitted for length_\n`;
  }
  return s;
}

function bundleToMarkdown(bundle: Record<string, unknown>): string {
  const clientId = String(bundle.client_id ?? "");
  let block =
    `\n## ANALYTICS & CRM DATA (client_id: \`${clientId}\`)\n` +
    `**Access:** Loaded server-side with Supabase **service role** (full read for this client). ` +
    `This matches **Analytics**, **Dashboard** (Braze tiles), **Campaigns** (braze_campaigns), and CSV/API imports into Supabase. ` +
    `**Never** tell the user you lack “Analytics tab permission”, “UI access”, or “cannot see their dashboard”; ` +
    `when this section contains numbers, those are authoritative. If a subsection is empty, say that table has no rows yet (import/sync).\n`;

  const totals = bundle.braze_campaign_totals as Record<string, unknown> | undefined;
  if (!totals) {
    block += "\n### braze_campaign_analytics (totals)\n- Not present in bundle.\n";
  } else {
    const rc = Number(totals.row_count ?? 0);
    if (rc === 0) {
      block += "\n### braze_campaign_analytics (totals)\n- No rows for this client.\n";
    } else {
      block += `\n### braze_campaign_analytics (totals — full table, matches Analytics tab sums)\n`;
      block += `- Row count: **${rc.toLocaleString()}**\n`;
      block += `- **Total Sent** (COALESCE(sent, sends_last_30d)): **${Number(totals.total_sent ?? 0).toLocaleString()}**\n`;
      block += `- **Total Delivered**: **${Number(totals.total_delivered ?? 0).toLocaleString()}**\n`;
      block += `- **Total Opens**: **${Number(totals.total_opens ?? 0).toLocaleString()}**\n`;
      block += `- **Total Clicks**: **${Number(totals.total_clicks ?? 0).toLocaleString()}**\n`;
      block += `- **Total Conversions**: **${Number(totals.total_conversions ?? 0).toLocaleString()}**\n`;
      block += `- **Total Revenue** (sum): **${Number(totals.total_revenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}**\n`;
    }
  }

  block += formatJsonRows("braze_campaign_analytics (recent rows)", bundle.braze_recent as unknown[], 35);
  block += formatJsonRows("braze_usage_analytics", bundle.braze_usage as unknown[], 25);
  block += formatJsonRows("braze_segment_analytics", bundle.braze_segments as unknown[], 30);
  block += formatJsonRows("customerio_campaigns", bundle.customerio_campaigns as unknown[], 40);
  block += formatJsonRows("customerio_broadcasts", bundle.customerio_broadcasts as unknown[], 20);

  const cvTot = bundle.braze_canvases_totals as Record<string, unknown> | undefined;
  if (cvTot != null) {
    block += `\n### braze_canvases (workspace totals — matches Lifecycle “Entries (60d)” hero sum)\n`;
    block += `- **Canvas rows** in \`braze_canvases\`: **${Number(cvTot.canvas_row_count ?? 0).toLocaleString()}**\n`;
    block += `- **Sum entries_last_60d** (all canvases): **${Number(cvTot.sum_entries_last_60d ?? 0).toLocaleString()}**\n`;
    block += `- **Sum entries_last_30d** (all canvases): **${Number(cvTot.sum_entries_last_30d ?? 0).toLocaleString()}**\n`;
    block += `- **Sum sends_last_30d** (all canvases): **${Number(cvTot.sum_sends_last_30d ?? 0).toLocaleString()}**\n`;
    block += `- Rows below are a **sample** (≤50) ordered by **entries_last_60d** descending — not the full directory.\n`;
  }

  block += formatJsonRows(
    "braze_canvases (top ≤50 by entries_last_60d)",
    bundle.braze_canvases as unknown[],
    25,
  );

  const kpiSum = bundle.braze_kpi_summary as Record<string, unknown> | undefined;
  if (kpiSum != null) {
    if (Number(kpiSum.kpi_row_count ?? 0) > 0) {
      block += `\n### braze_kpi_series (summary — same source as Analytics KPI cards)\n`;
      block += `- Rows in KPI series: **${Number(kpiSum.kpi_row_count ?? 0).toLocaleString()}**\n`;
      block += `- Latest **DAU** (most recent dau point): **${Number(kpiSum.latest_dau ?? 0).toLocaleString()}**\n`;
      block += `- Latest **MAU** (most recent mau point): **${Number(kpiSum.latest_mau ?? 0).toLocaleString()}**\n`;
      block += `- **New users (30d)** sum from KPI series: **${Number(kpiSum.new_users_sum_30d ?? 0).toLocaleString()}**\n`;
    } else {
      block += `\n### braze_kpi_series (summary)\n- No KPI series rows (sync Braze KPIs or import CSV).\n`;
    }
  }

  if (Array.isArray(bundle.braze_kpi_series)) {
    block += formatJsonRows("braze_kpi_series (recent points)", bundle.braze_kpi_series as unknown[], 40);
  }

  const campTot = bundle.braze_campaigns_totals as Record<string, unknown> | undefined;
  if (campTot != null) {
    block += `\n### braze_campaigns (workspace totals — matches Campaigns tab “Showing 1–N of N” when channel = All)\n`;
    block += `- **Campaign rows** in \`braze_campaigns\`: **${Number(campTot.row_count ?? 0).toLocaleString()}**\n`;
    block += `- **Email channel rows** (normalized like Campaigns filter “Email”): **${Number(campTot.email_row_count ?? 0).toLocaleString()}**\n`;
    block += `- Rows below are a **sample** (≤50) ordered by **sent_date** descending — not the full directory.\n`;
  }

  if (Array.isArray(bundle.braze_campaigns)) {
    block += formatJsonRows(
      "braze_campaigns (top ≤50 by sent_date — Campaigns tab sample)",
      bundle.braze_campaigns as unknown[],
      35,
    );
  }

  if (bundle.braze_segments_sync_count != null) {
    const segN = Number(bundle.braze_segments_sync_count);
    block += `\n### braze_segments_sync (segment directory)\n- Count: **${segN.toLocaleString()}**\n`;
  }
  if (Array.isArray(bundle.braze_segments_sync)) {
    block += formatJsonRows("braze_segments_sync (sample rows)", bundle.braze_segments_sync as unknown[], 25);
  }

  if (Array.isArray(bundle.braze_scheduled_broadcasts)) {
    block += formatJsonRows("braze_scheduled_broadcasts", bundle.braze_scheduled_broadcasts as unknown[], 20);
  }

  const em = bundle.braze_email_events_30d as Record<string, unknown> | undefined;
  if (em != null) {
    block += `\n### braze_email_events (last 30 days)\n`;
    block += `- **Hard bounces**: **${Number(em.hard_bounces ?? 0).toLocaleString()}**\n`;
    block += `- **Unsubscribes**: **${Number(em.unsubscribes ?? 0).toLocaleString()}**\n`;
  }

  const cio = (bundle.customerio_campaigns as Record<string, unknown>[]) || [];
  if (cio.length) {
    const dr = avgRate(cio, "delivery_rate");
    const or_ = avgRate(cio, "open_rate");
    const cr = avgRate(cio, "click_rate");
    const cvr = avgRate(cio, "conversion_rate");
    if (dr || or_ || cr || cvr) {
      block += `\n### customerio_campaigns (derived — avg rates where >0, like dashboard cards)\n`;
      block += `- Avg delivery_rate: **${dr.toFixed(2)}%**, open_rate: **${or_.toFixed(2)}%**, click_rate: **${cr.toFixed(2)}%**, conversion_rate: **${cvr.toFixed(2)}%**\n`;
    }
  }

  block +=
    "\nFor **Overview** / email performance, prefer **braze_campaign_totals** and **braze_usage**. " +
    "For **DAU/MAU/new users**, prefer **braze_kpi_summary** and **braze_usage**. " +
    "For **named one-off campaign counts**, use **braze_campaigns_totals** (full directory); the **braze_campaigns** list is a capped sample. " +
    "For **lifecycle entry volume**, use **braze_canvases_totals** (workspace sums); per-canvas lines are a capped sample.\n";

  return block;
}

async function buildAnalyticsSnapshotFallback(
  supabase: SupabaseClient,
  clientId: string,
): Promise<string> {
  let block =
    `\n## ANALYTICS & CRM DATA (client_id: \`${clientId}\`) — fallback reader\n` +
    `**Note:** RPC \`analytics_bundle_for_copilot\` unavailable; using paged reads (may be slower / capped). ` +
    `Apply latest \`analytics_bundle_for_copilot\` migration (e.g. \`20260410120000_analytics_bundle_braze_campaigns_totals.sql\`) for RPC-backed totals.\n`;

  const { totals, error: brazeErr } = await aggregateBrazeCampaignAnalyticsPaged(
    supabase,
    clientId,
  );

  if (brazeErr) {
    block += `\n### braze_campaign_analytics\n- Error: ${brazeErr}\n`;
  } else if (totals.rowCount === 0) {
    block += "\n### braze_campaign_analytics\n- No rows.\n";
  } else {
    block += `\n### braze_campaign_analytics (paged aggregate, ${totals.rowCount} rows read)\n`;
    block += `- **Total Sent**: **${Math.round(totals.sent).toLocaleString()}**\n`;
    block += `- **Total Delivered**: **${Math.round(totals.delivered).toLocaleString()}**\n`;
    block += `- **Total Opens / Clicks / Conversions**: ${Math.round(totals.opens).toLocaleString()} / ${Math.round(totals.clicks).toLocaleString()} / ${Math.round(totals.conversions).toLocaleString()}\n`;
    block += `- **Total Revenue**: **${totals.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}**\n`;
  }

  try {
    const { data } = await supabase
      .from("customerio_campaigns")
      .select("*")
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .limit(50);
    block += formatJsonRows("customerio_campaigns", (data ?? []) as unknown[], 35);
  } catch {
    block += "\n### customerio_campaigns\n- Error.\n";
  }

  try {
    const { data: kpi } = await supabase
      .from("braze_kpi_series")
      .select("metric,series_date,value")
      .eq("client_id", clientId)
      .order("series_date", { ascending: false })
      .limit(120);
    block += formatJsonRows("braze_kpi_series (fallback)", (kpi ?? []) as unknown[], 40);
  } catch {
    block += "\n### braze_kpi_series\n- Error or table missing.\n";
  }

  try {
    const { data: allCamps, error: campErr } = await supabase
      .from("braze_campaigns")
      .select("name,channel,status,sent_date,opens,clicks,deliveries,open_rate,click_rate,unsubs,segment")
      .eq("client_id", clientId);
    if (campErr) {
      block += `\n### braze_campaigns (fallback)\n- Error: ${campErr.message}\n`;
    } else {
      const rows = (allCamps ?? []) as Record<string, unknown>[];
      let emailN = 0;
      for (const r of rows) {
        if (normalizeCampaignChannelForSnapshot(String(r.channel ?? null)) === "email") emailN++;
      }
      block += `\n### braze_campaigns (workspace totals — fallback, matches Campaigns tab counts)\n`;
      block += `- **Campaign rows**: **${rows.length.toLocaleString()}**\n`;
      block += `- **Email channel rows** (normalized): **${emailN.toLocaleString()}**\n`;
      const sentMs = (r: Record<string, unknown>) => {
        const d = r.sent_date;
        if (d == null) return 0;
        const t = new Date(String(d)).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      const top = [...rows].sort((a, b) => sentMs(b) - sentMs(a)).slice(0, 50);
      block += formatJsonRows(
        "braze_campaigns (top 50 by sent_date, fallback)",
        top as unknown[],
        35,
      );
    }
  } catch (e) {
    block += `\n### braze_campaigns (fallback)\n- Error: ${String(e).slice(0, 200)}\n`;
  }

  try {
    const { data: cvRows, error: cvErr } = await supabase
      .from("braze_canvases")
      .select("entries_last_60d, entries_last_30d, sends_last_30d, name, enabled")
      .eq("client_id", clientId);
    if (cvErr) {
      block += `\n### braze_canvases (fallback)\n- Error: ${cvErr.message}\n`;
    } else {
      const rows = (cvRows ?? []) as Array<{
        entries_last_60d?: number | null;
        entries_last_30d?: number | null;
        sends_last_30d?: number | null;
      }>;
      let sum60 = 0;
      let sum30 = 0;
      let sumSends = 0;
      for (const r of rows) {
        sum60 += Number(r.entries_last_60d ?? 0) || 0;
        sum30 += Number(r.entries_last_30d ?? 0) || 0;
        sumSends += Number(r.sends_last_30d ?? 0) || 0;
      }
      block += `\n### braze_canvases (workspace totals — fallback, matches Lifecycle Entries sum)\n`;
      block += `- **Canvas rows**: **${rows.length.toLocaleString()}**\n`;
      block += `- **Sum entries_last_60d**: **${sum60.toLocaleString()}**\n`;
      block += `- **Sum entries_last_30d**: **${sum30.toLocaleString()}**\n`;
      block += `- **Sum sends_last_30d**: **${sumSends.toLocaleString()}**\n`;
      const top = [...rows]
        .sort(
          (a, b) =>
            (Number(b.entries_last_60d ?? 0) || 0) - (Number(a.entries_last_60d ?? 0) || 0),
        )
        .slice(0, 50);
      block += formatJsonRows("braze_canvases (top 50 by entries_last_60d, fallback)", top as unknown[], 25);
    }
  } catch (e) {
    block += `\n### braze_canvases (fallback)\n- Error: ${String(e).slice(0, 200)}\n`;
  }

  return block;
}

/** Markdown block appended to the CRM Copilot system prompt. */
export async function buildAnalyticsSnapshotBlock(
  supabase: SupabaseClient,
  clientId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("analytics_bundle_for_copilot", {
      p_client_id: clientId,
    });

    if (error) {
      logger.error("analytics_bundle_for_copilot RPC:", error.message);
      return await buildAnalyticsSnapshotFallback(supabase, clientId);
    }

    if (data && typeof data === "object") {
      return bundleToMarkdown(data as Record<string, unknown>);
    }
  } catch (e) {
    logger.error("buildAnalyticsSnapshotBlock:", e);
  }

  return await buildAnalyticsSnapshotFallback(supabase, clientId);
}
