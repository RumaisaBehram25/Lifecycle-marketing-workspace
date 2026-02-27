import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Send, Workflow, UserPlus, Sparkles, Search, Monitor, DollarSign, Users, ChevronDown, ChevronUp,
  MessageCircle, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Flow vs Campaign Revenue + CRM % of Total (from audit) ───
const REVENUE_MONTHLY = [
  { month: 'May 25', flowRev: 24145, campaignRev: 4721, crmPct: 9.58 },
  { month: 'Jun', flowRev: 48718, campaignRev: 18752, crmPct: 11.85 },
  { month: 'Jul', flowRev: 23795, campaignRev: 16824, crmPct: 8.64 },
  { month: 'Aug', flowRev: 40850, campaignRev: 20073, crmPct: 11.32 },
  { month: 'Sep', flowRev: 30919, campaignRev: 20954, crmPct: 12.29 },
  { month: 'Oct', flowRev: 34293, campaignRev: 16232, crmPct: 14.48 },
  { month: 'Nov', flowRev: 27798, campaignRev: 40142, crmPct: 12.55 },
  { month: 'Dec', flowRev: 36309, campaignRev: 26631, crmPct: 13.85 },
  { month: 'Jan 26', flowRev: 30356, campaignRev: 7736, crmPct: 11.62 },
];

// ─── Flow Revenue by Flow (replacing monthly total) ───
const FLOW_REVENUE_BY_FLOW = [
  { name: 'Welcome Series', revenue: 151900, orders: 342, color: 'hsl(var(--primary))' },
  { name: 'Browse Abandon', revenue: 52400, orders: 128, color: 'hsl(var(--chart-2))' },
  { name: 'Cart Abandon', revenue: 41200, orders: 96, color: 'hsl(var(--chart-3))' },
  { name: 'Post-Purchase', revenue: 28700, orders: 74, color: 'hsl(var(--chart-4))' },
  { name: 'Win-Back', revenue: 14100, orders: 31, color: 'hsl(var(--chart-5, 220 70% 50%))' },
  { name: 'Sunset', revenue: 8700, orders: 18, color: 'hsl(var(--muted-foreground))' },
];

