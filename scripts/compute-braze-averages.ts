import { readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";

// --- Types ---

interface CampaignRow {
  date: string;
  campaign_id: string;
  campaign_name: string;
  variation_api_id: string;
  channel: string;
  sent: number;
  delivered: number;
  opens: number;
  unique_opens: number;
  clicks: number;
  unique_clicks: number;
  unsubscribes: number;
  bounces: number;
  reported_spam: number;
  unique_recipients: number;
  conversions: number;
  conversions_by_send_time: number;
  revenue: number;
}

interface AggregatedCampaign {
  campaign_name: string;
  date_range: string;
  channel: string;
  total_sent: number;
  total_delivered: number;
  total_opens: number;
  unique_opens: number;
  total_clicks: number;
  unique_clicks: number;
  bounces: number;
  unsubscribes: number;
  spam_reports: number;
  conversions: number;
  revenue: number;
}

interface ComputedCampaign extends AggregatedCampaign {
  delivery_rate: string;
  open_rate: string;
  unique_open_rate: string;
  click_rate: string;
  unique_click_rate: string;
  click_to_open_rate: string;
  bounce_rate: string;
  unsubscribe_rate: string;
  spam_rate: string;
  conversion_rate: string;
}

// --- CSV Parsing ---

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (values[i] ?? "").trim();
    });
    return row;
  });
}

function parseCampaignCSV(filePath: string): CampaignRow[] {
  const content = readFileSync(filePath, "utf-8");
  return parseCSV(content).map((row) => ({
    date: row.date,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    variation_api_id: row.variation_api_id,
    channel: row.channel,
    sent: Number(row.sent) || 0,
    delivered: Number(row.delivered) || 0,
    opens: Number(row.opens) || 0,
    unique_opens: Number(row.unique_opens) || 0,
    clicks: Number(row.clicks) || 0,
    unique_clicks: Number(row.unique_clicks) || 0,
    unsubscribes: Number(row.unsubscribes) || 0,
    bounces: Number(row.bounces) || 0,
    reported_spam: Number(row.reported_spam) || 0,
    unique_recipients: Number(row.unique_recipients) || 0,
    conversions: Number(row.conversions) || 0,
    conversions_by_send_time: Number(row.conversions_by_send_time) || 0,
    revenue: Number(row.revenue) || 0,
  }));
}

// --- Aggregation (Story 1) ---

export function aggregateByCampaignVariation(
  rows: CampaignRow[]
): AggregatedCampaign[] {
  // First pass: find which campaign_ids have multiple variations
  const variationsByCampaign = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!variationsByCampaign.has(row.campaign_id)) {
      variationsByCampaign.set(row.campaign_id, new Set());
    }
    variationsByCampaign.get(row.campaign_id)!.add(row.variation_api_id);
  }

  // Build sorted variation labels for multi-variation campaigns
  const variationLabels = new Map<string, string>();
  for (const [campaignId, variations] of variationsByCampaign) {
    if (variations.size > 1) {
      const sorted = Array.from(variations).sort();
      sorted.forEach((varId, idx) => {
        const label = String.fromCharCode(65 + idx); // A, B, C, ...
        variationLabels.set(`${campaignId}|${varId}`, label);
      });
    }
  }

  // Aggregate by (campaign_id, variation_api_id, channel)
  const groups = new Map<
    string,
    {
      campaign_id: string;
      campaign_name: string;
      variation_api_id: string;
      channel: string;
      sent: number;
      delivered: number;
      opens: number;
      unique_opens: number;
      clicks: number;
      unique_clicks: number;
      unsubscribes: number;
      bounces: number;
      reported_spam: number;
      conversions: number;
      revenue: number;
      minDate: string;
      maxDate: string;
    }
  >();

  for (const row of rows) {
    const key = `${row.campaign_id}|${row.variation_api_id}|${row.channel}`;
    if (!groups.has(key)) {
      groups.set(key, {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        variation_api_id: row.variation_api_id,
        channel: row.channel,
        sent: 0,
        delivered: 0,
        opens: 0,
        unique_opens: 0,
        clicks: 0,
        unique_clicks: 0,
        unsubscribes: 0,
        bounces: 0,
        reported_spam: 0,
        conversions: 0,
        revenue: 0,
        minDate: row.date,
        maxDate: row.date,
      });
    }
    const g = groups.get(key)!;
    g.sent += row.sent;
    g.delivered += row.delivered;
    g.opens += row.opens;
    g.unique_opens += row.unique_opens;
    g.clicks += row.clicks;
    g.unique_clicks += row.unique_clicks;
    g.unsubscribes += row.unsubscribes;
    g.bounces += row.bounces;
    g.reported_spam += row.reported_spam;
    g.conversions += row.conversions;
    g.revenue += row.revenue;
    if (row.date < g.minDate) g.minDate = row.date;
    if (row.date > g.maxDate) g.maxDate = row.date;
  }

  // Build output with proper campaign names
  const results: AggregatedCampaign[] = [];
  for (const g of groups.values()) {
    const labelKey = `${g.campaign_id}|${g.variation_api_id}`;
    const label = variationLabels.get(labelKey);
    const displayName = label
      ? `${g.campaign_name} (Variant ${label})`
      : g.campaign_name;

    results.push({
      campaign_name: displayName,
      date_range: `${g.minDate} to ${g.maxDate}`,
      channel: g.channel,
      total_sent: g.sent,
      total_delivered: g.delivered,
      total_opens: g.opens,
      unique_opens: g.unique_opens,
      total_clicks: g.clicks,
      unique_clicks: g.unique_clicks,
      bounces: g.bounces,
      unsubscribes: g.unsubscribes,
      spam_reports: g.reported_spam,
      conversions: g.conversions,
      revenue: Math.round(g.revenue * 100) / 100,
    });
  }

  return results;
}

