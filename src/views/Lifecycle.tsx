import { useState, useMemo, useEffect, useLayoutEffect, useCallback } from 'react';
import { plainTextPreviewFromBrazeMessageBody } from '@/lib/brazeMessagePreviewText';
import { sanitizeBrazeEmailHtmlForIframe } from '@/lib/sanitizeBrazeEmailIframe';
import { BRAZE_CANVASES_LIST_SELECT } from '@/lib/brazeCanvasesListSelect';
import { cn, scrollAppMainToTopAfterLayout } from '@/lib/utils';
import { getJourneyVisuals } from '@/lib/lifecycleJourneyVisuals';
import {
  dashPill,
  dashStickinessPanel,
  dashboardSurfaceCard,
  dashboardTopAccentClass,
} from '@/lib/dashboard-surface';
import { useDoubleGoodPlatforms, useResolvedClientId } from '@/hooks/useDoubleGoodClient';
import { useBrazeDashboardClientId } from '@/hooks/useBrazeDashboardClientId';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
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
  TrendingUp,
  Eye,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { prefetchLifecycleJourneyImageUrls } from '@/lib/campaignImagePreload';
import { collectLifecycleStepImageUrls, collectOrderedTouchpointImageUrls } from '@/lib/lifecycleCanvasImageUrls';
import {
  saveLifecycleCanvasImageUrls,
  warmAllCachedLifecycleImages,
} from '@/lib/lifecycleImageSessionCache';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseCampaignTaxonomy, getChannelColor, getTypeColor } from '@/lib/campaign-taxonomy';
import {
  computeLifecycleDisplayTouchpoints,
  formatLifecycleStepBadge,
  getLifecycleStepChannel,
  isLifecycleMessagingChannel,
  isMessagingTouchpointStep,
  normalizeRawSteps,
  type LifecycleCanvasStep,
} from '@/lib/lifecycleCanvasSteps';
import { HorizontalFlowChart } from '@/components/creative/HorizontalFlowChart';
import { BRCGIcon } from '@/components/BRCGLogo';
import {
  stripBrazeLiquidForDisplay,
} from '@/lib/campaignDisplay';

// Type definitions
type CanvasStep = LifecycleCanvasStep;

interface CanvasVariant {
  name: string;
  percentage: number;
  first_step_id: string | null;
}

/** First Braze canvas tag for sorting / display (case-insensitive). */
function firstCanvasTagLower(tags: unknown): string {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  const t = tags.find((x) => typeof x === 'string' && String(x).trim());
  return typeof t === 'string' ? t.trim().toLowerCase() : '';
}

function sortJourneysByNameAsc<T extends { displayName?: string; name?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    String(a.displayName ?? a.name ?? '').localeCompare(String(b.displayName ?? b.name ?? ''), undefined, {
      sensitivity: 'base',
    }),
  );
}

function sortJourneysByFirstTagAsc<
  T extends { tags?: string[]; displayName?: string; name?: string },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = firstCanvasTagLower(a.tags);
    const tb = firstCanvasTagLower(b.tags);
    if (ta !== tb) {
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.localeCompare(tb, undefined, { sensitivity: 'base' });
    }
    return String(a.displayName ?? a.name ?? '').localeCompare(String(b.displayName ?? b.name ?? ''), undefined, {
      sensitivity: 'base',
    });
  });
}

/** Stable order for API rows (list query omits `raw_steps` — avoid touchpoint-based sort on empty JSON). */
function sortCanvasRowsByName<T extends { name?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' }),
  );
}

/** Elapsed ms since first entry (journey "running since"); null if unknown. */
function timeRunningSinceFirstEntryMs(firstEntry: string | undefined): number | null {
  if (!firstEntry) return null;
  const t = Date.parse(String(firstEntry));
  if (Number.isNaN(t)) return null;
  return Math.max(0, Date.now() - t);
}

/**
 * Sort by how long the journey has been running since first_entry.
 * `asc` = shortest running first (most recent starts), `desc` = longest running first.
 */
function sortJourneysByTimeRunning<
  T extends { first_entry?: string; name?: string; displayName?: string },
>(rows: T[], direction: 'asc' | 'desc'): T[] {
  return [...rows].sort((a, b) => {
    const aMs = timeRunningSinceFirstEntryMs(a.first_entry);
    const bMs = timeRunningSinceFirstEntryMs(b.first_entry);
    const aNull = aMs == null;
    const bNull = bMs == null;
    if (aNull && bNull) {
      return String(a.displayName ?? a.name ?? '').localeCompare(
        String(b.displayName ?? b.name ?? ''),
        undefined,
        { sensitivity: 'base' },
      );
    }
    if (aNull) return 1;
    if (bNull) return -1;
    const cmp = direction === 'asc' ? aMs - bMs : bMs - aMs;
    if (cmp !== 0) return cmp;
    return String(a.displayName ?? a.name ?? '').localeCompare(
      String(b.displayName ?? b.name ?? ''),
      undefined,
      { sensitivity: 'base' },
    );
  });
}

/** Highest `total_steps` first (same metric as cards: messaging → all steps → Braze DB count). */
function sortJourneysByTouchpointsDesc<
  T extends { total_steps?: number; displayName?: string; name?: string },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = typeof a.total_steps === 'number' && !Number.isNaN(a.total_steps) ? a.total_steps : 0;
    const tb = typeof b.total_steps === 'number' && !Number.isNaN(b.total_steps) ? b.total_steps : 0;
    if (tb !== ta) return tb - ta;
    return String(a.displayName ?? a.name ?? '').localeCompare(String(b.displayName ?? b.name ?? ''), undefined, {
      sensitivity: 'base',
    });
  });
}

function toDateMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e12 ? v : v * 1000;
  if (typeof v === 'string' && v.trim()) {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function journeyRecencyMs(j: {
  last_entry?: string;
  first_entry?: string;
  updated_in_braze?: string;
  synced_at?: string;
  updated_at?: string;
  created_in_braze?: string;
  created_at?: string;
}): number | null {
  return (
    toDateMs(j.last_entry) ??
    toDateMs(j.first_entry) ??
    toDateMs(j.updated_in_braze) ??
    toDateMs(j.synced_at) ??
    toDateMs(j.updated_at) ??
    toDateMs(j.created_in_braze) ??
    toDateMs(j.created_at)
  );
}

function sortJourneysByRecentDesc<
  T extends {
    last_entry?: string;
    first_entry?: string;
    updated_in_braze?: string;
    synced_at?: string;
    updated_at?: string;
    created_in_braze?: string;
    created_at?: string;
    displayName?: string;
    name?: string;
  },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const am = journeyRecencyMs(a);
    const bm = journeyRecencyMs(b);
    if (am == null && bm == null) {
      return String(a.displayName ?? a.name ?? '').localeCompare(String(b.displayName ?? b.name ?? ''), undefined, {
        sensitivity: 'base',
      });
    }
    if (am == null) return 1;
    if (bm == null) return -1;
    if (bm !== am) return bm - am;
    return String(a.displayName ?? a.name ?? '').localeCompare(String(b.displayName ?? b.name ?? ''), undefined, {
      sensitivity: 'base',
    });
  });
}

