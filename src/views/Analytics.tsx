import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAnalyticsData, type LifecycleFlowPerformanceRow } from '@/hooks/useAnalyticsData';
import { useResolvedClientId, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { useToast } from '@/hooks/use-toast';
import { invokeFullBrazeSync } from '@/lib/touchpointsSyncClient';
import {
  brazeSyncPartialDescription,
  formatBrazeSyncInvokeError,
  type BrazeSyncInvokeBody,
} from '@/lib/brazeSyncInvoke';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { supabase } from '@/integrations/supabase/client';
import { useDoubleGoodClient } from '@/hooks/useDoubleGoodClient';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Send, Workflow, UserPlus, Sparkles, DollarSign, ChevronDown, ChevronUp,
  Eye, RefreshCw, BarChart2, UploadCloud, ArrowRight, MailWarning, Layers, Loader2, AlertCircle,
  ChevronsUpDown, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  dashSectionTitleBorder,
  dashSubtitleRule,
  dashPill,
  dashboardMetricTile,
  dashboardSectionHeadingClass,
  dashboardSurfaceCard,
  dashboardTopAccentClass,
  dashIconChip,
  dashboardEmptyWarningCard,
} from '@/lib/dashboard-surface';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/** Match Dashboard section titles (e.g. Performance & connections). */
const analyticsSectionHeadingClass = cn(
  dashboardSectionHeadingClass,
  'text-2xl sm:text-3xl font-bold tracking-tight',
);

const analyticsCardClass = cn(dashboardSurfaceCard, 'shadow-md');

const analyticsCardHeaderClass = cn(
  'pb-2 pt-4 bg-gradient-to-r from-primary/[0.07] via-card to-transparent',
  dashSectionTitleBorder,
);

const analyticsSubtitleClass = cn('text-xs text-muted-foreground mt-1.5 pl-3 ml-0.5', dashSubtitleRule);

const analyticsChartPanelClass = cn(
  'rounded-xl border border-border/50 bg-gradient-to-b from-muted/30 to-muted/10',
  'p-2 sm:p-3 ring-1 ring-inset ring-border/30',
);

/** Recharts defaults the tooltip box to `whiteSpace: 'nowrap'`, which lets long labels spill outside the card */
const analyticsTooltipContentStyle: CSSProperties = {
  fontSize: 12,
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  maxWidth: 'min(92vw, 320px)',
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  color: 'hsl(var(--foreground))',
  borderRadius: 8,
};

const analyticsTooltipLabelStyle: CSSProperties = {
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  maxWidth: '100%',
};

type StatAccent = 'primary' | 'blue' | 'amber' | 'cyan' | 'rose' | 'emerald' | 'violet' | 'orange' | 'purple';

const statRail: Record<StatAccent, string> = {
  primary: 'border-l-primary/55',
  blue: 'border-l-blue-500/50',
  amber: 'border-l-amber-500/50',
  cyan: 'border-l-cyan-500/50',
  rose: 'border-l-rose-500/50',
  emerald: 'border-l-emerald-500/50',
  violet: 'border-l-violet-500/50',
  orange: 'border-l-orange-500/50',
  purple: 'border-l-purple-500/50',
};

type BenchmarkTooltipPayload = { campaignRev?: number; crmPct?: number | null };

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  trend,
  accent = 'primary',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  accent?: StatAccent;
  trend?: { direction: 'up' | 'down' | 'flat'; value: string };
}) {
  return (
    <div
      className={cn(
        dashboardMetricTile,
        'border-l-[3px]',
        statRail[accent],
      )}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-black/5 dark:ring-white/10', color)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground leading-snug">{label}</p>
        <p className="text-2xl font-bold tracking-tight text-foreground mt-1 tabular-nums">{value}</p>
        {trend && (
          <div
            className={cn(
              'flex items-center gap-1 mt-2 text-xs font-medium',
              trend.direction === 'up'
                ? 'text-emerald-600 dark:text-emerald-400'
                : trend.direction === 'down'
                  ? 'text-destructive'
                  : 'text-muted-foreground',
            )}
          >
            {trend.direction === 'up' ? (
              <ChevronUp className="h-3 w-3" />
            ) : trend.direction === 'down' ? (
              <ChevronDown className="h-3 w-3" />
            ) : null}
            {trend.value}
          </div>
        )}
      </div>
    </div>
  );
}

const formatDollar = (v: number) => `$${(v / 1000).toFixed(0)}K`;

function formatPct(value: number): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return '—';
  return `${Number(value).toFixed(2)}%`;
}

