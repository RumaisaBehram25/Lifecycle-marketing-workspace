import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDoubleGoodClient } from '@/hooks/useDoubleGoodClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ArrowRight, Plus, CheckCircle2, ListTodo, Send,
  Workflow, Clock, Zap, Sparkles, ChevronDown, ChevronRight,
  FolderOpen,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';
import { CreateBriefModal } from '@/components/briefs/CreateBriefModal';
import { BriefDetailModal } from '@/components/briefs/BriefDetailModal';
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
  complete: { label: 'Complete', color: 'bg-green-500/20 text-green-600' },
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

const PLACEHOLDER_BRIEFS = [
  { id: 'p1', name: 'Welcome Series Revamp', content_type: 'lifecycle', status: 'pending_copy', deadline: '2026-03-15', channels: ['email', 'push'], created_at: '2026-02-01', about: 'Revamp the welcome series with updated brand voice', stage: 'Onboarding' },
  { id: 'p2', name: 'Spring Sale Campaign', content_type: 'campaign', status: 'to_brief', deadline: '2026-03-20', channels: ['email'], created_at: '2026-02-10', about: 'Q1 spring sale push', quarter: 'Q1 2026' },
  { id: 'p3', name: 'Post-Purchase Flow', content_type: 'lifecycle', status: 'in_development', deadline: '2026-03-10', channels: ['email', 'inapp'], created_at: '2026-01-20', about: 'Post-purchase thank you and cross-sell flow', stage: 'Post-Purchase' },
  { id: 'p4', name: 'Q2 Content Calendar', content_type: 'task', status: 'in_progress', deadline: '2026-04-01', channels: [], created_at: '2026-02-15', about: 'Plan Q2 content calendar and briefs' },
  { id: 'p5', name: 'Memorial Day Blast', content_type: 'campaign', status: 'pending_design', deadline: '2026-05-20', channels: ['email'], created_at: '2026-02-20', about: 'Memorial Day sale campaign', quarter: 'Q2 2026' },
  { id: 'p6', name: 'Cart Abandonment V2', content_type: 'lifecycle', status: 'to_brief', deadline: '2026-04-15', channels: ['email', 'push'], created_at: '2026-02-18', about: 'Update cart abandonment flow with new incentives', stage: 'Recovery' },
  { id: 'p7', name: 'Upload UTM Tracking Doc', content_type: 'task', status: 'to_brief', deadline: '2026-03-05', channels: [], created_at: '2026-02-22', about: 'Upload UTM tracking documentation' },
  { id: 'p8', name: 'Summer Sale Campaign', content_type: 'campaign', status: 'to_brief', deadline: '2026-06-15', channels: ['email', 'push'], created_at: '2026-02-25', about: 'Summer sale kickoff', quarter: 'Q2 2026' },
  { id: 'p9', name: 'Valentine\'s Day Campaign', content_type: 'campaign', status: 'complete', deadline: '2026-02-14', channels: ['email'], created_at: '2026-01-10', about: 'Valentine\'s Day promo email blast', quarter: 'Q1 2026' },
  { id: 'p10', name: 'New Year Welcome Flow', content_type: 'lifecycle', status: 'live', deadline: '2026-01-05', channels: ['email', 'push'], created_at: '2025-12-15', about: 'New Year welcome series for Jan subscribers', stage: 'Onboarding' },
  { id: 'p11', name: 'Black Friday Series', content_type: 'campaign', status: 'complete', deadline: '2025-11-29', channels: ['email', 'push'], created_at: '2025-10-15', about: 'Black Friday email and push series', quarter: 'Q4 2025' },
  { id: 'p12', name: 'Holiday Win-Back', content_type: 'lifecycle', status: 'complete', deadline: '2025-12-20', channels: ['email'], created_at: '2025-11-01', about: 'Holiday re-engagement for lapsed users', stage: 'Win-Back' },
];