/** Journey cards per page — pagination chunk size. */
const JOURNEY_PAGE_SIZE = 21;

/** localStorage key for Lifecycle “Canvases” hide list (per workspace client id). */
const LIFECYCLE_HIDDEN_CANVAS_IDS_KEY = 'lifecycle:hidden_canvas_db_ids';



/**
 * Warm touchpoint hero URLs in **journey path order** so the first creative the user sees
 * on open is already in the HTTP cache.
 *
 * Two passes:
 *  1. Ordered pass — follows each variant's BFS path so images arrive in the same order
 *     as the flow chart renders them (highest visual priority first).
 *  2. Unordered fallback — catches any step images not reachable from the entry chain.
 *
 * Persists discovered URLs to localStorage (via lifecycleImageSessionCache) so they can be
 * warmed immediately on the next page visit — before any DB query runs.
 */
function preloadJourneyStepImages(
  rawSteps: unknown,
  rawVariants?: unknown,
  clientId?: string,
  canvasDbId?: string,
): void {
  if (!rawSteps || typeof rawSteps !== 'object') return;

  const stepsMap = rawSteps as Record<string, LifecycleCanvasStep>;

  // --- Ordered pass (variant-aware BFS path) ---
  const orderedUrls: string[] = [];
  const orderedSeen = new Set<string>();

  const variants = Array.isArray(rawVariants) ? rawVariants : [];
  // Find each non-control variant's entry and walk its BFS path.
  const entryIds: string[] = [];
  for (const v of variants) {
    if (typeof v !== 'object' || !v) continue;
    const name = String((v as { name?: string }).name ?? '').toLowerCase();
    if (name.includes('control')) continue;
    const fid = (v as { first_step_id?: string | null }).first_step_id;
    if (fid && typeof fid === 'string' && stepsMap[fid]) entryIds.push(fid);
  }
  // Fallback: infer entry from graph when no variants
  if (entryIds.length === 0) {
    const ids = Object.keys(stepsMap);
    const hasIncoming = new Set<string>();
    for (const s of Object.values(stepsMap)) {
      const step = s as LifecycleCanvasStep;
      const nexts = (step.next_step_ids ?? []) as string[];
      for (const nid of nexts) if (nid) hasIncoming.add(nid);
    }
    const roots = ids.filter(id => !hasIncoming.has(id));
    if (roots.length > 0) entryIds.push(roots[0]);
    else if (ids.length > 0) entryIds.push(ids[0]);
  }

  for (const entryId of entryIds) {
    const visited = new Set<string>();
    const queue: string[] = [entryId];
    const pathSteps: LifecycleCanvasStep[] = [];
    while (queue.length > 0) {
      const cid = queue.shift()!;
      if (visited.has(cid)) continue;
      visited.add(cid);
      const step = stepsMap[cid];
      if (!step) continue;
      pathSteps.push(step as LifecycleCanvasStep);
      const nexts = (step.next_step_ids ?? []) as string[];
      for (const nid of nexts) if (nid && !visited.has(nid) && stepsMap[nid]) queue.push(nid);
    }
    for (const url of collectOrderedTouchpointImageUrls(pathSteps)) {
      if (!orderedSeen.has(url)) { orderedSeen.add(url); orderedUrls.push(url); }
    }
  }

  // --- Unordered fallback (catches images not reachable via entry BFS) ---
  const fallbackUrls = collectLifecycleStepImageUrls(
    stepsMap as Record<string, { messages?: Array<{ image_url?: string; html_content?: string; body?: string }> }>,
  ).filter(u => !orderedSeen.has(u));

  const allUrls = [...orderedUrls, ...fallbackUrls];
  if (allUrls.length === 0) return;

  // Persist to localStorage so next page visit can warm these images immediately at mount.
  if (clientId && canvasDbId) {
    saveLifecycleCanvasImageUrls(clientId, canvasDbId, allUrls);
  }

  // First 28 get `<link rel="preload">` (highest browser priority); rest warm via new Image().
  prefetchLifecycleJourneyImageUrls(allUrls, { linkPreloadCount: 28, concurrency: 14 });
}

const LIFECYCLE_CANVAS_DETAIL_STALE_MS = 60_000;
/** Keep canvas detail in React Query memory cache for 30 min — survives route changes within the session. */
const LIFECYCLE_CANVAS_DETAIL_GC_MS = 30 * 60 * 1000;

/** Single source for canvas detail (used by prefetch, hover warm, click-open, and JourneyDetail). */
async function fetchLifecycleBrazeCanvasDetail(
  clientId: string,
  journeyDbId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('braze_canvases')
    .select('id,raw_steps,raw_variants,total_steps')
    .eq('client_id', clientId)
    .eq('id', journeyDbId)
    .maybeSingle();
  if (error) throw error;
  // Warm images in path order + persist to localStorage for instant warm on next visit.
  preloadJourneyStepImages(data?.raw_steps, data?.raw_variants, clientId, journeyDbId);
  return data as Record<string, unknown> | null;
}

