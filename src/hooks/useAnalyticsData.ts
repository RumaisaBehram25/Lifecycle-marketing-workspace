import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDoubleGoodClient } from '@/hooks/useDoubleGoodClient';

type Row = Record<string, unknown>;

function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export function useAnalyticsData() {
  const { data: client, isLoading: clientLoading } = useDoubleGoodClient();
  const { data: fallbackClient, isLoading: fallbackLoading } = useQuery({
    queryKey: ['onboarding-fallback-client'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string } | null;
    },
    enabled: !client?.id,
    staleTime: 1000 * 60 * 5,
  });
  const clientId = client?.id ?? fallbackClient?.id ?? undefined;

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

  const isClientLoading = !clientId && (clientLoading || (fallbackLoading && !fallbackClient));
  const isLoading =
    isClientLoading ||
    (!!clientId && (brazeCampaignAnalytics.isLoading || customerioCampaigns.isLoading));

  const error = brazeCampaignAnalytics.error || customerioCampaigns.error;

  const refetch = () => {
    brazeCampaignAnalytics.refetch();
    customerioCampaigns.refetch();
    segmentAnalytics.refetch();
    usageAnalytics.refetch();
  };

  const canvases = brazeCampaignAnalytics.data ?? [];
  const campaigns = customerioCampaigns.data ?? [];
  const segmentRows = segmentAnalytics.data ?? [];
  const usageRows = usageAnalytics.data ?? [];

  const totalSent = canvases.reduce(
    (sum, r) => sum + num(r.sent ?? r.sends_last_30d),
    0
  );
  const totalDelivered = canvases.reduce((sum, r) => sum + num(r.delivered), 0);
  const totalOpens = canvases.reduce((sum, r) => sum + num(r.opens), 0);
  const totalClicks = canvases.reduce((sum, r) => sum + num(r.clicks), 0);

  const latestUsage = usageRows.length > 0 ? usageRows[0] : null;
  const dau = num(latestUsage?.dau);
  const mau = num(latestUsage?.mau);

  const rates = campaigns.filter(
    (r) =>
      num(r.delivery_rate) > 0 ||
      num(r.open_rate) > 0 ||
      num(r.click_rate) > 0 ||
      num(r.conversion_rate) > 0
  );
  const deliveryRate =
    rates.length > 0
      ? rates.reduce((s, r) => s + num(r.delivery_rate), 0) / rates.length
      : 0;
  const openRate =
    rates.length > 0
      ? rates.reduce((s, r) => s + num(r.open_rate), 0) / rates.length
      : 0;
  const clickRate =
    rates.length > 0
      ? rates.reduce((s, r) => s + num(r.click_rate), 0) / rates.length
      : 0;
  const conversionRate =
    rates.length > 0
      ? rates.reduce((s, r) => s + num(r.conversion_rate), 0) / rates.length
      : 0;

  const hasAnyData =
    canvases.length > 0 ||
    campaigns.length > 0 ||
    segmentRows.length > 0 ||
    usageRows.length > 0;

  const usageChartData = [...usageRows].reverse().map((r) => ({
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
        ? '—'
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
      segment: '—',
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
      dau,
      mau,
      deliveryRate,
      openRate,
      clickRate,
      conversionRate,
    },
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
