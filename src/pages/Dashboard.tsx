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
  ArrowRight, Plus, CheckCircle2, ListTodo, Send,
  Workflow, TrendingUp, Users, UserPlus, Sparkles, ChevronDown,
  Clock, Zap, FileText,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';
import { CreateBriefModal } from '@/components/briefs/CreateBriefModal';
import { PastCampaigns } from '@/components/dashboard/PastCampaigns';
import { EmbeddedChat } from '@/components/dashboard/EmbeddedChat';
import { BRCGIcon, BRCGLogo } from '@/components/BRCGLogo';
import { cn } from '@/lib/utils';

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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  to_brief: { label: 'To Brief', color: 'bg-muted text-muted-foreground' },
  pending_copy: { label: 'Pending Copy', color: 'bg-amber-500/20 text-amber-600' },
  pending_design: { label: 'Pending Design', color: 'bg-orange-500/20 text-orange-600' },
  design_review: { label: 'In Design Review', color: 'bg-blue-500/20 text-blue-600' },
  in_development: { label: 'In Development', color: 'bg-purple-500/20 text-purple-600' },
  qa_ready: { label: 'QA Ready', color: 'bg-cyan-500/20 text-cyan-600' },
  live: { label: 'Live', color: 'bg-green-500/20 text-green-600' },
  draft: { label: 'To Brief', color: 'bg-muted text-muted-foreground' },
  in_review: { label: 'In Design Review', color: 'bg-blue-500/20 text-blue-600' },
  approved: { label: 'In Development', color: 'bg-purple-500/20 text-purple-600' },
  in_progress: { label: 'In Progress', color: 'bg-purple-500/20 text-purple-600' },
  complete: { label: 'Live', color: 'bg-green-500/20 text-green-600' },
};

const PROGRESS_STEPS = [
  { id: 'to_brief', label: 'Brief' },
  { id: 'pending_copy', label: 'Copy' },
  { id: 'pending_design', label: 'Design' },
  { id: 'design_review', label: 'Review' },
  { id: 'in_development', label: 'Dev' },
  { id: 'qa_ready', label: 'QA' },
  { id: 'live', label: 'Live' },
];

// Placeholder briefs for when DB is empty
const PLACEHOLDER_BRIEFS = [
  { id: 'p1', name: 'Welcome Series Revamp', content_type: 'lifecycle', status: 'pending_copy', deadline: '2026-03-15', channels: ['email', 'push'] },
  { id: 'p2', name: 'Spring Sale Campaign', content_type: 'campaign', status: 'to_brief', deadline: '2026-03-20', channels: ['email'] },
  { id: 'p3', name: 'Post-Purchase Flow', content_type: 'lifecycle', status: 'in_development', deadline: '2026-03-10', channels: ['email', 'inapp'] },
  { id: 'p4', name: 'Q2 Content Calendar', content_type: 'task', status: 'in_progress', deadline: '2026-04-01', channels: [] },
];

function OpenBriefsTracker({ briefs }: { briefs: any[] }) {
  const displayBriefs = briefs.length > 0 ? briefs : PLACEHOLDER_BRIEFS;
  const openBriefs = displayBriefs.filter(b => !['complete', 'live'].includes(b.status));

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          Open Briefs
        </CardTitle>
        <Link to="/briefs">
          <Button variant="ghost" size="sm" className="text-xs">
            View All <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {openBriefs.slice(0, 5).map((brief) => {
          const statusConfig = STATUS_CONFIG[brief.status] || STATUS_CONFIG.to_brief;
          const currentStepIndex = PROGRESS_STEPS.findIndex(s => s.id === brief.status || (brief.status === 'draft' && s.id === 'to_brief'));

          return (
            <div key={brief.id} className="p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {brief.content_type === 'campaign' ? (
                    <Zap className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                  ) : brief.content_type === 'task' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <Workflow className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">{brief.name}</span>
                </div>
                <Badge className={cn("text-[10px] flex-shrink-0", statusConfig.color)}>
                  {statusConfig.label}
                </Badge>
              </div>
              {/* Progress bar */}
              <div className="flex items-center gap-0.5 mb-1.5">
                {PROGRESS_STEPS.map((step, i) => (
                  <div
                    key={step.id}
                    className={cn(
                      "flex-1 h-1 rounded-full",
                      i <= currentStepIndex ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="capitalize">{brief.content_type}</span>
                {brief.deadline && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Due {format(new Date(brief.deadline), 'MMM d')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {openBriefs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No open briefs</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: client } = useDoubleGoodClient();
  const [createBriefOpen, setCreateBriefOpen] = useState(false);
  
  const { data: briefs } = useQuery({
    queryKey: ['dashboard-briefs', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('briefs')
        .select('*')
        .eq('client_id', client.id)
        .order('deadline', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!client?.id,
  });

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
            icon={Send}
            label="Campaigns Sent"
            value={10}
            trend="Last 30 days"
            color="bg-blue-500/10 text-blue-600"
          />
          <MetricCard
            icon={Workflow}
            label="Lifecycle Flows Updated"
            value={4}
            trend="Last 30 days"
            color="bg-purple-500/10 text-purple-600"
          />
          <MetricCard
            icon={ListTodo}
            label="Open Briefs"
            value={briefCounts?.open ?? 0}
            color="bg-primary/10 text-primary"
          />
          <MetricCard
            icon={TrendingUp}
            label="Avg. Open Rate"
            value="24.3%"
            trend="Last 30 days"
            color="bg-green-500/10 text-green-600"
          />
        </div>

        {/* Open Briefs Tracker */}
        <OpenBriefsTracker briefs={briefs || []} />

        {/* Recent Campaigns */}
        <PastCampaigns />

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

        <CreateBriefModal open={createBriefOpen} onOpenChange={setCreateBriefOpen} />
      </div>
    </AppLayout>
  );
}