/** Batch load canvas detail rows to avoid N+1 fetch loops. */
async function fetchLifecycleBrazeCanvasDetailsBatch(
  clientId: string,
  journeyDbIds: string[],
): Promise<Array<Record<string, unknown>>> {
  if (journeyDbIds.length === 0) return [];
  const { data, error } = await supabase
    .from('braze_canvases')
    .select('id,raw_steps,raw_variants,total_steps')
    .eq('client_id', clientId)
    .in('id', journeyDbIds);
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

export default function Lifecycle() {
  const { clientId: workspaceClientId } = useResolvedClientId();
  const { clientId: brazeReadClientId, isLoading: brazeDashboardClientLoading } =
    useBrazeDashboardClientId();
  const { data: platforms } = useDoubleGoodPlatforms();
  const queryClient = useQueryClient();

  // ─── INSTANT IMAGE WARM ───────────────────────────────────────────────────────
  // At mount (before paint), fire new Image() for every URL we discovered on a
  // previous visit. They are already in localStorage — no DB call needed.
  // On first ever visit this is a no-op; from second visit onward cards open
  // with zero image-load latency.
  useLayoutEffect(() => {
    const clientId = brazeReadClientId ?? workspaceClientId;
    if (!clientId) return;
    warmAllCachedLifecycleImages(clientId, 16);
  }, [brazeReadClientId, workspaceClientId]);
  // ─────────────────────────────────────────────────────────────────────────────

  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('All');
  const [launchDateFilter, setLaunchDateFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [journeyPage, setJourneyPage] = useState(1);
  /** Page-only: hide journeys by DB row id (Settings visibility is separate). */
  const [hiddenCanvasDbIds, setHiddenCanvasDbIds] = useState<Set<string>>(() => new Set());
  /** After localStorage hydrate for this workspace — avoids save effect wiping LS before load. */
  const [lifecycleCanvasPrefsReady, setLifecycleCanvasPrefsReady] = useState(false);
  const [lifecycleSortMode, setLifecycleSortMode] = useState<
    'recent' | 'touchpoints' | 'name' | 'tag' | 'time_running_short' | 'time_running_long'
  >('recent');
  const [selectedJourney, setSelectedJourney] = useState<any>(null);
  const [selectedTouchpoint, setSelectedTouchpoint] = useState<any>(null);

  /** Braze row on resolved workspace. */
  const hasBrazeOnWorkspace = Boolean(platforms?.some(p => p.platform === 'braze' && p.is_connected));
  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);

  const { data: dashboardBrazePlatform, isFetching: dashboardBrazePlatformFetching } = useQuery({
    queryKey: ['braze-platform-schema-dashboard', brazeReadClientId],
    queryFn: async () => {
      if (!brazeReadClientId) return null;
      const { data, error } = await supabase
        .from('client_platforms_public')
        .select('*')
        .eq('client_id', brazeReadClientId)
        .eq('platform', 'braze')
        .order('last_sync_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!brazeReadClientId,
    staleTime: 60_000,
  });

  /** Platform row used to invoke sync — same client as `brazeReadClientId` when using admin read fallback. */
  const lifecycleSyncPlatform = brazePlatform ?? dashboardBrazePlatform ?? null;

  /** Same client as Analytics / Settings visibility — includes admin fallback when Braze synced elsewhere. */
  const canViewLifecycleFromBraze =
    hasBrazeOnWorkspace || Boolean(dashboardBrazePlatform?.is_connected);

  // Fetch latest synced canvases from normalized table (synced rows only — avoids schema_cache dumps).
  // raw_steps / raw_variants are intentionally excluded here (BRAZE_CANVASES_LIST_SELECT omits them to
  // avoid PostgREST payload overload). They are seeded into the query cache via the prefetch useEffect
  // after this list resolves, and fetched individually on canvas open via fetchLifecycleBrazeCanvasDetail.
  const { data: normalizedCanvases, isLoading: canvasesLoading } = useQuery({
    queryKey: ['braze_canvases', brazeReadClientId],
    queryFn: async () => {
      if (!brazeReadClientId) return [];

      const { data, error } = await supabase
        .from('braze_canvases')
        .select(BRAZE_CANVASES_LIST_SELECT)
        .eq('client_id', brazeReadClientId)
        // Latest lifecycle cards: newest by activity/sync timestamps.
        .order('last_entry', { ascending: false, nullsFirst: false })
        .order('updated_in_braze', { ascending: false, nullsFirst: false })
        .order('synced_at', { ascending: false, nullsFirst: false })
        .limit(30);
      if (error) throw error;

      return data ?? [];
    },
    enabled: !!brazeReadClientId && canViewLifecycleFromBraze,
  });

  // Fetch visibility settings
  const { data: visibilityData } = useQuery({
    queryKey: ['data-visibility-canvas', brazeReadClientId],
    queryFn: async () => {
      if (!brazeReadClientId) return [];
      const { data, error } = await supabase
        .from('data_visibility')
        .select('*')
        .eq('client_id', brazeReadClientId)
        .eq('item_type', 'canvas');
      if (error) throw error;
      return data as Array<{ item_id: string; is_visible: boolean }>;
    },
    enabled: !!brazeReadClientId && canViewLifecycleFromBraze,
  });

  const visibilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    visibilityData?.forEach(v => map.set(v.item_id, v.is_visible));
    return map;
  }, [visibilityData]);

  // Transform canvases to journey format — only `braze_canvases` rows (no Braze schema_cache / API dump merge).
  const journeys = useMemo(() => {
    if (!canViewLifecycleFromBraze) return [];

    const rawSource: unknown[] = Array.isArray(normalizedCanvases) ? normalizedCanvases : [];

    if (rawSource.length === 0) return [];

    return sortJourneysByNameAsc(
      rawSource.map((canvasRaw) => {
        const canvas = canvasRaw as Record<string, unknown>;
        const name = (canvas.name as string) ?? '';
        const taxonomy = parseCampaignTaxonomy(name);

        const stepsRecord = normalizeRawSteps(canvas.raw_steps ?? canvas.steps);

        const stepsList = Object.values(stepsRecord);

        let inferredChannels: string[] = [];
        if (stepsList.length > 0) {
          const channels = stepsList
            .map((s) => getLifecycleStepChannel(s as LifecycleCanvasStep))
            .filter((ch): ch is string => Boolean(ch))
            .filter((ch) => isLifecycleMessagingChannel(ch));
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

        const dbTotalRaw =
          typeof canvas.total_steps === 'number' && !Number.isNaN(canvas.total_steps)
            ? canvas.total_steps
            : undefined;

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
          draft: Boolean(canvas.draft),
          enabled: Boolean(canvas.enabled),
          description: (canvas.description as string | undefined) || 'Automated lifecycle journey',
          status: 'active' as const,
          tags: (canvas.tags as string[] | undefined) || [],
          channels: inferredChannels,
          first_entry: canvas.first_entry as string | undefined,
          last_entry: canvas.last_entry as string | undefined,
          created_at: canvas.created_at as string | undefined,
          updated_at: canvas.updated_at as string | undefined,
          synced_at: canvas.synced_at as string | undefined,
          created_in_braze: canvas.created_in_braze as string | undefined,
          updated_in_braze: canvas.updated_in_braze as string | undefined,
          taxonomy: { ...taxonomy, type: 'lifecycle' as const },
          variants: ((canvas.raw_variants ?? canvas.variants ?? []) as CanvasVariant[]),
          steps: stepsRecord,
          total_steps: computeLifecycleDisplayTouchpoints(stepsRecord, dbTotalRaw),
          /** DB column when Phase 3 stored counts but `raw_steps` empty or UI can't classify messaging */
          db_total_steps: dbTotalRaw,
          entry_type: canvas.entry_type as string | undefined,
          entry_segment_name: canvas.entry_segment_name as string | undefined,
          trigger_event_name: canvas.trigger_event_name as string | undefined,
          exception_events: canvas.exception_events as string[] | undefined,
          conversion_events: canvas.conversion_events,
          entry_filters: canvas.entry_filters,
          entries_last_30d: canvas.entries_last_30d as number | undefined,
          entries_last_60d: canvas.entries_last_60d as number | undefined,
          schedule_type: canvas.schedule_type as string | undefined,
          raw_steps: canvas.raw_steps,
          raw_variants: canvas.raw_variants,
        };
      }),
    );
  }, [normalizedCanvases, canViewLifecycleFromBraze]);

  // ─── S3 image + canvas-detail BATCH prefetch ──────────────────────────────────────────────────
  // Goal: by the time the user clicks a journey card, both the raw_steps JSON (flow chart data)
  // AND every touchpoint image are already in the HTTP cache → zero-latency open.
  //
  // Approach (same as Campaigns S3/session-cache model):
  //   1. Fast path: journeys with raw_steps already present get images warmed synchronously.
  //   2. Batch path: all remaining journey IDs are fetched in ONE DB query via
  //      fetchLifecycleBrazeCanvasDetailsBatch, then each result is seeded into React Query cache
  //      and images are warmed via preloadJourneyStepImages → localStorage image session cache.
  //   3. On subsequent visits, warmAllCachedLifecycleImages (at mount) fires new Image() for every
  //      previously-discovered URL — images are ready before the user sees the cards.
  useEffect(() => {
    const clientId = brazeReadClientId ?? workspaceClientId;
    if (!clientId || journeys.length === 0) return;
    let cancelled = false;

    const top = journeys.slice(0, JOURNEY_PAGE_SIZE);

    // Fast path: seed cache for journeys that already have raw_steps (no DB call needed).
    const needsFetch: string[] = [];
    for (const journey of top) {
      const journeyDbId = String(journey.dbId ?? journey.id ?? '');
      if (!journeyDbId) continue;

      if (journey.raw_steps != null) {
        preloadJourneyStepImages(journey.raw_steps, journey.raw_variants, clientId, journeyDbId);
        queryClient.setQueryData(
          ['lifecycle-braze-canvas-detail', clientId, journeyDbId],
          {
            id: journey.dbId,
            raw_steps: journey.raw_steps,
            raw_variants: journey.raw_variants,
            total_steps: journey.db_total_steps,
          },
        );
      } else {
        // Only fetch if not already in React Query cache.
        const cached = queryClient.getQueryData(['lifecycle-braze-canvas-detail', clientId, journeyDbId]);
        if (!cached) needsFetch.push(journeyDbId);
      }
    }

    // Batch fetch: one DB query for all missing canvas details.
    if (needsFetch.length > 0) {
      void (async () => {
        try {
          const batchResults = await fetchLifecycleBrazeCanvasDetailsBatch(clientId, needsFetch);
          if (cancelled) return;
          for (const row of batchResults) {
            const rowId = String(row.id ?? '');
            if (!rowId) continue;
            // Seed React Query cache so individual detail queries resolve instantly.
            queryClient.setQueryData(
              ['lifecycle-braze-canvas-detail', clientId, rowId],
              row,
            );
            // Warm images in BFS path order + persist to localStorage for instant warm on next visit.
            preloadJourneyStepImages(row.raw_steps, row.raw_variants, clientId, rowId);
          }
        } catch {
          // Batch failed — fall back to individual prefetches for remaining IDs.
          if (cancelled) return;
          for (const journeyDbId of needsFetch) {
            void queryClient.prefetchQuery({
              queryKey: ['lifecycle-braze-canvas-detail', clientId, journeyDbId],
              queryFn: () => fetchLifecycleBrazeCanvasDetail(clientId, journeyDbId),
              staleTime: LIFECYCLE_CANVAS_DETAIL_STALE_MS,
            });
          }
        }
      })();
    }

    return () => { cancelled = true; };
  }, [journeys, brazeReadClientId, workspaceClientId, queryClient]);

  const isItemVisible = useCallback((brazeOrVisibilityId: string) => {
    const explicitSetting = visibilityMap.get(brazeOrVisibilityId);
    if (explicitSetting !== undefined) return explicitSetting;
    return true;
  }, [visibilityMap]);

  /**
   * Open the modal immediately. Never `await` the detail fetch here — large `raw_steps` JSON can take many
   * seconds and looked like “cards don’t open”. Detail still loads via the same query key + shared `queryFn`
   * (often already warm from list prefetch / hover).
   */
  const prefetchCanvasDetailForJourney = useCallback(
    (journey: { dbId?: string; id?: string }) => {
      const clientId = brazeReadClientId ?? workspaceClientId;
      const journeyDbId = String(journey.dbId ?? journey.id ?? '');
      if (!clientId || !journeyDbId) return;
      void queryClient.prefetchQuery({
        queryKey: ['lifecycle-braze-canvas-detail', clientId, journeyDbId],
        queryFn: () => fetchLifecycleBrazeCanvasDetail(clientId, journeyDbId),
        staleTime: LIFECYCLE_CANVAS_DETAIL_STALE_MS,
      });
    },
    [brazeReadClientId, workspaceClientId, queryClient],
  );

  const openJourneyDetail = useCallback(
    (journey: (typeof journeys)[number]) => {
      setSelectedJourney(journey);
      prefetchCanvasDetailForJourney(journey);
    },
    [prefetchCanvasDetailForJourney],
  );

  const pickableJourneys = useMemo(
    () =>
      [...journeys]
        .filter((j) => isItemVisible(j.id))
        .sort((a, b) =>
          String(a.displayName ?? a.name ?? '').localeCompare(
            String(b.displayName ?? b.name ?? ''),
            undefined,
            { sensitivity: 'base' },
          ),
        ),
    [journeys, isItemVisible],
  );

  /** Restore page-level hidden canvases after refresh (browser only). Layout runs before paint so persist effect does not overwrite LS with an empty Set. */
  useLayoutEffect(() => {
    setLifecycleCanvasPrefsReady(false);
    if (!brazeReadClientId) {
      setHiddenCanvasDbIds(new Set());
      setLifecycleCanvasPrefsReady(true);
      return;
    }
    try {
      const raw = localStorage.getItem(
        `${LIFECYCLE_HIDDEN_CANVAS_IDS_KEY}:${brazeReadClientId}`,
      );
      if (!raw) {
        setHiddenCanvasDbIds(new Set());
      } else {
        const arr = JSON.parse(raw) as unknown;
        if (!Array.isArray(arr)) {
          setHiddenCanvasDbIds(new Set());
        } else {
          setHiddenCanvasDbIds(
            new Set(arr.filter((x): x is string => typeof x === 'string' && x.length > 0)),
          );
        }
      }
    } catch {
      setHiddenCanvasDbIds(new Set());
    } finally {
      setLifecycleCanvasPrefsReady(true);
    }
  }, [brazeReadClientId]);

  /** Drop hidden ids that no longer exist in the synced list (after data has loaded). */
  useEffect(() => {
    if (normalizedCanvases === undefined) return;
    const valid = new Set(
      normalizedCanvases.map((row) => String((row as { id?: unknown }).id ?? '')),
    );
    setHiddenCanvasDbIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
      });
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [normalizedCanvases]);

  useEffect(() => {
    if (!brazeReadClientId || !lifecycleCanvasPrefsReady) return;
    try {
      localStorage.setItem(
        `${LIFECYCLE_HIDDEN_CANVAS_IDS_KEY}:${brazeReadClientId}`,
        JSON.stringify([...hiddenCanvasDbIds]),
      );
    } catch {
      /* quota / private mode */
    }
  }, [brazeReadClientId, hiddenCanvasDbIds, lifecycleCanvasPrefsReady]);

  // Filter journeys, then sort (name / Canvas tag / time running)
  const filteredJourneys = useMemo(() => {
    const filtered = journeys.filter((journey) => {
      if (!isItemVisible(journey.id)) return false;
      if (hiddenCanvasDbIds.has(journey.dbId)) return false;

      // Lifecycle should only show journeys whose most relevant activity date or sync date is in 2026.
      const recencyMs = journeyRecencyMs(journey);
      const activityYear = recencyMs ? new Date(recencyMs).getFullYear() : 0;
      const syncYear = journey.synced_at ? new Date(journey.synced_at).getFullYear() : 0;

      if (activityYear !== 2026 && syncYear !== 2026) return false;

      const matchesSearch =
        journey.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        journey.description?.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesChannel = true;
      if (channelFilter !== 'All') {
        matchesChannel =
          journey.channels?.some((ch) => {
            const normalizedCh = ch.toLowerCase().replace(/[-_]/g, '');
            const normalizedFilter = channelFilter.toLowerCase().replace(/[-_]/g, '');
            return (
              normalizedCh === normalizedFilter ||
              normalizedCh.includes(normalizedFilter) ||
              normalizedFilter.includes(normalizedCh)
            );
          }) || false;
      }

      let matchesLaunchDate = true;
      if (launchDateFilter !== 'All') {
        if (!recencyMs) {
          matchesLaunchDate = false;
        } else {
          const daysDiff = Math.floor((Date.now() - recencyMs) / (1000 * 60 * 60 * 24));
          if (launchDateFilter === '7days') matchesLaunchDate = daysDiff <= 7;
          else if (launchDateFilter === '15days') matchesLaunchDate = daysDiff <= 15;
          else if (launchDateFilter === '30days') matchesLaunchDate = daysDiff <= 30;
          else if (launchDateFilter === '90days') matchesLaunchDate = daysDiff <= 90;
          else if (launchDateFilter === 'year') matchesLaunchDate = daysDiff <= 365;
        }
      }

      return matchesSearch && matchesChannel && matchesLaunchDate;
    });
    if (lifecycleSortMode === 'recent') return sortJourneysByRecentDesc(filtered);
    if (lifecycleSortMode === 'touchpoints') return sortJourneysByTouchpointsDesc(filtered);
    if (lifecycleSortMode === 'name') return sortJourneysByNameAsc(filtered);
    if (lifecycleSortMode === 'tag') return sortJourneysByFirstTagAsc(filtered);
    if (lifecycleSortMode === 'time_running_short') return sortJourneysByTimeRunning(filtered, 'asc');
    return sortJourneysByTimeRunning(filtered, 'desc');
  }, [
    journeys,
    searchQuery,
    channelFilter,
    launchDateFilter,
    hiddenCanvasDbIds,
    lifecycleSortMode,
    isItemVisible,
  ]);

  const top30Journeys = useMemo(() => {
    return filteredJourneys.slice(0, 30);
  }, [filteredJourneys]);

  const journeyTotalPages = Math.max(1, Math.ceil(top30Journeys.length / JOURNEY_PAGE_SIZE));

  const journeyRangeStart =
    top30Journeys.length === 0
      ? 0
      : (Math.min(journeyPage, journeyTotalPages) - 1) * JOURNEY_PAGE_SIZE + 1;
  const journeyRangeEnd = Math.min(
    top30Journeys.length,
    Math.min(journeyPage, journeyTotalPages) * JOURNEY_PAGE_SIZE,
  );

  useEffect(() => {
    setJourneyPage(1);
  }, [searchQuery, channelFilter, launchDateFilter, lifecycleSortMode, hiddenCanvasDbIds]);

  useEffect(() => {
    setJourneyPage((p) => Math.min(p, journeyTotalPages));
  }, [journeyTotalPages]);

  const paginatedJourneys = useMemo(() => {
    const safePage = Math.min(journeyPage, journeyTotalPages);
    const start = (safePage - 1) * JOURNEY_PAGE_SIZE;
    return top30Journeys.slice(start, start + JOURNEY_PAGE_SIZE);
  }, [top30Journeys, journeyPage, journeyTotalPages]);

  const listLoading =
    canViewLifecycleFromBraze &&
    (brazeDashboardClientLoading ||
      dashboardBrazePlatformFetching ||
      (!!brazeReadClientId && canvasesLoading));



  return (
    <>
      <TooltipProvider delayDuration={300}>
        {selectedJourney ? (
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="mb-6">
              <Button variant="ghost" onClick={() => setSelectedJourney(null)} className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back to Journeys
              </Button>
            </div>
            {(() => {
              const j = selectedJourney as Record<string, unknown>;
              const title = String(j.displayName ?? j.name ?? 'Journey');
              const { Icon, gradient, shadow } = getJourneyVisuals(String(j.name ?? ''));
              const hdrSteps = normalizeRawSteps(j.steps as Record<string, LifecycleCanvasStep> | undefined);
              const hdrBadge = formatLifecycleStepBadge(
                hdrSteps,
                (j as { db_total_steps?: number }).db_total_steps,
              );
              const headerDraft = Boolean(j.draft);
              const headerDisabled = j.enabled === false;
              return (
                <div className="mb-8 space-y-2">
                  <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold leading-snug sm:text-3xl text-foreground">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-md ring-2 ring-white/10',
                        `bg-gradient-to-br ${gradient}`,
                        shadow,
                      )}
                    >
                      <Icon className="h-5 w-5 text-white drop-shadow" />
                    </div>
                    <span className="break-words">{title}</span>
                    {headerDraft && (
                      <Badge variant="outline" className="shrink-0 border-amber-500/40 bg-amber-500/10 font-normal text-amber-900 dark:text-amber-200">
                        Draft
                      </Badge>
                    )}
                    {!headerDraft && headerDisabled && (
                      <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                        Disabled
                      </Badge>
                    )}
                  </h1>
                  <p className="text-muted-foreground text-sm flex items-center gap-2">
                    {hdrBadge.line}
                  </p>
                </div>
              );
            })()}
            <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden h-[calc(100vh-16rem)] min-h-[600px] flex flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-6 pb-6 pt-6 [scrollbar-gutter:stable]">
                <JourneyDetail
                  journey={selectedJourney}
                  clientId={brazeReadClientId ?? workspaceClientId}
                  inDialog={false}
                  onBack={() => setSelectedJourney(null)}
                  onViewTouchpoint={(step: unknown) => setSelectedTouchpoint(step)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="relative mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
            <div
              className="pointer-events-none absolute inset-x-0 -top-px h-72 max-w-7xl rounded-b-[2rem] bg-gradient-to-b from-teal-500/[0.07] via-violet-500/[0.04] to-transparent dark:from-teal-950/35 dark:via-violet-950/25 dark:to-transparent"
              aria-hidden
            />

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              <PageHeader
                className="min-w-0 flex-1"
                title="Lifecycle"
                titleClassName="text-4xl sm:text-5xl text-black dark:text-white"
                description={
                  canViewLifecycleFromBraze
                    ? 'Preview synced Braze canvases as journeys (steps load per canvas from your workspace DB). Sort by Canvas tags from Braze; open a card for the full flow.'
                    : 'Connect Braze to sync multi-touch journeys into this workspace.'
                }
              />
            </div>

            {!canViewLifecycleFromBraze && (
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
                      'mb-8 flex h-12 w-12 items-center justify-center rounded-full',
                      'bg-primary/[0.07] text-primary shadow-inner',
                      'ring-1 ring-primary/15',
                    )}
                    aria-hidden
                  >
                    <Workflow className="h-6 w-6" strokeWidth={1.25} />
                  </div>
                  <h2 className="text-balance text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">
                    Lifecycle journeys are hidden until Braze is connected.
                  </h2>
                  <p className="mt-4 max-w-sm text-pretty text-xs leading-relaxed text-muted-foreground sm:text-sm">
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

            {canViewLifecycleFromBraze && (
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

                  <Select
                    value={lifecycleSortMode}
                    onValueChange={(v) =>
                      setLifecycleSortMode(
                        v as 'recent' | 'touchpoints' | 'name' | 'tag' | 'time_running_short' | 'time_running_long',
                      )
                    }
                  >
                    <SelectTrigger className="w-[220px] border-border/70 bg-background/80">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Most recent activity</SelectItem>
                      <SelectItem value="touchpoints">Touchpoints (most first)</SelectItem>
                      <SelectItem value="name">Name (A–Z)</SelectItem>
                      <SelectItem value="tag">Canvas tag (A–Z)</SelectItem>
                      <SelectItem value="time_running_short">Time running · shortest first</SelectItem>
                      <SelectItem value="time_running_long">Time running · longest first</SelectItem>
                    </SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-border/70 bg-background/80 shadow-sm"
                        aria-label="Choose which canvases to show on this page"
                      >
                        <Eye className="mr-2 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                        Canvases
                        {hiddenCanvasDbIds.size > 0 ? (
                          <Badge
                            variant="secondary"
                            className="ml-2 tabular-nums text-[10px] font-normal"
                          >
                            {
                              pickableJourneys.filter((j) => !hiddenCanvasDbIds.has(j.dbId)).length
                            }
                            /{pickableJourneys.length}
                          </Badge>
                        ) : null}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[min(100vw-2rem,22rem)] p-0"
                      align="start"
                      side="bottom"
                      sideOffset={6}
                      avoidCollisions={false}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
                        <p className="text-sm font-medium text-foreground">Show on page</p>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => setHiddenCanvasDbIds(new Set())}
                          >
                            All
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() =>
                              setHiddenCanvasDbIds(new Set(pickableJourneys.map((j) => j.dbId)))
                            }
                          >
                            None
                          </Button>
                        </div>
                      </div>
                      {/* Vertical scroll for the whole menu; one shared horizontal scroll for all rows (not per-row). */}
                      <div
                        className={cn(
                          'max-h-[min(50vh,280px)] w-full min-w-0 overflow-y-auto overflow-x-hidden',
                          '[scrollbar-width:thin]',
                        )}
                      >
                        <div
                          className={cn(
                            'w-full min-w-0 overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]',
                            '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
                          )}
                        >
                          <ul className="w-max min-w-full space-y-0.5 p-2" role="list">
                            {pickableJourneys.map((j) => {
                              const label = String(j.displayName ?? j.name ?? 'Journey');
                              const checked = !hiddenCanvasDbIds.has(j.dbId);
                              return (
                                <li key={j.dbId}>
                                  <label
                                    className="flex w-max min-w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                                    htmlFor={`lifecycle-canvas-${j.dbId}`}
                                    title={label}
                                  >
                                    <Checkbox
                                      id={`lifecycle-canvas-${j.dbId}`}
                                      checked={checked}
                                      onCheckedChange={(v) => {
                                        const on = v === true;
                                        setHiddenCanvasDbIds((prev) => {
                                          const next = new Set(prev);
                                          if (on) next.delete(j.dbId);
                                          else next.add(j.dbId);
                                          return next;
                                        });
                                      }}
                                      className="shrink-0"
                                      aria-label={label}
                                    />
                                    <span className="whitespace-nowrap leading-snug">{label}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
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



            {!canViewLifecycleFromBraze ? null : listLoading ? (
              <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4 p-6">
                <LoadingPage message="Loading journeys…" />
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3',
                  )}
                >
                  {top30Journeys.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
                      <Workflow className="h-12 w-12 text-muted-foreground opacity-60" aria-hidden />
                      <p className="font-medium text-foreground">No journeys synced yet</p>
                      <p className="max-w-md text-sm text-muted-foreground">
                        Run <strong className="font-medium text-foreground">Sync All from Braze</strong> on the Dashboard so rows appear in{' '}
                        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">braze_canvases</code>.
                      </p>
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
                        onClick={() => openJourneyDetail(journey)}
                        onPointerEnter={() => prefetchCanvasDetailForJourney(journey)}
                        onPointerDown={() => prefetchCanvasDetailForJourney(journey)}
                      />
                    ))
                  )}
                </div>
                {top30Journeys.length > 0 && journeyTotalPages > 1 && (
                  <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-5 sm:flex-row">
                    <p className="text-sm text-muted-foreground">
                      Showing{' '}
                      <span className="font-medium text-foreground">
                        {journeyRangeStart}–{journeyRangeEnd}
                      </span>{' '}
                      of {top30Journeys.length}
                    </p>
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
        )}
      </TooltipProvider>

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
                        <p className="font-medium">{stripBrazeLiquidForDisplay(message?.subject || selectedTouchpoint.subject || '')}</p>
                        {(message?.preheader || selectedTouchpoint.preheader) && (
                          <p className="text-sm text-muted-foreground mt-1">{stripBrazeLiquidForDisplay(message?.preheader || selectedTouchpoint.preheader || '')}</p>
                        )}
                      </div>
                    )}
                    {(message?.html_content || selectedTouchpoint.html_content || selectedTouchpoint.html_preview) ? (
                      <div className="border rounded-lg overflow-hidden bg-white">
                        <iframe
                          srcDoc={sanitizeBrazeEmailHtmlForIframe(
                            message?.html_content || selectedTouchpoint.html_content || selectedTouchpoint.html_preview,
                          )}
                          className="w-full h-[600px]"
                          title="Email Preview"
                          sandbox=""
                        />
                      </div>
                    ) : message?.body ? (
                      <div className="p-4 border rounded-lg bg-card">
                        <p className="text-sm">{plainTextPreviewFromBrazeMessageBody(message.body)}</p>
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
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl p-0.5">
                            <BRCGIcon className="h-full w-full max-h-10 max-w-10 object-contain sm:max-h-11 sm:max-w-11" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">BRCG • now</p>
                            <p className="font-semibold text-sm mt-0.5">
                              {message?.title || selectedTouchpoint.title || selectedTouchpoint.name}
                            </p>
                            {(message?.body || selectedTouchpoint.body) && (
                              <p className="text-sm text-muted-foreground line-clamp-3 mt-1">
                                {plainTextPreviewFromBrazeMessageBody(
                                  message?.body || selectedTouchpoint.body,
                                )}
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
                            <iframe
                              srcDoc={sanitizeBrazeEmailHtmlForIframe(bodyContent)}
                              className="w-full h-[600px]"
                              title="In-App Message Preview"
                              sandbox=""
                            />
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
                            {bodyContent && (
                              <p className="text-sm text-muted-foreground mt-2">
                                {plainTextPreviewFromBrazeMessageBody(bodyContent)}
                              </p>
                            )}
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
                      <p className="text-sm">
                        {plainTextPreviewFromBrazeMessageBody(
                          message?.body || selectedTouchpoint.body,
                        ) || 'SMS message content'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
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
    if (!isLifecycleMessagingChannel(s)) continue;
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

/** Fills the flow area while canvas detail loads — reads as “layout arriving”, not an error state. */
function JourneyFlowPreviewSkeleton() {
  return (
    <div
      className="space-y-4 rounded-xl border border-border/50 bg-gradient-to-b from-muted/30 via-muted/10 to-transparent p-4 shadow-inner"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Workflow className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
          <div className="h-3 w-32 rounded-full bg-muted-foreground/12" />
        </div>
        <div className="h-5 w-24 rounded-md bg-muted-foreground/10" />
      </div>
      <div className="flex gap-3 overflow-hidden pb-1 pt-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="w-[200px] shrink-0 space-y-2 rounded-lg border border-border/40 bg-card/90 p-2 shadow-sm"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="h-[120px] w-full animate-pulse rounded-md bg-gradient-to-br from-muted-foreground/[0.09] to-muted-foreground/[0.04]" />
            <div className="h-2 w-[88%] animate-pulse rounded-full bg-muted-foreground/10" />
            <div className="h-2 w-[55%] animate-pulse rounded-full bg-muted-foreground/10" />
          </div>
        ))}
      </div>
      <span className="sr-only">Journey path preview is preparing</span>
    </div>
  );
}

// Journey Card Component — Campaigns-style hero + touchpoints + per-channel pills + View journey
function JourneyCard({
  journey,
  viewMode,
  onClick,
  onPointerEnter,
  onPointerDown,
}: {
  journey: any;
  viewMode: 'grid' | 'list';
  onClick: () => void;
  onPointerEnter?: () => void;
  /** Warms canvas detail before click (pointer down fires before click — hides perceived lag). */
  onPointerDown?: () => void;
}) {
  const titleText = String(journey.displayName || journey.name || 'Journey');
  const titleForVisual = String(journey.name ?? journey.displayName ?? '');
  const { Icon: TitleIcon, gradient: titleGradient, shadow: titleShadow } =
    getJourneyVisuals(titleForVisual);
  const channels = journey.channels as string[] | undefined;
  const stepsRecord = normalizeRawSteps(journey.steps) as Record<string, LifecycleCanvasStep>;
  const stepBadge = formatLifecycleStepBadge(
    stepsRecord,
    (journey as { db_total_steps?: number }).db_total_steps,
  );
  const channelPills = journeyCardChannelPillList(channels);

  const titleIconBadge = (
    <div
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ring-1 ring-white/30 dark:ring-black/25',
        titleGradient,
        titleShadow,
      )}
      aria-hidden
    >
      <TitleIcon className="h-6 w-6 drop-shadow" strokeWidth={2} />
    </div>
  );

  const open = () => onClick();

  const isDraft = Boolean(journey.draft);
  const isDisabled = journey.enabled === false;

  const touchpointBadge = (
    <span
      className={cn(
        'inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        stepBadge.variant === 'db_only'
          ? 'border-amber-500/35 bg-amber-500/[0.08] text-amber-900 dark:text-amber-200'
          : 'border-teal-500/25 bg-gradient-to-r from-teal-500/[0.08] to-emerald-500/[0.06] text-teal-800 dark:text-teal-200',
      )}
      title={stepBadge.variant === 'db_only' ? 'Step JSON not loaded for this canvas yet — run Sync All from Braze on the Dashboard' : undefined}
    >
      <GitBranch className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
      <span className="min-w-0 text-left leading-snug">{stepBadge.line}</span>
    </span>
  );

  const statusBadges =
    isDraft || isDisabled ? (
      <div className="flex flex-wrap gap-1.5">
        {isDraft && (
          <Badge variant="outline" className="text-xs font-normal border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
            Draft
          </Badge>
        )}
        {!isDraft && isDisabled && (
          <Badge variant="outline" className="text-xs font-normal border-muted-foreground/30 text-muted-foreground">
            Disabled
          </Badge>
        )}
      </div>
    ) : null;

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
        onPointerEnter={() => {
          onPointerEnter?.();
        }}
        onPointerDown={() => {
          onPointerDown?.();
        }}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3 min-w-0">
            {titleIconBadge}
            <Tooltip>
              <TooltipTrigger asChild>
                <h3 className="line-clamp-1 min-w-0 text-left text-sm font-medium leading-snug text-foreground">{titleText}</h3>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">{titleText}</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5 shrink-0 opacity-75" aria-hidden />
            <span>{stepBadge.line}</span>
          </div>
          {statusBadges}
          {channelPillRow}
          <div className="mt-1 border-t border-border/60 pt-3 flex items-center justify-end">
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground/90 group-hover:text-primary transition-colors">
              View Journey
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
      onPointerEnter={() => {
        onPointerEnter?.();
      }}
      onPointerDown={() => {
        onPointerDown?.();
      }}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          {titleIconBadge}
          <Tooltip>
            <TooltipTrigger asChild>
              <h3 className="line-clamp-1 min-w-0 text-left text-sm font-medium leading-snug text-foreground">{titleText}</h3>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm">{titleText}</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5 shrink-0 opacity-75" aria-hidden />
          <span>{stepBadge.line}</span>
        </div>
        {statusBadges}
        {channelPillRow}
        <div className="mt-auto border-t border-border/60 pt-4 flex items-center justify-end">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground/90 group-hover:text-primary transition-colors">
            View Journey
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

  const {
    data: detailRow,
    isError: detailIsError,
    error: detailErrorObj,
    isFetched: detailFetched,
  } = useQuery({
    queryKey: ['lifecycle-braze-canvas-detail', clientId, journeyDbId],
    queryFn: () => fetchLifecycleBrazeCanvasDetail(clientId!, journeyDbId),
    enabled: !!clientId && !!journeyDbId,
    staleTime: LIFECYCLE_CANVAS_DETAIL_STALE_MS,
  });

  const merged = useMemo(() => {
    if (!detailRow) return journey;
    const rowId = detailRow.id != null ? String(detailRow.id).trim() : '';
    if (rowId && rowId !== journeyDbId) return journey;
    // journeyDbId intentionally included so merged re-derives when the opened journey changes
    const stepsRecord = normalizeRawSteps(detailRow.raw_steps);
    const variants = (detailRow.raw_variants ?? journey.variants) as CanvasVariant[];
    const priorSteps = normalizeRawSteps(journey.steps);
    const stepsForCount =
      Object.keys(stepsRecord).length > 0 ? stepsRecord : priorSteps;
    const dbTotalMerged =
      typeof detailRow.total_steps === 'number' && !Number.isNaN(detailRow.total_steps)
        ? detailRow.total_steps
        : (journey as { db_total_steps?: number }).db_total_steps;

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
      total_steps: computeLifecycleDisplayTouchpoints(stepsForCount, dbTotalMerged),
      db_total_steps: dbTotalMerged,
      draft: Boolean(detailRow.draft ?? journey.draft),
      enabled: Boolean(detailRow.enabled ?? journey.enabled),
    };
  }, [journey, detailRow, journeyDbId]);

  const stepsRecord = useMemo(
    () => normalizeRawSteps(merged.steps as Record<string, LifecycleCanvasStep> | undefined),
    [merged.steps],
  );

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

  const stepSummaryBadge = formatLifecycleStepBadge(
    stepsRecord,
    (merged as { db_total_steps?: number }).db_total_steps,
  );
  const channelCounts = useMemo(
    () =>
      Object.values(stepsRecord).reduce((acc: Record<string, number>, step: LifecycleCanvasStep) => {
        if (!isMessagingTouchpointStep(step)) return acc;
        const ch = getLifecycleStepChannel(step) || 'email';
        acc[ch] = (acc[ch] || 0) + 1;
        return acc;
      }, {}),
    [stepsRecord],
  );

  const flowChartCanvas = useMemo(() => {
    if (Object.keys(stepsRecord).length === 0) return null;
    return {
      id: String((merged as { dbId?: string }).dbId ?? merged.id),
      name: String(merged.name ?? ''),
      description: merged.description as string | undefined,
      enabled: merged.enabled !== false,
      draft: Boolean(merged.draft),
      variants: (merged.variants as CanvasVariant[]) || [],
      steps: stepsRecord as Record<string, CanvasStep>,
      tags: merged.tags as string[] | undefined,
      first_entry: merged.first_entry as string | undefined,
      last_entry: merged.last_entry as string | undefined,
    };
  }, [merged, stepsRecord]);

  const handleFlowViewStep = useCallback(
    (step: CanvasStep) => {
      onViewTouchpoint({ ...step, delay: step.delay_formatted });
    },
    [onViewTouchpoint],
  );

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
                  {String(merged.displayName || merged.name || '')}
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
                    {stepSummaryBadge.line}
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

          {/* Flow chart: raw_steps are fetched individually after the list loads (BRAZE_CANVASES_LIST_SELECT
               intentionally omits them). Show a skeleton while the detail query is in-flight so the user
               never sees the premature "no steps" alert during normal loading. */}
          {flowChartCanvas ? (
            <HorizontalFlowChart canvas={flowChartCanvas} onViewStep={handleFlowViewStep} />
          ) : !detailFetched && !detailIsError ? (
            <JourneyFlowPreviewSkeleton />
          ) : detailIsError ? (
            <Alert variant="destructive" className="border-destructive/40">
              <AlertDescription>
                Could not load step data for this canvas.{' '}
                {detailErrorObj instanceof Error ? detailErrorObj.message : 'Try again in a moment.'}
              </AlertDescription>
            </Alert>
          ) : detailFetched && detailRow === null ? (
            <Alert className="border-amber-500/35 bg-amber-500/[0.06]">
              <AlertDescription>
                This canvas was not found for the current workspace (it may have been removed or the workspace
                changed). Go back and refresh the Lifecycle list.
              </AlertDescription>
            </Alert>
          ) : detailFetched && Object.keys(stepsRecord).length === 0 ? (
            <Alert>
              <AlertDescription className="text-muted-foreground">
                No journey steps are recorded for this canvas. Try running Sync All from Braze on the Dashboard.
              </AlertDescription>
            </Alert>
          ) : null}
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

