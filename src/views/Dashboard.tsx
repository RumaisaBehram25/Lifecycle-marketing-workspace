import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResolvedClientId, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { useBrazeDashboardClientId } from '@/hooks/useBrazeDashboardClientId';
import { useDashboardBrazeMetrics } from '@/hooks/useDashboardBrazeMetrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowRight, CheckCircle2,
  Workflow, Clock, Zap, Sparkles, ChevronDown, ChevronRight,
  FolderOpen, FileText, MessageSquare, Layers, Search,
  TrendingUp, TrendingDown, Minus, MailWarning,
  RefreshCw, Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  startDashboardBrazeFullSyncDetached,
  requestCancelDashboardBrazeFullSync,
  clearImplicitDashboardBrazeSyncSuppress,
} from '@/lib/brazeDashboardBackgroundSync';
import { useDashboardBrazeSyncHud } from '@/components/braze/BrazeDashboardSyncHud';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';
import { BriefDetailModal } from '@/components/briefs/BriefDetailModal';
import { useDriveBriefs, countSyncedDriveFiles } from '@/hooks/useDriveBriefs';
import { GoogleDriveBriefsPanel } from '@/components/briefs/GoogleDriveBriefsPanel';
import { BRCGIcon, BRCGLogo } from '@/components/BRCGLogo';
import { cn } from '@/lib/utils';
import {
  campaignCleanupSearchText,
  DASHBOARD_CAMPAIGN_HYGIENE_QK,
  fetchCampaignHygieneDirectory,
} from '@/lib/campaignHygiene';
import {
  dashBadgeSoft,
  dashIconChip,
  dashIconChipAccent,
  dashIconChipDestructive,
  dashIconChipSuccess,
  dashIconChipWarning,
  dashPill,
  dashRailAccent,
  dashRailDestructive,
  dashRailPrimary,
  dashRailWarning,
  dashRingInset,
  dashRowHover,
  dashSectionTitleBorder,
  dashShadowSm,
  dashSubtitleRule,
  dashWashBrand,
  dashWashPromo,
  dashboardMetricTile,
  dashboardSectionDotClass,
  dashboardSectionHeadingClass,
  dashboardSurfaceCard,
  dashboardSurfaceCardInteractive,
  dashboardTopAccentClass,
} from '@/lib/dashboard-surface';
import { UserGrowthHeroCard } from '@/components/dashboard/UserGrowthHeroCard';

function trendIconFromLabel(trend: string) {
  if (/\+[\d.]+%?/.test(trend)) return TrendingUp;
  if (/-[\d.]+%/.test(trend)) return TrendingDown;
  return Minus;
}

