import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { LoadingPage } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  Send, Workflow, UserPlus, Search, DollarSign, Users, ChevronDown, ChevronUp,
  Eye, RefreshCw, BarChart2, UploadCloud, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type SortKey = 'name' | 'revenue' | 'orders' | 'ctr' | 'date' | 'channel' | 'segment';

function StatCard({ icon: Icon, label, value, color, trend }: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  trend?: { direction: 'up' | 'down' | 'flat'; value: string };
}) {
  return (
    <Card className="shadow-sm border-border/80">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", color)}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold tracking-tight text-foreground/95">{value}</p>
        {trend && (
          <div className={cn("flex items-center gap-1 mt-1 text-xs font-medium",
            trend.direction === 'up' ? 'text-green-600' : trend.direction === 'down' ? 'text-red-500' : 'text-muted-foreground'
          )}>
            {trend.direction === 'up' ? <ChevronUp className="h-3 w-3" /> : trend.direction === 'down' ? <ChevronDown className="h-3 w-3" /> : null}
            {trend.value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const formatDollar = (v: number) => `$${(v / 1000).toFixed(0)}K`;

function formatPct(value: number): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return '—';
  return `${Number(value).toFixed(2)}%`;
}

export default function Analytics() {
  const {
    clientId,
    isClientLoading,
    isLoading,
    error,
    refetch,
    hasAnyData,
    metrics,
    revenueMonthly,
    campaignTableRows,
    usageChartData,
    campaignChartData,
    segmentChartDataByDate,
    segmentNames,
    flowRevenueByCampaign,
  } = useAnalyticsData();

  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignChannelFilter, setCampaignChannelFilter] = useState('All');
  const [period, setPeriod] = useState('default');
  const [siteRevenueInput, setSiteRevenueInput] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortAsc, setSortAsc] = useState(false);

  if (!clientId) {
    if (isClientLoading) {
      return (
        <AppLayout>
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6">
            <LoadingPage message="Loading client..." />
          </div>
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 sm:py-24">
          <Card className="w-full max-w-md border-border/80 shadow-sm">
            <CardContent className="flex flex-col items-center pt-10 pb-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <BarChart2 className="h-7 w-7 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">No analytics data yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload your Braze campaign, segment, or usage CSVs on the onboarding page to see charts and benchmarks here.
              </p>
              <Button asChild className="mt-6">
                <Link to="/onboarding" className="inline-flex items-center gap-2">
                  <UploadCloud className="h-4 w-4" />
                  Go to Onboarding
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6">
          <LoadingPage message="Loading analytics..." />
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6">
          <p className="text-destructive font-medium">{error.message}</p>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (!hasAnyData) {
    return (
      <AppLayout>
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 sm:py-24">
          <Card className="w-full max-w-md border-border/80 shadow-sm">
            <CardContent className="flex flex-col items-center pt-10 pb-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <BarChart2 className="h-7 w-7 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">No analytics data yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload your Braze campaign, segment, or usage CSVs on the onboarding page to see charts and benchmarks here.
              </p>
              <Button asChild className="mt-6">
                <Link to="/onboarding" className="inline-flex items-center gap-2">
                  <UploadCloud className="h-4 w-4" />
                  Go to Onboarding
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="inline h-3 w-3 ml-0.5 opacity-30" />;
    return sortAsc ? <ChevronUp className="inline h-3 w-3 ml-0.5" /> : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
  };

  const filteredCampaigns = campaignTableRows
    .filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(campaignSearch.toLowerCase());
      const matchesChannel = campaignChannelFilter === 'All' || c.channel === campaignChannelFilter;
      return matchesSearch && matchesChannel;
    })
    .sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortKey === 'name') return mul * a.name.localeCompare(b.name);
      if (sortKey === 'revenue') return mul * (a.revenue - b.revenue);
      if (sortKey === 'orders') return mul * ((a.orders ?? 0) - (b.orders ?? 0));
      if (sortKey === 'ctr') return mul * (a.ctr - b.ctr);
      if (sortKey === 'date') return mul * (a.dateRange ?? '').localeCompare(b.dateRange ?? '');
      if (sortKey === 'channel') return mul * (a.channel ?? '').localeCompare(b.channel ?? '');
      if (sortKey === 'segment') return mul * (a.segment ?? '').localeCompare(b.segment ?? '');
      return 0;
    });

  const totalCampaignRevenue = revenueMonthly.reduce((s, m) => s + (m.campaignRev ?? 0), 0);
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
  const renderBenchmarkTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload as { campaignRev?: number; crmPct?: number | null };
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

  const dailyEmailEngagementData = usageChartData.map((r) => ({
    date: r.date,
    emails_opened: Number((r as any).emails_opened ?? 0),
    email_clicks: Number((r as any).email_clicks ?? 0),
    email_bounces: Number((r as any).email_bounces ?? 0),
  }));

  const engagementRatio = metrics.mau > 0 ? (metrics.dau / metrics.mau) * 100 : 0;

  const campaignComparisonData = [...campaignTableRows]
    .map((r) => ({
      campaign_name: r.name || 'Untitled Campaign',
      revenue: Number(r.revenue ?? 0),
      conversions: Number(r.orders ?? 0),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);

  const latestSegmentDate =
    segmentChartDataByDate.length > 0
      ? String((segmentChartDataByDate[segmentChartDataByDate.length - 1] as any).date ?? '')
      : '';
  const latestSegmentRow = segmentChartDataByDate.length > 0
    ? (segmentChartDataByDate[segmentChartDataByDate.length - 1] as Record<string, string | number>)
    : null;

  const findSegmentValue = (keys: string[]) => {
    if (!latestSegmentRow) return 0;
    const lower = keys.map((k) => k.toLowerCase());
    for (const [k, v] of Object.entries(latestSegmentRow)) {
      if (k === 'date') continue;
      if (lower.includes(k.toLowerCase())) return Number(v ?? 0);
    }
    return 0;
  };

  const segmentDonutData = [
    {
      name: 'All Email Subscribers',
      value: findSegmentValue(['All Email Subscribers']),
      color: 'hsl(217 91% 60%)',
    },
    {
      name: 'Active Subscribers',
      value: findSegmentValue(['Active Subscribers']),
      color: 'hsl(142 71% 45%)',
    },
    {
      name: 'Churned',
      value: findSegmentValue(['Churned']),
      color: 'hsl(0 72% 51%)',
    },
  ];
  const segmentTotal = segmentDonutData.reduce((s, d) => s + d.value, 0);

  const chartMutedFill = 'hsl(var(--muted-foreground))';

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <PageHeader
            title="Analytics"
            description="Revenue performance, campaign metrics, and subscriber trends"
          />
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">All Time</SelectItem>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="year">Year</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Send} label="Total Sent" value={metrics.totalSent.toLocaleString()} color="bg-primary/10 text-primary" />
          <StatCard icon={Send} label="Total Delivered" value={metrics.totalDelivered.toLocaleString()} color="bg-blue-500/10 text-blue-600" />
          <StatCard icon={Eye} label="Total Opens" value={metrics.totalOpens.toLocaleString()} color="bg-amber-500/10 text-amber-600" />
          <StatCard
            icon={Send}
            label="Total Clicks"
            value={metrics.totalClicks.toLocaleString()}
            color="bg-cyan-500/10 text-cyan-600"
            trend={{ direction: 'flat', value: `${metrics.totalConversions.toLocaleString()} conversions` }}
          />
        </div>

        {/* DAU / MAU / new users — braze_kpi_series when synced; else braze_usage_analytics CSV */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
          <StatCard
            icon={Users}
            label="DAU"
            value={metrics.dau.toLocaleString()}
            color="bg-emerald-500/10 text-emerald-600"
            trend={{
              direction: 'flat',
              value: metrics.kpiSource ? 'Latest day · Braze KPI API' : `${formatPct(engagementRatio)} of MAU`,
            }}
          />
          <StatCard
            icon={Users}
            label="MAU"
            value={metrics.mau.toLocaleString()}
            color="bg-green-500/10 text-green-600"
            trend={{
              direction: 'flat',
              value: metrics.kpiSource ? 'Latest day · Braze KPI API' : 'Usage CSV',
            }}
          />
          <StatCard
            icon={UserPlus}
            label="New users (30d)"
            value={metrics.newUsers30.toLocaleString()}
            color="bg-teal-500/10 text-teal-600"
            trend={{
              direction: 'flat',
              value: metrics.kpiSource ? 'Sum of daily new_users · KPI' : 'Sum from usage rows',
            }}
          />
          <StatCard
            icon={Eye}
            label="Delivery Rate"
            value={formatPct(metrics.deliveryRate)}
            color="bg-purple-500/10 text-purple-600"
            trend={{ direction: 'flat', value: `Bounce ${formatPct(metrics.bounceRate)}` }}
          />
          <StatCard icon={Eye} label="Open Rate" value={formatPct(metrics.openRate)} color="bg-amber-500/10 text-amber-600" />
          <StatCard
            icon={Send}
            label="Click Rate"
            value={formatPct(metrics.clickRate)}
            color="bg-cyan-500/10 text-cyan-600"
            trend={{ direction: 'flat', value: `Unsub ${formatPct(metrics.unsubscribeRate)}` }}
          />
          <StatCard
            icon={DollarSign}
            label="Conversion Rate"
            value={formatPct(metrics.conversionRate)}
            color="bg-rose-500/10 text-rose-600"
            trend={{
              direction: 'flat',
              value: `Scheduled active ${formatPct(metrics.schedulingPerformanceRate)}`,
            }}
          />
        </div>

        {/* Campaign revenue vs benchmark — combined chart */}
        <Card className="shadow-sm border-border/80 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground/95 flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart2 className="h-4 w-4 text-primary" />
              </div>
              How your campaigns compare to the benchmark
            </CardTitle>
            <p className="text-xs text-muted-foreground">Your revenue from campaigns and what “good” looks like (25% of total site revenue from CRM).</p>
          </CardHeader>
          <CardContent className="pt-2 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/80 bg-card p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Campaign Revenue</p>
                <p className="text-xl font-semibold text-foreground">${totalCampaignRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-card p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Best Month</p>
                <p className="text-base font-semibold text-foreground">
                  {bestMonth ? `${bestMonth.monthLabel} · $${Number(bestMonth.campaignRev ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                </p>
              </div>
              <div className="rounded-lg border border-border/80 bg-card p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">vs 25% Benchmark</p>
                <p className="text-base font-semibold text-foreground">{benchmarkStatText}</p>
              </div>
            </div>

            <div className="h-[280px] [&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]">
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

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-muted-foreground">
              <span>
                Top brands average 25% of total site revenue from CRM. Enter your site revenue above to see where you stand.
              </span>
              <div className="inline-flex items-center gap-1.5 shrink-0">
                <span>Site revenue</span>
                <Input
                  inputMode="decimal"
                  placeholder="$____"
                  value={siteRevenueInput}
                  onChange={(e) => setSiteRevenueInput(e.target.value)}
                  className="h-7 w-[130px] text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Campaign Revenue by Campaign */}
        {flowRevenueByCampaign.length > 0 && (
          <Card className="shadow-sm border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-foreground/95 flex items-center gap-2">
                <Workflow className="h-4 w-4 text-violet-500" />
                Campaign Revenue
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Total revenue by campaign from Braze CSV</p>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] [&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flowRevenueByCampaign} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 120 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                    <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))', borderRadius: 8 }} formatter={(v: number) => [`$${Number(v).toLocaleString()}`, 'Revenue']} />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(262 83% 58% / 0.9)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Campaigns */}
        <Card className="shadow-sm border-border/80">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Send className="h-4 w-4 text-blue-500" />
                All Campaigns
              </CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search..." value={campaignSearch} onChange={e => setCampaignSearch(e.target.value)} className="pl-8 h-8 w-[180px] text-xs" />
                </div>
                <Select value={campaignChannelFilter} onValueChange={setCampaignChannelFilter}>
                  <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Email">Email</SelectItem>
                    <SelectItem value="Push">Push</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('name')}>Campaign <SortIcon col="name" /></TableHead>
                    <TableHead className="text-xs text-right cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('revenue')}>Revenue <SortIcon col="revenue" /></TableHead>
                    <TableHead className="text-xs text-right cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('orders')}>Orders <SortIcon col="orders" /></TableHead>
                    <TableHead className="text-xs text-right cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('ctr')}>CTR <SortIcon col="ctr" /></TableHead>
                    <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('channel')}>Channel <SortIcon col="channel" /></TableHead>
                    <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('segment')}>Segment <SortIcon col="segment" /></TableHead>
                    <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('date')}>Date range <SortIcon col="date" /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12">
                        <div className="flex flex-col items-center justify-center gap-2 text-center">
                          <UploadCloud className="h-8 w-8 text-muted-foreground/70" />
                          <p className="text-sm text-muted-foreground">Upload your Braze CSVs on the onboarding page.</p>
                          <Button asChild variant="link" className="text-primary hover:text-primary/90">
                            <Link to="/onboarding" className="inline-flex items-center gap-1.5">
                              Go to Onboarding <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCampaigns.map((c, i) => (
                      <TableRow key={i} className="cursor-pointer">
                        <TableCell className="text-sm font-medium py-2">{c.name}</TableCell>
                        <TableCell className="text-sm text-right font-semibold py-2">${c.revenue.toLocaleString()}</TableCell>
                        <TableCell className="text-sm text-right py-2">{c.orders}</TableCell>
                        <TableCell className="text-sm text-right py-2">{formatPct(c.ctr)}</TableCell>
                        <TableCell className="py-2"><Badge variant="outline" className="text-xs">{c.channel}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">{c.segment}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">{c.dateRange}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Segment size over time */}
        <Card className="shadow-sm border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground/95 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-emerald-500" />
              Segment Size Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {segmentChartDataByDate.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <UploadCloud className="h-8 w-8 text-muted-foreground/70" />
                <p className="text-sm text-muted-foreground">Upload your Braze CSVs on the onboarding page.</p>
                <Button asChild variant="link" className="text-primary hover:text-primary/90">
                  <Link to="/onboarding" className="inline-flex items-center gap-1.5">
                    Go to Onboarding <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="h-[300px] [&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))] [&_.recharts-legend-item-text]:fill-[hsl(var(--muted-foreground))]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={segmentChartDataByDate} margin={{ top: 12, right: 12, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                    <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))', borderRadius: 8 }} />
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
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Performance Overview</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="shadow-sm border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-foreground/95">Daily Email Engagement</CardTitle>
                <p className="text-xs text-muted-foreground">Opens, clicks, and bounces from Braze usage analytics by day.</p>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] [&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyEmailEngagementData} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                      <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))', borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                      <Line type="monotone" dataKey="emails_opened" name="Opens" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="email_clicks" name="Clicks" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="email_bounces" name="Bounces" stroke="hsl(0 72% 51%)" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-foreground/95">Campaign Comparison</CardTitle>
                <p className="text-xs text-muted-foreground">Revenue and conversions by campaign, sorted by revenue.</p>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] [&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={campaignComparisonData} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 90 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="campaign_name" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                      <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))', borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                      <Bar dataKey="revenue" name="Revenue" fill="hsl(262 83% 58% / 0.9)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="conversions" name="Conversions" fill="hsl(199 89% 48% / 0.9)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-foreground/95">Subscriber Segments</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Latest segment mix from Braze segment analytics{latestSegmentDate ? ` (${latestSegmentDate})` : ''}.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-[220px]">
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
                        contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))', borderRadius: 8 }}
                        formatter={(v: number, n: string) => {
                          const pct = segmentTotal > 0 ? ((Number(v) / segmentTotal) * 100).toFixed(1) : '0.0';
                          return [`${Number(v).toLocaleString()} (${pct}%)`, n];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {segmentDonutData.map((s) => {
                    const pct = segmentTotal > 0 ? (s.value / segmentTotal) * 100 : 0;
                    return (
                      <div key={s.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="text-muted-foreground truncate">{s.name}</span>
                        </div>
                        <span className="font-medium text-foreground tabular-nums">
                          {s.value.toLocaleString()} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Device and channel placeholder */}
        <Card className="bg-muted/20 border-border/60 shadow-sm">
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Device and channel breakdown not available in current CSV export.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
