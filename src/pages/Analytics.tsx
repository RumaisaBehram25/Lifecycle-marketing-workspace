import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
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
  Send, Workflow, UserPlus, TrendingUp, ArrowUpRight, ArrowDownRight,
  Mail, Smartphone, Bell, MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Placeholder data
const CAMPAIGN_WEEKLY = [
  { week: 'W1', sends: 4200, opens: 1180, clicks: 310 },
  { week: 'W2', sends: 3800, opens: 1090, clicks: 285 },
  { week: 'W3', sends: 5100, opens: 1530, clicks: 420 },
  { week: 'W4', sends: 4600, opens: 1340, clicks: 365 },
  { week: 'W5', sends: 5400, opens: 1620, clicks: 445 },
  { week: 'W6', sends: 4900, opens: 1470, clicks: 398 },
];

const FLOW_PERFORMANCE = [
  { name: 'Welcome Series', entries: 1820, completed: 1240, converted: 410 },
  { name: 'Re-engagement', entries: 950, completed: 610, converted: 195 },
  { name: 'Post-Purchase', entries: 680, completed: 490, converted: 165 },
  { name: 'Win-Back', entries: 380, completed: 220, converted: 68 },
  { name: 'Milestone', entries: 290, completed: 210, converted: 85 },
];

const SIGNUP_WEEKLY = [
  { week: 'W1', signups: 320 },
  { week: 'W2', signups: 345 },
  { week: 'W3', signups: 382 },
  { week: 'W4', signups: 368 },
  { week: 'W5', signups: 405 },
  { week: 'W6', signups: 430 },
];

const CHANNEL_MIX = [
  { name: 'Email', value: 62, color: 'hsl(var(--primary))' },
  { name: 'Push', value: 18, color: 'hsl(var(--chart-2))' },
  { name: 'In-App', value: 12, color: 'hsl(var(--chart-3))' },
  { name: 'SMS', value: 8, color: 'hsl(var(--chart-4))' },
];

function StatCard({ icon: Icon, label, value, change, changeLabel, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  change: number;
  changeLabel: string;
  color: string;
}) {
  const isPositive = change >= 0;
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
        <div className="flex items-center gap-1 mt-1">
          <Badge variant="secondary" className={cn("text-xs gap-0.5", isPositive ? "text-green-600 bg-green-500/10" : "text-red-600 bg-red-500/10")}>
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change)}%
          </Badge>
          <span className="text-xs text-muted-foreground">{changeLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <PageHeader
          title="Analytics"
          description="Track messaging performance across campaigns, lifecycle flows, and signups"
        />

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Send} label="Total Sends" value="28,000" change={12.4} changeLabel="vs last period" color="bg-primary/10 text-primary" />
          <StatCard icon={TrendingUp} label="Open Rate" value="29.1%" change={3.2} changeLabel="vs last period" color="bg-blue-500/10 text-blue-600" />
          <StatCard icon={Workflow} label="Flow Conversions" value="923" change={-2.1} changeLabel="vs last period" color="bg-purple-500/10 text-purple-600" />
          <StatCard icon={UserPlus} label="New Signups" value="2,250" change={8.6} changeLabel="vs last period" color="bg-green-500/10 text-green-600" />
        </div>

        {/* Campaign Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              Campaign Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={CAMPAIGN_WEEKLY} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" tickLine={false} axisLine={false} />
                  <YAxis className="text-xs" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Legend />
                  <Area type="monotone" dataKey="sends" name="Sends" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted) / 0.4)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="opens" name="Opens" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
                  <Area type="monotone" dataKey="clicks" name="Clicks" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2) / 0.1)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Flow Performance */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Workflow className="h-4 w-4 text-purple-500" />
                Flow Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={FLOW_PERFORMANCE} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-[10px]" tickLine={false} axisLine={false} />
                    <YAxis className="text-xs" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Legend />
                    <Bar dataKey="entries" name="Entries" fill="hsl(var(--primary) / 0.5)" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="converted" name="Converted" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Channel Mix */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-500" />
                Channel Mix
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="h-[200px] w-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={CHANNEL_MIX} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                        {CHANNEL_MIX.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} formatter={(v: number) => `${v}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {CHANNEL_MIX.map((ch) => (
                    <div key={ch.name} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: ch.color }} />
                      <span className="text-sm">{ch.name}</span>
                      <span className="text-sm font-semibold ml-auto">{ch.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Signup Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-green-500" />
              Signup Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={SIGNUP_WEEKLY} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" tickLine={false} axisLine={false} />
                  <YAxis className="text-xs" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Area type="monotone" dataKey="signups" name="Signups" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3) / 0.15)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