/** Large client-facing KPI tile with optional trend line (matches User Growth tile language). */
function ClientProminentMetric({
  icon: Icon,
  label,
  value,
  trendText,
  footnote,
  accentClass,
  railClass = dashRailPrimary,
  warnZero,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  trendText?: string;
  footnote?: string;
  accentClass: string;
  /** Left accent rail color (Tailwind border-l-*). */
  railClass?: string;
  warnZero?: boolean;
}) {
  const numeric =
    typeof value === 'number'
      ? value
      : value === '—'
        ? null
        : Number(String(value).replace(/,/g, ''));
  const showWarn = warnZero && numeric === 0;
  const TrendIc = trendText ? trendIconFromLabel(trendText) : null;

  return (
    <Card className={cn(dashboardMetricTile, railClass)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className={accentClass}>
            <Icon className="h-5 w-5" />
          </div>
          {showWarn ? (
            <span
              className="shrink-0 rounded-md border border-warning/35 bg-warning/12 px-1.5 py-0.5 text-xs font-semibold text-warning-foreground"
              title="Zero — may indicate missing sync or pipeline issue"
            >
              ⚠️
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">{value}</p>
        {trendText ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            {TrendIc ? (
              <TrendIc
                className={cn(
                  'h-4 w-4 shrink-0',
                  /\+[\d.]+%?/.test(trendText)
                    ? 'text-success'
                    : /-[\d.]+%/.test(trendText)
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                )}
              />
            ) : null}
            <span className="leading-snug">{trendText}</span>
          </p>
        ) : null}
        {footnote ? <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">{footnote}</p> : null}
      </CardContent>
    </Card>
  );
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
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
      className={cn(
        'p-3 rounded-xl border border-border/60 bg-card/95 cursor-pointer',
        dashShadowSm,
        dashRingInset,
        dashRowHover,
      )}
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
      <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
        <span className="min-w-0 truncate">{brief.about ? brief.about.slice(0, 48) + (brief.about.length > 48 ? '…' : '') : '—'}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {brief.conversation_id && (
            <MessageSquare className="h-3 w-3 text-primary/80" aria-label="Linked chat" />
          )}
          {brief.deadline && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Due {format(new Date(brief.deadline), 'MMM d')}
            </span>
          )}
        </span>
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
      <CollapsibleTrigger
        className={cn(
          'flex items-center gap-2 w-full p-2.5 rounded-xl border border-transparent',
          'hover:bg-muted/40 hover:border-border/50 transition-all',
        )}
      >
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

export function ClosedBriefsSection({ briefs, clientId, onRefresh }: { briefs: any[]; clientId: string; onRefresh: () => void }) {
  const [selectedBrief, setSelectedBrief] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const closedBriefs = briefs.filter(b => ['complete', 'live'].includes(b.status));

  if (closedBriefs.length === 0) return null;

  // Group closed briefs by type
  const campaignBriefs = closedBriefs.filter(b => b.content_type === 'campaign');
  const lifecycleBriefs = closedBriefs.filter(b => b.content_type === 'lifecycle');
  const taskBriefs = closedBriefs.filter(b => b.content_type === 'task');

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className={dashboardSurfaceCard}>
          <div className={dashboardTopAccentClass} aria-hidden />
          <CollapsibleTrigger asChild>
            <CardHeader
              className={cn(
                'pb-3 cursor-pointer flex flex-row items-center justify-between hover:bg-primary/[0.03] transition-colors rounded-t-none',
                dashSectionTitleBorder,
              )}
            >
              <CardTitle className="text-2xl sm:text-3xl font-bold font-heading tracking-tight flex items-center gap-2">
                <span className={cn(dashIconChipSuccess, 'h-8 w-8 shrink-0 rounded-lg')}>
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                Closed Briefs
                <Badge variant="secondary" className="text-[10px] ml-1">{closedBriefs.length}</Badge>
              </CardTitle>
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-2 pt-4 pb-5 px-6">
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
  const { clientId } = useResolvedClientId();
  const { clientId: brazeMetricsClientId } = useBrazeDashboardClientId();
  const { data: platforms } = useDoubleGoodPlatforms();
  const brazePlatform = platforms?.find((p) => p.platform === 'braze');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const brazeSyncHud = useDashboardBrazeSyncHud();
  const [hygieneSearch, setHygieneSearch] = useState('');

  const handleSyncAll = useCallback(async () => {
    if (!clientId || !brazePlatform?.id) return;
    clearImplicitDashboardBrazeSyncSuppress(clientId, brazePlatform.id);
    try {
      const result = await startDashboardBrazeFullSyncDetached({
        clientId,
        platformId: brazePlatform.id,
        queryClient,
      });
      if (result.cancelled) {
        toast({
          title: 'Sync stopped',
          description:
            result.campaignRounds === 0 && result.touchpointChunks === 0
              ? 'Stopped before the first sync step finished. The Dashboard will not auto-sync again until you use “Sync All from Braze”.'
              : `Stopped between steps after ${result.campaignRounds} campaign round${result.campaignRounds === 1 ? '' : 's'} and ${result.touchpointChunks} touchpoint chunk${result.touchpointChunks === 1 ? '' : 's'} (KPI/metrics may be skipped). Reopening the Dashboard will not restart sync until you run “Sync All from Braze”.`,
        });
        return;
      }
      toast({
        title: 'Sync complete',
        description: `Campaigns (${result.campaignRounds} rounds) + touchpoints (${result.touchpointChunks} chunks) + KPI/metrics synced.`,
      });
    } catch (err: unknown) {
      console.error('[Sync All] Error:', err);
      toast({ title: 'Sync failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  }, [clientId, brazePlatform?.id, queryClient, toast]);

  const handleBrazeSyncButtonClick = useCallback(() => {
    if (brazeSyncHud.running) {
      requestCancelDashboardBrazeFullSync();
      return;
    }
    void handleSyncAll();
  }, [brazeSyncHud.running, handleSyncAll]);

  // DISABLED: Re-entering the Dashboard no longer starts throttled background Braze sync.
  // Sync only when the user clicks “Sync All from Braze”.
  //
  // Previous logic:
  // useEffect(() => {
  //   if (!clientId || !brazePlatform?.id) return;
  //   const t = window.setTimeout(() => {
  //     void tryStartImplicitDashboardBrazeSync({
  //       clientId,
  //       platformId: brazePlatform.id,
  //       queryClient,
  //       minIntervalMs: 25_000,
  //     });
  //   }, 800);
  //   return () => window.clearTimeout(t);
  // }, [clientId, brazePlatform?.id, queryClient]);

  const refreshBriefs = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-briefs', clientId] });
    queryClient.invalidateQueries({ queryKey: ['brief-counts', clientId] });
  };
  const {
    canvasStats: brazeCanvas,
    segmentCount: brazeSegmentCount,
    segmentDirectorySource: brazeSegmentDirectorySource,
    scheduled: brazeScheduled,
    scheduledIsError: brazeScheduledIsError,
    derived: brazeDerived,
    syncHealth: brazeSyncHealth,
  } = useDashboardBrazeMetrics();
  const { data: driveBriefs = [], isFetching: driveBriefsLoading } = useDriveBriefs(clientId);
  const driveFileCount = useMemo(() => countSyncedDriveFiles(driveBriefs), [driveBriefs]);
  const { data: driveConnections = [] } = useQuery({
    queryKey: ['dashboard-drive-connections', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await (supabase as any)
        .from('client_google_drive')
        .select('id,last_synced_at')
        .eq('client_id', clientId)
        .order('connected_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; last_synced_at: string | null }>;
    },
    enabled: !!clientId,
  });
  const latestDriveSync = driveConnections
    .map((c) => c.last_synced_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  const { data: briefs } = useQuery({
    queryKey: ['dashboard-briefs', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('briefs')
        .select('*')
        .eq('client_id', clientId)
        .order('deadline', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });

  const pillarItems = useMemo(() => {
    const p = brazeCanvas.pillars;
    if (!p || p === '—') return [];
    return p.split(' · ').map((s) => s.trim()).filter(Boolean);
  }, [brazeCanvas.pillars]);

  const { data: lifecycleFlowsUpdated = 0 } = useQuery({
    queryKey: ['dashboard-lifecycle-updated-30d', brazeMetricsClientId],
    queryFn: async () => {
      const cid = brazeMetricsClientId;
      if (!cid) return 0;
      const cutoffIso = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
      const { count, error } = await supabase
        .from('braze_canvases')
        .select('id', { count: 'exact' })
        .eq('client_id', cid)
        .or('archived.is.null,archived.eq.false')
        .gte('updated_at', cutoffIso)
        .limit(1);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!brazeMetricsClientId,
  });

  const { data: campaignDirectoryRows = [] } = useQuery({
    queryKey: [DASHBOARD_CAMPAIGN_HYGIENE_QK, brazeMetricsClientId],
    queryFn: async () => {
      if (!brazeMetricsClientId) return [];
      return fetchCampaignHygieneDirectory(brazeMetricsClientId);
    },
    enabled: !!brazeMetricsClientId,
    staleTime: 30_000,
  });

  const hygieneQuery = hygieneSearch.trim().toLowerCase();
  const filteredHygieneRows = campaignDirectoryRows
    .filter((r) => {
      if (!hygieneQuery) return true;
      return campaignCleanupSearchText(r as Record<string, unknown>).toLowerCase().includes(hygieneQuery);
    })
    .slice(0, 200);

  useEffect(() => {
    if (import.meta.env.PROD || !clientId || !brazeMetricsClientId) return;
    if (clientId !== brazeMetricsClientId) {
      console.info(
        '[workspace-metrics] Braze KPI/email/segment reads use clients.id',
        brazeMetricsClientId.slice(0, 8) + '…',
        '— Drive/briefs use',
        clientId.slice(0, 8) + '…',
        '(admin: latest Braze sync when the BRCG workspace has no Braze row).',
      );
    }
  }, [clientId, brazeMetricsClientId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#braze-sync-all') return;
    requestAnimationFrame(() => {
      document.getElementById('braze-sync-all')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
        {/* Brand Header — anchor for #braze-sync-all (Campaigns / Lifecycle / Analytics deep links) */}
        <Card id="braze-sync-all" className={dashboardSurfaceCardInteractive}>
          <div className={dashboardTopAccentClass} aria-hidden />
          <CardContent className={cn('p-6', dashWashBrand)}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 ring-2 ring-primary/15">
                <BRCGIcon className="h-8 w-8 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <BRCGLogo className="h-7 w-auto text-foreground" />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={dashPill}>Live</span>
                  <p className="text-sm text-muted-foreground">CRM Copilot — Lifecycle marketing command center</p>
                </div>
              </div>
              {brazePlatform && (
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Button
                    type="button"
                    onClick={handleBrazeSyncButtonClick}
                    variant={brazeSyncHud.running ? 'secondary' : 'outline'}
                    size="sm"
                    aria-label={brazeSyncHud.running ? 'Stop Braze sync' : 'Sync all from Braze'}
                    title={brazeSyncHud.running ? 'Click to stop (finishes the current step first)' : undefined}
                  >
                    {brazeSyncHud.running ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {brazeSyncHud.running ? 'Syncing…' : 'Sync All from Braze'}
                  </Button>
                  {brazeSyncHud.running && brazeSyncHud.status && (
                    <p className="text-xs text-muted-foreground animate-pulse max-w-[250px] text-right">
                      {brazeSyncHud.status}
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <UserGrowthHeroCard />

        {/* Client-facing metrics */}
        <Card className={cn(dashboardSurfaceCard, 'shadow-md')}>
          <div className={dashboardTopAccentClass} aria-hidden />
          <CardHeader className={cn('pb-2 pt-4 bg-gradient-to-r from-primary/[0.07] via-card to-transparent', dashSectionTitleBorder)}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className={cn(dashboardSectionHeadingClass, 'text-2xl sm:text-3xl font-bold tracking-tight')}>
                  <span className={dashboardSectionDotClass} aria-hidden />
                  Performance &amp; connections
                </h2>
                <p className={cn('text-xs text-muted-foreground mt-1.5 pl-3 ml-0.5', dashSubtitleRule)}>
                  Key health metrics your team sees at a glance
                </p>
              </div>
              <Badge variant="secondary" className={cn(dashPill, 'border-0')}>
                Live data
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 pb-5 space-y-4 bg-muted/10">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            <ClientProminentMetric
              icon={MailWarning}
              label="Open Rate"
              value={formatPercent(brazeDerived.openRate)}
              footnote="Calculated as total opens / total delivered across synced campaigns (all channels)"
              railClass={dashRailWarning}
              accentClass={cn(dashIconChipWarning, 'h-10 w-10 rounded-xl')}
            />
            <ClientProminentMetric
              icon={TrendingUp}
              label="Click Rate"
              value={formatPercent(brazeDerived.clickRate)}
              footnote="Calculated as total clicks / total delivered across synced campaigns (all channels)"
              railClass={dashRailDestructive}
              accentClass={cn(dashIconChipDestructive, 'h-10 w-10 rounded-xl')}
            />
            <ClientProminentMetric
              icon={Minus}
              label="Unsubscribe Rate"
              value={formatPercent(brazeDerived.unsubRate)}
              footnote="Calculated as total unsubscribes / total delivered across synced campaigns (all channels)"
              railClass={dashRailPrimary}
              accentClass={cn(dashIconChip, 'h-10 w-10 rounded-xl')}
            />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            <ClientProminentMetric
              icon={Workflow}
              label="Enabled canvases"
              value={brazeCanvas.enabledInBraze.toLocaleString()}
              footnote={`${brazeCanvas.syncedTotal.toLocaleString()} total synced (non-archived) · ${lifecycleFlowsUpdated} updated in last 30d`}
              railClass={dashRailAccent}
              accentClass={cn(dashIconChipAccent, 'h-10 w-10 rounded-xl')}
              warnZero={!!brazeMetricsClientId && brazeCanvas.enabledInBraze === 0 && brazeCanvas.syncedTotal > 0}
            />
            <ClientProminentMetric
              icon={Layers}
              label="Braze segments"
              value={brazeSegmentCount.toLocaleString()}
              footnote={
                brazeSegmentDirectorySource === 'csv'
                  ? 'Distinct segments from segment analytics CSV (Resources)'
                  : 'Directory from Braze segments/list sync (or CSV if sync not run yet)'
              }
              railClass={dashRailWarning}
              accentClass={cn(dashIconChipWarning, 'h-10 w-10 rounded-xl')}
              warnZero={!!brazeMetricsClientId && brazeSegmentCount === 0}
            />
            <ClientProminentMetric
              icon={FileText}
              label="Google Drive files"
              value={driveBriefsLoading ? '…' : driveFileCount.toLocaleString()}
              footnote={
                driveBriefsLoading
                  ? 'Refreshing…'
                  : `${driveConnections.length} folder connection${driveConnections.length === 1 ? '' : 's'}${latestDriveSync ? ` · last sync ${format(new Date(latestDriveSync), 'MMM d, p')}` : ''}`
              }
              railClass={dashRailPrimary}
              accentClass={cn(dashIconChip, 'h-10 w-10 rounded-xl')}
            />
            </div>
          </CardContent>
        </Card>

        <GoogleDriveBriefsPanel
          clientId={clientId}
          driveBriefs={driveBriefs}
          isFetching={driveBriefsLoading}
        />

        <div className="space-y-3">
          <Card className={cn(dashboardSurfaceCard, 'shadow-md')}>
            <div className={dashboardTopAccentClass} aria-hidden />
            <CardHeader className={cn('pb-2 pt-4 bg-gradient-to-r from-primary/[0.07] via-card to-transparent', dashSectionTitleBorder)}>
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl sm:text-3xl font-bold font-heading tracking-tight">
                  <span className={cn(dashIconChipWarning, 'h-8 w-8 shrink-0 rounded-lg')}>
                    <Workflow className="h-4 w-4" />
                  </span>
                  Campaign Hygiene
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Same workspace as Drive &amp; KPIs — Braze sync or campaign analytics CSV. Search matches name, id,
                  tags, status, channel.
                </p>
              </div>
              <div className="relative mt-2 max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={hygieneSearch}
                  onChange={(e) => setHygieneSearch(e.target.value)}
                  placeholder="Search name, id, tags, status…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="pb-4 pt-3 bg-muted/10">
              <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Last update</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHygieneRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-8 text-center text-xs text-muted-foreground">
                            {campaignDirectoryRows.length === 0
                              ? 'No campaigns yet. Sync Braze or upload campaign analytics CSV for this workspace.'
                              : 'No campaigns match your search.'}
                          </td>
                        </tr>
                      ) : (
                        filteredHygieneRows.map((row, i) => (
                          <tr key={`${String(row.name)}-${i}`} className="border-t border-border/60">
                            <td className="px-3 py-2.5 text-sm font-medium">{String(row.name ?? 'Campaign')}</td>
                            <td className="px-3 py-2.5 text-xs">{String(row.status ?? '—')}</td>
                            <td className="px-3 py-2.5 text-xs">
                              {row.updated_at ? format(new Date(String(row.updated_at)), 'MMM d, yyyy') : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={cn(dashboardSurfaceCard, 'shadow-sm')}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Lifecycle preview</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Braze canvases, Canvas tags, and per-canvas steps after sync — same analytics workspace as KPIs when
                  Braze is connected.
                </p>
              </div>
              <Button variant="secondary" size="sm" className="shrink-0" asChild>
                <Link to="/lifecycle" className="inline-flex items-center gap-1.5">
                  Open Lifecycle
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Closed Briefs — now grouped by type */}
        <ClosedBriefsSection
          briefs={briefs || []}
          clientId={clientId || ''}
          onRefresh={refreshBriefs}
        />

        {/* CRM Copilot — full experience lives on AI Chat tab (single place for history + Grok) */}
        <Card className={dashboardSurfaceCardInteractive}>
          <div className={dashboardTopAccentClass} aria-hidden />
          <CardContent className={cn('p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4', dashWashPromo)}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 ring-2 ring-primary/15">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-foreground">AI Chat — CRM Copilot</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Conversations, Grok-powered replies, and saved history are all in the{' '}
                <span className="text-foreground font-medium">AI Chat</span> tab. Use the sidebar or the button below — nothing runs inline on the dashboard anymore.
              </p>
            </div>
            <Button className="shrink-0 sm:self-center" size="lg" asChild>
              <Link to="/chat">
                Open AI Chat
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

      </div>
  );
}
