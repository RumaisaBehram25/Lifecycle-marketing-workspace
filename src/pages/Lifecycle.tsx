import { useState, useMemo, useEffect } from 'react';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import { cn } from '@/lib/utils';
import {
  dashPill,
  dashSectionTitleBorder,
  dashIconChip,
  dashStickinessPanel,
  dashSubtitleRule,
  dashboardMetricTile,
  dashboardSectionHeadingClass,
  dashboardSurfaceCard,
  dashboardSurfaceCardInteractive,
  dashboardTopAccentClass,
} from '@/lib/dashboard-surface';
import { useDoubleGoodClient, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LoadingPage } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Search, 
  Mail, 
  Smartphone, 
  Bell, 
  ArrowRight,
  ArrowLeft,
  Sparkles,
  TrendingUp,
  Gift,
  Heart,
  Zap,
  Calendar,
  ChevronRight,
  LayoutGrid,
  List,
  Workflow,
  Pencil,
  Check,
  X,
  Users,
  Timer,
  GitBranch,
  Filter,
  ShoppingCart,
  Star,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { parseCampaignTaxonomy, getChannelColor, getTypeColor } from '@/lib/campaign-taxonomy';
import {
  countMessagingTouchpoints,
  getLifecycleStepChannel,
  isMessagingTouchpointStep,
  normalizeRawSteps,
  type LifecycleCanvasStep,
} from '@/lib/lifecycleCanvasSteps';
import { HorizontalFlowChart } from '@/components/creative/HorizontalFlowChart';
import { BRCGIcon } from '@/components/BRCGLogo';

// Type definitions
type CanvasStep = LifecycleCanvasStep;

interface CanvasVariant {
  name: string;
  percentage: number;
  first_step_id: string | null;
}

interface BrazeSchemaCache {
  canvases?: any[];
  last_sync?: string;
}

/**
 * Mirrors PostgREST order: entries_last_60d desc nulls last, last_entry desc nulls first, name asc.
 * Sorting in-app avoids fragile multi-column ORDER BY (can surface as HTTP 500 on some DB/PostgREST setups).
 */
function sortLifecycleCanvases<
  T extends {
    entries_last_60d?: number | null;
    last_entry?: string | null;
    name?: string | null;
  },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aE =
      typeof a.entries_last_60d === 'number' && !Number.isNaN(a.entries_last_60d)
        ? a.entries_last_60d
        : null;
    const bE =
      typeof b.entries_last_60d === 'number' && !Number.isNaN(b.entries_last_60d)
        ? b.entries_last_60d
        : null;
    if (aE == null && bE == null) {
      /* tie-break last_entry */
    } else if (aE == null) return 1;
    else if (bE == null) return -1;
    else if (bE !== aE) return bE - aE;

    const aMs = a.last_entry ? Date.parse(String(a.last_entry)) : NaN;
    const bMs = b.last_entry ? Date.parse(String(b.last_entry)) : NaN;
    const aNull = Number.isNaN(aMs);
    const bNull = Number.isNaN(bMs);
    if (aNull && bNull) {
      /* tie-break name */
    } else if (aNull && !bNull) return -1;
    else if (!aNull && bNull) return 1;
    else if ((bMs as number) !== (aMs as number)) return (bMs as number) - (aMs as number);

    return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
      sensitivity: 'base',
    });
  });
}

/** Match Analytics page section styling. */
const lifecycleSectionHeadingClass = cn(
  dashboardSectionHeadingClass,
  'text-2xl sm:text-3xl font-bold tracking-tight',
);

const lifecycleCardClass = cn(dashboardSurfaceCard, 'shadow-md');

const lifecycleCardHeaderClass = cn(
  'pb-2 pt-4 bg-gradient-to-r from-primary/[0.07] via-card to-transparent',
  dashSectionTitleBorder,
);

const lifecycleSubtitleClass = cn('text-xs text-muted-foreground mt-1.5 pl-3 ml-0.5', dashSubtitleRule);

type LifecycleMetricAccent = 'primary' | 'violet' | 'emerald' | 'amber';

const lifecycleMetricRail: Record<LifecycleMetricAccent, string> = {
  primary: 'border-l-primary/55',
  violet: 'border-l-violet-500/50',
  emerald: 'border-l-emerald-500/50',
  amber: 'border-l-amber-500/50',
};

