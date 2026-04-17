import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAnalyticsData, type LifecycleFlowPerformanceRow } from '@/hooks/useAnalyticsData';
import {
  useResolvedClientId,
  useDoubleGoodPlatforms,
  useActiveClientRow,
} from '@/hooks/useDoubleGoodClient';
import { useToast } from '@/hooks/use-toast';
import {
  buildDefaultStarredSegmentMixNames,
  compareSegmentMixRows,
  migrateStarredSegmentMixNames,
} from '@/lib/brazeSegmentMixNames';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { supabase } from '@/integrations/supabase/client';
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
  Eye, RefreshCw, BarChart2, UploadCloud, MailWarning, Layers, Loader2, AlertCircle,
  ChevronsUpDown, Check, Star,
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

/** Collapse whitespace / newlines so Recharts does not stack multiple SVG lines on one tick. */
function normalizeCategoryAxisLabel(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ellipsizeAxisLabel(str: string, maxChars: number): string {
  if (str.length <= maxChars) return str;
  if (maxChars <= 1) return '…';
  return `${str.slice(0, maxChars - 1)}…`;
}

type VerticalCategoryTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
  fill?: string;
  maxChars: number;
  fontSize?: number;
};

/** Single-line category tick; hover shows full name via SVG title. */
function VerticalCategoryAxisTick({
  x = 0,
  y = 0,
  payload,
  fill = 'hsl(var(--muted-foreground))',
  maxChars,
  fontSize = 11,
}: VerticalCategoryTickProps) {
  const full = normalizeCategoryAxisLabel(payload?.value);
  const label = ellipsizeAxisLabel(full, maxChars);
  return (
    <text
      x={x}
      y={y}
      dy="0.35em"
      textAnchor="end"
      fill={fill}
      fontSize={fontSize}
      className="recharts-cartesian-axis-tick-value"
    >
      <title>{full}</title>
      {label}
    </text>
  );
}

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
type BenchmarkType = 'campaign' | 'canvas';
type BenchmarkRangePreset = '7d' | '30d' | '90d' | 'custom';
type SegmentRangePreset = '7d' | '30d' | '90d' | 'custom';

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

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIsoDayToUtcMs(day: string): number {
  const t = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isNaN(t) ? 0 : t;
}

const STARRED_CORE_SEGMENTS_STORAGE_KEY = 'analytics:starred-core-segments:v1';
/** First-time visitors: star up to N segments (core trio first when present, then by size). */
const DEFAULT_STARRED_SEGMENT_MIX_COUNT = 5;

