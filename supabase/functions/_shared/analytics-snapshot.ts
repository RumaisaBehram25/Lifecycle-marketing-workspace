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
    `This is the same underlying data as the **Analytics** tab and related tables—not a browser tab preview. ` +
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
  block += formatJsonRows("braze_canvases (lifecycle)", bundle.braze_canvases as unknown[], 25);

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
    "\nFor **Overview** questions, prefer **braze_campaign_totals** and **braze_usage** above. " +
    "For journeys, also use **braze_canvases**.\n";

  return block;
}

async function buildAnalyticsSnapshotFallback(
  supabase: SupabaseClient,
  clientId: string,
): Promise<string> {
  let block =
    `\n## ANALYTICS & CRM DATA (client_id: \`${clientId}\`) — fallback reader\n` +
    `**Note:** RPC \`analytics_bundle_for_copilot\` unavailable; using paged reads (may be slower / capped). ` +
    `Run migration \`20260322100000_analytics_bundle_for_copilot.sql\` for exact totals.\n`;

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