// ─── Touchpoint drill-down data per flow ───
const FLOW_TOUCHPOINT_DATA: Record<string, Array<{ touchpoint: string; revenue: number; priorRevenue: number; openRate: number; clickRate: number; unsubRate: number; conversionRate: number }>> = {
  'Welcome Series': [
    { touchpoint: 'Email 1 – Welcome', revenue: 62400, priorRevenue: 48200, openRate: 58.2, clickRate: 12.4, unsubRate: 0.3, conversionRate: 4.1 },
    { touchpoint: 'Email 2 – Value Props', revenue: 41200, priorRevenue: 35800, openRate: 42.1, clickRate: 8.7, unsubRate: 0.5, conversionRate: 2.8 },
    { touchpoint: 'Email 3 – Social Proof', revenue: 28100, priorRevenue: 22400, openRate: 36.8, clickRate: 6.2, unsubRate: 0.4, conversionRate: 1.9 },
    { touchpoint: 'Email 4 – Offer', revenue: 20200, priorRevenue: 18600, openRate: 31.4, clickRate: 9.1, unsubRate: 0.8, conversionRate: 3.2 },
  ],
  'Browse Abandon': [
    { touchpoint: 'Email 1 – Reminder', revenue: 31200, priorRevenue: 24100, openRate: 44.3, clickRate: 7.8, unsubRate: 0.4, conversionRate: 2.1 },
    { touchpoint: 'Email 2 – Incentive', revenue: 14800, priorRevenue: 11200, openRate: 38.6, clickRate: 10.2, unsubRate: 0.6, conversionRate: 3.4 },
    { touchpoint: 'Push – Nudge', revenue: 6400, priorRevenue: 5800, openRate: 28.1, clickRate: 5.4, unsubRate: 0.2, conversionRate: 1.1 },
  ],
  'Cart Abandon': [
    { touchpoint: 'Email 1 – Cart Reminder', revenue: 22100, priorRevenue: 19400, openRate: 52.1, clickRate: 11.3, unsubRate: 0.3, conversionRate: 4.8 },
    { touchpoint: 'Email 2 – Urgency', revenue: 12600, priorRevenue: 10200, openRate: 41.7, clickRate: 8.9, unsubRate: 0.7, conversionRate: 3.1 },
    { touchpoint: 'SMS – Final Push', revenue: 6500, priorRevenue: 4800, openRate: 0, clickRate: 6.2, unsubRate: 1.1, conversionRate: 2.4 },
  ],
  'Post-Purchase': [
    { touchpoint: 'Thank You', revenue: 12400, priorRevenue: 9800, openRate: 62.4, clickRate: 8.1, unsubRate: 0.1, conversionRate: 1.8 },
    { touchpoint: 'Cross-Sell', revenue: 10200, priorRevenue: 8400, openRate: 35.2, clickRate: 6.7, unsubRate: 0.5, conversionRate: 2.2 },
    { touchpoint: 'Review Request', revenue: 6100, priorRevenue: 5200, openRate: 29.8, clickRate: 4.3, unsubRate: 0.3, conversionRate: 0.9 },
  ],
  'Win-Back': [
    { touchpoint: 'Email 1 – We Miss You', revenue: 8200, priorRevenue: 6800, openRate: 18.4, clickRate: 3.2, unsubRate: 1.2, conversionRate: 1.1 },
    { touchpoint: 'Email 2 – Offer', revenue: 5900, priorRevenue: 4200, openRate: 14.6, clickRate: 4.8, unsubRate: 1.8, conversionRate: 1.6 },
  ],
  'Sunset': [
    { touchpoint: 'Final Email', revenue: 5200, priorRevenue: 4100, openRate: 8.2, clickRate: 1.4, unsubRate: 3.2, conversionRate: 0.4 },
    { touchpoint: 'Suppression', revenue: 3500, priorRevenue: 2800, openRate: 0, clickRate: 0, unsubRate: 0, conversionRate: 0 },
  ],
};

// ─── All Campaigns Performance ───
const ALL_CAMPAIGNS = [
  { name: 'Black Friday Email 1', revenue: 19791, orders: 17, ctr: 1.66, date: 'Nov 24', channel: 'Email', segment: 'All Engaged' },
  { name: 'HEIGH10 Blowout Sale', revenue: 10762, orders: 12, ctr: 1.26, date: 'Dec 23', channel: 'Email', segment: 'Engaged 180d' },
  { name: 'Labor Day Sale #4', revenue: 5335, orders: 7, ctr: 1.06, date: 'Sep 1', channel: 'Email', segment: 'Engaged 90d' },
  { name: 'Labor Day Sale #2', revenue: 4993, orders: 9, ctr: 1.07, date: 'Aug 28', channel: 'Email', segment: 'Engaged 180d' },
  { name: 'New Pricing Infotainment', revenue: 4353, orders: 4, ctr: 0.31, date: 'Jan 6', channel: 'Email', segment: 'All Subscribers' },
  { name: 'Gift Card Final', revenue: 4220, orders: 8, ctr: 0.84, date: 'May 31', channel: 'Email', segment: 'Engaged 180d' },
  { name: '4th of July Sale #4', revenue: 4159, orders: 6, ctr: 0.59, date: 'Jun 28', channel: 'Email', segment: 'Engaged 90d' },
  { name: 'Black Friday Email 4', revenue: 3835, orders: 3, ctr: 0.48, date: 'Nov 29', channel: 'Email', segment: 'All Engaged' },
  { name: 'Spring Launch', revenue: 3200, orders: 5, ctr: 0.92, date: 'Mar 15', channel: 'Email', segment: 'Engaged 180d' },
  { name: 'Back To School', revenue: 2800, orders: 4, ctr: 0.71, date: 'Aug 10', channel: 'Email', segment: 'Engaged 90d' },
  { name: 'Flash Sale Push', revenue: 1950, orders: 3, ctr: 2.10, date: 'Oct 5', channel: 'Push', segment: 'App Users' },
  { name: 'Weekly Digest #42', revenue: 1200, orders: 2, ctr: 0.45, date: 'Dec 1', channel: 'Email', segment: 'Engaged 180d' },
];