export default function Analytics() {
  const { data: client } = useDoubleGoodClient();
  const { clientId: workspaceClientId } = useResolvedClientId();
  const { data: platforms } = useDoubleGoodPlatforms();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const brazeWorkspacePlatform = platforms?.find((p) => p.platform === 'braze' && p.is_connected);
  const [canvasMetricsSyncing, setCanvasMetricsSyncing] = useState(false);
  const [period, setPeriod] = useState('default');

  const {
    clientId,
    isClientLoading,
    isLoading,
    error,
    refetch,
    hasAnyData,
    metrics,
    rawCampaignRows,
    canvasListRows,
    revenueMonthly,
    totalCampaignRevenue,
    campaignTableRows,
    usageChartData,
    campaignChartData,
    segmentChartDataByDate,
    segmentNames,
    flowRevenueByCampaign,
    bounceDomains,
    hardBounceCount,
    unsubCount30d,
    trackingSummary,
    cleanupFlagged,
    campaignDirectoryRows,
    lifecycleFlowPerformanceRows,
    brazeCanvasFlowMetricsError,
    brazeCanvasFlowMetricsErrorMessage,
    brazeCanvasFlowMetricsIsLoading,
    brazeCanvasFlowMetricsIsFetching,
  } = useAnalyticsData(period);

  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignChannelFilter, setCampaignChannelFilter] = useState('All');
  const [flowChartMetric, setFlowChartMetric] = useState<'revenue' | 'sent' | 'opens' | 'clicks' | 'orders'>('revenue');
  const [siteRevenueInput, setSiteRevenueInput] = useState('');
  const [insights, setInsights] = useState<{ title: string; body: string; tag: string; tagColor: string }[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<string>('all');
  const [compSelectedCampaign, setCompSelectedCampaign] = useState<string>('all');
  const [compOpen, setCompOpen] = useState(false);
  const [compStartDate, setCompStartDate] = useState('');
  const [compEndDate, setCompEndDate] = useState('');

  const handleCanvasMetricsSync = async () => {
    if (!workspaceClientId || !brazeWorkspacePlatform?.id) return;
    setCanvasMetricsSyncing(true);
    try {
      const { data: syncData, error } = await invokeFullBrazeSync({
        clientId: workspaceClientId,
        platformId: brazeWorkspacePlatform.id,
      });
      if (error) throw error;
      const partialDesc = brazeSyncPartialDescription(syncData as BrazeSyncInvokeBody);
      toast({
        title: (syncData as { partial?: boolean })?.partial ? 'Braze sync completed (partial)' : 'Braze sync completed',
        description:
          partialDesc ??
          'Canvas metrics (entries, sends, revenue, conversions, opens, clicks) were written to braze_canvases where Braze returned data.',
      });
      await queryClient.invalidateQueries({ queryKey: ['braze_canvases'] });
      await queryClient.invalidateQueries({ queryKey: ['analytics'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-braze'] });
    } catch (e: unknown) {
      toast({
        title: 'Sync failed',
        description: await formatBrazeSyncInvokeError(e),
        variant: 'destructive',
      });
    } finally {
      setCanvasMetricsSyncing(false);
    }
  };

  const rawRows = rawCampaignRows ?? [];
  const canvasRowsList = canvasListRows ?? [];

  // Unique campaign names for the filter dropdown
  const campaignNames = [...new Set(
    rawRows.map((r) => String(r.campaign_name ?? r.name ?? '').trim()).filter(Boolean),
  )].sort();

  // Split into campaigns with data (revenue or conversions) vs without, for dropdown ordering
  const campaignsWithDataSet = new Set(
    (rawRows as Record<string, unknown>[])
      .filter((r) => Number(r.revenue ?? 0) > 0 || Number(r.conversions ?? r.orders ?? 0) > 0)
      .map((r) => String(r.campaign_name ?? r.name ?? '').trim())
      .filter(Boolean),
  );
  const campaignNamesWithData = campaignNames.filter((n) => campaignsWithDataSet.has(n));
  const campaignNamesNoData = campaignNames.filter((n) => !campaignsWithDataSet.has(n));

  /** Canvas-only flows with no merged metrics stay out of the list (no test/IP-warming noise). */
  const canvasRowHasAnyMetric = (r: LifecycleFlowPerformanceRow) =>
    r.revenue > 0 || r.sent > 0 || r.opens > 0 || r.clicks > 0 || r.orders > 0;

  const canvasNames = [...new Set(
    lifecycleFlowPerformanceRows
      .filter((r) => r.drilldownPrefix === 'canvas' && canvasRowHasAnyMetric(r))
      .map((r) => String(r.name ?? '').trim())
      .filter(Boolean),
  )].sort();

  // Compute filtered metrics when a specific campaign is selected
  const n = (v: unknown) => { const x = Number(v); return isNaN(x) ? 0 : x; };

  const activeMetrics = (() => {
    if (!selectedFlow.startsWith('campaign:')) return metrics;
    const name = selectedFlow.slice(9);
    const rows = rawRows.filter((r) => String(r.campaign_name ?? r.name ?? '').trim() === name);
    const fSent = rows.reduce((s, r) => s + n(r.sent ?? r.sends_last_30d), 0);
    const fDelivered = rows.reduce((s, r) => s + n(r.delivered), 0);
    const fOpens = rows.reduce((s, r) => s + n(r.opens), 0);
    const fClicks = rows.reduce((s, r) => s + n(r.clicks), 0);
    const fConversions = rows.reduce((s, r) => s + n(r.conversions), 0);
    const fBounces = rows.reduce((s, r) => s + n(r.bounces), 0);
    const fUnsubs = rows.reduce((s, r) => s + n(r.unsubscribes), 0);
    return {
      ...metrics,
      totalSent: fSent,
      totalDelivered: fDelivered,
      totalOpens: fOpens,
      totalClicks: fClicks,
      totalConversions: fConversions,
      totalBounces: fBounces,
      totalUnsubscribes: fUnsubs,
      deliveryRate: fSent > 0 ? (fDelivered / fSent) * 100 : 0,
      openRate: fDelivered > 0 ? (fOpens / fDelivered) * 100 : 0,
      clickRate: fDelivered > 0 ? (fClicks / fDelivered) * 100 : 0,
      conversionRate: fDelivered > 0 ? (fConversions / fDelivered) * 100 : 0,
      bounceRate: fSent > 0 ? (fBounces / fSent) * 100 : 0,
      unsubscribeRate: fDelivered > 0 ? (fUnsubs / fDelivered) * 100 : 0,
    };
  })();

  // For canvas selection, pull metrics from canvasListRows
  const selectedCanvasRow = selectedFlow.startsWith('canvas:')
    ? canvasRowsList.find((r) => String(r.name ?? '').trim() === selectedFlow.slice(7)) ?? null
    : null;

  const generateInsights = async () => {
    if (!client?.id) return;
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const { data: canvases, error: dbError } = await supabase
        .from('braze_canvases')
        .select('name, sends_last_30d, entries_last_30d, entries_last_60d, tags, enabled, schedule_type, conversion_events')
        .eq('client_id', client.id)
        .eq('archived', false);
      if (dbError) throw dbError;

      const campaigns = (canvases || []).map(c => ({
        name: c.name,
        sends_30d: c.sends_last_30d || 0,
        entries_30d: c.entries_last_30d || 0,
        entries_60d: c.entries_last_60d || 0,
        tags: c.tags || [],
        enabled: c.enabled,
        schedule_type: c.schedule_type,
        conversion_events: c.conversion_events || [],
      }));

      const res = await fetch('/api/generate-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaigns }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate insights');
      }
      const data = await res.json();
      setInsights(data?.insights ?? []);
    } catch (err: unknown) {
      setInsightsError(err instanceof Error ? err.message : 'Failed to generate insights');
    } finally {
      setInsightsLoading(false);
    }
  };

  const campaignComparisonData = useMemo(() => {
    let rows = rawCampaignRows as Record<string, unknown>[];
    if (compStartDate) rows = rows.filter((r) => String(r.date ?? '') >= compStartDate);
    if (compEndDate) rows = rows.filter((r) => String(r.date ?? '') <= compEndDate);
    const aggMap = new Map<string, { revenue: number; conversions: number }>();
    for (const r of rows) {
      const name = String(r.campaign_name ?? r.name ?? '').trim();
      if (!name) continue;
      const cur = aggMap.get(name) ?? { revenue: 0, conversions: 0 };
      cur.revenue += Number(r.revenue ?? 0);
      cur.conversions += Number(r.conversions ?? r.orders ?? 0);
      aggMap.set(name, cur);
    }
    const allResults = [...aggMap.entries()]
      .filter(([, v]) => v.revenue > 0 || v.conversions > 0)
      .map(([name, v]) => ({ campaign_name: name, revenue: v.revenue, conversions: v.conversions }))
      .sort((a, b) => b.revenue - a.revenue);
    if (compSelectedCampaign !== 'all') {
      return allResults.filter((r) => r.campaign_name === compSelectedCampaign);
    }
    return allResults.slice(0, 15);
  }, [rawCampaignRows, compStartDate, compEndDate, compSelectedCampaign]);

  const compBenchmarkRevenue =
    campaignComparisonData.length > 1
      ? campaignComparisonData.reduce((s, r) => s + r.revenue, 0) / campaignComparisonData.length
      : 0;

  const bounceRateData = useMemo(() => {
    const byDate = new Map<string, { bounces: number; sent: number }>();
    for (const r of rawCampaignRows) {
      const row = r as Record<string, unknown>;
      const date = String(row.date ?? '').slice(0, 10);
      if (!date) continue;
      const cur = byDate.get(date) ?? { bounces: 0, sent: 0 };
      cur.bounces += Number(row.bounces ?? 0);
      cur.sent += Number(row.sent ?? row.sends ?? 0);
      byDate.set(date, cur);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        bounce_rate: v.sent > 0 ? Number(((v.bounces / v.sent) * 100).toFixed(3)) : 0,
      }));
  }, [rawCampaignRows]);

  if (!clientId) {
    if (isClientLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6">
          <LoadingPage message="Loading client..." />
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 sm:py-24 bg-gradient-to-b from-background via-primary/[0.02] to-muted/20">
        <Card className={cn('w-full max-w-md', dashboardEmptyWarningCard)}>
          <div className={dashboardTopAccentClass} aria-hidden />
          <CardContent className="flex flex-col items-center pt-10 pb-10 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
              <BarChart2 className="h-7 w-7 text-primary" />
            </div>
            <h2 className={analyticsSectionHeadingClass}>No analytics data yet</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm leading-relaxed">
              Braze sync or imported campaign, segment, and usage data will appear here. Use Dashboard to run a sync or check workspace setup.
            </p>
            <Button asChild className="mt-6">
              <Link to="/dashboard" className="inline-flex items-center gap-2">
                <UploadCloud className="h-4 w-4" />
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6">
        <LoadingPage message="Loading analytics (campaigns, journeys, KPIs, email health)…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6">
        <p className="text-destructive font-medium">{error.message}</p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!hasAnyData) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 sm:py-24 bg-gradient-to-b from-background via-primary/[0.02] to-muted/20">
        <Card className={cn('w-full max-w-md', dashboardEmptyWarningCard)}>
          <div className={dashboardTopAccentClass} aria-hidden />
          <CardContent className="flex flex-col items-center pt-10 pb-10 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
              <BarChart2 className="h-7 w-7 text-primary" />
            </div>
            <h2 className={analyticsSectionHeadingClass}>No analytics data yet</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm leading-relaxed">
              Braze sync or imported campaign, segment, and usage data will appear here. Use Dashboard to run a sync or check workspace setup.
            </p>
            <Button asChild className="mt-6">
              <Link to="/dashboard" className="inline-flex items-center gap-2">
                <UploadCloud className="h-4 w-4" />
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const bestMonth = revenueMonthly.length > 0
    ? revenueMonthly.reduce((best, m) => (m.campaignRev > (best?.campaignRev ?? 0) ? m : best), revenueMonthly[0])
    : null;
  const parsedSiteRevenue = Number(siteRevenueInput.replace(/[^0-9.]/g, ''));
  const hasSiteRevenue = Number.isFinite(parsedSiteRevenue) && parsedSiteRevenue > 0;
  const overallCrmPct = hasSiteRevenue ? (totalCampaignRevenue / parsedSiteRevenue) * 100 : null;
  const overallGapToBenchmark = overallCrmPct != null ? overallCrmPct - 25 : null;
  const benchmarkStatText =
    overallGapToBenchmark == null
      ? 'Enter site revenue to compare'
      : `${overallGapToBenchmark >= 0 ? '+' : ''}${overallGapToBenchmark.toFixed(1)} pts vs 25%`;

  const benchmarkChartData = revenueMonthly.map((m) => ({
    monthLabel: m.monthLabel,
    campaignRev: Number(m.campaignRev ?? 0),
    crmPct: hasSiteRevenue ? (Number(m.campaignRev ?? 0) / parsedSiteRevenue) * 100 : null,
    benchmark: 25,
  }));

  const renderBenchmarkTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: ReadonlyArray<{ payload?: BenchmarkTooltipPayload }>;
    label?: string;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload;
    const revenue = Number(row?.campaignRev ?? 0);
    const crm = row?.crmPct == null ? null : Number(row.crmPct);
    const gap = crm == null ? null : crm - 25;
    return (
      <div className="rounded-lg border border-border bg-card p-2.5 text-xs shadow-sm">
        <p className="font-medium text-foreground mb-1">Month: {label}</p>
        <p className="text-muted-foreground">Revenue: <span className="text-foreground">${revenue.toLocaleString()}</span></p>
        <p className="text-muted-foreground">CRM %: <span className="text-foreground">{crm == null ? '—' : `${crm.toFixed(2)}%`}</span></p>
        <p className="text-muted-foreground">Gap to benchmark: <span className="text-foreground">{gap == null ? '—' : `${gap >= 0 ? '+' : ''}${gap.toFixed(2)} pts`}</span></p>
      </div>
    );
  };

  // Daily Email Engagement: prefer campaign analytics (synced from Braze API), fall back to usage CSV
  const dailyEmailEngagementData = (() => {
    const byDate = new Map<string, { opens: number; clicks: number; bounces: number }>();
    for (const r of rawCampaignRows) {
      const row = r as Record<string, unknown>;
      const date = String(row.date ?? '').slice(0, 10);
      if (!date) continue;
      const cur = byDate.get(date) ?? { opens: 0, clicks: 0, bounces: 0 };
      cur.opens += Number(row.opens ?? 0);
      cur.clicks += Number(row.clicks ?? 0);
      cur.bounces += Number(row.bounces ?? 0);
      byDate.set(date, cur);
    }
    if (byDate.size > 0) {
      return [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date,
          emails_opened: v.opens,
          email_clicks: v.clicks,
          email_bounces: v.bounces,
        }));
    }
    return usageChartData.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        date: String(row.date ?? ''),
        emails_opened: Number(row.emails_opened ?? 0),
        email_clicks: Number(row.email_clicks ?? 0),
        email_bounces: Number(row.email_bounces ?? 0),
      };
    });
  })();

  const engagementRatio = metrics.mau > 0 ? (metrics.dau / metrics.mau) * 100 : 0;

  // segmentChartDataByDate is pivoted: { date, "All Email Subscribers": 89950, "Active Subscribers (opened in 90d)": 62965, ... }
  const latestSegmentDate = segmentChartDataByDate.length > 0
    ? String((segmentChartDataByDate[segmentChartDataByDate.length - 1] as Record<string, unknown>).date ?? '')
    : '';
  const latestSegmentRow = segmentChartDataByDate.length > 0
    ? (segmentChartDataByDate[segmentChartDataByDate.length - 1] as Record<string, string | number>)
    : null;

  // Resolve segments by keyword so names like "All Email Subscribers", "Active Subscribers (opened in 90d)" etc. resolve correctly
  const findSegmentByKeyword = (keywords: string[]) => {
    if (!latestSegmentRow) return 0;
    for (const name of segmentNames) {
      const lower = name.toLowerCase();
      if (keywords.every((k) => lower.includes(k))) {
        return Number(latestSegmentRow[name] ?? 0);
      }
    }
    return 0;
  };

  const segmentAll = findSegmentByKeyword(['all', 'email', 'subscriber']);
  const segmentActive = findSegmentByKeyword(['active', 'subscriber']);
  const segmentChurned = findSegmentByKeyword(['churn']);
  const segmentOther = Math.max(0, segmentAll - segmentActive - segmentChurned);
  const segmentTotal = segmentAll > 0 ? segmentAll : segmentActive + segmentChurned;

  const segmentDonutData = segmentAll > 0
    ? [
        { name: 'Active Subscribers', value: segmentActive, color: 'hsl(142 71% 45%)' },
        { name: 'Churned', value: segmentChurned, color: 'hsl(0 72% 51%)' },
        { name: 'Other (inactive)', value: segmentOther, color: 'hsl(217 91% 60%)' },
      ].filter((s) => s.value > 0)
    : segmentNames.slice(0, 6).map((name, i) => ({
        name,
        value: latestSegmentRow ? Number(latestSegmentRow[name] ?? 0) : 0,
        color: ['hsl(217 91% 60%)', 'hsl(142 71% 45%)', 'hsl(0 72% 51%)', 'hsl(262 83% 58%)', 'hsl(24 95% 53%)', 'hsl(173 58% 39%)'][i % 6],
      }));

  const chartMutedFill = 'hsl(var(--muted-foreground))';

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-b from-background via-primary/[0.02] to-muted/20">
        <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <PageHeader
            title="Analytics"
            description="Revenue performance, campaign metrics, and subscriber trends"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className={cn(dashPill, 'border-0 text-[10px]')}>
              Live data
            </Badge>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[150px] h-10 text-sm border-primary/15 bg-card/80 shadow-sm">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">All Time</SelectItem>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
              <SelectItem value="60d">60 Days</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>
          </div>
        </div>

        {/* Lifecycle Flow Performance — merged campaign analytics (CSV) + Braze canvas sync metrics */}
        {(lifecycleFlowPerformanceRows.length > 0 ||
          (brazeCanvasFlowMetricsIsLoading && campaignTableRows.length === 0)) &&
          (() => {
          const metricLabels: Record<string, string> = {
            revenue: 'Revenue', sent: 'Sends', opens: 'Opens', clicks: 'Clicks', orders: 'Orders',
          };
          const metricFormatter = (v: number) =>
            flowChartMetric === 'revenue' ? `$${Number(v).toLocaleString()}` : Number(v).toLocaleString();

          const mapped = [...lifecycleFlowPerformanceRows].map((r) => {
            const value =
              flowChartMetric === 'revenue'
                ? r.revenue
                : flowChartMetric === 'sent'
                  ? r.sent
                  : flowChartMetric === 'opens'
                    ? r.opens
                    : flowChartMetric === 'clicks'
                      ? r.clicks
                      : flowChartMetric === 'orders'
                        ? r.orders
                        : 0;
            const v = Number(value);
            return {
              name: r.name,
              value: Number.isFinite(v) && v >= 0 ? v : 0,
              drilldownPrefix: r.drilldownPrefix,
            };
          });
          const seen = new Set<string>();
          const flowChartData = mapped
            .filter((r) => r.value > 0)
            .sort((a, b) => b.value - a.value)
            .filter((r) => {
              if (seen.has(r.name)) return false;
              seen.add(r.name);
              return true;
            })
            .slice(0, 15);

          const barHeight = 36;
          const chartHeight = Math.max(220, flowChartData.length * barHeight + 40);
          const flowKey = (prefix: 'campaign' | 'canvas', name: string) => `${prefix}:${name}`;

          return (
            <Card className={analyticsCardClass}>
              <div className={dashboardTopAccentClass} aria-hidden />
              <CardHeader className={analyticsCardHeaderClass}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/12 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/20">
                        <Workflow className="h-4 w-4" />
                      </span>
                      Lifecycle Flow Performance
                    </CardTitle>
                    <p className={analyticsSubtitleClass}>
                      Select a flow to filter metrics below. Bars use data already in this workspace—campaign analytics (CSV import) plus journey metrics from{' '}
                      <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">braze_canvases</code> after a full Braze sync (button below)—not a live Braze call on each visit.
                    </p>
                    {brazeCanvasFlowMetricsError && brazeCanvasFlowMetricsErrorMessage && (
                      <Alert variant="destructive" className="mt-3 text-left">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Cannot load journey rows (braze_canvases)</AlertTitle>
                        <AlertDescription className="text-sm mt-1">{brazeCanvasFlowMetricsErrorMessage}</AlertDescription>
                      </Alert>
                    )}
                    {brazeCanvasFlowMetricsIsFetching && brazeCanvasFlowMetricsIsLoading === false && !brazeCanvasFlowMetricsError && (
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                        Refreshing saved journey data from the database…
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 border-primary/15 bg-card/80 shadow-sm"
                      disabled={!workspaceClientId || !brazeWorkspacePlatform?.id || canvasMetricsSyncing}
                      onClick={handleCanvasMetricsSync}
                      title={
                        !brazeWorkspacePlatform?.id
                          ? 'Connect Braze on Platforms for this workspace first.'
                          : 'Runs full sync-braze (canvas data_series metrics, KPI, campaigns). Can take several minutes.'
                      }
                    >
                      {canvasMetricsSyncing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      {canvasMetricsSyncing ? 'Syncing…' : 'Sync Braze metrics'}
                    </Button>
                    <Select value={flowChartMetric} onValueChange={(v) => setFlowChartMetric(v as typeof flowChartMetric)}>
                      <SelectTrigger className="w-[210px] h-9 text-sm border-primary/15 bg-card/80 shadow-sm shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['revenue', 'sent', 'opens', 'clicks', 'orders'] as const).map(m => (
                          <SelectItem key={m} value={m}>
                            All Flows ({metricLabels[m]})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-6 bg-muted/10">
                {brazeCanvasFlowMetricsIsLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    Loading braze_canvases from the database…
                  </div>
                )}
                {brazeCanvasFlowMetricsIsLoading && lifecycleFlowPerformanceRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin opacity-60" />
                    Waiting for journey rows…
                  </div>
                ) : flowChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No flows with a positive value for this metric. Import campaign analytics (CSV), apply the braze_canvases migration if needed, then run{' '}
                    <span className="font-medium">Sync Braze metrics</span> above to backfill canvas series (entries, revenue, conversions, opens, clicks).
                  </p>
                ) : (
                <div className={cn(analyticsChartPanelClass, '[&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]')} style={{ height: chartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={flowChartData}
                      layout="vertical"
                      margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
                      onClick={(d) => {
                        const p = d?.activePayload?.[0]?.payload as { name?: string; drilldownPrefix?: 'campaign' | 'canvas' } | undefined;
                        if (p?.name && p?.drilldownPrefix) {
                          const key = flowKey(p.drilldownPrefix, p.name);
                          setSelectedFlow((prev) => (prev === key ? 'all' : key));
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={metricFormatter} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fill: chartMutedFill, fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={280}
                        interval={0}
                      />
                      <Tooltip
                        contentStyle={analyticsTooltipContentStyle}
                        labelStyle={analyticsTooltipLabelStyle}
                        formatter={(v: number) => [metricFormatter(v), metricLabels[flowChartMetric]]}
                      />
                      <Bar
                        dataKey="value"
                        name={metricLabels[flowChartMetric]}
                        fill="hsl(230 80% 55%)"
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                      >
                        {flowChartData.map((entry) => (
                          <Cell
                            key={`${entry.drilldownPrefix}:${entry.name}`}
                            fill={
                              selectedFlow === flowKey(entry.drilldownPrefix, entry.name)
                                ? 'hsl(262 83% 45%)'
                                : 'hsl(230 80% 55%)'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                )}
                {selectedFlow !== 'all' && (
                  <p className="mt-2 text-xs text-muted-foreground text-center">
                    Filtering to <span className="font-medium text-foreground">{selectedFlow.replace(/^(campaign|canvas):/, '')}</span> — click the bar again to reset
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })()}

        <Card className={analyticsCardClass}>
          <div className={dashboardTopAccentClass} aria-hidden />
          <CardHeader className={analyticsCardHeaderClass}>
            <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>
              <span className={cn(dashIconChip, 'h-9 w-9 shrink-0')}>
                <Send className="h-4 w-4" />
              </span>
              Performance Snapshot
            </CardTitle>
            <p className={analyticsSubtitleClass}>Delivery, engagement, list health, and campaign hygiene KPIs.</p>
          </CardHeader>
          <CardContent className="pt-2 pb-6 bg-muted/10 divide-y divide-border/40">
            {selectedCanvasRow ? (
              /* Canvas-level view */
              <div className="py-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard icon={Send} label="Sends (30d)" value={n(selectedCanvasRow.sends_last_30d).toLocaleString()} color="bg-primary/12 text-primary" accent="primary" />
                <StatCard icon={UserPlus} label="Entries (30d)" value={n(selectedCanvasRow.entries_last_30d).toLocaleString()} color="bg-blue-500/12 text-blue-600 dark:text-blue-400" accent="blue" />
                <StatCard icon={Workflow} label="Schedule Type" value={String(selectedCanvasRow.schedule_type ?? '—')} color="bg-amber-500/12 text-amber-600 dark:text-amber-400" accent="amber" />
                <StatCard
                  icon={Layers}
                  label="Status"
                  value={selectedCanvasRow.enabled ? 'Active' : 'Inactive'}
                  color={selectedCanvasRow.enabled ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'}
                  accent={selectedCanvasRow.enabled ? 'emerald' : 'rose'}
                />
              </div>
            ) : (
              <>
                <div className="py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">Volume</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <StatCard icon={Send} label="Total Sent" value={activeMetrics.totalSent.toLocaleString()} color="bg-primary/12 text-primary" accent="primary" />
                    <StatCard icon={Send} label="Total Delivered" value={activeMetrics.totalDelivered.toLocaleString()} color="bg-blue-500/12 text-blue-600 dark:text-blue-400" accent="blue" />
                    <StatCard icon={Eye} label="Total Opens" value={activeMetrics.totalOpens.toLocaleString()} color="bg-amber-500/12 text-amber-600 dark:text-amber-400" accent="amber" />
                    <StatCard
                      icon={Send}
                      label="Total Clicks"
                      value={activeMetrics.totalClicks.toLocaleString()}
                      color="bg-cyan-500/12 text-cyan-600 dark:text-cyan-400"
                      accent="cyan"
                      trend={{ direction: 'flat', value: `${activeMetrics.totalConversions.toLocaleString()} conversions` }}
                    />
                  </div>
                </div>

                <div className="py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">List Health</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <StatCard icon={MailWarning} label="Hard bounces (30d)" value={hardBounceCount.toLocaleString()} color="bg-rose-500/12 text-rose-600 dark:text-rose-400" accent="rose" />
                    <StatCard icon={UserPlus} label="Unsubscribes (30d)" value={unsubCount30d.toLocaleString()} color="bg-orange-500/12 text-orange-600 dark:text-orange-400" accent="orange" />
                    <StatCard
                      icon={Layers}
                      label="Segments tracking ON"
                      value={trackingSummary.enabled.toLocaleString()}
                      color="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                      accent="emerald"
                      trend={{
                        direction: 'flat',
                        value:
                          trackingSummary.total === 0
                            ? 'Sync Braze segments/list or upload segment analytics CSV (Resources)'
                            : trackingSummary.source === 'csv'
                              ? `${trackingSummary.total.toLocaleString()} from segment CSV — shown as on (no per-segment API flags)`
                              : `${trackingSummary.total.toLocaleString()} in directory · ${trackingSummary.disabled.toLocaleString()} tracking off`,
                      }}
                    />
                    <StatCard
                      icon={Workflow}
                      label="Campaigns flagged"
                      value={cleanupFlagged.toLocaleString()}
                      color="bg-amber-500/12 text-amber-600 dark:text-amber-400"
                      accent="amber"
                      trend={{
                        direction: cleanupFlagged > 0 ? 'down' : 'flat',
                        value:
                          cleanupFlagged > 0
                            ? 'Name, tags, or status matched cleanup patterns'
                            : campaignDirectoryRows.length === 0
                              ? 'No campaign directory yet — sync Braze or upload campaign analytics CSV'
                              : 'No campaigns matched patterns (test, IP warm, sandbox, staging, cleanup)',
                      }}
                    />
                  </div>
                </div>

                <div className="py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">Engagement Rates</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    <StatCard
                      icon={Eye}
                      label="Delivery Rate"
                      value={formatPct(activeMetrics.deliveryRate)}
                      color="bg-purple-500/12 text-purple-600 dark:text-purple-400"
                      accent="purple"
                      trend={{ direction: 'flat', value: `Bounce ${formatPct(activeMetrics.bounceRate)}` }}
                    />
                    <StatCard icon={Eye} label="Open Rate" value={formatPct(activeMetrics.openRate)} color="bg-amber-500/12 text-amber-600 dark:text-amber-400" accent="amber" />
                    <StatCard
                      icon={Send}
                      label="Click Rate"
                      value={formatPct(activeMetrics.clickRate)}
                      color="bg-cyan-500/12 text-cyan-600 dark:text-cyan-400"
                      accent="cyan"
                      trend={{ direction: 'flat', value: `Unsub ${formatPct(activeMetrics.unsubscribeRate)}` }}
                    />
                    <StatCard
                      icon={DollarSign}
                      label="Conversion Rate"
                      value={formatPct(activeMetrics.conversionRate)}
                      color="bg-rose-500/12 text-rose-600 dark:text-rose-400"
                      accent="rose"
                      trend={{
                        direction: 'flat',
                        value: `Scheduled active ${formatPct(activeMetrics.schedulingPerformanceRate)}`,
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Campaign revenue vs benchmark — combined chart */}
        <Card className={cn(analyticsCardClass, 'overflow-hidden')}>
          <div className={dashboardTopAccentClass} aria-hidden />
          <CardHeader className={analyticsCardHeaderClass}>
            <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>
              <span className={cn(dashIconChip, 'h-9 w-9 shrink-0')}>
                <BarChart2 className="h-4 w-4" />
              </span>
              How your campaigns compare to the benchmark
            </CardTitle>
            <p className={analyticsSubtitleClass}>Your revenue from campaigns and what “good” looks like (25% of total site revenue from CRM).</p>
          </CardHeader>
          <CardContent className="pt-2 pb-6 space-y-4 bg-muted/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/50 bg-gradient-to-br from-primary/[0.08] via-card to-card p-4 shadow-sm ring-1 ring-inset ring-primary/10 border-l-[3px] border-l-primary/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Total Campaign Revenue</p>
                <p className="text-xl font-bold tabular-nums text-foreground tracking-tight">${totalCampaignRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-gradient-to-br from-cyan-500/[0.06] via-card to-card p-4 shadow-sm ring-1 ring-inset ring-border/35 border-l-[3px] border-l-cyan-500/45">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Best Month</p>
                <p className="text-base font-semibold text-foreground leading-snug">
                  {bestMonth ? `${bestMonth.monthLabel} · $${Number(bestMonth.campaignRev ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-gradient-to-br from-amber-500/[0.06] via-card to-card p-4 shadow-sm ring-1 ring-inset ring-border/35 border-l-[3px] border-l-amber-500/45">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">vs 25% Benchmark</p>
                <p className="text-base font-semibold text-foreground leading-snug">{benchmarkStatText}</p>
              </div>
            </div>

            <div className={cn('h-[280px]', analyticsChartPanelClass, '[&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]')}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={benchmarkChartData.length ? benchmarkChartData : [{ monthLabel: '—', campaignRev: 0, crmPct: null, benchmark: 25 }]}
                  margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="revenue" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatDollar} width={50} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 'auto']} tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} width={42} />
                  <Tooltip content={renderBenchmarkTooltip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <ReferenceLine yAxisId="pct" y={25} stroke="hsl(24 95% 53%)" strokeDasharray="6 4" ifOverflow="extendDomain" label={{ value: '25% benchmark', fill: chartMutedFill, fontSize: 10, position: 'insideTopRight' }} />
                  <Bar yAxisId="revenue" dataKey="campaignRev" name="Revenue" fill="hsl(217 91% 60% / 0.85)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="pct" type="monotone" dataKey="crmPct" name="CRM %" stroke="hsl(173 58% 39%)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-dashed border-primary/20 bg-primary/[0.03] px-4 py-3 text-xs text-muted-foreground">
              <span className="flex-1 leading-relaxed">
                Top brands average 25% of total site revenue from CRM. Enter your site revenue above to see where you stand.
              </span>
              <div className="inline-flex items-center gap-2 shrink-0">
                <span className="text-foreground/80 font-medium whitespace-nowrap">Site revenue</span>
                <Input
                  inputMode="decimal"
                  placeholder="$____"
                  value={siteRevenueInput}
                  onChange={(e) => setSiteRevenueInput(e.target.value)}
                  className="h-9 w-[140px] text-sm border-primary/15 bg-background/80"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Segment size over time */}
        <Card className={analyticsCardClass}>
          <div className={dashboardTopAccentClass} aria-hidden />
          <CardHeader className={analyticsCardHeaderClass}>
            <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
                <UserPlus className="h-4 w-4" />
              </span>
              Segment Size Over Time
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-6 bg-muted/10">
            {segmentChartDataByDate.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <UploadCloud className="h-8 w-8 text-muted-foreground/70" />
                <p className="text-sm text-muted-foreground">Segment history appears after Braze sync or when data is available.</p>
                <Button asChild variant="link" className="text-primary hover:text-primary/90">
                  <Link to="/dashboard" className="inline-flex items-center gap-1.5">
                    Go to Dashboard <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className={cn('h-[300px]', analyticsChartPanelClass, '[&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))] [&_.recharts-legend-item-text]:fill-[hsl(var(--muted-foreground))]')}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={segmentChartDataByDate} margin={{ top: 12, right: 12, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                    <Tooltip
                      contentStyle={analyticsTooltipContentStyle}
                      labelStyle={analyticsTooltipLabelStyle}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                    {segmentNames.slice(0, 5).map((seg, i) => (
                      <Line
                        key={seg}
                        type="monotone"
                        dataKey={seg}
                        name={seg}
                        stroke={['hsl(217 91% 60%)', 'hsl(173 58% 39%)', 'hsl(262 83% 58%)', 'hsl(199 89% 48%)', 'hsl(24 95% 53%)'][i]}
                        strokeWidth={2}
                        dot={{ r: 3, fill: 'hsl(var(--card))' }}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Overview */}
        <div className="space-y-4">
          <div className="pl-1">
            <h2 className={analyticsSectionHeadingClass}>Performance Overview</h2>
            <p className={analyticsSubtitleClass}>Engagement, campaign mix, and subscriber composition</p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className={cn(analyticsCardClass, 'min-w-0')}>
              <div className={dashboardTopAccentClass} aria-hidden />
              <CardHeader className={analyticsCardHeaderClass}>
                <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>Daily Email Engagement</CardTitle>
                <p className={analyticsSubtitleClass}>Opens, clicks, and bounces from Braze usage analytics by day.</p>
              </CardHeader>
              <CardContent className="pb-6 bg-muted/10">
                <div className={cn('h-[280px]', analyticsChartPanelClass, '[&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyEmailEngagementData} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                      <Tooltip
                        contentStyle={analyticsTooltipContentStyle}
                        labelStyle={analyticsTooltipLabelStyle}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                      <Line type="monotone" dataKey="emails_opened" name="Opens" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="email_clicks" name="Clicks" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className={cn(analyticsCardClass, 'min-w-0 overflow-visible')}>
              <div className={dashboardTopAccentClass} aria-hidden />
              <CardHeader className={analyticsCardHeaderClass}>
                <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>Campaign Comparison</CardTitle>
                <p className={analyticsSubtitleClass}>Revenue and conversions by campaign, sorted by revenue.</p>
              </CardHeader>
              <CardContent className="space-y-3 overflow-visible pb-6 bg-muted/10">
                <div className="flex flex-wrap items-center gap-2">
                  <Popover open={compOpen} onOpenChange={setCompOpen}>
                    <PopoverTrigger asChild>
                      <button className="inline-flex h-8 w-[200px] items-center justify-between rounded-md border border-primary/15 bg-card/80 px-3 text-xs shadow-sm hover:bg-muted/50 transition-colors truncate">
                        <span className="truncate">
                          {compSelectedCampaign === 'all' ? 'All campaigns' : compSelectedCampaign}
                        </span>
                        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search campaigns..." className="h-8 text-xs" />
                        <CommandList>
                          <CommandEmpty>No campaigns found</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="all"
                              onSelect={() => { setCompSelectedCampaign('all'); setCompOpen(false); }}
                            >
                              <Check className={cn('mr-2 h-3 w-3', compSelectedCampaign === 'all' ? 'opacity-100' : 'opacity-0')} />
                              All campaigns
                            </CommandItem>
                          </CommandGroup>
                          {campaignNamesWithData.length > 0 && (
                            <>
                              <CommandSeparator />
                              <CommandGroup heading="Has data">
                                {campaignNamesWithData.map((name) => (
                                  <CommandItem
                                    key={name}
                                    value={name}
                                    onSelect={() => { setCompSelectedCampaign(name); setCompOpen(false); }}
                                  >
                                    <Check className={cn('mr-2 h-3 w-3', compSelectedCampaign === name ? 'opacity-100' : 'opacity-0')} />
                                    {name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                          {campaignNamesNoData.length > 0 && (
                            <>
                              <CommandSeparator />
                              <CommandGroup heading="No data">
                                {campaignNamesNoData.map((name) => (
                                  <CommandItem
                                    key={name}
                                    value={name}
                                    onSelect={() => { setCompSelectedCampaign(name); setCompOpen(false); }}
                                    className="text-muted-foreground"
                                  >
                                    <Check className={cn('mr-2 h-3 w-3', compSelectedCampaign === name ? 'opacity-100' : 'opacity-0')} />
                                    {name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <input
                    type="date"
                    value={compStartDate}
                    onChange={(e) => setCompStartDate(e.target.value)}
                    className="h-8 rounded-md border border-primary/15 bg-card/80 px-2 text-xs shadow-sm text-foreground"
                    placeholder="Start date"
                  />
                  <span className="text-xs text-muted-foreground">—</span>
                  <input
                    type="date"
                    value={compEndDate}
                    onChange={(e) => setCompEndDate(e.target.value)}
                    className="h-8 rounded-md border border-primary/15 bg-card/80 px-2 text-xs shadow-sm text-foreground"
                    placeholder="End date"
                  />
                  {(compSelectedCampaign !== 'all' || compStartDate || compEndDate) && (
                    <button
                      onClick={() => { setCompSelectedCampaign('all'); setCompStartDate(''); setCompEndDate(''); }}
                      className="h-8 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground border border-border/40 hover:border-border transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div
                  className={cn(
                    'relative z-0 h-[280px] overflow-visible',
                    analyticsChartPanelClass,
                    '[&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]',
                    '[&_.recharts-surface]:!overflow-visible',
                    '[&_.recharts-wrapper]:!overflow-visible',
                  )}
                >
                  {campaignComparisonData.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data for selected filters</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={campaignComparisonData}
                        layout="vertical"
                        margin={{ top: 8, right: 16, bottom: 44, left: 90 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="campaign_name" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                        <Tooltip
                          allowEscapeViewBox={{ x: true, y: true }}
                          wrapperStyle={{ zIndex: 50, outline: 'none' }}
                          contentStyle={analyticsTooltipContentStyle}
                          labelStyle={analyticsTooltipLabelStyle}
                        />
                        <Legend
                          verticalAlign="bottom"
                          align="center"
                          layout="horizontal"
                          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                          iconType="circle"
                          iconSize={8}
                        />
                        {compBenchmarkRevenue > 0 && (
                          <ReferenceLine x={compBenchmarkRevenue} stroke="hsl(24 95% 53%)" strokeDasharray="5 3" label={{ value: 'Avg revenue', fill: chartMutedFill, fontSize: 10, position: 'insideTopRight' }} />
                        )}
                        <Bar dataKey="revenue" name="Revenue" fill="hsl(262 83% 58% / 0.9)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="conversions" name="Conversions" fill="hsl(199 89% 48% / 0.9)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className={cn(analyticsCardClass, 'min-w-0')}>
              <div className={dashboardTopAccentClass} aria-hidden />
              <CardHeader className={analyticsCardHeaderClass}>
                <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>Subscriber Segments</CardTitle>
                <p className={analyticsSubtitleClass}>
                  Latest segment mix from Braze segment analytics{latestSegmentDate ? ` (${latestSegmentDate})` : ''}.
                </p>
              </CardHeader>
              <CardContent className="space-y-3 pb-6 bg-muted/10">
                <div className={cn('h-[220px] overflow-visible', analyticsChartPanelClass)}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={segmentDonutData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={82}
                        paddingAngle={2}
                      >
                        {segmentDonutData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        wrapperStyle={{ zIndex: 50, outline: 'none' }}
                        contentStyle={analyticsTooltipContentStyle}
                        labelStyle={analyticsTooltipLabelStyle}
                        formatter={(v: number, n: string) => {
                          const pct = segmentTotal > 0 ? ((Number(v) / segmentTotal) * 100).toFixed(1) : '0.0';
                          return [`${Number(v).toLocaleString()} (${pct}%)`, n];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 rounded-lg border border-border/40 bg-card/50 p-3">
                  {segmentDonutData.map((s) => {
                    const pct = segmentTotal > 0 ? (s.value / segmentTotal) * 100 : 0;
                    return (
                      <div key={s.name} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-b-0 last:pb-0 first:pt-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-black/10" style={{ backgroundColor: s.color }} />
                          <span className="text-muted-foreground truncate">{s.name}</span>
                        </div>
                        <span className="font-semibold text-foreground tabular-nums text-[11px] sm:text-xs">
                          {s.value.toLocaleString()} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                    );
                  })}
                  {segmentAll > 0 && (
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-border/40 mt-1">
                      <span className="text-muted-foreground font-medium">Total subscribers</span>
                      <span className="font-semibold text-foreground tabular-nums text-[11px] sm:text-xs">
                        {segmentAll.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className={cn(analyticsCardClass, 'lg:col-span-2')}>
            <div className={dashboardTopAccentClass} aria-hidden />
            <CardHeader className={analyticsCardHeaderClass}>
              <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>Bounce Rate Over Time</CardTitle>
              <p className={analyticsSubtitleClass}>Daily bounce rate (bounces ÷ sends) from campaign analytics data.</p>
            </CardHeader>
            <CardContent className="pb-6 pt-4 bg-muted/10">
              {bounceRateData.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <MailWarning className="h-8 w-8 text-muted-foreground/70" />
                  <p className="text-sm text-muted-foreground">Bounce rate data appears after campaign analytics are synced or imported.</p>
                </div>
              ) : (
                <div className={cn('h-[260px]', analyticsChartPanelClass, '[&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={bounceRateData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={48} />
                      <Tooltip
                        contentStyle={analyticsTooltipContentStyle}
                        labelStyle={analyticsTooltipLabelStyle}
                        formatter={(v: number) => [`${Number(v).toFixed(3)}%`, 'Bounce Rate']}
                      />
                      <ReferenceLine y={2} stroke="hsl(24 95% 53%)" strokeDasharray="5 3" label={{ value: '2% threshold', fill: chartMutedFill, fontSize: 10, position: 'insideTopRight' }} />
                      <Line type="monotone" dataKey="bounce_rate" name="Bounce Rate" stroke="hsl(0 72% 51%)" strokeWidth={2} dot={false} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={analyticsCardClass}>
            <div className={dashboardTopAccentClass} aria-hidden />
            <CardHeader className={analyticsCardHeaderClass}>
              <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>Top Bounce Domains</CardTitle>
              <p className={analyticsSubtitleClass}>Highest-volume domains in hard bounce data</p>
            </CardHeader>
            <CardContent className="space-y-1 pb-6 bg-muted/10">
              {bounceDomains.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No hard bounce domain data yet.</p>
              ) : (
                bounceDomains.map((d) => (
                  <div
                    key={d.domain}
                    className="flex items-center justify-between text-xs rounded-lg border border-border/40 bg-card/60 px-3 py-2.5 hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-muted-foreground truncate pr-2">{d.domain}</span>
                    <span className="font-semibold tabular-nums text-foreground shrink-0">{d.count.toLocaleString()}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI Insights */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Insights
              </CardTitle>
              <Button size="sm" onClick={generateInsights} disabled={insightsLoading || !client?.id}>
                {insightsLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                {insightsLoading ? 'Generating...' : 'Generate Insights'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {insightsError && (
                <p className="text-sm text-red-500">{insightsError}</p>
              )}
              {insights.length === 0 && !insightsLoading && !insightsError && (
                <p className="text-sm text-muted-foreground">Click "Generate Insights" to analyze your campaign data with AI.</p>
              )}
              {insights.map((insight, i) => (
                <div key={i} className="p-3 rounded-lg border bg-card/50">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className={cn("text-[10px]", insight.tagColor)}>{insight.tag}</Badge>
                    <span className="text-sm font-semibold">{insight.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{insight.body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
  );
}