function LifecycleMetricTile({
  icon: Icon,
  label,
  value,
  color,
  accent = 'primary',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  accent?: LifecycleMetricAccent;
}) {
  return (
    <div className={cn(dashboardMetricTile, 'border-l-[3px]', lifecycleMetricRail[accent])}>
      <div className="p-4 sm:p-5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-black/5 dark:ring-white/10',
              color,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-xs font-medium uppercase tracking-wide leading-snug text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default function Lifecycle() {
  const { data: client, isLoading: clientLoading } = useDoubleGoodClient();
  const { data: platforms } = useDoubleGoodPlatforms();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('All');
  const [launchDateFilter, setLaunchDateFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedJourney, setSelectedJourney] = useState<any>(null);
  const [selectedTouchpoint, setSelectedTouchpoint] = useState<any>(null);

  /** Only show lifecycle data when Braze is connected with API credentials — no mock/cached list. */
  const hasBrazeApi = Boolean(platforms?.some(p => p.platform === 'braze' && p.is_connected));
  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const brazeJsonCache = brazePlatform?.schema_cache as BrazeSchemaCache | undefined;

  // Fetch canvases from normalized table (synced rows only — avoids flooding the tab with schema_cache dumps)
  const { data: normalizedCanvases, isLoading: canvasesLoading } = useQuery({
    queryKey: ['braze_canvases', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('braze_canvases')
        .select('*')
        .eq('client_id', client.id)
        .eq('archived', false)
        .eq('draft', false)
        .eq('enabled', true);
      if (error) throw error;
      return sortLifecycleCanvases(data ?? []);
    },
    enabled: !!client?.id && hasBrazeApi,
  });

  // Fetch visibility settings
  const { data: visibilityData } = useQuery({
    queryKey: ['data-visibility-canvas', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('data_visibility')
        .select('*')
        .eq('client_id', client.id)
        .eq('item_type', 'canvas');
      if (error) throw error;
      return data as Array<{ item_id: string; is_visible: boolean }>;
    },
    enabled: !!client?.id && hasBrazeApi,
  });

  const visibilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    visibilityData?.forEach(v => map.set(v.item_id, v.is_visible));
    return map;
  }, [visibilityData]);

  // Transform canvases to journey format (DB sync only; optional step hydration from schema_cache)
  const journeys = useMemo(() => {
    if (!hasBrazeApi) return [];

    const rawSource: unknown[] = Array.isArray(normalizedCanvases) ? normalizedCanvases : [];

    if (rawSource.length === 0) return [];

    return rawSource.map((canvasRaw) => {
      const canvas = canvasRaw as Record<string, unknown>;
      const name = (canvas.name as string) ?? '';
      const taxonomy = parseCampaignTaxonomy(name);

      let stepsRecord = normalizeRawSteps(canvas.raw_steps ?? canvas.steps);
      if (Object.keys(stepsRecord).length === 0 && brazeJsonCache?.canvases?.length) {
        const brazeId = String(canvas.braze_canvas_id ?? canvas.id ?? '');
        const cached = (brazeJsonCache.canvases as Record<string, unknown>[]).find(
          (c) => String(c.id ?? '') === brazeId,
        );
        if (cached?.steps) {
          stepsRecord = normalizeRawSteps(cached.steps);
        }
      }

      const stepsList = Object.values(stepsRecord);

      let inferredChannels: string[] = [];
      if (stepsList.length > 0) {
        const channels = stepsList
          .map((s) => getLifecycleStepChannel(s as LifecycleCanvasStep))
          .filter(Boolean);
        inferredChannels = [...new Set(channels)];
      }
      if (inferredChannels.length === 0) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('email') || taxonomy.channel === 'email') inferredChannels.push('email');
        if (nameLower.includes('push')) inferredChannels.push('push');
        if (nameLower.includes('sms')) inferredChannels.push('sms');
        if (nameLower.includes('in-app') || nameLower.includes('in_app')) inferredChannels.push('in_app_message');
        if (inferredChannels.length === 0) inferredChannels.push('email');
      }

      const messageStepCount = countMessagingTouchpoints(stepsRecord);

      const canvasId = (canvas.braze_canvas_id ?? canvas.id ?? '') as string;

      return {
        id: canvasId,
        name,
        displayName: taxonomy.displayName,
        description: (canvas.description as string | undefined) || 'Automated lifecycle journey',
        status: 'active' as const,
        tags: (canvas.tags as string[] | undefined) || [],
        channels: inferredChannels,
        first_entry: canvas.first_entry as string | undefined,
        last_entry: canvas.last_entry as string | undefined,
        taxonomy: { ...taxonomy, type: 'lifecycle' as const },
        variants: ((canvas.raw_variants ?? canvas.variants ?? []) as CanvasVariant[]),
        steps: stepsRecord,
        total_steps: messageStepCount,
        entry_type: canvas.entry_type as string | undefined,
        entry_segment_name: canvas.entry_segment_name as string | undefined,
        trigger_event_name: canvas.trigger_event_name as string | undefined,
        exception_events: canvas.exception_events as string[] | undefined,
        conversion_events: canvas.conversion_events,
        entry_filters: canvas.entry_filters,
        entries_last_30d: canvas.entries_last_30d as number | undefined,
        entries_last_60d: canvas.entries_last_60d as number | undefined,
        schedule_type: canvas.schedule_type as string | undefined,
      };
    });
  }, [normalizedCanvases, brazeJsonCache?.canvases, hasBrazeApi]);

  const isItemVisible = (canvasId: string) => {
    const explicitSetting = visibilityMap.get(canvasId);
    if (explicitSetting !== undefined) return explicitSetting;
    return true;
  };

  // Filter journeys
  const filteredJourneys = useMemo(() => {
    return journeys.filter(journey => {
      if (!isItemVisible(journey.id)) return false;

      const matchesSearch = journey.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           journey.description?.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesChannel = true;
      if (channelFilter !== 'All') {
        matchesChannel = journey.channels?.some(ch => {
          const normalizedCh = ch.toLowerCase().replace(/[-_]/g, '');
          const normalizedFilter = channelFilter.toLowerCase().replace(/[-_]/g, '');
          return normalizedCh === normalizedFilter || normalizedCh.includes(normalizedFilter) || normalizedFilter.includes(normalizedCh);
        }) || false;
      }

      let matchesLaunchDate = true;
      if (launchDateFilter !== 'All') {
        if (!journey.first_entry) {
          matchesLaunchDate = false;
        } else {
          const launchDate = new Date(journey.first_entry);
          const daysDiff = Math.floor((Date.now() - launchDate.getTime()) / (1000 * 60 * 60 * 24));
          if (launchDateFilter === '7days') matchesLaunchDate = daysDiff <= 7;
          else if (launchDateFilter === '30days') matchesLaunchDate = daysDiff <= 30;
          else if (launchDateFilter === '90days') matchesLaunchDate = daysDiff <= 90;
        }
      }

      return matchesSearch && matchesChannel && matchesLaunchDate;
    }).sort((a, b) => {
      const aEntries = (a as any).entries_last_60d ?? 0;
      const bEntries = (b as any).entries_last_60d ?? 0;
      return bEntries - aEntries;
    });
  }, [journeys, searchQuery, channelFilter, launchDateFilter, visibilityMap]);

  const listLoading =
    hasBrazeApi && (clientLoading || (!!client?.id && canvasesLoading));

  const entries60dTotal = useMemo(
    () =>
      filteredJourneys.reduce(
        (s, j) => s + (Number((j as { entries_last_60d?: number }).entries_last_60d) || 0),
        0,
      ),
    [filteredJourneys],
  );

  const messagingStepsTotal = useMemo(
    () =>
      filteredJourneys.reduce(
        (s, j) => s + countMessagingTouchpoints(normalizeRawSteps(j.steps)),
        0,
      ),
    [filteredJourneys],
  );

  return (
    <AppLayout>
      <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-b from-background via-primary/[0.02] to-muted/20">
        <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <PageHeader
              title="Lifecycle"
              description={
                hasBrazeApi
                  ? 'Multi-touch journeys from Braze canvases synced to your workspace (not from sample data).'
                  : 'Synced journeys from Braze appear here after you connect.'
              }
              titleClassName="text-4xl sm:text-5xl"
            />
            {hasBrazeApi && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className={cn(dashPill, 'border-0 text-[10px]')}>
                  Braze connected
                </Badge>
              </div>
            )}
          </div>

          {!hasBrazeApi && (
            <div
              className={cn(
                'mx-auto w-full max-w-md rounded-3xl border border-border/70',
                'bg-gradient-to-b from-card to-muted/20',
                'px-8 py-12 shadow-[0_1px_0_0_hsl(var(--border))] sm:px-10 sm:py-14',
                'ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
              )}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    'mb-8 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full',
                    'bg-primary/[0.07] text-primary shadow-inner',
                    'ring-1 ring-primary/15',
                  )}
                  aria-hidden
                >
                  <Workflow className="h-9 w-9" strokeWidth={1.25} />
                </div>
                <h2 className="text-balance text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
                  Lifecycle journeys are hidden until Braze is connected.
                </h2>
                <p className="mt-4 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
                  Add your Braze API credentials on Platforms. This page only lists canvases after sync—not embedded
                  schema cache—so this tab stays clean.
                </p>
                <Button
                  asChild
                  size="lg"
                  className="mt-9 min-w-[200px] rounded-full px-8 font-medium shadow-sm"
                >
                  <Link to="/platforms" className="inline-flex items-center justify-center gap-2">
                    Connect Braze
                    <ArrowRight className="h-4 w-4 opacity-90" />
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Filters — only when API connected */}
          {hasBrazeApi && (
            <Card className={lifecycleCardClass}>
              <div className={dashboardTopAccentClass} aria-hidden />
              <CardHeader className={lifecycleCardHeaderClass}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle
                      className={cn(
                        lifecycleSectionHeadingClass,
                        'flex flex-wrap items-center gap-2 text-foreground/95',
                      )}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/12 text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-400">
                        <Filter className="h-4 w-4" />
                      </span>
                      Find journeys
                    </CardTitle>
                    <p className={lifecycleSubtitleClass}>Search and filter by channel or launch window</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="border-t border-primary/5 bg-muted/10 pb-5 pt-4">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex flex-wrap gap-3">
                    <div className="relative min-w-[200px] max-w-md flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/50" />
                      <Input
                        placeholder="Search journeys..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-10 border-primary/15 bg-background/80 pl-10 shadow-sm focus-visible:ring-primary/25"
                      />
                    </div>

                    <Select value={channelFilter} onValueChange={setChannelFilter}>
                      <SelectTrigger className="h-10 w-[140px] border-primary/15 bg-background/80 shadow-sm">
                        <SelectValue placeholder="Channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All Channels</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="push">Push</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="inapp">In-App</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={launchDateFilter} onValueChange={setLaunchDateFilter}>
                      <SelectTrigger className="h-10 w-[150px] border-primary/15 bg-background/80 shadow-sm">
                        <SelectValue placeholder="Date range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All Time</SelectItem>
                        <SelectItem value="7days">Last 7 Days</SelectItem>
                        <SelectItem value="15days">Last 15 Days</SelectItem>
                        <SelectItem value="30days">Last 30 Days</SelectItem>
                        <SelectItem value="90days">Last 90 Days</SelectItem>
                        <SelectItem value="year">Last 12 Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-primary/10 bg-card/60 p-1 shadow-inner">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="icon"
                      className={cn(viewMode === 'grid' && 'shadow-sm')}
                      onClick={() => setViewMode('grid')}
                      aria-pressed={viewMode === 'grid'}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="icon"
                      className={cn(viewMode === 'list' && 'shadow-sm')}
                      onClick={() => setViewMode('list')}
                      aria-pressed={viewMode === 'list'}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {hasBrazeApi && !listLoading && journeys.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <LifecycleMetricTile
                icon={Workflow}
                label="Synced journeys"
                value={String(journeys.length)}
                color="bg-primary/12 text-primary"
                accent="primary"
              />
              <LifecycleMetricTile
                icon={Filter}
                label="Showing (filters)"
                value={String(filteredJourneys.length)}
                color="bg-violet-500/12 text-violet-600 dark:text-violet-400"
                accent="violet"
              />
              <LifecycleMetricTile
                icon={Users}
                label="Entries (60d)"
                value={entries60dTotal.toLocaleString()}
                color="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                accent="emerald"
              />
              <LifecycleMetricTile
                icon={GitBranch}
                label="Messaging steps"
                value={String(messagingStepsTotal)}
                color="bg-amber-500/12 text-amber-600 dark:text-amber-400"
                accent="amber"
              />
            </div>
          )}

          {/* Journeys Grid/List */}
          {selectedJourney ? (
            <JourneyDetail
              journey={selectedJourney}
              clientId={client?.id}
              onBack={() => setSelectedJourney(null)}
              onViewTouchpoint={(step: unknown) => setSelectedTouchpoint(step)}
            />
          ) : !hasBrazeApi ? null : listLoading ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4 p-6">
              <LoadingPage message="Loading journeys…" />
            </div>
          ) : (
            <Card className={lifecycleCardClass}>
              <div className={dashboardTopAccentClass} aria-hidden />
              <CardHeader className={lifecycleCardHeaderClass}>
                <CardTitle className={cn(lifecycleSectionHeadingClass, 'flex flex-wrap items-center gap-2 text-foreground/95')}>
                  <span className={cn(dashIconChip, 'h-9 w-9 shrink-0')}>
                    <Workflow className="h-4 w-4" />
                  </span>
                  Your journeys
                </CardTitle>
                <p className={lifecycleSubtitleClass}>
                  Open a journey to explore steps, triggers, and message previews. Counts reflect the filtered list below.
                </p>
              </CardHeader>
              <CardContent className="bg-muted/10 pb-6 pt-2">
                <div className={viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
                  {journeys.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed border-primary/20 bg-gradient-to-br from-muted/30 via-card to-primary/[0.04] py-14 px-6 text-center">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
                        <Workflow className="h-7 w-7 text-primary" />
                      </div>
                      <p className="font-heading text-lg font-semibold text-foreground">No journeys synced yet</p>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                        This list only includes canvases stored after a Braze sync. Run sync from Campaigns (or your
                        pipeline) so rows appear in{' '}
                        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">braze_canvases</code>.
                      </p>
                      <Button variant="outline" size="sm" className="mt-4" asChild>
                        <Link to="/campaigns" className="inline-flex items-center gap-2">
                          Open Campaigns to sync
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  ) : filteredJourneys.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed border-primary/20 bg-gradient-to-br from-muted/30 via-card to-primary/[0.04] py-14 px-6 text-center">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
                        <Filter className="h-7 w-7 text-primary" />
                      </div>
                      <p className="font-heading text-lg font-semibold text-foreground">No journeys match</p>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                        Try adjusting search or filters. Hidden canvases can be controlled from Settings → data visibility.
                      </p>
                    </div>
                  ) : (
                    filteredJourneys.map((journey) => (
                      <JourneyCard
                        key={journey.id}
                        journey={journey}
                        viewMode={viewMode}
                        onClick={() => setSelectedJourney(journey)}
                      />
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Touchpoint Creative Modal */}
      <Dialog open={!!selectedTouchpoint} onOpenChange={() => setSelectedTouchpoint(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto border-primary/15 bg-card/95 shadow-2xl shadow-primary/10 backdrop-blur-sm">
          <DialogHeader className="space-y-1 border-b border-primary/10 pb-4">
            <DialogTitle className="flex items-center gap-3 text-xl font-heading">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
                <ChannelIcon channel={selectedTouchpoint?.channel || 'email'} size="lg" />
              </span>
              <span className="leading-snug">{selectedTouchpoint?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {selectedTouchpoint?.channel === 'email' ? 'Email creative preview' :
               selectedTouchpoint?.channel === 'push' ? 'Push notification preview' :
               selectedTouchpoint?.channel?.includes('in_app') || selectedTouchpoint?.channel?.includes('in-app') ? 'In-app message preview' :
               'Message preview'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTouchpoint && (() => {
            const messages = selectedTouchpoint.messages || [];
            const channel = (selectedTouchpoint.channel || 'email').toLowerCase();
            const message = messages.find((m: any) => m.channel?.toLowerCase().includes(channel.split('_')[0])) || messages[0];
            
            return (
              <div className="space-y-4 mt-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={getChannelColor(selectedTouchpoint.channel)}>
                    {selectedTouchpoint.channel === 'in_app_message' || selectedTouchpoint.channel === 'trigger_in_app_message' 
                      ? 'In-App' 
                      : selectedTouchpoint.channel}
                  </Badge>
                  {selectedTouchpoint.delay && (
                    <Badge variant="outline" className="gap-1">
                      <Calendar className="h-3 w-3" />
                      {selectedTouchpoint.delay}
                    </Badge>
                  )}
                </div>

                {/* Email preview */}
                {channel === 'email' && (
                  <div className="space-y-3">
                    {(message?.subject || selectedTouchpoint.subject) && (
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Subject Line</p>
                        <p className="font-medium">{message?.subject || selectedTouchpoint.subject}</p>
                        {(message?.preheader || selectedTouchpoint.preheader) && (
                          <p className="text-sm text-muted-foreground mt-1">{message?.preheader || selectedTouchpoint.preheader}</p>
                        )}
                      </div>
                    )}
                    {(message?.html_content || selectedTouchpoint.html_content || selectedTouchpoint.html_preview) ? (
                      <div className="border rounded-lg overflow-hidden bg-white">
                        <iframe
                          srcDoc={sanitizeHtml(message?.html_content || selectedTouchpoint.html_content || selectedTouchpoint.html_preview)}
                          className="w-full h-[600px]"
                          title="Email Preview"
                          sandbox=""
                        />
                      </div>
                    ) : message?.body ? (
                      <div className="p-4 border rounded-lg bg-card">
                        <p className="text-sm">{message.body}</p>
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-muted/20 rounded-lg border border-dashed">
                        <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Email preview not available</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Push preview */}
                {(channel === 'push' || channel.includes('push')) && (
                  <div className="space-y-3">
                    <div className="max-w-sm mx-auto">
                      <div className="bg-card border rounded-2xl p-4 shadow-lg">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                            <BRCGIcon className="h-5 w-5 text-primary-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">BRCG • now</p>
                            <p className="font-semibold text-sm mt-0.5">
                              {message?.title || selectedTouchpoint.title || selectedTouchpoint.name}
                            </p>
                            {(message?.body || selectedTouchpoint.body) && (
                              <p className="text-sm text-muted-foreground line-clamp-3 mt-1">
                                {message?.body || selectedTouchpoint.body}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-center text-muted-foreground mt-3">Push notification preview</p>
                    </div>
                  </div>
                )}

                {/* In-app message preview */}
                {(channel === 'in_app_message' || channel.includes('in_app') || channel.includes('in-app') || channel === 'trigger_in_app_message') && (
                  <div className="space-y-3">
                    {(() => {
                      const bodyContent = message?.body || selectedTouchpoint.body || '';
                      const isHtmlBody = bodyContent.trim().startsWith('<!doctype') || bodyContent.trim().startsWith('<html') || bodyContent.includes('<div');
                      
                      if (isHtmlBody) {
                        return (
                          <div className="border rounded-lg overflow-hidden bg-white">
                            <iframe srcDoc={sanitizeHtml(bodyContent)} className="w-full h-[600px]" title="In-App Message Preview" sandbox="" />
                          </div>
                        );
                      }
                      
                      return (
                        <div className="max-w-sm mx-auto">
                          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/30 rounded-2xl p-6 text-center">
                            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                              <Smartphone className="h-6 w-6 text-primary" />
                            </div>
                            <h4 className="font-bold text-lg">
                              {message?.title || selectedTouchpoint.title || selectedTouchpoint.name}
                            </h4>
                            {bodyContent && <p className="text-sm text-muted-foreground mt-2">{bodyContent}</p>}
                            <Button className="mt-4" size="sm">
                              {message?.buttons?.[0]?.text || 'Take Action'}
                            </Button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* SMS preview */}
                {channel === 'sms' && (
                  <div className="max-w-sm mx-auto">
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
                      <p className="text-sm">{message?.body || selectedTouchpoint.body || 'SMS message content'}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

/** Icon + gradient ring for journey cards — aligns with dashboard primary/emerald/violet accents. */
function getJourneyVisuals(name: string): { Icon: typeof Workflow; gradient: string; shadow: string } {
  const n = name.toLowerCase();
  if (n.includes('welcome') || n.includes('onboard'))
    return { Icon: Sparkles, gradient: 'from-emerald-500 via-emerald-600 to-teal-700', shadow: 'shadow-emerald-500/25' };
  if (n.includes('re-engage') || n.includes('winback') || n.includes('win-back'))
    return { Icon: TrendingUp, gradient: 'from-sky-500 via-blue-600 to-indigo-700', shadow: 'shadow-blue-500/25' };
  if (n.includes('upgrade') || n.includes('upsell'))
    return { Icon: Zap, gradient: 'from-violet-500 via-purple-600 to-fuchsia-700', shadow: 'shadow-violet-500/25' };
  if (n.includes('milestone') || n.includes('anniversary'))
    return { Icon: Heart, gradient: 'from-pink-500 via-rose-600 to-red-700', shadow: 'shadow-pink-500/20' };
  if (n.includes('purchase') || n.includes('order'))
    return { Icon: ShoppingCart, gradient: 'from-amber-500 via-orange-600 to-amber-800', shadow: 'shadow-amber-500/25' };
  if (n.includes('feature') || n.includes('announce'))
    return { Icon: Gift, gradient: 'from-cyan-500 to-blue-600', shadow: 'shadow-cyan-500/20' };
  return { Icon: Workflow, gradient: 'from-primary via-primary to-primary/80', shadow: 'shadow-primary/25' };
}

// Journey Card Component
function JourneyCard({ journey, viewMode, onClick }: { journey: any; viewMode: 'grid' | 'list'; onClick: () => void }) {
  const { Icon, gradient, shadow } = getJourneyVisuals(String(journey.name ?? ''));
  
  if (viewMode === 'list') {
    return (
      <Card
        className={cn(
          dashboardSurfaceCardInteractive,
          'cursor-pointer border-primary/15 bg-gradient-to-br from-card via-card to-muted/20',
        )}
        onClick={onClick}
      >
        <div className={dashboardTopAccentClass} aria-hidden />
        <CardContent className="p-4 pt-3">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ring-2 ring-white/10',
                `bg-gradient-to-br ${gradient}`,
                shadow,
              )}
            >
              <Icon className="h-5 w-5 text-white drop-shadow-sm" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium line-clamp-1">{journey.displayName || journey.name}</h3>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {[...new Set(journey.channels?.map((ch: string) => {
                  const normalized = ch.toLowerCase().replace(/[-_]/g, '');
                  if (normalized.includes('email')) return 'Email';
                  if (normalized.includes('push')) return 'Push';
                  if (normalized.includes('inapp')) return 'In-App';
                  if (normalized.includes('sms')) return 'SMS';
                  return null;
                }).filter(Boolean))]?.map((ch: string) => (
                  <Badge key={ch} variant="outline" className={`text-xs ${getChannelColor(ch.toLowerCase())}`}>{ch}</Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className={cn(dashPill, 'border-0 font-normal normal-case tracking-normal')}>
                {countMessagingTouchpoints(normalizeRawSteps(journey.steps))} touchpoints
              </Badge>
              <ChevronRight className="h-5 w-5 text-primary/40" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        dashboardSurfaceCardInteractive,
        'group cursor-pointer overflow-hidden border-primary/15 bg-gradient-to-b from-card via-card/98 to-muted/15',
      )}
      onClick={onClick}
    >
      <div className={dashboardTopAccentClass} aria-hidden />
      <CardContent className="p-5 pt-4">
        <div className="flex items-start gap-3 mb-4">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-2 ring-white/15',
              `bg-gradient-to-br ${gradient}`,
              shadow,
            )}
          >
            <Icon className="h-5 w-5 text-white drop-shadow" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {journey.displayName || journey.name}
            </h3>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/[0.06] px-2.5 py-1 text-xs font-medium text-primary">
            <Workflow className="h-3.5 w-3.5 opacity-80" />
            {countMessagingTouchpoints(normalizeRawSteps(journey.steps))} touchpoints
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[...new Set(journey.channels?.map((ch: string) => {
            const normalized = ch.toLowerCase().replace(/[-_]/g, '');
            if (normalized.includes('email')) return 'Email';
            if (normalized.includes('push')) return 'Push';
            if (normalized.includes('inapp')) return 'In-App';
            if (normalized.includes('sms')) return 'SMS';
            return null;
          }).filter(Boolean))]?.map((ch: string) => (
            <Badge key={ch} variant="outline" className={`text-xs ${getChannelColor(ch.toLowerCase())}`}>{ch}</Badge>
          ))}
        </div>

        <div className="flex items-center justify-end border-t border-primary/10 pt-3 mt-1">
          <Button variant="ghost" size="sm" className="gap-1 text-primary hover:text-primary hover:bg-primary/10">
            View journey
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function generateJourneyDescription(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('welcome') || lower.includes('onboard')) return 'Guides new users through their first experience and drives initial engagement.';
  if (lower.includes('re-engage') || lower.includes('winback') || lower.includes('win-back')) return 'Reactivates inactive users and brings them back to the platform.';
  if (lower.includes('upgrade') || lower.includes('upsell')) return 'Encourages users to upgrade to premium features or paid plans.';
  if (lower.includes('purchase') || lower.includes('order')) return 'Follows up after a purchase to build loyalty and drive repeat orders.';
  if (lower.includes('milestone')) return 'Celebrates user milestones and anniversaries to strengthen engagement.';
  return 'Automated multi-touch journey delivering targeted messages across channels.';
}

// Journey Detail Component
function JourneyDetail({
  journey,
  clientId,
  onBack,
  onViewTouchpoint,
}: {
  journey: Record<string, unknown>;
  clientId?: string;
  onBack: () => void;
  onViewTouchpoint: (step: unknown) => void;
}) {
  const { data: detailRow } = useQuery({
    queryKey: ['lifecycle-braze-canvas-detail', clientId, journey.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('braze_canvases')
        .select('*')
        .eq('client_id', clientId!)
        .eq('braze_canvas_id', String(journey.id))
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
    enabled: !!clientId && !!journey?.id,
  });

  const merged = useMemo(() => {
    if (!detailRow) return journey;
    const stepsRecord = normalizeRawSteps(detailRow.raw_steps);
    const variants = (detailRow.raw_variants ?? journey.variants) as CanvasVariant[];
    const msgCount = countMessagingTouchpoints(stepsRecord);
    const priorSteps = normalizeRawSteps(journey.steps);
    const priorCount = countMessagingTouchpoints(priorSteps);
    const effectiveMsgCount =
      Object.keys(stepsRecord).length > 0 ? msgCount : priorCount;

    return {
      ...journey,
      steps: Object.keys(stepsRecord).length > 0 ? stepsRecord : journey.steps,
      variants: Array.isArray(variants) ? variants : journey.variants,
      description: (detailRow.description as string) ?? journey.description,
      entry_type: detailRow.entry_type ?? journey.entry_type,
      entry_segment_name: detailRow.entry_segment_name ?? journey.entry_segment_name,
      trigger_event_name: detailRow.trigger_event_name ?? journey.trigger_event_name,
      exception_events: detailRow.exception_events ?? journey.exception_events,
      conversion_events: detailRow.conversion_events ?? journey.conversion_events,
      entry_filters: detailRow.entry_filters ?? journey.entry_filters,
      tags: detailRow.tags ?? journey.tags,
      first_entry: detailRow.first_entry ?? journey.first_entry,
      last_entry: detailRow.last_entry ?? journey.last_entry,
      schedule_type: detailRow.schedule_type ?? journey.schedule_type,
      total_steps: effectiveMsgCount,
    };
  }, [journey, detailRow]);

  const [editableDescription, setEditableDescription] = useState<string>(() => {
    const d = merged.description != null ? String(merged.description) : '';
    return d && d !== 'Automated lifecycle journey'
      ? d
      : generateJourneyDescription(String(merged.name ?? ''));
  });
  const [editableTrigger, setEditableTrigger] = useState<string>(String(merged.trigger_event_name ?? '') || '');
  const [isEditingTrigger, setIsEditingTrigger] = useState(false);
  const [tempTrigger, setTempTrigger] = useState('');
  const [editableAudience, setEditableAudience] = useState<string>(String(merged.entry_segment_name ?? '') || '');
  const [isEditingAudience, setIsEditingAudience] = useState(false);
  const [tempAudience, setTempAudience] = useState('');

  useEffect(() => {
    const d = String(merged.description ?? '');
    setEditableDescription(
      d && d !== 'Automated lifecycle journey' ? d : generateJourneyDescription(String(merged.name ?? '')),
    );
    setEditableTrigger(String(merged.trigger_event_name ?? '') || '');
    setEditableAudience(String(merged.entry_segment_name ?? '') || '');
  }, [merged]);
  
  const { Icon, gradient, shadow } = getJourneyVisuals(String(merged.name ?? ''));

  const stepsRecord = normalizeRawSteps(merged.steps as Record<string, LifecycleCanvasStep> | undefined);
  const messageStepCount = countMessagingTouchpoints(stepsRecord);
  const channelCounts = Object.values(stepsRecord).reduce((acc: Record<string, number>, step: LifecycleCanvasStep) => {
    if (!isMessagingTouchpointStep(step)) return acc;
    const ch = getLifecycleStepChannel(step) || 'email';
    acc[ch] = (acc[ch] || 0) + 1;
    return acc;
  }, {});

  const getEntryType = (): string => {
    const sched = merged.schedule_type ? String(merged.schedule_type).toLowerCase() : '';
    if (sched.includes('scheduled') || sched.includes('time') || sched.includes('calendar')) return 'Scheduled';
    if (merged.entry_type) {
      const type = String(merged.entry_type).toLowerCase();
      if (type.includes('trigger') || type.includes('action')) return 'Trigger';
      if (type.includes('segment')) return 'Segment';
      if (type.includes('api')) return 'API';
      if (type.includes('schedule')) return 'Scheduled';
    }
    return 'Trigger';
  };

  return (
    <div className="space-y-4">
      <Button
        variant="outline"
        size="sm"
        onClick={onBack}
        className="gap-2 rounded-lg border-primary/20 bg-background/90 shadow-sm hover:bg-primary/[0.06] hover:border-primary/35"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to journeys
      </Button>

      <Card className={cn(dashboardSurfaceCard, 'overflow-hidden shadow-md shadow-primary/[0.05]')}>
        <div className={dashboardTopAccentClass} aria-hidden />
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4 rounded-xl bg-gradient-to-r from-primary/[0.06] via-transparent to-muted/20 p-3 ring-1 ring-primary/10">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-2 ring-white/15',
                `bg-gradient-to-br ${gradient}`,
                shadow,
              )}
            >
              <Icon className="h-6 w-6 text-white drop-shadow" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-heading text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
                {merged.displayName || merged.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {[...new Set(Object.keys(channelCounts).map((channel) => {
                  const normalized = channel.toLowerCase().replace(/[-_]/g, '');
                  if (normalized.includes('email')) return 'Email';
                  if (normalized.includes('push')) return 'Push';
                  if (normalized.includes('inapp')) return 'In-App';
                  if (normalized.includes('sms')) return 'SMS';
                  return null;
                }).filter(Boolean))]?.map((ch: string) => (
                  <Badge key={ch} variant="outline" className={`text-xs ${getChannelColor(ch.toLowerCase())}`}>{ch}</Badge>
                ))}
                <Badge variant="secondary" className={cn(dashPill, 'border-0 font-normal normal-case tracking-normal')}>
                  {messageStepCount} message step{messageStepCount !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
          </div>

          {/* TLDR Section */}
          <div className={cn(dashStickinessPanel, 'mb-4 space-y-3 border-primary/10 bg-gradient-to-br from-muted/40 to-muted/10')}>
            <div className="flex flex-wrap gap-2 items-center">
              <Badge className="bg-primary/10 text-primary border-primary/30">{getEntryType()} Entry</Badge>
              {merged.schedule_type ? (
                <Badge variant="outline" className="text-xs">
                  {String(merged.schedule_type)}
                </Badge>
              ) : null}
            </div>
            
            {/* Trigger Event */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-emerald-500" />
                <p className="text-xs font-medium text-muted-foreground">Trigger Event:</p>
              </div>
              {isEditingTrigger ? (
                <div className="flex items-center gap-2">
                  <Input value={tempTrigger} onChange={(e) => setTempTrigger(e.target.value)} placeholder="e.g., user_signed_up" className="h-8 text-sm flex-1" autoFocus />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditableTrigger(tempTrigger); setIsEditingTrigger(false); }}>
                    <Check className="h-4 w-4 text-emerald-500" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditingTrigger(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {editableTrigger ? (
                    <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 gap-1">
                      <Zap className="h-3 w-3" />{editableTrigger}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">No trigger event set</span>
                  )}
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setTempTrigger(editableTrigger); setIsEditingTrigger(true); }}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </div>
            
            {/* Audience */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-blue-500" />
                <p className="text-xs font-medium text-muted-foreground">Audience / Segment:</p>
              </div>
              {isEditingAudience ? (
                <div className="flex items-center gap-2">
                  <Input value={tempAudience} onChange={(e) => setTempAudience(e.target.value)} placeholder="e.g., Active Users" className="h-8 text-sm flex-1" autoFocus />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditableAudience(tempAudience); setIsEditingAudience(false); }}>
                    <Check className="h-4 w-4 text-emerald-500" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditingAudience(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {editableAudience ? (
                    <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400 gap-1">
                      <Users className="h-3 w-3" />{editableAudience}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">No audience defined</span>
                  )}
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setTempAudience(editableAudience); setIsEditingAudience(true); }}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </div>
            
            {Array.isArray(merged.entry_filters) && merged.entry_filters.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Additional Filters:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(merged.entry_filters as Record<string, unknown>[]).slice(0, 5).map((filter, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400">
                      {String(filter.property ?? filter.type ?? '')}
                      {filter.comparator != null && ` ${filter.comparator}`}
                      {filter.value != null && ` "${String(filter.value)}"`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {Array.isArray(merged.exception_events) && merged.exception_events.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Exclusions:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(merged.exception_events as string[]).map((event: string, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400">{event}</Badge>
                  ))}
                </div>
              </div>
            )}
            
            {Array.isArray(merged.conversion_events) && merged.conversion_events.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Conversion Goals:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(merged.conversion_events as { name?: string; window_seconds?: number }[]).map((cv, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-400 gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {cv.name}
                      {cv.window_seconds != null && ` (${Math.round(cv.window_seconds / 86400)}d window)`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {merged.description && merged.description !== 'Automated lifecycle journey' && (
              <p className="text-sm text-muted-foreground pt-1 border-t">{String(merged.description)}</p>
            )}
          </div>

          {/* Flow Chart */}
          {Object.keys(stepsRecord).length > 0 && (
            <HorizontalFlowChart
              canvas={{
                id: String(merged.id),
                name: String(merged.name ?? ''),
                description: merged.description as string | undefined,
                enabled: true,
                draft: false,
                variants: (merged.variants as CanvasVariant[]) || [],
                steps: stepsRecord as Record<string, CanvasStep>,
                tags: merged.tags as string[] | undefined,
                first_entry: merged.first_entry as string | undefined,
                last_entry: merged.last_entry as string | undefined,
              }}
              onViewStep={(step) => onViewTouchpoint({ ...step, delay: step.delay_formatted })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Channel Icon Component
function ChannelIcon({ channel, size = 'sm' }: { channel: string; size?: 'sm' | 'lg' }) {
  const iconSize = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  const normalizedChannel = channel.toLowerCase().replace('_', '-');
  switch (normalizedChannel) {
    case 'email': return <Mail className={`${iconSize} text-blue-500`} />;
    case 'push': case 'ios-push': case 'android-push': return <Bell className={`${iconSize} text-orange-500`} />;
    case 'in-app': case 'in-app-message': return <Smartphone className={`${iconSize} text-purple-500`} />;
    default: return <Mail className={`${iconSize} text-muted-foreground`} />;
  }
}
