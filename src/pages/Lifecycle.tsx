import { useState, useMemo, useEffect } from 'react';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import { cn, scrollAppMainToTopAfterLayout } from '@/lib/utils';
import { getJourneyVisuals } from '@/lib/lifecycleJourneyVisuals';
import {
  dashPill,
  dashStickinessPanel,
  dashboardSurfaceCard,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { format } from 'date-fns';
import {
  Search,
  Mail,
  Smartphone,
  Bell,
  ArrowRight,
  ArrowLeft,
  Zap,
  Calendar,
  ChevronLeft,
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
  Star,
  RefreshCw,
  TrendingUp,
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
import { CampaignCreativeHero } from '@/components/campaigns/CampaignCreativeHero';
import {
  normalizeCampaignChannel,
  type CampaignChannelUi,
} from '@/lib/campaignDisplay';

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

/** Journey cards per page (between 25–30 for readable grids). */
const JOURNEY_PAGE_SIZE = 27;

function LifecycleMetricTile({
  icon: Icon,
  label,
  value,
  color,
  glowClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  /** Tailwind `from-*` (+ optional `to-*`) for soft corner glow */
  glowClass?: string;
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm backdrop-blur-sm',
        'ring-1 ring-black/[0.03] transition-shadow hover:shadow-md dark:ring-white/[0.06]',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br to-transparent opacity-[0.14] blur-2xl transition-opacity group-hover:opacity-[0.22]',
          glowClass ?? 'from-primary/30',
        )}
        aria-hidden
      />
      <div className="relative">
        <div className="mb-2 flex items-center gap-2">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-black/5 dark:ring-white/10',
              color,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        </div>
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
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
  const [journeyPage, setJourneyPage] = useState(1);
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

      const dbRowId = String(canvas.id ?? '');
      const brazeCanvasIdRaw = canvas.braze_canvas_id;
      const brazeCanvasId =
        brazeCanvasIdRaw != null && String(brazeCanvasIdRaw).trim() !== ''
          ? String(brazeCanvasIdRaw).trim()
          : dbRowId;

      return {
        /** DB primary key — unique per row for list keys and detail fetch. */
        dbId: dbRowId,
        /** Braze canvas id when present; used for visibility map (Settings) and display. */
        id: brazeCanvasId,
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

  const isItemVisible = (brazeOrVisibilityId: string) => {
    const explicitSetting = visibilityMap.get(brazeOrVisibilityId);
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

  const journeyTotalPages = Math.max(1, Math.ceil(filteredJourneys.length / JOURNEY_PAGE_SIZE));

  useEffect(() => {
    setJourneyPage(1);
  }, [searchQuery, channelFilter, launchDateFilter]);

  useEffect(() => {
    setJourneyPage((p) => Math.min(p, journeyTotalPages));
  }, [journeyTotalPages]);

  const paginatedJourneys = useMemo(() => {
    const safePage = Math.min(journeyPage, journeyTotalPages);
    const start = (safePage - 1) * JOURNEY_PAGE_SIZE;
    return filteredJourneys.slice(start, start + JOURNEY_PAGE_SIZE);
  }, [filteredJourneys, journeyPage, journeyTotalPages]);

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
      <TooltipProvider delayDuration={300}>
      <div className="relative mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div
          className="pointer-events-none absolute inset-x-0 -top-px h-72 max-w-7xl rounded-b-[2rem] bg-gradient-to-b from-teal-500/[0.07] via-violet-500/[0.04] to-transparent dark:from-teal-950/35 dark:via-violet-950/25 dark:to-transparent"
          aria-hidden
        />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg ring-2 ring-white/20 dark:ring-black/30',
              'from-teal-500 via-emerald-600 to-cyan-700 text-white shadow-teal-500/30',
            )}
            aria-hidden
          >
            <Workflow className="h-7 w-7 drop-shadow" strokeWidth={1.5} />
          </div>
          <PageHeader
            className="min-w-0 flex-1"
            title="Lifecycle"
            titleClassName="text-2xl sm:text-3xl bg-gradient-to-r from-teal-700 via-emerald-700 to-violet-700 bg-clip-text text-transparent dark:from-teal-300 dark:via-emerald-300 dark:to-violet-300"
            description={
              hasBrazeApi
                ? 'Browse synced Braze canvases as journeys — same card layout as Campaigns.'
                : 'Connect Braze to sync multi-touch journeys into this workspace.'
            }
            actions={
              hasBrazeApi ? (
                <>
                  <Button variant="outline" asChild className="border-teal-500/25 bg-background/80 shadow-sm hover:bg-teal-500/[0.06] dark:border-teal-400/20">
                    <Link to="/campaigns" className="inline-flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Sync via Campaigns
                    </Link>
                  </Button>
                  <Badge className="border border-teal-500/20 bg-teal-500/10 text-xs font-normal text-teal-800 dark:text-teal-200">
                    Braze connected
                  </Badge>
                </>
              ) : undefined
            }
          />
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

          {hasBrazeApi && (
            <div
              className={cn(
                'flex flex-col justify-between gap-4 rounded-2xl border border-border/60 bg-card/85 p-4 shadow-sm backdrop-blur-md sm:flex-row sm:items-center sm:p-5',
                'ring-1 ring-teal-500/[0.06] dark:ring-violet-500/10',
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[200px] max-w-md flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600/70 dark:text-teal-400/70" />
                  <Input
                    placeholder="Search journeys..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="border-border/70 pl-10 shadow-inner dark:bg-background/50"
                    aria-label="Search journeys"
                  />
                </div>
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="w-[140px] border-border/70 bg-background/80">
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
                  <SelectTrigger className="w-[150px] border-border/70 bg-background/80">
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
              <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/40 p-1 dark:bg-muted/20">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  className={cn(viewMode === 'grid' && 'bg-gradient-to-br from-teal-600 to-emerald-700 text-white shadow-md hover:from-teal-600 hover:to-emerald-700')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  className={cn(viewMode === 'list' && 'bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-md hover:from-violet-600 hover:to-indigo-700')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {hasBrazeApi && !listLoading && journeys.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <LifecycleMetricTile
                icon={Workflow}
                label="Synced journeys"
                value={String(journeys.length)}
                color="bg-teal-500/15 text-teal-700 dark:text-teal-300"
                glowClass="from-teal-500/50"
              />
              <LifecycleMetricTile
                icon={Filter}
                label="Showing (filters)"
                value={String(filteredJourneys.length)}
                color="bg-violet-500/15 text-violet-700 dark:text-violet-300"
                glowClass="from-violet-500/50"
              />
              <LifecycleMetricTile
                icon={Users}
                label="Entries (60d)"
                value={entries60dTotal.toLocaleString()}
                color="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                glowClass="from-emerald-500/50"
              />
              <LifecycleMetricTile
                icon={GitBranch}
                label="Messaging steps"
                value={String(messagingStepsTotal)}
                color="bg-amber-500/15 text-amber-800 dark:text-amber-300"
                glowClass="from-amber-500/45"
              />
            </div>
          )}

          {!hasBrazeApi ? null : listLoading ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4 p-6">
              <LoadingPage message="Loading journeys…" />
            </div>
          ) : (
            <>
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
                    : 'space-y-3'
                }
              >
                {journeys.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
                    <Workflow className="h-12 w-12 text-muted-foreground opacity-60" aria-hidden />
                    <p className="font-medium text-foreground">No journeys synced yet</p>
                    <p className="max-w-md text-sm text-muted-foreground">
                      Run sync from Campaigns so rows appear in{' '}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">braze_canvases</code>.
                    </p>
                    <Button variant="outline" size="sm" className="mt-2" asChild>
                      <Link to="/campaigns" className="inline-flex items-center gap-2">
                        Open Campaigns
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                ) : filteredJourneys.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
                    <Filter className="h-12 w-12 text-muted-foreground opacity-60" aria-hidden />
                    <p className="font-medium text-foreground">No journeys match</p>
                    <p className="max-w-md text-sm text-muted-foreground">
                      Try adjusting search or filters. Visibility is controlled in Settings.
                    </p>
                  </div>
                ) : (
                  paginatedJourneys.map((journey) => (
                    <JourneyCard
                      key={journey.dbId}
                      journey={journey}
                      viewMode={viewMode}
                      onClick={() => setSelectedJourney(journey)}
                    />
                  ))
                )}
              </div>
              {filteredJourneys.length > 0 && journeyTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 border-t border-border/60 pt-5">
                  <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-2 py-1.5 shadow-inner dark:bg-muted/15">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={journeyPage <= 1}
                      onClick={() => {
                        setJourneyPage((p) => Math.max(1, p - 1));
                        scrollAppMainToTopAfterLayout('smooth');
                      }}
                      aria-label="Previous page"
                      className="h-9 w-9 shrink-0 rounded-full p-0 hover:bg-teal-500/15"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[7rem] text-center text-sm tabular-nums font-medium text-muted-foreground">
                      Page {Math.min(journeyPage, journeyTotalPages)} of {journeyTotalPages}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={journeyPage >= journeyTotalPages}
                      onClick={() => {
                        setJourneyPage((p) => Math.min(journeyTotalPages, p + 1));
                        scrollAppMainToTopAfterLayout('smooth');
                      }}
                      aria-label="Next page"
                      className="h-9 w-9 shrink-0 rounded-full p-0 hover:bg-teal-500/15"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
      </div>
      </TooltipProvider>

      {/* Journey detail — same modal pattern as Campaigns */}
      <Dialog
        open={!!selectedJourney}
        onOpenChange={(open) => {
          if (!open) setSelectedJourney(null);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden border-primary/15 bg-card p-0 shadow-xl duration-300 sm:max-w-4xl">
          {selectedJourney && (
            <>
              {(() => {
                const j = selectedJourney as Record<string, unknown>;
                const title = String(j.displayName ?? j.name ?? 'Journey');
                const { Icon, gradient, shadow } = getJourneyVisuals(String(j.name ?? ''));
                const stepCount = countMessagingTouchpoints(normalizeRawSteps(j.steps as Record<string, LifecycleCanvasStep> | undefined));
                const firstEntry = j.first_entry ? String(j.first_entry) : '';
                let entryLine = '';
                if (firstEntry) {
                  const d = new Date(firstEntry);
                  if (!Number.isNaN(d.getTime())) entryLine = ` · First entry ${format(d, 'MMMM d, yyyy')}`;
                }
                return (
                  <DialogHeader className="shrink-0 space-y-2 px-6 pb-2 pt-6">
                    <DialogTitle className="flex items-start gap-3 pr-8 text-left text-lg font-semibold leading-snug">
                      <div
                        className={cn(
                          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-md ring-2 ring-white/10',
                          `bg-gradient-to-br ${gradient}`,
                          shadow,
                        )}
                      >
                        <Icon className="h-4 w-4 text-white drop-shadow" />
                      </div>
                      <span className="line-clamp-3 break-words">{title}</span>
                    </DialogTitle>
                    <DialogDescription>
                      {stepCount} message step{stepCount !== 1 ? 's' : ''}
                      {entryLine}
                    </DialogDescription>
                  </DialogHeader>
                );
              })()}
              <div
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-6 pb-6 [scrollbar-gutter:stable]"
                tabIndex={-1}
                aria-label="Journey details"
              >
                <JourneyDetail
                  journey={selectedJourney}
                  clientId={client?.id}
                  inDialog
                  onBack={() => setSelectedJourney(null)}
                  onViewTouchpoint={(step: unknown) => setSelectedTouchpoint(step)}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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

function generateJourneyDescription(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('welcome') || lower.includes('onboard'))
    return 'Guides new users through their first experience and drives initial engagement.';
  if (lower.includes('re-engage') || lower.includes('winback') || lower.includes('win-back'))
    return 'Reactivates inactive users and brings them back to the platform.';
  if (lower.includes('upgrade') || lower.includes('upsell'))
    return 'Encourages users to upgrade to premium features or paid plans.';
  if (lower.includes('purchase') || lower.includes('order'))
    return 'Follows up after a purchase to build loyalty and drive repeat orders.';
  if (lower.includes('milestone'))
    return 'Celebrates user milestones and anniversaries to strengthen engagement.';
  return 'Automated multi-touch journey delivering targeted messages across channels.';
}

function journeyCardPreviewLine(journey: {
  description?: string;
  name?: string;
}): string {
  const d = typeof journey.description === 'string' ? journey.description.trim() : '';
  if (d && d !== 'Automated lifecycle journey') return d;
  return generateJourneyDescription(String(journey.name ?? ''));
}

function journeyCardPrimaryUiChannel(channels: string[] | undefined): CampaignChannelUi {
  if (!channels?.length) return 'email';
  return normalizeCampaignChannel(channels[0]);
}

function journeyCardDateLabel(journey: { first_entry?: string; last_entry?: string }): string {
  const raw = journey.first_entry || journey.last_entry;
  if (!raw) return '—';
  const dt = new Date(String(raw));
  if (Number.isNaN(dt.getTime())) return '—';
  return format(dt, 'MMM d');
}

/** One pill per channel: Push → Push, Email/SMS/In-App as before; unknown raw strings get a muted pill. */
function journeyCardChannelPillList(channels: string[] | undefined): Array<{
  key: string;
  label: string;
  colorArg: string | null;
}> {
  const seen = new Map<string, { label: string; colorArg: string | null }>();
  for (const raw of channels ?? []) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    const normalized = s.toLowerCase().replace(/[-_\s]/g, '');
    let label: string;
    let colorArg: string | null;
    if (normalized.includes('email')) {
      label = 'Email';
      colorArg = 'email';
    } else if (normalized.includes('sms')) {
      label = 'SMS';
      colorArg = 'sms';
    } else if (normalized.includes('push')) {
      label = 'Push';
      colorArg = 'push';
    } else if (normalized.includes('inapp') || normalized.includes('contentcard')) {
      label = 'In-App';
      colorArg = 'in_app_message';
    } else {
      label = s.replace(/_/g, ' ');
      colorArg = null;
    }
    if (!seen.has(label)) seen.set(label, { label, colorArg });
  }
  if (seen.size === 0) {
    return [{ key: 'email', label: 'Email', colorArg: 'email' }];
  }
  const order = ['Email', 'SMS', 'Push', 'In-App'];
  return [...seen.entries()]
    .map(([k, v]) => ({ key: k, label: v.label, colorArg: v.colorArg }))
    .sort((a, b) => {
      const ia = order.indexOf(a.label);
      const ib = order.indexOf(b.label);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
}

// Journey Card Component — Campaigns-style hero + touchpoints + per-channel pills + View journey
function JourneyCard({ journey, viewMode, onClick }: { journey: any; viewMode: 'grid' | 'list'; onClick: () => void }) {
  const titleText = String(journey.displayName || journey.name || 'Journey');
  const titleForVisual = String(journey.name ?? journey.displayName ?? '');
  const { Icon: TitleIcon, gradient: titleGradient, shadow: titleShadow, heroSurface } =
    getJourneyVisuals(titleForVisual);
  const previewLine = journeyCardPreviewLine(journey);
  const channels = journey.channels as string[] | undefined;
  const primaryCh = journeyCardPrimaryUiChannel(channels);
  const dateLabel = journeyCardDateLabel(journey);
  const touchCount = countMessagingTouchpoints(normalizeRawSteps(journey.steps));
  const channelPills = journeyCardChannelPillList(channels);

  const titleIconBadge = (
    <div
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ring-2 ring-white/30 dark:ring-black/25',
        titleGradient,
        titleShadow,
      )}
      aria-hidden
    >
      <TitleIcon className="h-5 w-5 drop-shadow" strokeWidth={2} />
    </div>
  );

  const open = () => onClick();

  const touchpointBadge = (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-teal-500/25 bg-gradient-to-r from-teal-500/[0.08] to-emerald-500/[0.06] px-2.5 py-1 text-xs font-medium text-teal-800 dark:text-teal-200">
      <GitBranch className="h-3.5 w-3.5 opacity-80" aria-hidden />
      {touchCount} touchpoint{touchCount !== 1 ? 's' : ''}
    </span>
  );

  const channelPillRow = (
    <div className="flex flex-wrap gap-1.5">
      {channelPills.map((pill) => (
        <Badge
          key={pill.key}
          variant="outline"
          className={cn('text-xs font-normal', getChannelColor(pill.colorArg))}
        >
          {pill.label}
        </Badge>
      ))}
    </div>
  );

  if (viewMode === 'list') {
    return (
      <Card
        role="button"
        tabIndex={0}
        aria-label={`Open journey ${titleText}`}
        className={cn(
          'group flex cursor-pointer flex-col overflow-hidden border-border/70 transition-all duration-200 hover:border-teal-500/35 hover:shadow-lg motion-safe:hover:-translate-y-0.5 dark:hover:border-teal-400/25',
        )}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
          {titleIconBadge}
          <div className="min-w-0 flex-1 space-y-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <h3 className="line-clamp-2 text-left text-sm font-medium leading-snug">{titleText}</h3>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                {titleText}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="line-clamp-2 text-left text-xs leading-relaxed text-muted-foreground">{previewLine}</p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                {previewLine}
              </TooltipContent>
            </Tooltip>
            {touchpointBadge}
            {channelPillRow}
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <span className="flex items-center justify-end gap-1 text-xs tabular-nums text-muted-foreground sm:justify-start">
              <Calendar className="h-3 w-3 shrink-0" aria-hidden />
              {dateLabel}
            </span>
            <span className="flex items-center gap-1 text-sm font-medium text-teal-700 dark:text-teal-300 sm:justify-end">
              View journey
              <ArrowRight className="h-3.5 w-3.5 opacity-90" aria-hidden />
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Open journey ${titleText}`}
      className={cn(
        'group flex h-full min-h-0 cursor-pointer flex-col overflow-hidden border-border/70 transition-all duration-200 hover:border-teal-500/35 hover:shadow-lg motion-safe:hover:-translate-y-0.5 dark:hover:border-teal-400/25',
      )}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <CampaignCreativeHero
        channel={primaryCh}
        previewText={previewLine}
        campaignName={titleText}
        variant="card"
        journeyPlaceholder={{
          surfaceGradient: heroSurface,
          largeIcon: <TitleIcon className="h-8 w-8 text-white drop-shadow" strokeWidth={2} aria-hidden />,
          iconContainerClassName: cn(
            'mb-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-lg ring-2 ring-white/40 dark:ring-black/25',
            `bg-gradient-to-br ${titleGradient}`,
            titleShadow,
          ),
        }}
      />
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <h3 className="line-clamp-2 text-left text-sm font-medium leading-snug">{titleText}</h3>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            {titleText}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="line-clamp-2 text-left text-xs leading-relaxed text-muted-foreground">{previewLine}</p>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm">
            {previewLine}
          </TooltipContent>
        </Tooltip>
        {touchpointBadge}
        {channelPillRow}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
            <Calendar className="h-3 w-3 shrink-0" aria-hidden />
            {dateLabel}
          </span>
          <span className="flex items-center gap-1 text-sm font-medium text-teal-700 dark:text-teal-300">
            View journey
            <ArrowRight className="h-3.5 w-3.5 opacity-90" aria-hidden />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// Journey Detail Component
function JourneyDetail({
  journey,
  clientId,
  inDialog = false,
  onBack,
  onViewTouchpoint,
}: {
  journey: Record<string, unknown>;
  clientId?: string;
  /** When true, render for a modal (no back row; header lives in Dialog). */
  inDialog?: boolean;
  onBack: () => void;
  onViewTouchpoint: (step: unknown) => void;
}) {
  const journeyDbId = String((journey as { dbId?: string }).dbId ?? journey.id ?? '');

  const { data: detailRow } = useQuery({
    queryKey: ['lifecycle-braze-canvas-detail', clientId, journeyDbId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('braze_canvases')
        .select('*')
        .eq('client_id', clientId!)
        .eq('id', journeyDbId)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
    enabled: !!clientId && !!journeyDbId,
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
    <div className={cn(!inDialog && 'space-y-4')}>
      {!inDialog && (
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="gap-2 rounded-lg border-primary/20 bg-background/90 shadow-sm hover:bg-primary/[0.06] hover:border-primary/35"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to journeys
        </Button>
      )}

      <Card
        className={cn(
          dashboardSurfaceCard,
          'overflow-hidden shadow-md shadow-primary/[0.05]',
          inDialog && 'rounded-xl border-border/80',
        )}
      >
        <div className={dashboardTopAccentClass} aria-hidden />
        <CardContent className={cn('p-4 sm:p-6', inDialog && 'pt-4')}>
          {!inDialog && (
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-gradient-to-r from-primary/[0.06] via-transparent to-muted/20 p-3 ring-1 ring-primary/10">
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-2 ring-white/15',
                  `bg-gradient-to-br ${gradient}`,
                  shadow,
                )}
              >
                <Icon className="h-6 w-6 text-white drop-shadow" />
              </div>
              <div className="min-w-0 flex-1">
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
          )}

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
