import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrazeDashboardClientId } from '@/hooks/useBrazeDashboardClientId';
import { fetchCampaignHygieneDirectory, isCampaignCleanupFlagged } from '@/lib/campaignHygiene';
import { sumBouncesUnsubsLast30dFromCampaignAnalytics } from '@/lib/brazeCampaignAnalyticsHealth';

type Row = Record<string, unknown>;

function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function truthyFlag(v: unknown): boolean {
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'yes' || s === 'on' || s === 'enabled';
  }
  return false;
}

function falsyExplicit(v: unknown): boolean {
  if (v === false || v === 'false' || v === 0 || v === '0') return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'no' || s === 'off' || s === 'disabled';
  }
  return false;
}

function getNested(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Braze list payloads omit flags or nest them; missing flag defaults to ON (not OFF). */
function segmentAnalyticsTrackingOn(raw: Record<string, unknown>): boolean {
  const tryVal = (v: unknown): boolean | null => {
    if (v === undefined || v === null || v === '') return null;
    if (falsyExplicit(v)) return false;
    if (truthyFlag(v)) return true;
    return null;
  };

  const topKeys = [
    'analytics_tracking_enabled',
    'analytics_enabled',
    'tracking_enabled',
    'is_tracking_enabled',
    'analyticsTrackingEnabled',
    'is_analytics_tracking_enabled',
    'analytics_tracking',
  ];
  for (const k of topKeys) {
    const t = tryVal(raw[k]);
    if (t !== null) return t;
  }
  const nestedPaths = [
    ['analytics', 'tracking_enabled'],
    ['analytics', 'enabled'],
    ['settings', 'analytics_tracking_enabled'],
  ] as const;
  for (const path of nestedPaths) {
    const t = tryVal(getNested(raw, [...path]));
    if (t !== null) return t;
  }
  return true;
}

function seriesDateMs(seriesDate: string): number {
  const d = String(seriesDate).slice(0, 10);
  const t = Date.parse(`${d}T12:00:00.000Z`);
  return Number.isNaN(t) ? 0 : t;
}

export function useAnalyticsData() {
  const { clientId, isLoading: isClientLoading } = useBrazeDashboardClientId();

  const brazeCampaignAnalytics = useQuery({
    queryKey: ['analytics', 'braze_campaign_analytics', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await (supabase as any)
        .from('braze_campaign_analytics')
        .select('*')
        .eq('client_id', clientId);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      rows.sort((a, b) => String(a.date ?? a.created_at ?? '').localeCompare(String(b.date ?? b.created_at ?? '')));
      return rows;
    },
    enabled: !!clientId,
  });

  const customerioCampaigns = useQuery({
    queryKey: ['analytics', 'customerio_campaigns', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('customerio_campaigns')
        .select('*')
        .eq('client_id', clientId);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!clientId,
  });

  const segmentAnalytics = useQuery({
    queryKey: ['analytics', 'braze_segment_analytics', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await (supabase as any)
        .from('braze_segment_analytics')
        .select('*')
        .eq('client_id', clientId)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!clientId,
    retry: false,
  });

  const usageAnalytics = useQuery({
    queryKey: ['analytics', 'braze_usage_analytics', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await (supabase as any)
        .from('braze_usage_analytics')
        .select('*')
        .eq('client_id', clientId)
        .order('date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!clientId,
    retry: false,
  });

  const brazeKpiSeries = useQuery({
    queryKey: ['analytics', 'braze_kpi_series', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await (supabase as any)
        .from('braze_kpi_series')
        .select('metric,series_date,value')
        .eq('client_id', clientId)
        .order('series_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!clientId,
    retry: false,
  });

  const brazeCanvases = useQuery({
    queryKey: ['analytics', 'braze_canvases', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await (supabase as any)
        .from('braze_canvases')
        .select(
          'name,schedule_type,enabled,archived,sends_last_30d,entries_last_30d,entries_last_60d',
        )
        .eq('client_id', clientId);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!clientId,
    retry: false,
  });

  const segmentsSync = useQuery({
    queryKey: ['analytics', 'braze_segments_sync', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await (supabase as any)
        .from('braze_segments_sync')
        .select('name,raw')
        .eq('client_id', clientId);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!clientId,
    retry: false,
  });

  const emailEvents = useQuery({
    queryKey: ['analytics', 'braze_email_events', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await (supabase as any)
        .from('braze_email_events')
        .select('event_type,email,occurred_at')
        .eq('client_id', clientId)
        .order('occurred_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!clientId,
    retry: false,
  });

  const emailHealth30d = useQuery({
    queryKey: ['analytics', 'braze_email_health_30d', clientId],
    queryFn: async () => {
      if (!clientId) return { bounces: 0, unsubs: 0 };
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [{ count: bounces, error: e1 }, { count: unsubs, error: e2 }] = await Promise.all([
        (supabase as any)
          .from('braze_email_events')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('event_type', 'hard_bounce')
          .gte('occurred_at', since),
        (supabase as any)
          .from('braze_email_events')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('event_type', 'unsubscribe')
          .gte('occurred_at', since),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      let b = bounces ?? 0;
      let u = unsubs ?? 0;
      if (b === 0 || u === 0) {
        const csv = await sumBouncesUnsubsLast30dFromCampaignAnalytics(clientId);
        if (b === 0) b = csv.bounces;
        if (u === 0) u = csv.unsubs;
      }
      return { bounces: b, unsubs: u };
    },
    enabled: !!clientId,
    retry: false,
  });

  const scheduledBroadcasts = useQuery({
    queryKey: ['analytics', 'braze_scheduled_broadcasts', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await (supabase as any)
        .from('braze_scheduled_broadcasts')
        .select('name,broadcast_type,next_send_time,schedule_type')
        .eq('client_id', clientId)
        .order('next_send_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!clientId,
    retry: false,
  });

  const campaignDirectory = useQuery({
    queryKey: ['analytics', 'braze_campaigns_directory', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      return fetchCampaignHygieneDirectory(clientId);
    },
    enabled: !!clientId,
    retry: false,
  });

  const isLoading =
    isClientLoading ||
    (!!clientId && (
      brazeCampaignAnalytics.isLoading ||
      customerioCampaigns.isLoading ||
      brazeCanvases.isLoading ||
      brazeKpiSeries.isLoading ||
      segmentsSync.isLoading ||
      emailEvents.isLoading ||
      emailHealth30d.isLoading ||
      scheduledBroadcasts.isLoading ||
      campaignDirectory.isLoading
    ));

  const error =
    brazeCampaignAnalytics.error ||
    customerioCampaigns.error ||
    emailEvents.error ||
    emailHealth30d.error;

  const refetch = () => {
    brazeCampaignAnalytics.refetch();
    customerioCampaigns.refetch();
    segmentAnalytics.refetch();
    usageAnalytics.refetch();
    brazeKpiSeries.refetch();
    brazeCanvases.refetch();
    segmentsSync.refetch();
    emailEvents.refetch();
    emailHealth30d.refetch();
    scheduledBroadcasts.refetch();
    campaignDirectory.refetch();
  };

  const canvases = brazeCampaignAnalytics.data ?? [];
  const campaigns = customerioCampaigns.data ?? [];
  const segmentRows = segmentAnalytics.data ?? [];
  const usageRows = usageAnalytics.data ?? [];
  const canvasRows = brazeCanvases.data ?? [];
  const kpiRows = brazeKpiSeries.data ?? [];
  const segmentSyncRows = segmentsSync.data ?? [];
  const emailEventRows = emailEvents.data ?? [];
  const scheduledRows = scheduledBroadcasts.data ?? [];
  const campaignDirectoryRows = campaignDirectory.data ?? [];

  const latestKpi = (metric: string): number => {
    const rows = kpiRows.filter((r) => r.metric === metric);
    if (rows.length === 0) return 0;
    let bestMs = -Infinity;
    let bestVal = 0;
    for (const r of rows) {
      const ms = seriesDateMs(String(r.series_date));
      const v = num(r.value);
      if (ms > bestMs || (ms === bestMs && v > bestVal)) {
        bestMs = ms;
        bestVal = v;
      }
    }
    return bestVal;
  };

  const totalSent = canvases.reduce(
    (sum, r) => sum + num(r.sent ?? r.sends_last_30d),
    0
  );
  const totalDelivered = canvases.reduce((sum, r) => sum + num(r.delivered), 0);
  const totalOpens = canvases.reduce((sum, r) => sum + num(r.opens), 0);
  const totalClicks = canvases.reduce((sum, r) => sum + num(r.clicks), 0);
  const totalConversions = canvases.reduce((sum, r) => sum + num(r.conversions), 0);
  const totalBounces = canvases.reduce((sum, r) => sum + num(r.bounces), 0);
  const totalUnsubscribes = canvases.reduce((sum, r) => sum + num(r.unsubscribes), 0);

  const latestUsage = usageRows.length > 0 ? usageRows[0] : null;
  const dauFromUsage = num(latestUsage?.dau);
  const mauFromUsage = num(latestUsage?.mau);
  const hasDauKpiSeries = kpiRows.some((r) => r.metric === 'dau');
  const hasMauKpiSeries = kpiRows.some((r) => r.metric === 'mau');
  const hasNewUsersKpiSeries = kpiRows.some((r) => r.metric === 'new_users');
  const dauKpi = latestKpi('dau');
  const mauKpi = latestKpi('mau');
  // Prefer Braze REST KPI sync (braze_kpi_series). CSV usage is fallback only ΓÇö do not prefer usage when KPI exists but latest day is legitimately 0.
  const dau = hasDauKpiSeries ? dauKpi : dauFromUsage;
  const mau = hasMauKpiSeries ? mauKpi : mauFromUsage;

  const cutoff30 = new Date();
  cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoff30Str = cutoff30.toISOString().slice(0, 10);
  const newUsers30FromKpi = kpiRows
    .filter((r) => r.metric === 'new_users' && String(r.series_date ?? '').slice(0, 10) >= cutoff30Str)
    .reduce((s, r) => s + num(r.value), 0);
  const newUsers30FromUsage = usageRows
    .filter((r) => String(r.date ?? '').slice(0, 10) >= cutoff30Str)
    .reduce((s, r) => s + num(r.new_users), 0);
  const newUsers30 = hasNewUsersKpiSeries ? newUsers30FromKpi : newUsers30FromUsage;

  const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
  const openRate = totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0;
  const clickRate = totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0;
  const conversionRate = totalDelivered > 0 ? (totalConversions / totalDelivered) * 100 : 0;
  const bounceRate = totalSent > 0 ? (totalBounces / totalSent) * 100 : 0;
  const unsubscribeRate = totalDelivered > 0 ? (totalUnsubscribes / totalDelivered) * 100 : 0;

  const scheduledCanvases = canvasRows.filter((r) => {
    const scheduleType = String(r.schedule_type ?? '').toLowerCase();
    return scheduleType.includes('schedule');
  });
  const scheduledCanvasesActive = scheduledCanvases.filter((r) =>
    Boolean(r.enabled) && num(r.entries_last_30d) > 0
  );
  const schedulingPerformanceRate =
    scheduledCanvases.length > 0
      ? (scheduledCanvasesActive.length / scheduledCanvases.length) * 100
      : 0;

  const hasAnyData =
    canvases.length > 0 ||
    campaigns.length > 0 ||
    segmentRows.length > 0 ||
    usageRows.length > 0 ||
    canvasRows.length > 0 ||
    kpiRows.length > 0 ||
    segmentSyncRows.length > 0 ||
    emailEventRows.length > 0 ||
    scheduledRows.length > 0 ||
    campaignDirectoryRows.length > 0;

  const hardBounces = emailEventRows.filter((r) => String(r.event_type) === 'hard_bounce');
  const unsubscribes = emailEventRows.filter((r) => String(r.event_type) === 'unsubscribe');

  const bounceTimelineByDate: Record<string, number> = {};
  for (const r of hardBounces) {
    const d = String(r.occurred_at ?? '').slice(0, 10);
    if (!d) continue;
    bounceTimelineByDate[d] = (bounceTimelineByDate[d] ?? 0) + 1;
  }
  const bounceTimeline = Object.entries(bounceTimelineByDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const domainCounts = new Map<string, number>();
  for (const r of hardBounces) {
    const email = String(r.email ?? '').trim().toLowerCase();
    const domain = email.includes('@') ? email.split('@')[1] : '';
    if (!domain) continue;
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }
  const bounceDomains = [...domainCounts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const trackingSummary = (() => {
    if (segmentSyncRows.length > 0) {
      let enabled = 0;
      let disabled = 0;
      for (const r of segmentSyncRows) {
        const raw = (r.raw ?? {}) as Record<string, unknown>;
        if (segmentAnalyticsTrackingOn(raw)) enabled += 1;
        else disabled += 1;
      }
      return {
        enabled,
        disabled,
        total: segmentSyncRows.length,
        source: 'sync' as const,
      };
    }
    const segmentKeys = new Set<string>();
    for (const r of segmentRows) {
      const id = String(r.segment_id ?? '').trim();
      const nm = String(r.segment_name ?? '').trim();
      const key = id || nm;
      if (key) segmentKeys.add(key);
    }
    const csvTotal = segmentKeys.size;
    if (csvTotal > 0) {
      return {
        enabled: csvTotal,
        disabled: 0,
        total: csvTotal,
        source: 'csv' as const,
      };
    }
    return { enabled: 0, disabled: 0, total: 0, source: null as null };
  })();

  const cleanupFlagged = campaignDirectoryRows.filter((r) =>
    isCampaignCleanupFlagged(r as Record<string, unknown>)
  ).length;

  const usageChartDataFromKpi = (): Row[] => {
    const byDate: Record<string, { date: string; dau: number; mau: number; new_users: number }> = {};
    for (const r of kpiRows) {
      const d = String(r.series_date ?? '').slice(0, 10);
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d, dau: 0, mau: 0, new_users: 0 };
      const m = String(r.metric ?? '');
      const v = num(r.value);
      if (m === 'dau') byDate[d].dau = v;
      if (m === 'mau') byDate[d].mau = v;
      if (m === 'new_users') byDate[d].new_users = v;
    }
    return Object.values(byDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({
        date: row.date,
        sessions: 0,
        dau: row.dau,
        mau: row.mau,
        new_users_series: row.new_users,
        emails_sent: 0,
        emails_delivered: 0,
        emails_opened: 0,
        email_clicks: 0,
        email_bounces: 0,
      }));
  };

  const usageChartData =
    usageRows.length > 0
      ? [...usageRows].reverse().map((r) => ({
          date: String(r.date ?? ''),
          sessions: num(r.sessions),
          dau: num(r.dau),
          mau: num(r.mau),
          emails_sent: num(r.emails_sent),
          emails_delivered: num(r.emails_delivered),
          emails_opened: num(r.emails_opened),
          email_clicks: num(r.email_clicks),
          email_bounces: num(r.email_bounces),
        }))
      : (usageChartDataFromKpi() as Row[]).map((r) => ({
          date: String(r.date ?? ''),
          sessions: num(r.sessions),
          dau: num(r.dau),
          mau: num(r.mau),
          emails_sent: num(r.emails_sent),
          emails_delivered: num(r.emails_delivered),
          emails_opened: num(r.emails_opened),
          email_clicks: num(r.email_clicks),
          email_bounces: num(r.email_bounces),
        }));

  const campaignChartData = canvases
    .filter((r) => r.date != null)
    .map((r) => ({
      date: String(r.date),
      name: String(r.campaign_name ?? r.name ?? ''),
      revenue: num(r.revenue),
      sent: num(r.sent ?? r.sends_last_30d),
      delivered: num(r.delivered),
      opens: num(r.opens),
      clicks: num(r.clicks),
      channel: String(r.channel ?? 'Email'),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const segmentChartData = segmentRows.map((r) => ({
    date: String(r.date ?? ''),
    segment_name: String(r.segment_name ?? ''),
    size: num(r.size),
  }));

  const segmentNames = [...new Set(segmentChartData.map((r) => r.segment_name).filter(Boolean))];
  const segmentByDate: Record<string, Record<string, number>> = {};
  for (const r of segmentChartData) {
    const d = String(r.date ?? '').slice(0, 10);
    if (!segmentByDate[d]) segmentByDate[d] = {};
    segmentByDate[d][r.segment_name] = r.size;
  }
  const uniqueDates = Object.keys(segmentByDate).sort();
  const segmentChartDataByDate = uniqueDates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const seg of segmentNames) row[seg] = segmentByDate[date][seg] ?? 0;
    return row;
  });

  const campaignAggByName: Record<
    string,
    { name: string; channel: string; sent: number; delivered: number; opens: number; clicks: number; conversions: number; revenue: number; dates: string[] }
  > = {};
  for (const r of canvases) {
    const name = String(r.campaign_name ?? r.name ?? '').trim();
    const dateRaw = r.date != null ? String(r.date).trim().slice(0, 10) : '';
    if (!campaignAggByName[name]) {
      campaignAggByName[name] = {
        name,
        channel: String(r.channel ?? 'Email'),
        sent: 0,
        delivered: 0,
        opens: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        dates: [],
      };
    }
    const agg = campaignAggByName[name];
    agg.sent += num(r.sent ?? r.sends_last_30d);
    agg.delivered += num(r.delivered);
    agg.opens += num(r.opens);
    agg.clicks += num(r.clicks);
    agg.conversions += num(r.conversions);
    agg.revenue += num(r.revenue);
    if (dateRaw && !agg.dates.includes(dateRaw)) agg.dates.push(dateRaw);
  }
  const campaignTableRows = Object.values(campaignAggByName).map((agg) => {
    agg.dates.sort();
    const dateRange =
      agg.dates.length === 0
        ? 'ΓÇö'
        : agg.dates.length === 1
          ? agg.dates[0]
          : `${agg.dates[0]} to ${agg.dates[agg.dates.length - 1]}`;
    return {
      name: agg.name,
      revenue: agg.revenue,
      dateRange,
      channel: agg.channel,
      sent: agg.sent,
      ctr: agg.delivered > 0 ? (agg.clicks / agg.delivered) * 100 : 0,
      orders: agg.conversions,
      segment: 'ΓÇö',
    };
  });

  return {
    clientId,
    isClientLoading,
    isLoading,
    error: error ? (error as Error) : null,
    refetch,
    hasAnyData,
    metrics: {
      totalSent,
      totalDelivered,
      totalOpens,
      totalClicks,
      totalConversions,
      totalBounces,
      totalUnsubscribes,
      dau,
      mau,
      newUsers30,
      kpiSource: hasDauKpiSeries || hasMauKpiSeries || hasNewUsersKpiSeries,
      deliveryRate,
      openRate,
      clickRate,
      conversionRate,
      bounceRate,
      unsubscribeRate,
      schedulingPerformanceRate,
      scheduledCanvases: scheduledCanvases.length,
    },
    /** Braze campaign analytics rows (CSV/API) — used by Analytics filters and per-campaign drill-down. */
    rawCampaignRows: canvases,
    /** Canvas directory rows from `braze_canvases` (name, sends, entries, etc.). */
    canvasListRows: canvasRows,
    usageChartData,
    campaignChartData,
    segmentChartData,
    campaignTableRows,
    revenueMonthly: campaignChartData.length
      ? aggregateRevenueByMonth(campaignChartData)
      : [],
    segmentChartDataByDate,
    segmentNames,
    flowRevenueByCampaign: campaignTableRows.map((r) => ({ name: r.name, revenue: r.revenue })),
    scheduledRows,
    bounceTimeline,
    bounceDomains,
    hardBounceCount: emailHealth30d.data?.bounces ?? hardBounces.length,
    unsubCount30d: emailHealth30d.data?.unsubs ?? unsubscribes.length,
    trackingSummary,
    cleanupFlagged,
    campaignDirectoryRows,
  };
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

function aggregateRevenueByMonth(
  rows: { date: string; revenue: number }[]
): { month: string; monthLabel: string; flowRev: number; campaignRev: number; crmPct: number }[] {
  const byMonth: Record<string, { campaignRev: number }> = {};
  for (const r of rows) {
    const dateStr = String(r.date ?? '').slice(0, 10);
    const key = dateStr.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { campaignRev: 0 };
    byMonth[key].campaignRev += r.revenue;
  }
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => {
      const mm = month.slice(5, 7);
      const yyyy = month.slice(0, 4);
      return {
        month,
        monthLabel: `${MONTH_LABELS[mm] || mm} ${yyyy}`,
        flowRev: 0,
        campaignRev: v.campaignRev,
        crmPct: totalRev > 0 ? (v.campaignRev / totalRev) * 100 : 0,
      };
    });
}
