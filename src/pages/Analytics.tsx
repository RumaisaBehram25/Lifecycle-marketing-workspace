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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Send, Workflow, UserPlus, Search, DollarSign, Users, ChevronDown, ChevronUp,
  Eye, RefreshCw, Sparkles, Target, BarChart2, Info, UploadCloud, ArrowRight,
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

  const totalCampaignRevenue = campaignTableRows.reduce((s, c) => s + c.revenue, 0);
  const topCampaignShare = totalCampaignRevenue > 0 && campaignTableRows.length > 0
    ? Math.max(...campaignTableRows.map((c) => (c.revenue / totalCampaignRevenue) * 100))
    : 0;
  const hasNoFlowData = revenueMonthly.length > 0 && revenueMonthly.every((m) => (m.flowRev ?? 0) === 0);

  const bestMonth = revenueMonthly.length > 0
    ? revenueMonthly.reduce((best, m) => (m.campaignRev > (best?.campaignRev ?? 0) ? m : best), revenueMonthly[0])
    : null;

  const insights: { title: string; body: string; tag: string; tagColor: string }[] = [];

  if (revenueMonthly.length > 0) {
    insights.push({
      title: 'How to read the chart: Campaign Revenue vs 25% Benchmark',
      body: `In the chart above: Campaign Revenue (blue bars) = money from Braze campaigns each month. CRM % (teal line) = that month’s share of your total campaign revenue. The 25% Benchmark (dashed line) = industry target — top brands get ~25% of total site revenue from CRM. You’re viewing campaign data only; add flow or site revenue to see how you compare to 25%.${bestMonth ? ` Your strongest month was ${bestMonth.monthLabel} with $${Number(bestMonth.campaignRev).toLocaleString()} campaign revenue.` : ''}`,
      tag: 'Chart guide',
      tagColor: 'bg-blue-500/10 text-blue-600',
    });
  }

  if (hasNoFlowData) {
    insights.push({
      title: 'Comparing to the 25% benchmark',
      body: 'The dashed line at 25% is where you want to be: 25% of your total business revenue should come from CRM (campaigns + flows). Your chart currently shows only campaign revenue, so we can’t compare you to that benchmark yet. Once you add flow or total site revenue data, you’ll see whether you’re above or below 25% and by how much.',
      tag: 'Benchmark',
      tagColor: 'bg-purple-500/10 text-purple-600',
    });
  }
  if (topCampaignShare > 50 && campaignTableRows.length > 0) {
    const top = campaignTableRows.find((c) => (c.revenue / totalCampaignRevenue) * 100 === topCampaignShare);
    insights.push({
      title: 'Revenue concentration',
      body: `One campaign is doing most of the work: "${top?.name ?? 'One campaign'}" is ${topCampaignShare.toFixed(0)}% of your total campaign revenue. That’s a risk if that campaign stops. Consider spreading revenue across more campaigns.`,
      tag: 'High Priority',
      tagColor: 'bg-red-500/10 text-red-600',
    });
  }
  if (metrics.conversionRate < 3 && metrics.conversionRate >= 0) {
    insights.push({
      title: 'Conversion rate vs target',
      body: `Your conversion rate is ${metrics.conversionRate.toFixed(2)}%. The common target is 3% or higher. You’re ${(3 - metrics.conversionRate).toFixed(2)}% below that — improving emails and segments could help close the gap.`,
      tag: 'Opportunity',
      tagColor: 'bg-green-500/10 text-green-600',
    });
  }
  if (insights.length === 0) {
    insights.push({
      title: 'No insights yet',
      body: 'Upload Braze CSVs (campaign, segment, usage) to see chart comparisons and benchmark insights here.',
      tag: 'Info',
      tagColor: 'bg-muted text-muted-foreground',
    });
  }

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
          <StatCard icon={Send} label="Total Clicks" value={metrics.totalClicks.toLocaleString()} color="bg-cyan-500/10 text-cyan-600" />
        </div>

        {/* DAU/MAU and rates — from braze_usage_analytics + customerio_campaigns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard icon={Users} label="DAU" value={metrics.dau.toLocaleString()} color="bg-emerald-500/10 text-emerald-600" />
          <StatCard icon={Users} label="MAU" value={metrics.mau.toLocaleString()} color="bg-green-500/10 text-green-600" />
          <StatCard icon={Eye} label="Delivery Rate" value={formatPct(metrics.deliveryRate)} color="bg-purple-500/10 text-purple-600" />
          <StatCard icon={Eye} label="Open Rate" value={formatPct(metrics.openRate)} color="bg-amber-500/10 text-amber-600" />
          <StatCard icon={Send} label="Click Rate" value={formatPct(metrics.clickRate)} color="bg-cyan-500/10 text-cyan-600" />
          <StatCard icon={DollarSign} label="Conversion Rate" value={formatPct(metrics.conversionRate)} color="bg-rose-500/10 text-rose-600" />
        </div>

        {/* Campaign revenue vs benchmark — easy comparison for non-tech */}
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
          <CardContent className="pt-2 space-y-5">
            {revenueMonthly.length > 0 && (() => {
              const totalRev = revenueMonthly.reduce((s, m) => s + (m.campaignRev ?? 0), 0);
              const monthCount = revenueMonthly.length;
              const bestMonth = monthCount > 0 ? revenueMonthly.reduce((best, m) => (m.campaignRev > (best?.campaignRev ?? 0) ? m : best), revenueMonthly[0]) : null;
              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <DollarSign className="h-5 w-5 text-emerald-600" />
                        </div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your campaign revenue</p>
                      </div>
                      <p className="text-2xl font-bold text-foreground">${totalRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                      <p className="text-xs text-muted-foreground">
                        {monthCount === 1 && bestMonth
                          ? `${bestMonth.monthLabel} · from your Braze campaign CSV`
                          : `Across ${monthCount} months · ${metrics.totalDelivered.toLocaleString()} delivered`}
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <Target className="h-5 w-5 text-amber-600" />
                        </div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Industry benchmark</p>
                      </div>
                      <p className="text-xl font-bold text-foreground/95">25% of total site revenue</p>
                      <p className="text-xs text-muted-foreground">
                        Top brands get about 25% of their total website revenue from CRM (email + campaigns). Add your total site revenue to see if you’re above or below this.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
                    <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground/90">Bottom line:</strong> You have ${totalRev.toLocaleString(undefined, { maximumFractionDigits: 0 })} from campaigns. To compare yourself to the 25% benchmark, we need your total site revenue — then we can show “your CRM share: X%” vs 25%.
                    </p>
                  </div>
                </>
              );
            })()}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Campaign revenue by month</p>
              </div>
              <div className="h-[220px] [&_.recharts-cartesian-axis-tick_value]:fill-[hsl(var(--muted-foreground))]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={revenueMonthly.length ? revenueMonthly : [{ monthLabel: '—', campaignRev: 0 }]}
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: chartMutedFill, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatDollar} width={48} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))', borderRadius: 8 }}
                      formatter={(v: number) => [`$${Number(v).toLocaleString()}`, 'Revenue']}
                      labelFormatter={(label) => label}
                    />
                    <Bar dataKey="campaignRev" name="Revenue" fill="hsl(217 91% 60% / 0.85)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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

        {/* AI Insights */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.map((insight, i) => (
              <div key={i} className="p-3 rounded-lg border bg-card/50">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className={cn('text-[10px]', insight.tagColor)}>
                    {insight.tag}
                  </Badge>
                  <span className="text-sm font-semibold">{insight.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{insight.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

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
