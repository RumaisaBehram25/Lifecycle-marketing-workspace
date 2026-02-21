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
import { Progress } from '@/components/ui/progress';
import { 
  ArrowRight, Calendar, FileText, Clock, Zap, Workflow, 
  Send, CheckCircle2, BarChart3, Sparkles, ListTodo
} from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { BriefDetailModal } from '@/components/briefs/BriefDetailModal';
import { UpcomingBriefs } from '@/components/dashboard/UpcomingBriefs';
import { PastCampaigns } from '@/components/dashboard/PastCampaigns';
import { EmbeddedChat } from '@/components/dashboard/EmbeddedChat';
import { BRCGIcon, BRCGLogo } from '@/components/BRCGLogo';
import { cn } from '@/lib/utils';

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
            trend="Placeholder data"
            color="bg-blue-500/10 text-blue-600"
          />
          <MetricCard
            icon={BarChart3}
            label="Avg. Open Rate"
            value="24.3%"
            trend="Placeholder data"
            color="bg-purple-500/10 text-purple-600"
          />
        </div>

        {/* Briefs and Campaigns */}
        <div className="grid lg:grid-cols-2 gap-6">
          <UpcomingBriefs />
          <RecentlyClosedBriefs />
        </div>

        <PastCampaigns />

        {/* AI Chat Module */}
        <EmbeddedChat />
      </div>
    </AppLayout>
  );
}