function getQuarter(deadline?: string | null): string {
  if (!deadline) return 'Unscheduled';
  const d = new Date(deadline);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} ${d.getFullYear()}`;
}

function getStage(brief: any): string {
  return brief.stage || 'General';
}

type FolderType = 'campaign' | 'lifecycle' | 'task';

const FOLDER_CONFIG: Record<FolderType, { label: string; icon: React.ElementType; color: string; groupBy: string }> = {
  campaign: { label: 'Campaigns', icon: Zap, color: 'text-blue-500', groupBy: 'Quarter' },
  lifecycle: { label: 'Lifecycle', icon: Workflow, color: 'text-purple-500', groupBy: 'Stage' },
  task: { label: 'Tasks', icon: CheckCircle2, color: 'text-green-500', groupBy: '' },
};

function BriefRow({ brief, onClick }: { brief: any; onClick: () => void }) {
  const statusConfig = STATUS_CONFIG[brief.status] || STATUS_CONFIG.to_brief;
  const currentStepIndex = PROGRESS_STEPS.findIndex(s => s.id === brief.status || (brief.status === 'draft' && s.id === 'to_brief'));

  return (
    <div
      className="p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium truncate">{brief.name}</span>
        <Badge className={cn("text-[10px] flex-shrink-0", statusConfig.color)}>
          {statusConfig.label}
        </Badge>
      </div>
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
        <span>{brief.about ? brief.about.slice(0, 40) + (brief.about.length > 40 ? '...' : '') : ''}</span>
        {brief.deadline && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Due {format(new Date(brief.deadline), 'MMM d')}
          </span>
        )}
      </div>
    </div>
  );
}

function BriefFolder({ type, briefs, onSelectBrief }: { type: FolderType; briefs: any[]; onSelectBrief: (b: any) => void }) {
  const [isOpen, setIsOpen] = useState(true);
  const config = FOLDER_CONFIG[type];
  const Icon = config.icon;

  const groups: Record<string, any[]> = {};
  if (type === 'campaign') {
    briefs.forEach(b => {
      const q = b.quarter || getQuarter(b.deadline);
      if (!groups[q]) groups[q] = [];
      groups[q].push(b);
    });
  } else if (type === 'lifecycle') {
    briefs.forEach(b => {
      const s = getStage(b);
      if (!groups[s]) groups[s] = [];
      groups[s].push(b);
    });
  } else {
    groups['All'] = briefs;
  }

  const sortedGroupKeys = Object.keys(groups).sort();

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted/50 transition-colors">
        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <FolderOpen className={cn("h-4 w-4", config.color)} />
        <span className="text-sm font-semibold">{config.label}</span>
        <Badge variant="secondary" className="text-[10px] ml-auto">{briefs.length}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 mt-1 space-y-3">
        {sortedGroupKeys.map(groupKey => (
          <div key={groupKey}>
            {type !== 'task' && (
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 px-1">
                {groupKey}
              </p>
            )}
            <div className="space-y-2">
              {groups[groupKey].map(brief => (
                <BriefRow key={brief.id} brief={brief} onClick={() => onSelectBrief(brief)} />
              ))}
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function OpenBriefsTracker({ briefs, clientId, onRefresh }: { briefs: any[]; clientId: string; onRefresh: () => void }) {
  const [selectedBrief, setSelectedBrief] = useState<any>(null);
  const displayBriefs = briefs.length > 0 ? briefs : PLACEHOLDER_BRIEFS;
  const openBriefs = displayBriefs.filter(b => !['complete', 'live'].includes(b.status));

  const campaignBriefs = openBriefs.filter(b => b.content_type === 'campaign');
  const lifecycleBriefs = openBriefs.filter(b => b.content_type === 'lifecycle');
  const taskBriefs = openBriefs.filter(b => b.content_type === 'task');

  return (
    <>
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
        <CardContent className="space-y-2">
          {campaignBriefs.length > 0 && (
            <BriefFolder type="campaign" briefs={campaignBriefs} onSelectBrief={setSelectedBrief} />
          )}
          {lifecycleBriefs.length > 0 && (
            <BriefFolder type="lifecycle" briefs={lifecycleBriefs} onSelectBrief={setSelectedBrief} />
          )}
          {taskBriefs.length > 0 && (
            <BriefFolder type="task" briefs={taskBriefs} onSelectBrief={setSelectedBrief} />
          )}
          {openBriefs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No open briefs</p>
          )}
        </CardContent>
      </Card>

      <BriefDetailModal
        brief={selectedBrief}
        open={!!selectedBrief}
        onOpenChange={(open) => { if (!open) setSelectedBrief(null); }}
        clientId={clientId}
        onUpdate={onRefresh}
      />
    </>
  );
}

function ClosedBriefsSection({ briefs, clientId, onRefresh }: { briefs: any[]; clientId: string; onRefresh: () => void }) {
  const [selectedBrief, setSelectedBrief] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const displayBriefs = briefs.length > 0 ? briefs : PLACEHOLDER_BRIEFS;
  const closedBriefs = displayBriefs.filter(b => ['complete', 'live'].includes(b.status));

  if (closedBriefs.length === 0) return null;

  // Group closed briefs by type
  const campaignBriefs = closedBriefs.filter(b => b.content_type === 'campaign');
  const lifecycleBriefs = closedBriefs.filter(b => b.content_type === 'lifecycle');
  const taskBriefs = closedBriefs.filter(b => b.content_type === 'task');

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer flex flex-row items-center justify-between hover:bg-muted/30 transition-colors rounded-t-lg">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Closed Briefs
                <Badge variant="secondary" className="text-[10px] ml-1">{closedBriefs.length}</Badge>
              </CardTitle>
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-2 pt-0">
              {campaignBriefs.length > 0 && (
                <BriefFolder type="campaign" briefs={campaignBriefs} onSelectBrief={setSelectedBrief} />
              )}
              {lifecycleBriefs.length > 0 && (
                <BriefFolder type="lifecycle" briefs={lifecycleBriefs} onSelectBrief={setSelectedBrief} />
              )}
              {taskBriefs.length > 0 && (
                <BriefFolder type="task" briefs={taskBriefs} onSelectBrief={setSelectedBrief} />
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <BriefDetailModal
        brief={selectedBrief}
        open={!!selectedBrief}
        onOpenChange={(open) => { if (!open) setSelectedBrief(null); }}
        clientId={clientId}
        onUpdate={onRefresh}
      />
    </>
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
          <MetricCard icon={Send} label="Campaigns Sent" value={10} trend="Last 30 days" color="bg-blue-500/10 text-blue-600" />
          <MetricCard icon={Workflow} label="Lifecycle Flows Updated" value={4} trend="Last 30 days" color="bg-purple-500/10 text-purple-600" />
          <MetricCard icon={ListTodo} label="Open Briefs" value={briefCounts?.open ?? 0} color="bg-primary/10 text-primary" />
          <MetricCard icon={CheckCircle2} label="Closed Briefs" value={briefCounts?.completed ?? 0} trend="Last 30 days" color="bg-green-500/10 text-green-600" />
        </div>

        {/* Open Briefs Tracker — with folders */}
        <OpenBriefsTracker
          briefs={briefs || []}
          clientId={client?.id || ''}
          onRefresh={() => {}}
        />

        {/* Closed Briefs — now grouped by type */}
        <ClosedBriefsSection
          briefs={briefs || []}
          clientId={client?.id || ''}
          onRefresh={() => {}}
        />

        {/* AI Chat Module — expanded by default */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="h-3 w-3 text-primary-foreground" />
              </div>
              AI Chat
            </CardTitle>
          </CardHeader>
          <EmbeddedChat />
        </Card>

        <CreateBriefModal open={createBriefOpen} onOpenChange={setCreateBriefOpen} />
      </div>
    </AppLayout>
  );
}