// --- Rate Computation (Story 2) ---

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.00%";
  const value = (numerator / denominator) * 100;
  return (Math.round(value * 100) / 100).toFixed(2) + "%";
}

export function computeRates(agg: AggregatedCampaign): ComputedCampaign {
  return {
    ...agg,
    delivery_rate: pct(agg.total_delivered, agg.total_sent),
    open_rate: pct(agg.total_opens, agg.total_delivered),
    unique_open_rate: pct(agg.unique_opens, agg.total_delivered),
    click_rate: pct(agg.total_clicks, agg.total_delivered),
    unique_click_rate: pct(agg.unique_clicks, agg.total_delivered),
    click_to_open_rate: pct(agg.total_clicks, agg.total_opens),
    bounce_rate: pct(agg.bounces, agg.total_sent),
    unsubscribe_rate: pct(agg.unsubscribes, agg.total_delivered),
    spam_rate: pct(agg.spam_reports, agg.total_delivered),
    conversion_rate: pct(agg.conversions, agg.total_delivered),
  };
}

// --- Cross-Campaign Weighted Averages (Story 3) ---

export function computeWeightedAverage(
  campaigns: AggregatedCampaign[]
): ComputedCampaign {
  const totals: AggregatedCampaign = {
    campaign_name: "All Campaigns Average",
    date_range: "",
    channel: "email",
    total_sent: 0,
    total_delivered: 0,
    total_opens: 0,
    unique_opens: 0,
    total_clicks: 0,
    unique_clicks: 0,
    bounces: 0,
    unsubscribes: 0,
    spam_reports: 0,
    conversions: 0,
    revenue: 0,
  };

  let minDate = "";
  let maxDate = "";

  for (const c of campaigns) {
    totals.total_sent += c.total_sent;
    totals.total_delivered += c.total_delivered;
    totals.total_opens += c.total_opens;
    totals.unique_opens += c.unique_opens;
    totals.total_clicks += c.total_clicks;
    totals.unique_clicks += c.unique_clicks;
    totals.bounces += c.bounces;
    totals.unsubscribes += c.unsubscribes;
    totals.spam_reports += c.spam_reports;
    totals.conversions += c.conversions;
    totals.revenue += c.revenue;

    const [startDate, endDate] = c.date_range.split(" to ");
    if (!minDate || startDate < minDate) minDate = startDate;
    if (!maxDate || endDate > maxDate) maxDate = endDate;
  }

  totals.date_range = `${minDate} to ${maxDate}`;
  totals.revenue = Math.round(totals.revenue * 100) / 100;

  return computeRates(totals);
}

// --- CSV Output (Story 3) ---

const CSV_HEADERS = [
  "campaign_name",
  "date_range",
  "channel",
  "total_sent",
  "total_delivered",
  "total_opens",
  "unique_opens",
  "total_clicks",
  "unique_clicks",
  "bounces",
  "unsubscribes",
  "spam_reports",
  "conversions",
  "revenue",
  "delivery_rate",
  "open_rate",
  "unique_open_rate",
  "click_rate",
  "unique_click_rate",
  "click_to_open_rate",
  "bounce_rate",
  "unsubscribe_rate",
  "spam_rate",
  "conversion_rate",
];

function campaignToCSVRow(c: ComputedCampaign): string {
  return CSV_HEADERS.map((h) => {
    const val = (c as Record<string, unknown>)[h];
    if (h === "revenue") return (val as number).toFixed(2);
    return String(val ?? "");
  }).join(",");
}

export function generateCSV(
  campaigns: ComputedCampaign[],
  average: ComputedCampaign
): string {
  const lines: string[] = [CSV_HEADERS.join(",")];
  for (const c of campaigns) {
    lines.push(campaignToCSVRow(c));
  }
  // Separator row (empty cells matching column count)
  lines.push(
    "--- CROSS-CAMPAIGN AVERAGES ---" + ",".repeat(CSV_HEADERS.length - 1)
  );
  lines.push(campaignToCSVRow(average));
  return lines.join("\n") + "\n";
}

// --- Main ---

export function processDirectory(inputDir: string): {
  campaigns: ComputedCampaign[];
  average: ComputedCampaign;
  csv: string;
} {
  const campaignFile = join(
    inputDir,
    "braze_campaign_analytics_example.csv"
  );
  const rows = parseCampaignCSV(campaignFile);
  const aggregated = aggregateByCampaignVariation(rows);
  const campaigns = aggregated.map(computeRates);
  const average = computeWeightedAverage(aggregated);
  const csv = generateCSV(campaigns, average);
  return { campaigns, average, csv };
}

// CLI entry point
if (process.argv[1]?.endsWith("compute-braze-averages.ts")) {
  const inputDir = resolve(process.argv[2] ?? "braze-examples");
  const outputFile = process.argv[3];

  const { csv } = processDirectory(inputDir);

  if (outputFile) {
    writeFileSync(outputFile, csv);
    console.log(`Written to ${outputFile}`);
  } else {
    process.stdout.write(csv);
  }
}
