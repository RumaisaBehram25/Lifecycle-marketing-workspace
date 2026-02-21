import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDoubleGoodClient } from '@/hooks/useDoubleGoodClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowRight, Plus, CheckCircle2, ListTodo, Send, BarChart3,
  Workflow, TrendingUp, Users, UserPlus, Sparkles, ChevronDown
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';
import { CreateBriefModal } from '@/components/briefs/CreateBriefModal';
import { UpcomingBriefs } from '@/components/dashboard/UpcomingBriefs';
import { PastCampaigns } from '@/components/dashboard/PastCampaigns';
import { EmbeddedChat } from '@/components/dashboard/EmbeddedChat';
import { BRCGIcon, BRCGLogo } from '@/components/BRCGLogo';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';

// Metric card for dashboard stats
function MetricCard({ icon: Icon, label, value, trend, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  trend?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// Placeholder performance data
const CAMPAIGN_PERF_DATA = [
  { name: 'Mon', sends: 1200, opens: 340, clicks: 89 },
  { name: 'Tue', sends: 980, opens: 290, clicks: 72 },
  { name: 'Wed', sends: 1500, opens: 420, clicks: 110 },
  { name: 'Thu', sends: 1100, opens: 310, clicks: 85 },
  { name: 'Fri', sends: 1400, opens: 390, clicks: 98 },
  { name: 'Sat', sends: 600, opens: 180, clicks: 45 },
  { name: 'Sun', sends: 450, opens: 140, clicks: 35 },
];

const FLOW_PERF_DATA = [
  { name: 'Welcome', entries: 820, completed: 640, converted: 210 },
  { name: 'Re-engage', entries: 450, completed: 310, converted: 95 },
  { name: 'Upsell', entries: 280, completed: 190, converted: 65 },
  { name: 'Win-Back', entries: 180, completed: 120, converted: 38 },
];

const SIGNUP_DATA = [
  { name: 'W1', signups: 120 },
  { name: 'W2', signups: 145 },
  { name: 'W3', signups: 132 },
  { name: 'W4', signups: 168 },
  { name: 'W5', signups: 155 },
  { name: 'W6', signups: 190 },
  { name: 'W7', signups: 210 },
];

// Lifecycle Flows Summary
function LifecycleFlowsSummary() {
  const flows = [
    { name: 'Welcome Series', status: 'active', touches: 4, channels: ['email', 'push'], lastUpdated: '2 days ago' },
    { name: 'Re-engagement', status: 'active', touches: 4, channels: ['email', 'push', 'in-app'], lastUpdated: '5 days ago' },
    { name: 'Upsell Journey', status: 'active', touches: 3, channels: ['email'], lastUpdated: '1 week ago' },
    { name: 'Win-Back Flow', status: 'draft', touches: 3, channels: ['email', 'push'], lastUpdated: '3 days ago' },
  ];

  const channelColors: Record<string, string> = {
    email: 'bg-blue-500/10 text-blue-600',
    push: 'bg-orange-500/10 text-orange-600',
    'in-app': 'bg-purple-500/10 text-purple-600',
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Lifecycle Flows</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/lifecycle">
            View All
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {flows.map((flow) => (
            <Link
              key={flow.name}
              to="/lifecycle"
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Workflow className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{flow.name}</p>
                  <Badge variant={flow.status === 'active' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                    {flow.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{flow.touches} touches</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <div className="flex gap-1">
                    {flow.channels.map(ch => (
                      <Badge key={ch} variant="outline" className={cn("text-[10px] px-1 py-0", channelColors[ch])}>
                        {ch}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">{flow.lastUpdated}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Performance Cards
function CampaignPerformanceCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Send className="h-4 w-4 text-blue-500" />
          Campaign Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={CAMPAIGN_PERF_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-[10px]" tickLine={false} axisLine={false} />
              <YAxis className="text-[10px]" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Area type="monotone" dataKey="opens" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
              <Area type="monotone" dataKey="clicks" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2) / 0.1)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Opens</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-chart-2" />Clicks</span>
        </div>
      </CardContent>
    </Card>
  );
}

function FlowPerformanceCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Workflow className="h-4 w-4 text-purple-500" />
          Flow Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={FLOW_PERF_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-[10px]" tickLine={false} axisLine={false} />
              <YAxis className="text-[10px]" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Bar dataKey="entries" fill="hsl(var(--primary) / 0.6)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="converted" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/60" />Entries</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-chart-3" />Converted</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SignupPerformanceCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-green-500" />
          Sign Up Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={SIGNUP_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-[10px]" tickLine={false} axisLine={false} />
              <YAxis className="text-[10px]" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Area type="monotone" dataKey="signups" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3) / 0.15)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-chart-3" />Weekly Signups</span>
        </div>
      </CardContent>
    </Card>
  );
}

// Recently closed briefs card
function RecentlyClosedBriefs() {
  const { data: client } = useDoubleGoodClient();
  
  const { data: closedBriefs, isLoading } = useQuery({
    queryKey: ['closed-briefs', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('briefs')
        .select('*')
        .eq('client_id', client.id)
        .in('status', ['complete', 'live'])
        .order('updated_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!client?.id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Recently Completed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Recently Completed</CardTitle>
      </CardHeader>
      <CardContent>
        {closedBriefs && closedBriefs.length > 0 ? (
          <div className="space-y-2">
            {closedBriefs.map((brief: any) => (
              <div key={brief.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{brief.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {brief.content_type === 'campaign' ? 'Campaign' : 'Lifecycle'} · Completed {format(new Date(brief.updated_at), 'MMM d')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No completed briefs yet</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: client } = useDoubleGoodClient();
  const [createBriefOpen, setCreateBriefOpen] = useState(false);
  
  // Get brief counts for metrics
  const { data: briefCounts } = useQuery({
    queryKey: ['brief-counts', client?.id],
    queryFn: async () => {
      if (!client?.id) return { open: 0, completed: 0 };
      const { data: allBriefs, error } = await supabase
        .from('briefs')
        .select('status')
        .eq('client_id', client.id);
      if (error) throw error;
      const open = (allBriefs || []).filter(b => !['complete', 'live'].includes(b.status)).length;
      const completed = (allBriefs || []).filter(b => ['complete', 'live'].includes(b.status)).length;
      return { open, completed };
    },
    enabled: !!client?.id,
  });

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
        {/* Brand Header */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center">
                <BRCGIcon className="h-8 w-8 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <BRCGLogo className="h-7 w-auto text-foreground" />
                <p className="text-sm text-muted-foreground mt-1">
                  CRM Copilot — Lifecycle marketing command center
                </p>
              </div>
              <Button onClick={() => setCreateBriefOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Brief
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={ListTodo}
            label="Open Briefs"
            value={briefCounts?.open ?? 0}
            color="bg-primary/10 text-primary"
          />
          <MetricCard
            icon={CheckCircle2}
            label="Completed"
            value={briefCounts?.completed ?? 0}
            color="bg-green-500/10 text-green-600"
          />
          <MetricCard
            icon={Send}
            label="Campaigns Sent"
            value={10}
            trend="Last 30 days"
            color="bg-blue-500/10 text-blue-600"
          />
          <MetricCard
            icon={BarChart3}
            label="Avg. Open Rate"
            value="24.3%"
            trend="Last 30 days"
            color="bg-purple-500/10 text-purple-600"
          />
        </div>

        {/* Lifecycle Flows + Briefs */}
        <div className="grid lg:grid-cols-2 gap-6">
          <LifecycleFlowsSummary />
          <UpcomingBriefs />
        </div>

        {/* Performance Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          <CampaignPerformanceCard />
          <FlowPerformanceCard />
          <SignupPerformanceCard />
        </div>

        {/* Recent Campaigns + Completed Briefs */}
        <PastCampaigns />
        <RecentlyClosedBriefs />

        {/* AI Chat Module - collapsed by default */}
        <Collapsible>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer flex flex-row items-center justify-between hover:bg-muted/30 transition-colors rounded-t-lg">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-primary flex items-center justify-center">
                    <Sparkles className="h-3 w-3 text-primary-foreground" />
                  </div>
                  AI Chat
                </CardTitle>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <EmbeddedChat />
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Create Brief Modal */}
        <CreateBriefModal open={createBriefOpen} onOpenChange={setCreateBriefOpen} />
      </div>
    </AppLayout>
  );
}