// ─── Subscriber Growth by Source ───
const SUBSCRIBER_GROWTH = [
  { month: 'Feb 25', email: 1981, sms: 40, website: 138, vehicle: 0, dealer: 0, event: 0 },
  { month: 'Mar', email: 821, sms: 11, website: 176, vehicle: 0, dealer: 0, event: 0 },
  { month: 'May', email: 1308, sms: 27, website: 108, vehicle: 0, dealer: 0, event: 0 },
  { month: 'Jun', email: 1867, sms: 52, website: 142, vehicle: 0, dealer: 0, event: 0 },
  { month: 'Jul', email: 1351, sms: 36, website: 113, vehicle: 0, dealer: 4644, event: 0 },
  { month: 'Aug', email: 1432, sms: 46, website: 115, vehicle: 0, dealer: 3, event: 31 },
  { month: 'Sep', email: 1276, sms: 43, website: 270, vehicle: 0, dealer: 0, event: 3 },
  { month: 'Oct', email: 1268, sms: 35, website: 93, vehicle: 9, dealer: 0, event: 2 },
  { month: 'Nov', email: 1969, sms: 6, website: 0, vehicle: 80, dealer: 0, event: 0 },
  { month: 'Dec', email: 2103, sms: 95, website: 0, vehicle: 85, dealer: 0, event: 0 },
  { month: 'Jan 26', email: 1378, sms: 129, website: 0, vehicle: 49, dealer: 0, event: 0 },
  { month: 'Feb 26', email: 872, sms: 71, website: 0, vehicle: 25, dealer: 0, event: 0 },
];

const CONVERSION_DEVICE = [
  { device: 'Desktop', sessions: 42300, conversions: 1480, rate: 3.5 },
  { device: 'Mobile', sessions: 68200, conversions: 1568, rate: 2.3 },
];

const CHANNEL_MIX = [
  { name: 'Email', value: 62, color: 'hsl(var(--primary))' },
  { name: 'Push', value: 18, color: 'hsl(var(--chart-2))' },
  { name: 'In-App', value: 12, color: 'hsl(var(--chart-3))' },
  { name: 'SMS', value: 8, color: 'hsl(var(--chart-4))' },
];

type SortKey = 'name' | 'revenue' | 'orders' | 'ctr' | 'date' | 'channel' | 'segment';