export default function Analytics() {
  const { data: client } = useActiveClientRow();
  const { clientId: workspaceClientId } = useResolvedClientId();
  const { data: platforms } = useDoubleGoodPlatforms();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const brazeWorkspacePlatform = platforms?.find((p) => p.platform === 'braze' && p.is_connected);
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
  type CompViewMode = 'by_campaign' | 'by_date';
  type CompRangePreset = 'all' | '7d' | '30d' | '90d' | 'custom';
  const [compViewMode, setCompViewMode] = useState<CompViewMode>('by_campaign');
  const [compRangePreset, setCompRangePreset] = useState<CompRangePreset>('all');
  const [compShowBenchmark, setCompShowBenchmark] = useState(true);

  const applyCompRangePreset = useCallback((p: CompRangePreset) => {
    setCompRangePreset(p);
    if (p === 'all') {
      setCompStartDate('');
      setCompEndDate('');
      return;
    }
    if (p === 'custom') return;
    const endD = toIsoDate(new Date());
    const startD = new Date();
    const days = p === '7d' ? 7 : p === '30d' ? 30 : 90;
    startD.setDate(startD.getDate() - days);
    setCompStartDate(toIsoDate(startD));
    setCompEndDate(endD);
  }, []);
  const [benchmarkType, setBenchmarkType] = useState<BenchmarkType>('campaign');
  const [benchmarkRangePreset, setBenchmarkRangePreset] = useState<BenchmarkRangePreset>('30d');
  const [benchmarkCustomStart, setBenchmarkCustomStart] = useState('');
  const [benchmarkCustomEnd, setBenchmarkCustomEnd] = useState('');
  const [segmentRangePreset, setSegmentRangePreset] = useState<SegmentRangePreset>('30d');
  const [segmentCustomStart, setSegmentCustomStart] = useState('');
  const [segmentCustomEnd, setSegmentCustomEnd] = useState('');
  /**
   * Starred/core segments persistence:
   * - Stored in localStorage so stars survive reloads/sessions without backend dependency.
   * - Keyed by segment name because analytics dataset is name-keyed in this view.
   */
  const [starredCoreSegments, setStarredCoreSegments] = useState<string[]>([]);

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

    /** Same-origin — avoids CORS when Edge Function is missing or preflight fails (local dev). */
    const runLocalViteInsights = async () => {
      const { data: canvases, error: dbError } = await supabase
        .from('braze_canvases')
        .select('name, sends_last_30d, entries_last_30d, entries_last_60d, tags, enabled, schedule_type, conversion_events')
        .eq('client_id', client.id)
        .eq('archived', false);
      if (dbError) throw dbError;
      const campaigns = (canvases || []).map((c) => ({
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
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        insights?: { title: string; body: string; tag: string; tagColor: string }[];
      };
      if (!res.ok) throw new Error(json.error || `Insights API HTTP ${res.status}`);
      setInsights(Array.isArray(json.insights) ? json.insights : []);
    };

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setInsightsError('Sign in to generate AI insights.');
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke<{
        insights?: { title: string; body: string; tag: string; tagColor: string }[];
        error?: string;
      }>('generate-analytics-insights', {
        body: { client_id: client.id },
        headers: { Authorization: `Bearer ${token}` },
      });

      const edgePayloadErr =
        data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error;
      if (!fnError && !edgePayloadErr) {
        setInsights(Array.isArray(data?.insights) ? data.insights : []);
        return;
      }

      const msg = fnError
        ? typeof fnError === 'object' && fnError !== null && 'message' in fnError
          ? String((fnError as { message?: string }).message)
          : 'Edge function failed'
        : String(edgePayloadErr);

      if (import.meta.env.DEV) {
        try {
          await runLocalViteInsights();
          return;
        } catch {
          setInsightsError(
            `${msg} (local fallback failed — set ANTHROPIC_API_KEY in .env and use npm run dev).`,
          );
        }
      } else {
        setInsightsError(
          `${msg} If you see a CORS error, deploy: supabase functions deploy generate-analytics-insights`,
        );
      }
    } catch (err: unknown) {
      if (import.meta.env.DEV) {
        try {
          await runLocalViteInsights();
        } catch {
          setInsightsError(err instanceof Error ? err.message : 'Failed to generate insights');
        }
      } else {
        setInsightsError(err instanceof Error ? err.message : 'Failed to generate insights');
      }
    } finally {
      setInsightsLoading(false);
    }
  };

  const campaignComparisonData = useMemo(() => {
    let rows = rawCampaignRows as Record<string, unknown>[];
    if (compStartDate) rows = rows.filter((r) => String(r.date ?? '').slice(0, 10) >= compStartDate);
    if (compEndDate) rows = rows.filter((r) => String(r.date ?? '').slice(0, 10) <= compEndDate);
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

  /** Vertical bar chart needs explicit pixel height; outer wrapper scrolls when there are many campaigns. */
  const campaignComparisonBarChartHeight = useMemo(() => {
    const n = campaignComparisonData.length;
    if (n <= 0) return 320;
    const perRow = 52;
    const legendAndMargins = 88;
    return Math.min(3200, Math.max(300, n * perRow + legendAndMargins));
  }, [campaignComparisonData]);

  const campaignComparisonByDateData = useMemo(() => {
    let rows = rawCampaignRows as Record<string, unknown>[];
    if (compStartDate) rows = rows.filter((r) => String(r.date ?? '').slice(0, 10) >= compStartDate);
    if (compEndDate) rows = rows.filter((r) => String(r.date ?? '').slice(0, 10) <= compEndDate);
    if (compSelectedCampaign !== 'all') {
      rows = rows.filter((r) => String(r.campaign_name ?? r.name ?? '').trim() === compSelectedCampaign);
    }
    const byDate = new Map<string, { revenue: number; conversions: number }>();
    for (const r of rows) {
      const date = String(r.date ?? '').slice(0, 10);
      if (!date) continue;
      const cur = byDate.get(date) ?? { revenue: 0, conversions: 0 };
      cur.revenue += Number(r.revenue ?? 0);
      cur.conversions += Number(r.conversions ?? r.orders ?? 0);
      byDate.set(date, cur);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, revenue: v.revenue, conversions: v.conversions }))
      .filter((row) => row.revenue > 0 || row.conversions > 0);
  }, [rawCampaignRows, compStartDate, compEndDate, compSelectedCampaign]);

  const compBenchmarkRevenue =
    campaignComparisonData.length > 1
      ? campaignComparisonData.reduce((s, r) => s + r.revenue, 0) / campaignComparisonData.length
      : 0;

  const compBenchmarkDailyRevenue =
    campaignComparisonByDateData.length > 1
      ? campaignComparisonByDateData.reduce((s, r) => s + r.revenue, 0) / campaignComparisonByDateData.length
      : 0;

  const compBenchmarkDailyConversions =
    campaignComparisonByDateData.length > 1
      ? campaignComparisonByDateData.reduce((s, r) => s + r.conversions, 0) / campaignComparisonByDateData.length
      : 0;

  const benchmarkRange = useMemo(() => {
    /**
     * Date filter logic for Core Benchmark:
     * - Presets compute [startDate, endDate] anchored to today.
     * - Custom uses explicit user-selected dates.
     * - Toggle (campaign/canvas) does not mutate this state, so date range is preserved while switching type.
     */
    const endDate = toIsoDate(new Date());
    if (benchmarkRangePreset === 'custom') {
      return {
        startDate: benchmarkCustomStart || null,
        endDate: benchmarkCustomEnd || null,
      };
    }
    const days = benchmarkRangePreset === '7d' ? 7 : benchmarkRangePreset === '30d' ? 30 : 90;
    const start = new Date();
    start.setDate(start.getDate() - days);
    return {
      startDate: toIsoDate(start),
      endDate,
    };
  }, [benchmarkRangePreset, benchmarkCustomStart, benchmarkCustomEnd]);

  const benchmarkSeriesQuery = useQuery({
    queryKey: [
      'analytics',
      'core-benchmark-series',
      clientId,
      benchmarkType,
      benchmarkRange.startDate,
      benchmarkRange.endDate,
    ],
    queryFn: async () => {
      if (!clientId) return [] as Array<{ date: string; revenue: number }>;
      /**
       * Benchmark calculation method:
       * - Date filter logic is applied in SQL using `startDate`/`endDate`.
       * - Campaign mode: only aggregate variation rows (`__braze_sync_aggregate__`) and non-canvas channels.
       * - Canvas mode: channel contains "canvas" (case-insensitive), then fallback to `braze_canvases` snapshots if empty.
       * - Revenue is clamped at >= 0 for benchmark rollups to avoid negative correction rows producing counterintuitive totals.
       */
      let rows: Array<Record<string, unknown>> = [];
      if (benchmarkType === 'campaign') {
        let cq = (supabase as any)
          .from('braze_campaign_analytics')
          .select('date,revenue,channel')
          .eq('client_id', clientId)
          .eq('variation_api_id', '__braze_sync_aggregate__');
        if (benchmarkRange.startDate) cq = cq.gte('date', benchmarkRange.startDate);
        if (benchmarkRange.endDate) cq = cq.lte('date', benchmarkRange.endDate);
        const { data, error } = await cq.order('date', { ascending: true });
        if (error) throw error;
        rows = ((data ?? []) as Array<Record<string, unknown>>).filter((row) => {
          const channel = String(row.channel ?? '').trim().toLowerCase();
          return !channel.includes('canvas');
        });
      } else {
        let q = (supabase as any)
          .from('braze_campaign_analytics')
          .select('date,revenue,channel')
          .eq('client_id', clientId);
        if (benchmarkRange.startDate) q = q.gte('date', benchmarkRange.startDate);
        if (benchmarkRange.endDate) q = q.lte('date', benchmarkRange.endDate);
        const { data, error } = await q.order('date', { ascending: true });
        if (error) throw error;
        rows = ((data ?? []) as Array<Record<string, unknown>>).filter((row) =>
          String(row.channel ?? '').trim().toLowerCase().includes('canvas'),
        );
      }

      if (benchmarkType === 'canvas' && rows.length === 0) {
        /**
         * Canvas fallback:
         * Some workspaces only have canvas metrics in `braze_canvases` snapshot columns.
         * We map `synced_at` as date and `revenue_last_30d` as benchmark revenue so the
         * Canvas toggle still displays linked data instead of an empty benchmark.
         */
        let cq = (supabase as any)
          .from('braze_canvases')
          .select('synced_at,revenue_last_30d')
          .eq('client_id', clientId)
          .eq('archived', false);
        if (benchmarkRange.startDate) cq = cq.gte('synced_at', `${benchmarkRange.startDate}T00:00:00.000Z`);
        if (benchmarkRange.endDate) cq = cq.lte('synced_at', `${benchmarkRange.endDate}T23:59:59.999Z`);
        const { data: canvasData, error: canvasErr } = await cq.order('synced_at', { ascending: true });
        if (canvasErr) throw canvasErr;
        const DAY_MS = 24 * 60 * 60 * 1000;
        const selectedStartMs = benchmarkRange.startDate ? parseIsoDayToUtcMs(benchmarkRange.startDate) : null;
        const selectedEndMs = benchmarkRange.endDate ? parseIsoDayToUtcMs(benchmarkRange.endDate) : null;
        return (canvasData ?? []).map((row: Record<string, unknown>) => ({
          /**
           * `revenue_last_30d` is a rolling snapshot, not a historical daily series.
           * To honor benchmark date filters in fallback mode, we estimate the contribution
           * by overlap ratio between:
           * - selected range [startDate, endDate]
           * - canvas rolling window [synced_at - 29d, synced_at]
           */
          date: String(row.synced_at ?? '').slice(0, 10),
          revenue: (() => {
            const syncDay = String(row.synced_at ?? '').slice(0, 10);
            const syncMs = parseIsoDayToUtcMs(syncDay);
            if (!syncDay || syncMs <= 0) return 0;
            const windowEndMs = syncMs;
            const windowStartMs = syncMs - 29 * DAY_MS;
            const rangeStartMs = selectedStartMs ?? windowStartMs;
            const rangeEndMs = selectedEndMs ?? windowEndMs;
            const overlapStart = Math.max(windowStartMs, rangeStartMs);
            const overlapEnd = Math.min(windowEndMs, rangeEndMs);
            if (overlapEnd < overlapStart) return 0;
            const overlapDays = Math.floor((overlapEnd - overlapStart) / DAY_MS) + 1;
            const ratio = Math.max(0, Math.min(1, overlapDays / 30));
            return Math.max(0, Number(row.revenue_last_30d ?? 0)) * ratio;
          })(),
        }));
      }

      return rows.map((row: Record<string, unknown>) => ({
        date: String(row.date ?? '').slice(0, 10),
        revenue: Math.max(0, Number(row.revenue ?? 0)),
      }));
    },
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const benchmarkMonthly = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const row of benchmarkSeriesQuery.data ?? []) {
      if (!row.date) continue;
      const month = row.date.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + Number(row.revenue ?? 0));
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => {
        const mm = month.slice(5, 7);
        const yyyy = month.slice(0, 4);
        const monthLabel = `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mm) - 1] ?? mm} ${yyyy}`;
        return { month, monthLabel, campaignRev: revenue };
      });
  }, [benchmarkSeriesQuery.data]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STARRED_CORE_SEGMENTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const filtered = parsed.filter((v): v is string => typeof v === 'string');
      const migrated = migrateStarredSegmentMixNames(filtered);
      setStarredCoreSegments(migrated);
      if (JSON.stringify(migrated) !== JSON.stringify(filtered)) {
        localStorage.setItem(STARRED_CORE_SEGMENTS_STORAGE_KEY, JSON.stringify(migrated));
      }
    } catch {
      // Ignore invalid local storage payload and continue with empty starred set.
    }
  }, []);

  const toggleStarredCoreSegment = useCallback((segmentName: string) => {
    setStarredCoreSegments((prev) => {
      const next = prev.includes(segmentName)
        ? prev.filter((s) => s !== segmentName)
        : [...prev, segmentName];
      try {
        localStorage.setItem(STARRED_CORE_SEGMENTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage failures (private mode/quota) should not break the dashboard.
      }
      return next;
    });
  }, []);

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

  const segmentRange = useMemo(() => {
    const endDate = toIsoDate(new Date());
    if (segmentRangePreset === 'custom') {
      return { startDate: segmentCustomStart || null, endDate: segmentCustomEnd || null };
    }
    const days = segmentRangePreset === '7d' ? 7 : segmentRangePreset === '30d' ? 30 : 90;
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { startDate: toIsoDate(start), endDate };
  }, [segmentRangePreset, segmentCustomStart, segmentCustomEnd]);

  // segmentChartDataByDate is pivoted: { date, "<segmentName>": size, ... } from real Braze/CSV analytics sync.
  const filteredSegmentSeries = useMemo(() => {
    return segmentChartDataByDate.filter((rawRow) => {
      const row = rawRow as Record<string, unknown>;
      const d = String(row.date ?? '').slice(0, 10);
      if (!d) return false;
      if (segmentRange.startDate && d < segmentRange.startDate) return false;
      if (segmentRange.endDate && d > segmentRange.endDate) return false;
      return true;
    });
  }, [segmentChartDataByDate, segmentRange.startDate, segmentRange.endDate]);

  const latestSegmentRow = filteredSegmentSeries.length > 0
    ? (filteredSegmentSeries[filteredSegmentSeries.length - 1] as Record<string, string | number>)
    : null;
  // For summary cards/list, keep showing the latest real snapshot even if selected range has no rows.
  const latestAnySegmentRow = segmentChartDataByDate.length > 0
    ? (segmentChartDataByDate[segmentChartDataByDate.length - 1] as Record<string, string | number>)
    : null;
  const segmentSummaryRow = latestSegmentRow ?? latestAnySegmentRow;
  /** As-of date for Subscriber Segments subtitle — uses global latest when range has no rows. */
  const segmentMixAsOfDate = segmentSummaryRow
    ? String((segmentSummaryRow as Record<string, unknown>).date ?? '').slice(0, 10)
    : '';
  const segmentMixStaleDays = segmentMixAsOfDate
    ? Math.max(
        0,
        Math.floor((parseIsoDayToUtcMs(toIsoDate(new Date())) - parseIsoDayToUtcMs(segmentMixAsOfDate)) / 86400000),
      )
    : null;
  const segmentMixIsStale = segmentMixStaleDays != null && segmentMixStaleDays > 1;
  const firstSegmentRow = filteredSegmentSeries.length > 0
    ? (filteredSegmentSeries[0] as Record<string, string | number>)
    : null;

  /** Default stars when localStorage is unset: core trio first (if present), then largest other segments. */
  const segmentMixDefaultStarNames = useMemo(
    () =>
      buildDefaultStarredSegmentMixNames(
        segmentNames,
        segmentSummaryRow as Record<string, unknown> | null,
        DEFAULT_STARRED_SEGMENT_MIX_COUNT,
      ),
    [segmentNames, segmentSummaryRow],
  );

  /** First visit: no storage key → star top segments so Segment Size Over Time is populated without extra clicks. */
  useEffect(() => {
    if (segmentMixDefaultStarNames.length === 0) return;
    try {
      if (localStorage.getItem(STARRED_CORE_SEGMENTS_STORAGE_KEY) !== null) return;
    } catch {
      return;
    }
    setStarredCoreSegments(segmentMixDefaultStarNames);
    try {
      localStorage.setItem(STARRED_CORE_SEGMENTS_STORAGE_KEY, JSON.stringify(segmentMixDefaultStarNames));
    } catch {
      // private mode / quota
    }
  }, [segmentMixDefaultStarNames]);

  const segmentCurrentSizes = useMemo(
    () =>
      segmentNames
        .map((name) => ({
          name,
          value: segmentSummaryRow ? Number(segmentSummaryRow[name] ?? 0) : 0,
          isStarred: starredCoreSegments.includes(name),
        }))
        .filter((r) => Number.isFinite(r.value) && r.value >= 0)
        .sort(compareSegmentMixRows),
    [segmentNames, segmentSummaryRow, starredCoreSegments],
  );

  const trackedCoreSegments = segmentCurrentSizes.filter((s) => s.isStarred);
  const trackedCoreSegmentNames = trackedCoreSegments.map((s) => s.name);

  const trackedCoreMetrics = useMemo(() => {
    /**
     * Growth calculation:
     * - When the selected date range has ≥1 row: current = last in-range point, first = first in-range point.
     * - When range has no rows (sparse CSV): show latest global snapshot for current; growth line stays empty.
     */
    const rangeHasRows = filteredSegmentSeries.length > 0;
    return trackedCoreSegmentNames.map((name) => {
      if (rangeHasRows && latestSegmentRow && firstSegmentRow) {
        const current = Number(latestSegmentRow[name] ?? 0);
        const first = Number(firstSegmentRow[name] ?? 0);
        const netGrowth = current - first;
        const growthPct = first > 0 ? (netGrowth / first) * 100 : current > 0 ? 100 : 0;
        return { name, current, netGrowth, growthPct, rangeEmpty: false };
      }
      const current = segmentSummaryRow ? Number(segmentSummaryRow[name] ?? 0) : 0;
      return { name, current, netGrowth: 0, growthPct: 0, rangeEmpty: true };
    });
  }, [trackedCoreSegmentNames, filteredSegmentSeries.length, latestSegmentRow, firstSegmentRow, segmentSummaryRow]);

  const trackedSegmentChartData = useMemo(
    () =>
      filteredSegmentSeries.map((rawRow) => {
        const row = rawRow as Record<string, unknown>;
        const mapped: Record<string, string | number> = { date: String(row.date ?? '') };
        trackedCoreSegmentNames.forEach((name) => {
          mapped[name] = Number(row[name] ?? 0);
        });
        return mapped;
      }),
    [filteredSegmentSeries, trackedCoreSegmentNames],
  );

  const segmentTotal = segmentCurrentSizes.reduce((sum, s) => sum + s.value, 0);

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
              Braze sync or imported campaign, segment, and usage data will appear here. Use Dashboard <strong className="font-medium text-foreground">Sync All from Braze</strong> or check workspace setup.
            </p>
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
              Braze sync or imported campaign, segment, and usage data will appear here. Use Dashboard <strong className="font-medium text-foreground">Sync All from Braze</strong> or check workspace setup.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const bestMonth = benchmarkMonthly.length > 0
    ? benchmarkMonthly.reduce((best, m) => (m.campaignRev > (best?.campaignRev ?? 0) ? m : best), benchmarkMonthly[0])
    : null;
  const parsedSiteRevenue = Number(siteRevenueInput.replace(/[^0-9.]/g, ''));
  const hasSiteRevenue = Number.isFinite(parsedSiteRevenue) && parsedSiteRevenue > 0;
  const benchmarkTotalRevenue = benchmarkMonthly.reduce((sum, row) => sum + Number(row.campaignRev ?? 0), 0);
  const overallCrmPct = hasSiteRevenue ? (benchmarkTotalRevenue / parsedSiteRevenue) * 100 : null;
  const overallGapToBenchmark = overallCrmPct != null ? overallCrmPct - 25 : null;
  const benchmarkStatText =
    overallGapToBenchmark == null
      ? 'Enter site revenue to compare'
      : `${overallGapToBenchmark >= 0 ? '+' : ''}${overallGapToBenchmark.toFixed(1)} pts vs 25%`;

  const benchmarkChartData = benchmarkMonthly.map((m) => ({
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
    const byDate = new Map<string, { opens: number; clicks: number }>();
    for (const r of rawCampaignRows) {
      const row = r as Record<string, unknown>;
      const date = String(row.date ?? '').slice(0, 10);
      if (!date) continue;
      const cur = byDate.get(date) ?? { opens: 0, clicks: 0 };
      cur.opens += Number(row.opens ?? 0);
      cur.clicks += Number(row.clicks ?? 0);
      byDate.set(date, cur);
    }
    if (byDate.size > 0) {
      return [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date,
          emails_opened: v.opens,
          email_clicks: v.clicks,
        }));
    }
    return usageChartData.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        date: String(row.date ?? ''),
        emails_opened: Number(row.emails_opened ?? 0),
        email_clicks: Number(row.email_clicks ?? 0),
      };
    });
  })();

  const engagementRatio = metrics.mau > 0 ? (metrics.dau / metrics.mau) * 100 : 0;


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

          const barHeight = 48;
          const chartHeight = Math.max(240, flowChartData.length * barHeight + 52);
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
                      <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">braze_canvases</code> after Dashboard <strong className="font-medium text-foreground">Sync All from Braze</strong>—not a live Braze call on each visit.
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
                    <span className="font-medium">Sync All from Braze</span> on the Dashboard to backfill canvas series (entries, revenue, conversions, opens, clicks).
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
                        tick={(p) => (
                          <VerticalCategoryAxisTick
                            x={p.x}
                            y={p.y}
                            payload={p.payload}
                            fill={chartMutedFill}
                            maxChars={42}
                            fontSize={10}
                          />
                        )}
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
                            ? 'Dashboard Sync All from Braze (segments) or upload segment analytics CSV (Resources)'
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

        {/* Core Benchmark: date-filtered campaign/canvas revenue vs benchmark */}
        <Card className={cn(analyticsCardClass, 'overflow-hidden')}>
          <div className={dashboardTopAccentClass} aria-hidden />
          <CardHeader className={analyticsCardHeaderClass}>
            <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>
              <span className={cn(dashIconChip, 'h-9 w-9 shrink-0')}>
                <BarChart2 className="h-4 w-4" />
              </span>
              Core Benchmark
            </CardTitle>
            <p className={analyticsSubtitleClass}>
              Compare {benchmarkType === 'campaign' ? 'campaign' : 'canvas'} revenue to the 25% CRM benchmark within the selected date range.
            </p>
          </CardHeader>
          <CardContent className="pt-2 pb-6 space-y-4 bg-muted/10">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-card/40 p-3">
              <Select
                value={benchmarkRangePreset}
                onValueChange={(v) => setBenchmarkRangePreset(v as BenchmarkRangePreset)}
              >
                <SelectTrigger className="h-8 w-[170px] text-xs bg-background/80 border-primary/15">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="custom">Custom date range</SelectItem>
                </SelectContent>
              </Select>
              {benchmarkRangePreset === 'custom' && (
                <>
                  <input
                    type="date"
                    value={benchmarkCustomStart}
                    onChange={(e) => setBenchmarkCustomStart(e.target.value)}
                    className="h-8 rounded-md border border-primary/15 bg-background/80 px-2 text-xs shadow-sm text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">—</span>
                  <input
                    type="date"
                    value={benchmarkCustomEnd}
                    onChange={(e) => setBenchmarkCustomEnd(e.target.value)}
                    className="h-8 rounded-md border border-primary/15 bg-background/80 px-2 text-xs shadow-sm text-foreground"
                  />
                </>
              )}
              <div className="inline-flex h-8 rounded-md border border-primary/15 bg-background/80 p-0.5">
                <button
                  onClick={() => setBenchmarkType('campaign')}
                  className={cn(
                    'rounded px-2.5 text-xs transition-colors',
                    benchmarkType === 'campaign'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Campaigns
                </button>
                <button
                  onClick={() => setBenchmarkType('canvas')}
                  className={cn(
                    'rounded px-2.5 text-xs transition-colors',
                    benchmarkType === 'canvas'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Canvases
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/50 bg-gradient-to-br from-primary/[0.08] via-card to-card p-4 shadow-sm ring-1 ring-inset ring-primary/10 border-l-[3px] border-l-primary/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Total {benchmarkType === 'campaign' ? 'Campaign' : 'Canvas'} Revenue
                </p>
                <p className="text-xl font-bold tabular-nums text-foreground tracking-tight">
                  ${benchmarkTotalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
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
              {benchmarkSeriesQuery.isFetching && (
                <p className="px-3 pt-2 text-[11px] text-muted-foreground">Refreshing benchmark data…</p>
              )}
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
                  <Bar yAxisId="revenue" dataKey="campaignRev" name={`${benchmarkType === 'campaign' ? 'Campaign' : 'Canvas'} Revenue`} fill="hsl(217 91% 60% / 0.85)" radius={[4, 4, 0, 0]} />
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
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-card/40 p-3">
                  <div className="inline-flex h-8 flex-wrap gap-0.5 rounded-md border border-primary/15 bg-background/80 p-0.5">
                    {(['7d', '30d', '90d'] as const).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setSegmentRangePreset(preset)}
                        className={cn(
                          'rounded px-2.5 text-xs transition-colors',
                          segmentRangePreset === preset
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {preset === '7d' ? '7 days' : preset === '30d' ? '30 days' : '90 days'}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSegmentRangePreset('custom')}
                      className={cn(
                        'rounded px-2.5 text-xs transition-colors',
                        segmentRangePreset === 'custom'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Custom
                    </button>
                  </div>
                  {segmentRangePreset === 'custom' && (
                    <>
                      <input
                        type="date"
                        value={segmentCustomStart}
                        onChange={(e) => setSegmentCustomStart(e.target.value)}
                        className="h-8 rounded-md border border-primary/15 bg-background/80 px-2 text-xs shadow-sm text-foreground"
                      />
                      <span className="text-xs text-muted-foreground">—</span>
                      <input
                        type="date"
                        value={segmentCustomEnd}
                        onChange={(e) => setSegmentCustomEnd(e.target.value)}
                        className="h-8 rounded-md border border-primary/15 bg-background/80 px-2 text-xs shadow-sm text-foreground"
                      />
                    </>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Tracked Core Segments ({trackedCoreSegments.length})
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {trackedCoreMetrics.length === 0 ? (
                    <div className="md:col-span-3 rounded-xl border border-dashed border-border/50 bg-card/40 p-4 text-xs text-muted-foreground space-y-2">
                      <p>
                        No <strong className="font-medium text-foreground/85">core</strong> segments selected. Star segments in{' '}
                        <a
                          href="#analytics-segment-mix"
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Segment mix
                        </a>{' '}
                        (below) — the star button next to each row — then they appear here and in the chart.
                      </p>
                    </div>
                  ) : (
                    trackedCoreMetrics.map((seg) => (
                      <div key={seg.name} className="rounded-xl border border-border/50 bg-card/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{seg.name}</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{seg.current.toLocaleString()}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {seg.rangeEmpty ? (
                            <>No daily snapshots in this range · totals are latest available</>
                          ) : (
                            <>
                              Net growth {seg.netGrowth >= 0 ? '+' : ''}
                              {seg.netGrowth.toLocaleString()} · {formatPct(seg.growthPct)}
                            </>
                          )}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className={cn('h-[300px]', analyticsChartPanelClass, '[&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))] [&_.recharts-legend-item-text]:fill-[hsl(var(--muted-foreground))]')}>
                  {trackedCoreSegmentNames.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
                      <span>Select segments using the star in</span>
                      <a
                        href="#analytics-segment-mix"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Segment mix
                      </a>
                    </div>
                  ) : trackedSegmentChartData.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-sm text-muted-foreground">
                      <p>No daily segment snapshots in this date range.</p>
                      <p className="text-xs max-w-md">
                        Run a Braze sync so <code className="rounded bg-muted px-1 py-0.5 text-[11px]">braze_segment_analytics</code> gets rows for
                        these dates, import segment analytics CSV, or widen the range (e.g. 90 days).
                      </p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={trackedSegmentChartData} margin={{ top: 12, right: 12, bottom: 8, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                        <Tooltip
                          contentStyle={analyticsTooltipContentStyle}
                          labelStyle={analyticsTooltipLabelStyle}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                        {trackedCoreSegmentNames.map((seg, i) => (
                          <Line
                            key={seg}
                            type="monotone"
                            dataKey={seg}
                            name={seg}
                            stroke={['hsl(217 91% 60%)', 'hsl(173 58% 39%)', 'hsl(262 83% 58%)', 'hsl(199 89% 48%)', 'hsl(24 95% 53%)'][i % 5]}
                            strokeWidth={2}
                            dot={{ r: 3, fill: 'hsl(var(--card))' }}
                          />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
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
          <div className="flex min-w-0 flex-col gap-4">
            <Card className={cn(analyticsCardClass, 'min-w-0 w-full')}>
              <div className={dashboardTopAccentClass} aria-hidden />
              <CardHeader className={analyticsCardHeaderClass}>
                <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>Daily Email Engagement</CardTitle>
                <p className={analyticsSubtitleClass}>Opens and clicks by day (campaign analytics when available, otherwise Braze usage).</p>
              </CardHeader>
              <CardContent className="pb-6 bg-muted/10">
                <div className={cn('h-[min(360px,42vh)] min-h-[280px]', analyticsChartPanelClass, '[&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]')}>
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

            <Card className={cn(analyticsCardClass, 'min-w-0 w-full overflow-visible')}>
              <div className={dashboardTopAccentClass} aria-hidden />
              <CardHeader className={analyticsCardHeaderClass}>
                <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>Campaign Comparison</CardTitle>
                <p className={analyticsSubtitleClass}>
                  Toggle top campaigns vs daily totals; filter by campaign name and date range. Benchmark lines show the average among rows in view.
                </p>
              </CardHeader>
              <CardContent className="space-y-3 overflow-visible pb-6 bg-muted/10">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex h-8 flex-wrap gap-0.5 rounded-md border border-primary/15 bg-card/80 p-0.5">
                    <button
                      type="button"
                      onClick={() => setCompViewMode('by_campaign')}
                      className={cn(
                        'rounded px-2.5 text-xs transition-colors',
                        compViewMode === 'by_campaign'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      By campaign
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompViewMode('by_date')}
                      className={cn(
                        'rounded px-2.5 text-xs transition-colors',
                        compViewMode === 'by_date'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      By day
                    </button>
                  </div>
                  <div className="inline-flex h-8 flex-wrap gap-0.5 rounded-md border border-primary/15 bg-card/80 p-0.5">
                    {(['all', '7d', '30d', '90d'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => applyCompRangePreset(p)}
                        className={cn(
                          'rounded px-2 text-xs transition-colors',
                          compRangePreset === p
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {p === 'all' ? 'All' : p === '7d' ? '7d' : p === '30d' ? '30d' : '90d'}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => applyCompRangePreset('custom')}
                      className={cn(
                        'rounded px-2 text-xs transition-colors',
                        compRangePreset === 'custom'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Custom
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={compShowBenchmark}
                      onChange={(e) => setCompShowBenchmark(e.target.checked)}
                    />
                    Benchmark
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Popover open={compOpen} onOpenChange={setCompOpen}>
                    <PopoverTrigger asChild>
                      <button className="inline-flex h-8 w-[min(100%,220px)] items-center justify-between rounded-md border border-primary/15 bg-card/80 px-3 text-xs shadow-sm hover:bg-muted/50 transition-colors truncate">
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
                  {compRangePreset === 'custom' && (
                    <>
                      <input
                        type="date"
                        value={compStartDate}
                        onChange={(e) => {
                          setCompRangePreset('custom');
                          setCompStartDate(e.target.value);
                        }}
                        className="h-8 rounded-md border border-primary/15 bg-card/80 px-2 text-xs shadow-sm text-foreground"
                      />
                      <span className="text-xs text-muted-foreground">—</span>
                      <input
                        type="date"
                        value={compEndDate}
                        onChange={(e) => {
                          setCompRangePreset('custom');
                          setCompEndDate(e.target.value);
                        }}
                        className="h-8 rounded-md border border-primary/15 bg-card/80 px-2 text-xs shadow-sm text-foreground"
                      />
                    </>
                  )}
                  {(compSelectedCampaign !== 'all' || compStartDate || compEndDate || compRangePreset !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setCompSelectedCampaign('all');
                        setCompStartDate('');
                        setCompEndDate('');
                        setCompRangePreset('all');
                      }}
                      className="h-8 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground border border-border/40 hover:border-border transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div
                  className={cn(
                    'relative z-0 min-h-[280px]',
                    compViewMode === 'by_date' && 'h-[min(380px,45vh)]',
                    analyticsChartPanelClass,
                    '[&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]',
                    compViewMode === 'by_date' && '[&_.recharts-surface]:!overflow-visible [&_.recharts-wrapper]:!overflow-visible',
                  )}
                >
                  {compViewMode === 'by_campaign' && campaignComparisonData.length === 0 && (
                    <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                      No data for selected filters
                    </div>
                  )}
                  {compViewMode === 'by_campaign' && campaignComparisonData.length > 0 && (
                    <div className="max-h-[min(52vh,560px)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border border-border/30 bg-muted/5 pr-1">
                      <div className="min-w-0" style={{ height: campaignComparisonBarChartHeight }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={campaignComparisonData}
                            layout="vertical"
                            barCategoryGap="14%"
                            margin={{ top: 8, right: 16, bottom: 44, left: 158 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                            <XAxis type="number" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                            <YAxis
                              type="category"
                              dataKey="campaign_name"
                              tick={(p) => (
                                <VerticalCategoryAxisTick
                                  x={p.x}
                                  y={p.y}
                                  payload={p.payload}
                                  fill={chartMutedFill}
                                  maxChars={24}
                                  fontSize={11}
                                />
                              )}
                              tickLine={false}
                              axisLine={false}
                              width={150}
                              interval={0}
                            />
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
                            {compShowBenchmark && compBenchmarkRevenue > 0 && (
                              <ReferenceLine
                                x={compBenchmarkRevenue}
                                stroke="hsl(24 95% 53%)"
                                strokeDasharray="5 3"
                                label={{ value: 'Avg revenue', fill: chartMutedFill, fontSize: 10, position: 'insideTopRight' }}
                              />
                            )}
                            <Bar dataKey="revenue" name="Revenue" fill="hsl(262 83% 58% / 0.9)" radius={[0, 4, 4, 0]} />
                            <Bar dataKey="conversions" name="Conversions" fill="hsl(199 89% 48% / 0.9)" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {compViewMode === 'by_date' && campaignComparisonByDateData.length === 0 && (
                    <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                      No daily rows for this filter
                    </div>
                  )}
                  {compViewMode === 'by_date' && campaignComparisonByDateData.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={campaignComparisonByDateData} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis
                          yAxisId="rev"
                          tick={{ fill: chartMutedFill, fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={56}
                          tickFormatter={(v) => {
                            const n = Number(v);
                            if (!Number.isFinite(n)) return '';
                            if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
                            if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`;
                            return `$${Math.round(n)}`;
                          }}
                        />
                        <YAxis
                          yAxisId="ord"
                          orientation="right"
                          tick={{ fill: chartMutedFill, fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={40}
                        />
                        <Tooltip contentStyle={analyticsTooltipContentStyle} labelStyle={analyticsTooltipLabelStyle} />
                        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                        {compShowBenchmark && compBenchmarkDailyRevenue > 0 && (
                          <ReferenceLine
                            yAxisId="rev"
                            y={compBenchmarkDailyRevenue}
                            stroke="hsl(24 95% 53%)"
                            strokeDasharray="5 3"
                            label={{ value: 'Avg revenue / day', fill: chartMutedFill, fontSize: 10, position: 'insideTopRight' }}
                          />
                        )}
                        {compShowBenchmark && compBenchmarkDailyConversions > 0 && (
                          <ReferenceLine
                            yAxisId="ord"
                            y={compBenchmarkDailyConversions}
                            stroke="hsl(173 58% 39%)"
                            strokeDasharray="4 4"
                            label={{ value: 'Avg conv. / day', fill: chartMutedFill, fontSize: 10, position: 'insideTopLeft' }}
                          />
                        )}
                        <Bar yAxisId="rev" dataKey="revenue" name="Revenue" fill="hsl(262 83% 58% / 0.85)" radius={[4, 4, 0, 0]} />
                        <Line
                          yAxisId="ord"
                          type="monotone"
                          dataKey="conversions"
                          name="Conversions"
                          stroke="hsl(199 89% 48%)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card id="analytics-segment-mix" className={cn(analyticsCardClass, 'min-w-0 w-full scroll-mt-24')}>
              <div className={dashboardTopAccentClass} aria-hidden />
              <CardHeader className={analyticsCardHeaderClass}>
                <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>Segment mix</CardTitle>
                <p className={analyticsSubtitleClass}>
                  Share of audience from Braze segment analytics{segmentMixAsOfDate ? ` (${segmentMixAsOfDate})` : ''}. Star a row to plot it in <strong className="font-medium text-foreground/90">Segment Size Over Time</strong> (section above).
                  {segmentMixIsStale ? ` Data is ${segmentMixStaleDays} day${segmentMixStaleDays === 1 ? '' : 's'} old.` : ''}
                  {segmentMixIsStale
                    ? ' Run Sync All from Braze on the Dashboard to append today’s segment sizes when Braze returns them; otherwise import segment analytics CSV.'
                    : ''}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 pb-6 bg-muted/10">
                {segmentCurrentSizes.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No segment analytics yet — sync Braze or import segment analytics CSV.</p>
                ) : (
                  <div className="space-y-3">
                    {segmentCurrentSizes.slice(0, 10).map((s, i) => {
                      const pct = segmentTotal > 0 ? (s.value / segmentTotal) * 100 : 0;
                      const barPct = segmentTotal > 0 ? (s.value / segmentTotal) * 100 : 0;
                      const barColor = ['hsl(217 91% 60%)', 'hsl(142 71% 45%)', 'hsl(0 72% 51%)', 'hsl(262 83% 58%)', 'hsl(24 95% 53%)', 'hsl(173 58% 39%)'][i % 6];
                      return (
                        <div key={s.name} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex min-w-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleStarredCoreSegment(s.name)}
                                className={cn(
                                  'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors',
                                  s.isStarred ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground',
                                )}
                                title={s.isStarred ? 'Unstar segment' : 'Star segment'}
                                aria-label={s.isStarred ? `Unstar ${s.name}` : `Star ${s.name}`}
                              >
                                <Star className={cn('h-3.5 w-3.5', s.isStarred ? 'fill-current' : '')} />
                              </button>
                              <span className="truncate text-muted-foreground">{s.name}</span>
                            </div>
                            <span className="shrink-0 font-semibold tabular-nums text-foreground">
                              {s.value.toLocaleString()} ({pct.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                            <div className="h-full rounded-full transition-[width]" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
                          </div>
                        </div>
                      );
                    })}
                    {segmentTotal > 0 && (
                      <div className="flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
                        <span className="font-medium">Total subscribers</span>
                        <span className="font-semibold tabular-nums text-foreground">{segmentTotal.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className={cn(analyticsCardClass, 'min-w-0 w-full')}>
          <div className={dashboardTopAccentClass} aria-hidden />
          <CardHeader className={analyticsCardHeaderClass}>
            <CardTitle className={cn(analyticsSectionHeadingClass, 'text-foreground/95')}>Bounce health</CardTitle>
            <p className={analyticsSubtitleClass}>
              Bounce rate over time (bounces ÷ sends) from campaign analytics. Domain list is the same hard-bounce feed, shown compactly here only.
            </p>
          </CardHeader>
          <CardContent className="space-y-6 pb-6 pt-2 bg-muted/10">
            {bounceRateData.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <MailWarning className="h-8 w-8 text-muted-foreground/70" />
                <p className="text-sm text-muted-foreground">Bounce rate data appears after campaign analytics are synced or imported.</p>
              </div>
            ) : (
              <>
                <div className={cn('h-[min(320px,40vh)] min-h-[240px]', analyticsChartPanelClass, '[&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={bounceRateData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={48} />
                      <Tooltip
                        contentStyle={analyticsTooltipContentStyle}
                        labelStyle={analyticsTooltipLabelStyle}
                        formatter={(v: number) => [`${Number(v).toFixed(3)}%`, 'Bounce rate']}
                      />
                      <ReferenceLine y={2} stroke="hsl(24 95% 53%)" strokeDasharray="5 3" label={{ value: '2% threshold', fill: chartMutedFill, fontSize: 10, position: 'insideTopRight' }} />
                      <Line type="monotone" dataKey="bounce_rate" name="Bounce rate" stroke="hsl(0 72% 51%)" strokeWidth={2} dot={false} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Top bounce domains (hard bounces)</p>
                  {bounceDomains.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No domain breakdown yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {bounceDomains.slice(0, 9).map((d) => (
                        <div
                          key={d.domain}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-card/60 px-3 py-2 text-xs"
                        >
                          <span className="truncate text-muted-foreground">{d.domain}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-foreground">{d.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

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