function StatCard({ icon: Icon, label, value, color, trend }: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  trend?: { direction: 'up' | 'down' | 'flat'; value: string };
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", color)}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
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

const AI_INSIGHTS = [
  {
    title: 'Revenue Concentration Risk',
    body: 'Welcome Series accounts for 52% of all flow revenue ($151.9K). Diversifying cart recovery and browse abandonment flows could reduce single-flow dependency.',
    tag: 'High Priority',
    tagColor: 'bg-red-500/10 text-red-600',
  },
  {
    title: 'Campaign Revenue Pattern',
    body: '7 of your top 8 campaigns are sale events. Non-sale campaigns rarely break $2K in attributed revenue. Consider nurture sequences that build purchase intent outside promotions.',
    tag: 'Strategy',
    tagColor: 'bg-amber-500/10 text-amber-600',
  },
  {
    title: 'Subscriber Capture Gap',
    body: '37,477 checkout starts but only 24,308 list adds in the past year. ~13K potential subscribers lost. Audit popup timing, exit intent, and checkout opt-in.',
    tag: 'Growth',
    tagColor: 'bg-green-500/10 text-green-600',
  },
  {
    title: 'CRM Revenue Below Benchmark',
    body: 'CRM contributes ~10% of total site revenue. Industry benchmark is 25–35%. Even the best month (Oct at 14.48%) shows a massive gap.',
    tag: 'Benchmark',
    tagColor: 'bg-purple-500/10 text-purple-600',
  },
];

export default function Analytics() {
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignChannelFilter, setCampaignChannelFilter] = useState('All');
  const [period, setPeriod] = useState('default');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortAsc, setSortAsc] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; content: string }[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [comparisonPeriod, setComparisonPeriod] = useState<'yoy' | 'mom'>('yoy');

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

  const filteredCampaigns = ALL_CAMPAIGNS
    .filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(campaignSearch.toLowerCase());
      const matchesChannel = campaignChannelFilter === 'All' || c.channel === campaignChannelFilter;
      return matchesSearch && matchesChannel;
    })
    .sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortKey === 'name') return mul * a.name.localeCompare(b.name);
      if (sortKey === 'revenue') return mul * (a.revenue - b.revenue);
      if (sortKey === 'orders') return mul * (a.orders - b.orders);
      if (sortKey === 'ctr') return mul * (a.ctr - b.ctr);
      if (sortKey === 'date') return mul * a.date.localeCompare(b.date);
      if (sortKey === 'channel') return mul * a.channel.localeCompare(b.channel);
      if (sortKey === 'segment') return mul * a.segment.localeCompare(b.segment);
      return 0;
    });

  const handleChatSend = () => {
    if (!chatInput.trim()) return;
    setChatMessages(prev => [
      ...prev,
      { role: 'user', content: chatInput },
      { role: 'ai', content: `Based on your data, here's my analysis of "${chatInput}": The current metrics suggest focusing on flow diversification and improving SMS capture rates to close the CRM revenue gap.` },
    ]);
    setChatInput('');
  };

  const touchpointData = selectedFlow ? FLOW_TOUCHPOINT_DATA[selectedFlow] || [] : [];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
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
          <StatCard icon={DollarSign} label="CRM Attributed Revenue" value="$469K" color="bg-primary/10 text-primary" trend={period !== 'default' ? { direction: 'up', value: '+12.3% vs prior' } : undefined} />
          <StatCard icon={Workflow} label="Flow Revenue" value="$297K" color="bg-purple-500/10 text-purple-600" trend={period !== 'default' ? { direction: 'up', value: '+8.1% vs prior' } : undefined} />
          <StatCard icon={Send} label="Campaign Revenue" value="$172K" color="bg-blue-500/10 text-blue-600" trend={period !== 'default' ? { direction: 'down', value: '-3.2% vs prior' } : undefined} />
          <StatCard icon={UserPlus} label="List Growth" value="24,308" color="bg-green-500/10 text-green-600" trend={period !== 'default' ? { direction: 'up', value: '+5.7% vs prior' } : undefined} />
        </div>

        {/* Engagement Metrics Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Eye} label="Avg. Open Rate" value="32.4%" color="bg-amber-500/10 text-amber-600" trend={period !== 'default' ? { direction: 'up', value: '+1.8pp vs prior' } : undefined} />
          <StatCard icon={Send} label="Avg. Click Rate" value="4.8%" color="bg-cyan-500/10 text-cyan-600" trend={period !== 'default' ? { direction: 'up', value: '+0.4pp vs prior' } : undefined} />
          <StatCard icon={Users} label="Active Subscribers" value="18,742" color="bg-emerald-500/10 text-emerald-600" trend={period !== 'default' ? { direction: 'up', value: '+6.2% vs prior' } : undefined} />
          <StatCard icon={DollarSign} label="Revenue per Send" value="$0.42" color="bg-rose-500/10 text-rose-600" trend={period !== 'default' ? { direction: 'down', value: '-$0.03 vs prior' } : undefined} />
        </div>

        {/* Flow vs Campaign Revenue + CRM % */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Flow vs Campaign Revenue + CRM % of Total</CardTitle>
            <p className="text-xs text-muted-foreground">Dashed line at 25% = industry benchmark</p>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={REVENUE_MONTHLY} margin={{ top: 8, right: 16, bottom: 0, left: -4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="rev" className="text-xs" tickLine={false} axisLine={false} tickFormatter={formatDollar} />
                  <YAxis yAxisId="pct" orientation="right" className="text-xs" tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} domain={[0, 30]} />
                  <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} formatter={(v: number, name: string) => name === 'CRM %' ? `${v}%` : `$${v.toLocaleString()}`} />
                  <Legend />
                  <Bar yAxisId="rev" dataKey="flowRev" name="Flow Revenue" fill="hsl(var(--primary) / 0.6)" radius={[2, 2, 0, 0]} />
                  <Bar yAxisId="rev" dataKey="campaignRev" name="Campaign Revenue" fill="hsl(var(--chart-2) / 0.6)" radius={[2, 2, 0, 0]} />
                  <Line yAxisId="pct" type="monotone" dataKey="crmPct" name="CRM %" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="pct" dataKey={() => 25} name="25% Benchmark" stroke="hsl(var(--muted-foreground))" strokeDasharray="6 4" strokeWidth={1} dot={false} legendType="none" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Lifecycle Flow Performance Dashboard */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-purple-500" />
                  Lifecycle Flow Performance
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Select a flow to see touchpoint-level metrics</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={selectedFlow || 'all'} onValueChange={(v) => setSelectedFlow(v === 'all' ? null : v)}>
                  <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Select flow..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Flows (Revenue)</SelectItem>
                    {FLOW_REVENUE_BY_FLOW.map(f => (
                      <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedFlow && (
                  <Select value={comparisonPeriod} onValueChange={(v) => setComparisonPeriod(v as 'yoy' | 'mom')}>
                    <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yoy">YoY</SelectItem>
                      <SelectItem value="mom">MoM</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedFlow ? (
              /* Flow overview bar chart */
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={FLOW_REVENUE_BY_FLOW} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                    <XAxis type="number" className="text-xs" tickLine={false} axisLine={false} tickFormatter={formatDollar} />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      className="text-xs" 
                      tickLine={false} 
                      axisLine={false} 
                      width={80}
                      tick={({ x, y, payload }: any) => (
                        <text
                          x={x}
                          y={y}
                          dy={4}
                          textAnchor="end"
                          className="text-xs fill-foreground cursor-pointer hover:fill-primary"
                          onClick={() => setSelectedFlow(payload.value)}
                        >
                          {payload.value}
                        </text>
                      )}
                    />
                    <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} formatter={(v: number) => `$${v.toLocaleString()}`} />
                    <Bar 
                      dataKey="revenue" 
                      name="Revenue" 
                      fill="hsl(var(--primary))" 
                      radius={[0, 4, 4, 0]} 
                      cursor="pointer"
                      onClick={(data: any) => setSelectedFlow(data.name)}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              /* Touchpoint drill-down with metrics */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{selectedFlow}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Total: ${FLOW_REVENUE_BY_FLOW.find(f => f.name === selectedFlow)?.revenue.toLocaleString()}
                  </span>
                </div>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={touchpointData} margin={{ top: 8, right: 16, bottom: 0, left: -4 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="touchpoint" className="text-[10px]" tickLine={false} axisLine={false} />
                      <YAxis className="text-xs" tickLine={false} axisLine={false} tickFormatter={formatDollar} />
                      <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} formatter={(v: number, name: string) => [`$${v.toLocaleString()}`, name]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="revenue" name="Current Period" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="priorRevenue" name={comparisonPeriod === 'yoy' ? 'Prior Year' : 'Prior Month'} stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {/* Touchpoint metrics table */}
                <div className="overflow-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Touchpoint</TableHead>
                        <TableHead className="text-xs text-right">Revenue</TableHead>
                        <TableHead className="text-xs text-right">Open Rate</TableHead>
                        <TableHead className="text-xs text-right">Click Rate</TableHead>
                        <TableHead className="text-xs text-right">Unsub Rate</TableHead>
                        <TableHead className="text-xs text-right">Conversion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {touchpointData.map((tp, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm font-medium py-2">{tp.touchpoint}</TableCell>
                          <TableCell className="text-sm text-right font-semibold py-2">${tp.revenue.toLocaleString()}</TableCell>
                          <TableCell className="text-sm text-right py-2">{tp.openRate > 0 ? `${tp.openRate}%` : '—'}</TableCell>
                          <TableCell className="text-sm text-right py-2">{tp.clickRate > 0 ? `${tp.clickRate}%` : '—'}</TableCell>
                          <TableCell className="text-sm text-right py-2">{tp.unsubRate > 0 ? `${tp.unsubRate}%` : '—'}</TableCell>
                          <TableCell className="text-sm text-right py-2">{tp.conversionRate > 0 ? `${tp.conversionRate}%` : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* All Campaigns — sortable table — all columns clickable */}
        <Card>
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
                    <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('date')}>Date <SortIcon col="date" /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampaigns.map((c, i) => (
                    <TableRow key={i} className="cursor-pointer">
                      <TableCell className="text-sm font-medium py-2">{c.name}</TableCell>
                      <TableCell className="text-sm text-right font-semibold py-2">${c.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-right py-2">{c.orders}</TableCell>
                      <TableCell className="text-sm text-right py-2">{c.ctr}%</TableCell>
                      <TableCell className="py-2"><Badge variant="outline" className="text-xs">{c.channel}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2">{c.segment}</TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2">{c.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Subscriber Growth — full width */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-green-500" />
              Subscriber Growth by Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={SUBSCRIBER_GROWTH} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-[10px]" tickLine={false} axisLine={false} />
                  <YAxis className="text-xs" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="email" name="Email" stackId="a" fill="hsl(var(--primary))" />
                  <Bar dataKey="sms" name="SMS" stackId="a" fill="hsl(var(--chart-2))" />
                  <Bar dataKey="website" name="Website" stackId="a" fill="hsl(var(--chart-3))" />
                  <Bar dataKey="dealer" name="Dealer" stackId="a" fill="hsl(var(--chart-4))" />
                  <Bar dataKey="vehicle" name="Vehicle" stackId="a" fill="hsl(var(--chart-5, 220 70% 50%))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Conversion by Device + Channel Mix — split */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Monitor className="h-4 w-4 text-blue-500" />
                Conversion Rate by Device
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mt-2">
                {CONVERSION_DEVICE.map(d => (
                  <div key={d.device} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{d.device}</span>
                      <span className="text-sm font-bold">{d.rate}%</span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", d.device === 'Desktop' ? 'bg-primary' : 'bg-chart-2')}
                        style={{ width: `${d.rate * 10}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{d.sessions.toLocaleString()} sessions</span>
                      <span>{d.conversions.toLocaleString()} conversions</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Channel Mix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="h-[140px] w-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={CHANNEL_MIX} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3}>
                        {CHANNEL_MIX.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} formatter={(v: number) => `${v}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {CHANNEL_MIX.map(ch => (
                    <div key={ch.name} className="flex items-center gap-2 text-sm">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
                      <span>{ch.name}</span>
                      <span className="font-semibold ml-auto">{ch.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Insights + Chat */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {AI_INSIGHTS.map((insight, i) => (
                <div key={i} className="p-3 rounded-lg border bg-card/50">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className={cn("text-[10px]", insight.tagColor)}>{insight.tag}</Badge>
                    <span className="text-sm font-semibold">{insight.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{insight.body}</p>
                </div>
              ))}
            </div>

            {/* Chat section */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                Ask about your data
              </p>
              {chatMessages.length > 0 && (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={cn("text-sm p-2 rounded-lg", msg.role === 'user' ? 'bg-primary/10 text-foreground ml-8' : 'bg-muted mr-8')}>
                      {msg.content}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Ask about revenue trends, campaigns, subscriber growth..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChatSend()}
                  className="text-sm"
                />
                <Button size="sm" onClick={handleChatSend} disabled={!chatInput.trim()}>
                  Send
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
