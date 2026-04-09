import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Search,
  Mail,
  Bell,
  Smartphone,
  LayoutGrid,
  List,
  Sparkles,
  Calendar as CalendarIcon,
  CalendarDays,
  RefreshCw,
  Info,
  ArrowRight,
  Inbox,
  FilterX,
  ChevronLeft,
  ChevronRight,
  Bug,
  Database,
  MessageSquare,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  getDay,
  isAfter,
  subQuarters,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
} from 'date-fns';
import { cn, scrollAppMainToTopAfterLayout } from '@/lib/utils';
import { schedulePreloadCampaignBucketDetailImages } from '@/lib/campaignCreativeImageUrl';
import { useDoubleGoodPlatforms, useResolvedClientId } from '@/hooks/useDoubleGoodClient';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  brazeSyncPartialDescription,
  formatBrazeSyncInvokeError,
  type BrazeSyncInvokeBody,
} from '@/lib/brazeSyncInvoke';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import {
  buildCampaignSearchIndex,
  extractPreviewImageUrl,
  formatCampaignRate,
  getCampaignPreviewLine,
  getCampaignSecondaryLine,
  normalizeCampaignChannel,
  resolveEmailModalPreview,
  sanitizeCampaignDisplayText,
  sanitizeCampaignDisplayWithMeta,
  type CampaignChannelUi,
  type CampaignPreviewFields,
} from '@/lib/campaignDisplay';
import { CampaignCreativeHero } from '@/components/campaigns/CampaignCreativeHero';
import { EmailModalCreative } from '@/components/campaigns/EmailModalCreative';
import { PushSmsModalHero } from '@/components/campaigns/PushSmsModalHero';
import { buildCampaignModalStatRows } from '@/lib/campaignModalStats';
import {
  commitCreativeToCaches,
  loadBrazeCreativeSessionCache,
  warmSessionCacheImagesIdle,
} from '@/lib/brazeCreativeSessionCache';

interface PlaceholderCampaign {
  id: string;
  name: string;
  channel: CampaignChannelUi;
  subject?: string;
  preheader?: string;
  push_title?: string;
  push_body?: string;
  /** Braze campaign description from raw_details (optional). */
  description?: string;
  sent_date: string;
  status: 'sent' | 'scheduled' | 'draft';
  opens?: number;
  clicks?: number;
  segment?: string;
  deliveries?: number;
  /** Braze `sends` when `deliveries` is empty in API aggregate */
  sends?: number;
  open_rate?: string;
  click_rate?: string;
  unsubs?: number;
  /** Resolved preview line (always safe to render). */
  creative_preview?: string;
  preview_image_url?: string;
}

type CampaignViewModel = PlaceholderCampaign & {
  searchIndex: string;
  updatedAtMs: number;
  createdAtMs: number;
  openRateSort: number;
  clickRateSort: number;
};

type CampaignSortKey = 'data_desc' | 'sent_desc' | 'updated_desc' | 'created_desc' | 'performance_desc';

function sortMetricNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Higher = more row-level metrics (volume + engagement). */
function campaignDataRichnessScore(c: CampaignViewModel): number {
  return (
    sortMetricNumber(c.deliveries) +
    sortMetricNumber(c.opens) +
    sortMetricNumber(c.clicks) +
    sortMetricNumber(c.unsubs)
  );
}

const PAGE_SIZE = 24;

type BrazeCampaignRow = {
  id: string;
  braze_campaign_id?: string | null;
  name: string;
  channel?: string | null;
  subject?: string | null;
  preheader?: string | null;
  status?: string | null;
  sent_date?: string | null;
  opens?: number | null;
  clicks?: number | null;
  deliveries?: number | null;
  sends?: number | null;
  open_rate?: number | string | null;
  click_rate?: number | string | null;
  unsubs?: number | null;
  segment?: string | null;
  creative_preview?: string | null;
  raw_details?: Record<string, unknown> | null;
  /** Full public URL for an uploaded creative in Supabase Storage */
  image_url?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  synced_at?: string | null;
};

const now = new Date();

const PLACEHOLDER_CAMPAIGNS: PlaceholderCampaign[] = [
  {
    id: '1',
    name: 'Spring Launch Announcement',
    channel: 'email',
    subject: "🌸 Spring is here! Check out what's new",
    preheader: 'New products, fresh deals, and more inside',
    sent_date: format(subDays(now, 1), 'yyyy-MM-dd'),
    status: 'sent',
    opens: 12450,
    clicks: 3200,
    segment: 'Engaged 180d',
    deliveries: 42300,
    open_rate: '29.4%',
    click_rate: '7.6%',
    unsubs: 84,
    creative_preview: 'Hero banner with spring floral imagery and CTA button',
  },
  {
    id: '2',
    name: 'Flash Sale Reminder',
    channel: 'push',
    push_title: '⚡ Flash Sale ends tonight!',
    push_body: "Don't miss 40% off everything. Tap to shop now.",
    sent_date: format(subDays(now, 2), 'yyyy-MM-dd'),
    status: 'sent',
    opens: 8900,
    clicks: 2100,
    segment: 'All Subscribers',
    deliveries: 31200,
    open_rate: '28.5%',
    click_rate: '6.7%',
    unsubs: 45,
    creative_preview: 'Bold "40% OFF" text with countdown timer',
  },
  {
    id: '3',
    name: 'Welcome Series — Day 1',
    channel: 'email',
    subject: "Welcome to the family! Here's what to do first",
    preheader: 'Get started in 3 easy steps',
    sent_date: format(subDays(now, 3), 'yyyy-MM-dd'),
    status: 'sent',
    opens: 15600,
    clicks: 5400,
    segment: 'New Subscribers',
    deliveries: 28400,
    open_rate: '54.9%',
    click_rate: '19.0%',
    unsubs: 12,
    creative_preview: 'Clean welcome layout with 3-step getting started guide',
  },
  {
    id: '4',
    name: 'Feature Update — In-App',
    channel: 'inapp',
    push_title: 'New: Dark Mode is here!',
    push_body: 'Try our brand-new dark mode. Easier on your eyes.',
    sent_date: format(subDays(now, 4), 'yyyy-MM-dd'),
    status: 'sent',
    segment: 'Active Users',
    deliveries: 18500,
    open_rate: '—',
    click_rate: '12.1%',
    unsubs: 0,
    creative_preview: 'Split-screen light/dark mode comparison',
  },
  {
    id: '5',
    name: 'Weekly Digest',
    channel: 'email',
    subject: 'Your weekly roundup is here 📬',
    preheader: 'Top stories, tips, and what\'s trending',
    sent_date: format(subDays(now, 5), 'yyyy-MM-dd'),
    status: 'sent',
    opens: 9800,
    clicks: 1500,
    segment: 'Engaged 90d',
    deliveries: 37200,
    open_rate: '26.3%',
    click_rate: '4.0%',
    unsubs: 62,
    creative_preview: 'Newsletter-style layout with featured articles',
  },
  {
    id: '6',
    name: 'Cart Abandonment Nudge',
    channel: 'push',
    push_title: 'You left something behind!',
    push_body: 'Your cart is waiting. Complete your order before items sell out.',
    sent_date: format(subDays(now, 6), 'yyyy-MM-dd'),
    status: 'sent',
    opens: 6200,
    clicks: 1800,
    segment: 'Cart Abandoners',
    deliveries: 14800,
    open_rate: '41.9%',
    click_rate: '12.2%',
    unsubs: 18,
    creative_preview: 'Product thumbnail with urgency messaging',
  },
  {
    id: '7',
    name: 'Loyalty Reward Unlocked',
    channel: 'email',
    subject: "🎉 You've earned a reward!",
    preheader: 'Redeem your points before they expire',
    sent_date: format(subDays(now, 7), 'yyyy-MM-dd'),
    status: 'sent',
    opens: 11200,
    clicks: 4100,
    segment: 'Loyalty Members',
    deliveries: 22100,
    open_rate: '50.7%',
    click_rate: '18.6%',
    unsubs: 8,
    creative_preview: 'Reward badge with confetti animation and CTA',
  },
  {
    id: '8',
    name: 'Summer Preview',
    channel: 'email',
    subject: '☀️ Summer Preview: First look inside',
    preheader: 'Be the first to see our summer collection',
    sent_date: format(subDays(now, 10), 'yyyy-MM-dd'),
    status: 'sent',
    opens: 13400,
    clicks: 3800,
    segment: 'Engaged 180d',
    deliveries: 41500,
    open_rate: '32.3%',
    click_rate: '9.2%',
    unsubs: 71,
    creative_preview: 'Product grid with summer color palette',
  },
];

const BRIEF_CALENDAR_ITEMS = [
  { id: 'b1', name: 'Memorial Day Sale Brief', date: format(subDays(now, -3), 'yyyy-MM-dd'), type: 'brief' as const },
  { id: 'b2', name: 'June Newsletter Brief', date: format(subDays(now, -7), 'yyyy-MM-dd'), type: 'brief' as const },
];

const channelIcons: Record<CampaignChannelUi, React.ReactNode> = {
  email: <Mail className="h-4 w-4" aria-hidden />,
  push: <Bell className="h-4 w-4" aria-hidden />,
  inapp: <Smartphone className="h-4 w-4" aria-hidden />,
  sms: <MessageSquare className="h-4 w-4" aria-hidden />,
};

const channelLabels: Record<CampaignChannelUi, string> = {
  email: 'Email',
  push: 'Push',
  inapp: 'In-App',
  sms: 'SMS',
};

const channelColors: Record<CampaignChannelUi, string> = {
  email: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  push: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
  inapp: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  sms: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
};

function parseRateToSort(s: string | undefined): number {
  if (!s || s === '—') return -1;
  const n = Number.parseFloat(s.replace(/%/g, ''));
  return Number.isFinite(n) ? n : -1;
}

function toPreviewFields(c: PlaceholderCampaign): CampaignPreviewFields {
  return {
    subject: c.subject,
    push_title: c.push_title,
    preheader: c.preheader,
    push_body: c.push_body,
    creative_preview: c.creative_preview,
    description: c.description,
    name: c.name,
  };
}

function enrichToViewModel(c: PlaceholderCampaign, index = 0): CampaignViewModel {
  const previewFields = toPreviewFields(c);
  const previewLine = getCampaignPreviewLine(previewFields);
  return {
    ...c,
    creative_preview: previewLine,
    searchIndex: buildCampaignSearchIndex({
      name: c.name,
      subject: c.subject,
      push_title: c.push_title,
      push_body: c.push_body,
      creative_preview: c.creative_preview,
      preheader: c.preheader,
    }),
    updatedAtMs: now.getTime() - index * 60_000,
    createdAtMs: now.getTime() - index * 120_000,
    openRateSort: parseRateToSort(c.open_rate),
    clickRateSort: parseRateToSort(c.click_rate),
  };
}

/** Same shape as Settings → Braze schema cache `campaigns` (list from Braze API during sync). */
function schemaCacheRowToPlaceholder(raw: unknown): PlaceholderCampaign | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? o.campaign_id ?? '').trim();
  const name = String(o.name ?? '').trim();
  if (!id || !name) return null;
  const lastSent = typeof o.last_sent === 'string' ? o.last_sent.trim() : '';
  let sent_date = format(new Date(), 'yyyy-MM-dd');
  let lastSentLabel: string | null = null;
  if (lastSent) {
    const d = new Date(lastSent);
    if (!Number.isNaN(d.getTime())) {
      sent_date = format(d, 'yyyy-MM-dd');
      lastSentLabel = format(d, 'MMM d, yyyy');
    }
  }
  const draft = o.draft === true;
  return {
    id,
    name,
    channel: 'email',
    sent_date,
    status: draft ? 'draft' : 'sent',
    creative_preview: lastSentLabel
      ? `Braze list snapshot · last sent ${lastSentLabel}`
      : 'Braze list snapshot (same source as Settings → Braze)',
  };
}

function sortCampaigns(list: CampaignViewModel[], sortKey: CampaignSortKey): CampaignViewModel[] {
  const out = [...list];
  const perfScore = (c: CampaignViewModel) =>
    Math.max(0, c.openRateSort) * 2 + Math.max(0, c.clickRateSort);

  out.sort((a, b) => {
    switch (sortKey) {
      case 'data_desc': {
        const byData = campaignDataRichnessScore(b) - campaignDataRichnessScore(a);
        if (byData !== 0) return byData;
        return new Date(b.sent_date).getTime() - new Date(a.sent_date).getTime();
      }
      case 'sent_desc':
        return new Date(b.sent_date).getTime() - new Date(a.sent_date).getTime();
      case 'updated_desc':
        return b.updatedAtMs - a.updatedAtMs;
      case 'created_desc':
        return b.createdAtMs - a.createdAtMs;
      case 'performance_desc':
        return perfScore(b) - perfScore(a);
      default:
        return 0;
    }
  });
  return out;
}

function CampaignsGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="flex h-full min-h-0 flex-col overflow-hidden">
          <Skeleton className="h-[132px] w-full shrink-0 rounded-none" />
          <CardContent className="flex flex-1 flex-col gap-3 p-4">
            <Skeleton className="h-4 w-3/4" />
            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <Skeleton className="h-5 w-14 rounded-full" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-10" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CampaignsListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex items-center gap-4 p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
            <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CalendarView({
  campaigns,
  briefs,
  onSelectCampaign,
}: {
  campaigns: CampaignViewModel[];
  briefs: typeof BRIEF_CALENDAR_ITEMS;
  onSelectCampaign: (c: CampaignViewModel) => void;
}) {
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  const days = eachDayOfInterval({ start, end });
  const startDayOfWeek = getDay(start);

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">{format(now, 'MMMM yyyy')}</h3>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-border">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {Array.from({ length: startDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[80px] bg-card p-2" />
        ))}
        {days.map(day => {
          const dayCampaigns = campaigns.filter(c => isSameDay(new Date(c.sent_date), day));
          const dayBriefs = briefs.filter(b => isSameDay(new Date(b.date), day));
          const isToday = isSameDay(day, now);
          return (
            <div
              key={day.toISOString()}
              className={cn('min-h-[80px] bg-card p-1.5', isToday && 'ring-1 ring-primary/50')}
            >
              <span className={cn('text-xs font-medium', isToday ? 'text-primary' : 'text-muted-foreground')}>
                {format(day, 'd')}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayCampaigns.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectCampaign(c)}
                    className={cn(
                      'w-full truncate rounded px-1 py-0.5 text-left text-[10px]',
                      channelColors[c.channel],
                    )}
                  >
                    {c.name}
                  </button>
                ))}
                {dayBriefs.map(b => (
                  <div
                    key={b.id}
                    className="truncate rounded px-1 py-0.5 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  >
                    📋 {b.name}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Modal / detail copy: remove ESP invisible characters, then em dash if nothing left. */
function displaySanitized(value: string | null | undefined): string {
  const s = sanitizeCampaignDisplayText(value);
  return s.length > 0 ? s : '—';
}

function PersonalizedLiquidBadge() {
  return (
    <Badge
      variant="outline"
      className="h-5 shrink-0 border-dashed px-1.5 text-[10px] font-normal text-muted-foreground"
    >
      Personalized
    </Badge>
  );
}

export default function Campaigns() {
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'calendar'>('grid');
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignViewModel | null>(null);
  const campaignDetailScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedCampaign) return;
    const el = campaignDetailScrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = 0;
    });
    return () => cancelAnimationFrame(id);
  }, [selectedCampaign?.id]);
  const [dateFilter, setDateFilter] = useState('All Time');
  const [sortBy, setSortBy] = useState<CampaignSortKey>('data_desc');
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { clientId: workspaceClientId, isClientLoading: workspaceClientLoading } = useResolvedClientId();
  const { isAdmin } = useAuth();
  const { data: platforms, isLoading: platformsLoading } = useDoubleGoodPlatforms();
  /** Stable check — avoids treating “no row yet” as disconnected while `platforms` is still loading. */
  const brazeConnected = Boolean(platforms?.some(p => p.platform === 'braze' && p.is_connected));
  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const schemaCacheCampaignRows = useMemo(() => {
    const cache = brazePlatform?.schema_cache as { campaigns?: unknown } | undefined;
    const list = cache?.campaigns;
    return Array.isArray(list) ? list : [];
  }, [brazePlatform?.schema_cache]);
  /** Must match `sync-braze` body `clientId` — not `useBrazeDashboardClientId()` (admin fallback can point at another workspace). */
  const showLiveCampaigns = Boolean(workspaceClientId && brazeConnected);
  /** Demo cards only when we know the workspace has no Braze link — never while platforms query is in flight (prevents fake rows flashing after API save). */
  const showDemoCampaigns =
    Boolean(workspaceClientId) &&
    !workspaceClientLoading &&
    !platformsLoading &&
    !brazeConnected;

  const handleSyncFromBraze = async () => {
    if (!workspaceClientId || !brazePlatform?.id) return;
    setSyncing(true);
    try {
      let round = 0;
      let totalProcessed = 0;

      while (round < 20) {
        round++;
        console.log(`[Campaign Sync] Starting round ${round}`);

        const { data, error } = await supabase.functions.invoke('sync-braze', {
          body: { clientId: workspaceClientId, platformId: brazePlatform.id, campaigns_only: true },
        });

        if (error) throw error;

        const inner = data?.data as { counts?: Record<string, number> } | undefined;
        const processed = inner?.counts?.campaigns_processed ?? 0;
        totalProcessed += processed;

        console.log(`[Campaign Sync] Round ${round}: processed=${processed}, total_found=${inner?.counts?.campaigns_found ?? 0}, partial=${data?.partial}`);

        // Refresh UI between rounds
        queryClient.invalidateQueries({ queryKey: ['braze_campaigns'] });

        // Stop if nothing new was processed (all campaigns enriched)
        if (processed === 0) {
          console.log(`[Campaign Sync] Done after ${round} round(s), total enriched=${totalProcessed}`);
          break;
        }
      }

      toast({
        title: 'Campaigns synced from Braze',
        description: `Enriched ${totalProcessed} campaigns in ${round} round(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ['braze_campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['doublegood-platforms'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-braze'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    } catch (error: unknown) {
      logger.error('Sync error:', error);
      const description = await formatBrazeSyncInvokeError(error);
      toast({
        title: 'Failed to sync campaigns',
        description,
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const {
    data: dbCampaigns,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['braze_campaigns', workspaceClientId, isAdmin],
    queryFn: async () => {
      const cid = workspaceClientId;
      if (!cid) return [];
      // Supabase defaults to 1000 rows max; fetch all pages
      const allRows: Record<string, unknown>[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        let query = supabase
          .from('braze_campaigns')
          .select('*');
        // Admins see all campaigns; non-admins only see their workspace
        if (!isAdmin) {
          query = query.eq('client_id', cid);
        }
        const { data: page, error: qErr } = await query
          .order('sent_date', { ascending: false })
          .range(from, from + pageSize - 1);
        if (qErr) throw qErr;
        if (!page || page.length === 0) break;
        allRows.push(...page);
        if (page.length < pageSize) break;
        from += pageSize;
      }
      // Admins see all client_ids — deduplicate by braze_campaign_id, keeping the row with most data
      if (isAdmin) {
        const seen = new Map<string, Record<string, unknown>>();
        for (const row of allRows) {
          const key = (row.braze_campaign_id as string) ?? (row.id as string);
          const existing = seen.get(key);
          if (!existing) {
            seen.set(key, row);
          } else {
            // Prefer the row with more non-null fields (richer details)
            const score = (r: Record<string, unknown>) =>
              Object.values(r).filter(v => v != null && v !== '').length;
            if (score(row) > score(existing)) {
              seen.set(key, row);
            }
          }
        }
        return Array.from(seen.values());
      }
      return allRows;
    },
    enabled: showLiveCampaigns,
  });

  const campaigns: CampaignViewModel[] = useMemo(() => {
    if (showLiveCampaigns) {
      if (isLoading) return [];

      const dbRows = Array.isArray(dbCampaigns) ? dbCampaigns : [];
      if (dbRows.length > 0) {
      return (dbRows as BrazeCampaignRow[]).map(row => {
      const rawDetails = (row.raw_details ?? {}) as Record<string, unknown>;
      const channel = normalizeCampaignChannel(row.channel);
      const push_title = typeof rawDetails.push_title === 'string' ? rawDetails.push_title : undefined;
      const push_body = typeof rawDetails.push_body === 'string' ? rawDetails.push_body : undefined;
      const description = typeof rawDetails.description === 'string' ? rawDetails.description : undefined;
      const fromColumn = typeof row.image_url === 'string' ? row.image_url.trim() : '';
      /** Do not fall back to raw `preview_image_url` — it bypasses Linktree/non-hero filtering in {@link extractPreviewImageUrl}. */
      const preview_image_url = fromColumn || extractPreviewImageUrl(rawDetails);

      const base: PlaceholderCampaign = {
        id: String(row.braze_campaign_id ?? row.id),
        name: row.name,
        channel,
        subject: row.subject ?? undefined,
        preheader: row.preheader ?? undefined,
        push_title,
        push_body,
        description,
        sent_date: row.sent_date ? format(new Date(row.sent_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        status: (row.status ?? 'draft') as PlaceholderCampaign['status'],
        opens: row.opens ?? undefined,
        clicks: row.clicks ?? undefined,
        segment: row.segment ?? undefined,
        deliveries: row.deliveries ?? undefined,
        sends: row.sends ?? undefined,
        open_rate: formatCampaignRate(row.open_rate),
        click_rate: formatCampaignRate(row.click_rate),
        unsubs: row.unsubs ?? undefined,
        creative_preview: row.creative_preview ?? undefined,
        preview_image_url,
      };

      const previewFields: CampaignPreviewFields = {
        subject: base.subject,
        push_title: base.push_title,
        preheader: base.preheader,
        push_body: base.push_body,
        creative_preview: base.creative_preview,
        description: base.description,
        name: base.name,
      };
      const previewLine = getCampaignPreviewLine(previewFields);

      const updatedAtMs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : 0;

      return {
        ...base,
        creative_preview: previewLine,
        searchIndex: buildCampaignSearchIndex({
          name: base.name,
          subject: base.subject,
          push_title: base.push_title,
          push_body: base.push_body,
          creative_preview: row.creative_preview,
          preheader: base.preheader,
        }),
        updatedAtMs,
        createdAtMs,
        openRateSort: parseRateToSort(base.open_rate),
        clickRateSort: parseRateToSort(base.click_rate),
      };
    });
      }

      if (schemaCacheCampaignRows.length > 0) {
        return schemaCacheCampaignRows
          .map((raw, i) => {
            const p = schemaCacheRowToPlaceholder(raw);
            return p ? enrichToViewModel(p, i) : null;
          })
          .filter((x): x is CampaignViewModel => x != null);
      }

      return [];
    }

    if (showDemoCampaigns) {
      return PLACEHOLDER_CAMPAIGNS.map((c, i) => enrichToViewModel(c, i));
    }

    return [];
  }, [
    dbCampaigns,
    showLiveCampaigns,
    showDemoCampaigns,
    isLoading,
    schemaCacheCampaignRows,
  ]);

  /** Warm browser cache for Storage campaign creatives (detail transform) after list is ready. */
  useEffect(() => {
    if (campaigns.length === 0) return;
    schedulePreloadCampaignBucketDetailImages(campaigns.map(c => c.preview_image_url));
  }, [campaigns]);

  const showLoading =
    workspaceClientLoading ||
    (Boolean(workspaceClientId) && platformsLoading) ||
    Boolean(showLiveCampaigns && isLoading);
  const showSampleBanner = showDemoCampaigns;
  const showSchemaSnapshotBanner =
    showLiveCampaigns &&
    !isLoading &&
    Array.isArray(dbCampaigns) &&
    dbCampaigns.length === 0 &&
    schemaCacheCampaignRows.length > 0;
  const isEmptyLive =
    showLiveCampaigns &&
    !isLoading &&
    !isError &&
    Array.isArray(dbCampaigns) &&
    dbCampaigns.length === 0 &&
    schemaCacheCampaignRows.length === 0;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return campaigns.filter(c => {
      const matchesSearch =
        !q ||
        c.searchIndex.includes(q) ||
        c.name.toLowerCase().includes(q);
      const matchesChannel =
        channelFilter === 'All' || c.channel === normalizeCampaignChannel(channelFilter);

      let matchesDate = true;
      if (dateFilter !== 'All Time') {
        const sentDate = new Date(c.sent_date);
        const today = new Date();
        switch (dateFilter) {
          case 'Last 7 Days':
            matchesDate = isAfter(sentDate, subDays(today, 7));
            break;
          case 'Last 30 Days':
            matchesDate = isAfter(sentDate, subDays(today, 30));
            break;
          case 'This Quarter':
            matchesDate =
              isAfter(sentDate, startOfQuarter(today)) || isSameDay(sentDate, startOfQuarter(today));
            break;
          case 'Last Quarter': {
            const lastQ = subQuarters(today, 1);
            matchesDate =
              isAfter(sentDate, startOfQuarter(lastQ)) && !isAfter(sentDate, endOfQuarter(lastQ));
            break;
          }
          case 'YTD':
            matchesDate =
              isAfter(sentDate, startOfYear(today)) || isSameDay(sentDate, startOfYear(today));
            break;
        }
      }

      return matchesSearch && matchesChannel && matchesDate;
    });
  }, [campaigns, searchQuery, channelFilter, dateFilter]);

  const sortedCampaigns = useMemo(
    () => sortCampaigns(filtered, sortBy),
    [filtered, sortBy],
  );

  const totalPages = Math.max(1, Math.ceil(sortedCampaigns.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [searchQuery, channelFilter, dateFilter, sortBy]);

  useEffect(() => {
    setPage(p => Math.min(p, totalPages));
  }, [totalPages]);

  const paginatedCampaigns = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return sortedCampaigns.slice(start, start + PAGE_SIZE);
  }, [sortedCampaigns, page, totalPages]);

  const devDataHealth = useMemo(() => {
    if (!import.meta.env.DEV || !dbCampaigns?.length) return null;
    let missingCreative = 0;
    let missingImage = 0;
    let missingPushCopy = 0;
    for (const row of dbCampaigns as BrazeCampaignRow[]) {
      if (!String(row.creative_preview ?? '').trim()) missingCreative++;
      const raw = (row.raw_details ?? {}) as Record<string, unknown>;
      if (!extractPreviewImageUrl(raw)) missingImage++;
      const pt = typeof raw.push_title === 'string' ? raw.push_title : '';
      const pb = typeof raw.push_body === 'string' ? raw.push_body : '';
      const ch = normalizeCampaignChannel(row.channel);
      if ((ch === 'push' || ch === 'inapp') && !pt.trim() && !pb.trim()) {
        missingPushCopy++;
      }
    }
    return {
      total: dbCampaigns.length,
      missingCreative,
      missingImage,
      missingPushCopy,
    };
  }, [dbCampaigns]);

  const selectedRawRow = useMemo(() => {
    if (!selectedCampaign || !dbCampaigns) return null;
    return (dbCampaigns as BrazeCampaignRow[]).find(
      r => String(r.braze_campaign_id ?? r.id) === selectedCampaign.id,
    );
  }, [selectedCampaign, dbCampaigns]);

  /** Live `/campaigns/details` when preview image or email HTML is missing in DB. */
  const [brazeCreativeOverride, setBrazeCreativeOverride] = useState<{
    preview_image_url?: string;
    email_html_preview?: string;
  } | null>(null);

  /** True while the edge function is fetching creative for the selected campaign. */
  const [creativeLoading, setCreativeLoading] = useState(false);

  const creativePrefetchCacheRef = useRef(
    new Map<string, { preview_image_url?: string; email_html_preview?: string }>(),
  );
  const creativePrefetchInFlightRef = useRef(new Set<string>());
  const selectedCampaignIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!workspaceClientId || !brazePlatform?.id) {
      creativePrefetchCacheRef.current = new Map();
      return;
    }
    const loaded = loadBrazeCreativeSessionCache(workspaceClientId, brazePlatform.id);
    creativePrefetchCacheRef.current = loaded;
    warmSessionCacheImagesIdle(loaded);
  }, [workspaceClientId, brazePlatform?.id]);

  useEffect(() => {
    const id = selectedCampaign?.id;
    selectedCampaignIdRef.current = id;
    if (!id) {
      setBrazeCreativeOverride(null);
      return;
    }
    const cached = creativePrefetchCacheRef.current.get(id);
    setBrazeCreativeOverride(cached ? { ...cached } : null);
    setCreativeLoading(false);
  }, [selectedCampaign?.id]);

  /** Hero → HTML iframe → large direct image only; merges live Braze creative when fetched. */
  const emailModalPreview = useMemo(() => {
    const raw = selectedRawRow?.raw_details;
    const base: Record<string, unknown> =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? { ...(raw as Record<string, unknown>) }
        : {};
    if (brazeCreativeOverride?.preview_image_url) {
      base.preview_image_url = brazeCreativeOverride.preview_image_url;
    }
    if (brazeCreativeOverride?.email_html_preview) {
      base.email_html_preview = brazeCreativeOverride.email_html_preview;
    }
    if (typeof selectedRawRow?.image_url === 'string' && selectedRawRow.image_url.trim()) {
      base.preview_image_url = selectedRawRow.image_url.trim();
    }
    return resolveEmailModalPreview(Object.keys(base).length ? base : null);
  }, [selectedRawRow, brazeCreativeOverride]);

  const modalHeroImageUrl = emailModalPreview.displayUrl ?? emailModalPreview.url;

  /** Warm browser cache for modal hero as soon as we know the URL (before <img> paints). */
  useEffect(() => {
    if (!selectedCampaign || selectedCampaign.channel !== 'email') return;
    const t = emailModalPreview.previewType;
    if (t !== 'hero' && t !== 'imageUrl') return;
    const url = (emailModalPreview.displayUrl ?? emailModalPreview.url)?.trim();
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }, [selectedCampaign?.id, selectedCampaign?.channel, emailModalPreview]);

  function mergeRawWithCachedCreative(
    campaignId: string,
    row: BrazeCampaignRow | null | undefined,
  ): Record<string, unknown> | null {
    const raw = row?.raw_details;
    const base: Record<string, unknown> =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? { ...(raw as Record<string, unknown>) }
        : {};
    const cached = creativePrefetchCacheRef.current.get(campaignId);
    if (cached?.preview_image_url) base.preview_image_url = cached.preview_image_url;
    if (cached?.email_html_preview) base.email_html_preview = cached.email_html_preview;
    if (typeof row?.image_url === 'string' && row.image_url.trim()) {
      base.preview_image_url = row.image_url.trim();
    }
    return Object.keys(base).length ? base : null;
  }

  function isCreativeResolvedFromMerged(merged: Record<string, unknown> | null): boolean {
    const r = resolveEmailModalPreview(merged);
    return (
      r.previewType === 'hero' ||
      r.previewType === 'imageUrl' ||
      (r.previewType === 'html' && Boolean(r.html))
    );
  }

  useEffect(() => {
    const clientId = workspaceClientId;
    const platformId = brazePlatform?.id;
    if (!selectedCampaign || !showLiveCampaigns || !clientId || !platformId) return;

    const id = selectedCampaign.id;
    const merged = mergeRawWithCachedCreative(id, selectedRawRow);
    if (isCreativeResolvedFromMerged(merged)) return;

    if (creativePrefetchInFlightRef.current.has(id)) {
      setCreativeLoading(true);
      return;
    }

    let cancelled = false;
    creativePrefetchInFlightRef.current.add(id);
    setCreativeLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<{
          preview_image_url?: string | null;
          email_html_preview?: string | null;
          persisted?: boolean;
        }>('braze-campaign-creative', {
          body: {
            clientId,
            platformId,
            brazeCampaignId: id,
            persist: true,
          },
        });
        creativePrefetchInFlightRef.current.delete(id);
        if (cancelled) return;
        if (error) {
          logger.warn('[Campaigns] braze-campaign-creative invoke failed', error);
          setCreativeLoading(false);
          return;
        }
        const payload = {
          preview_image_url: data?.preview_image_url ?? undefined,
          email_html_preview: data?.email_html_preview ?? undefined,
        };
        commitCreativeToCaches(creativePrefetchCacheRef.current, clientId, platformId, id, payload);
        if (selectedCampaignIdRef.current !== id) return;
        setBrazeCreativeOverride(payload);
        setCreativeLoading(false);
        if (data?.persisted) {
          queryClient.invalidateQueries({ queryKey: ['braze_campaigns', workspaceClientId, isAdmin] });
        }
      } catch (e) {
        creativePrefetchInFlightRef.current.delete(id);
        if (!cancelled) {
          logger.warn('[Campaigns] braze-campaign-creative', e);
          setCreativeLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedCampaign?.id,
    selectedCampaign?.channel,
    selectedRawRow,
    showLiveCampaigns,
    workspaceClientId,
    brazePlatform?.id,
    queryClient,
    isAdmin,
  ]);

  const modalStatPayload = useMemo(() => {
    if (!selectedCampaign) return null;
    if (selectedRawRow) {
      return {
        deliveries: selectedRawRow.deliveries,
        sends: selectedRawRow.sends,
        opens: selectedRawRow.opens,
        clicks: selectedRawRow.clicks,
        open_rate: selectedRawRow.open_rate,
        click_rate: selectedRawRow.click_rate,
        unsubs: selectedRawRow.unsubs,
      };
    }
    return {
      deliveries: selectedCampaign.deliveries,
      sends: selectedCampaign.sends,
      opens: selectedCampaign.opens,
      clicks: selectedCampaign.clicks,
      open_rate: selectedCampaign.open_rate,
      click_rate: selectedCampaign.click_rate,
      unsubs: selectedCampaign.unsubs,
    };
  }, [selectedCampaign, selectedRawRow]);

  const modalStatRows = useMemo(() => {
    if (!selectedCampaign || !modalStatPayload) return null;
    return buildCampaignModalStatRows(selectedCampaign.channel, modalStatPayload);
  }, [selectedCampaign, modalStatPayload]);

  /** Subject, preheader, push title/body with Braze Liquid stripped + flags for “Personalized” badges. */
  const selectedCampaignModalCopy = useMemo(() => {
    if (!selectedCampaign) return null;
    const fields = toPreviewFields(selectedCampaign);
    const secondaryFallback = getCampaignSecondaryLine(fields) ?? '';
    const subjectRaw = selectedCampaign.subject ?? selectedCampaign.push_title ?? '';
    const emailPreheaderRaw = selectedCampaign.preheader ?? secondaryFallback;
    const pushBodyRaw =
      selectedCampaign.push_body ?? selectedCampaign.preheader ?? secondaryFallback;

    return {
      subject: sanitizeCampaignDisplayWithMeta(subjectRaw),
      emailPreheader: sanitizeCampaignDisplayWithMeta(emailPreheaderRaw),
      pushTitle: sanitizeCampaignDisplayWithMeta(selectedCampaign.push_title ?? selectedCampaign.subject ?? ''),
      pushBody: sanitizeCampaignDisplayWithMeta(pushBodyRaw),
    };
  }, [selectedCampaign]);

  const queryErrorMessage =
    error instanceof Error ? error.message : 'Something went wrong while loading campaigns.';

  const showPagination =
    !showLoading &&
    !isEmptyLive &&
    !(isError && showLiveCampaigns && !dbCampaigns?.length) &&
    viewMode !== 'calendar' &&
    sortedCampaigns.length > 0;

  const rangeStart = sortedCampaigns.length === 0 ? 0 : (Math.min(page, totalPages) - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(sortedCampaigns.length, Math.min(page, totalPages) * PAGE_SIZE);

  return (
    <AppLayout>
      <TooltipProvider delayDuration={300}>
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="Campaigns"
          description="Browse sent campaigns and one-off communications"
          actions={
            <>
              <Button
                variant="outline"
                onClick={handleSyncFromBraze}
                disabled={syncing || !brazePlatform}
              >
                {syncing ? (
                  <LoadingSpinner size="sm" className="mr-2" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sync from Braze
              </Button>
              <Button asChild>
                <Link to="/chat">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate New
                </Link>
              </Button>
            </>
          }
        />

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
                aria-label="Search campaigns"
              />
            </div>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="push">Push</SelectItem>
                <SelectItem value="inapp">In-App</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Time">All Time</SelectItem>
                <SelectItem value="Last 7 Days">Last 7 Days</SelectItem>
                <SelectItem value="Last 30 Days">Last 30 Days</SelectItem>
                <SelectItem value="This Quarter">This Quarter</SelectItem>
                <SelectItem value="Last Quarter">Last Quarter</SelectItem>
                <SelectItem value="YTD">YTD</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={v => setSortBy(v as CampaignSortKey)}>
              <SelectTrigger className="w-[180px]" aria-label="Sort campaigns">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="data_desc">Most data (deliveries, opens, clicks)</SelectItem>
                <SelectItem value="sent_desc">Sent date (newest)</SelectItem>
                <SelectItem value="updated_desc">Last updated</SelectItem>
                <SelectItem value="created_desc">Created date</SelectItem>
                <SelectItem value="performance_desc">Performance (open + click)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('calendar')}
              aria-label="Calendar view"
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {import.meta.env.DEV && devDataHealth && showLiveCampaigns && (
          <Collapsible className="rounded-lg border border-dashed border-amber-500/40 bg-muted/30 px-3 py-2">
            <CollapsibleTrigger className="flex w-full items-center gap-2 text-left text-sm font-medium text-amber-900 dark:text-amber-200">
              <Bug className="h-4 w-4 shrink-0" aria-hidden />
              Campaign data health (dev)
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {devDataHealth.total} rows · {devDataHealth.missingCreative} missing creative ·{' '}
                {devDataHealth.missingImage} missing image · {devDataHealth.missingPushCopy} push/IAM without title/body
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 text-xs text-muted-foreground">
              Re-sync from Braze to backfill creative_preview, images, and push fields. Counts are from the latest query
              (max 2000 rows).
            </CollapsibleContent>
          </Collapsible>
        )}

        {showSchemaSnapshotBanner && (
          <Alert className="border-teal-200 bg-teal-50/80 dark:border-teal-900 dark:bg-teal-950/40">
            <Database className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <AlertDescription className="text-sm text-teal-900 dark:text-teal-100">
              Showing campaign names from your last Braze sync snapshot (same source as Settings). Detailed metrics and
              creatives load from the <code className="rounded bg-teal-100/80 px-1 py-0.5 font-mono text-xs dark:bg-teal-900/60">braze_campaigns</code> table after a full sync writes rows for this workspace. If this list is empty after sync, check that campaigns are stored under your current client in the database.
            </AlertDescription>
          </Alert>
        )}

        {showSampleBanner && (
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-amber-800 dark:text-amber-200">
                This is sample data. Connect your Braze account on the Platforms page to see real campaign data.
              </span>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="w-fit shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-900/50"
              >
                <Link to="/platforms">
                  Connect Braze
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {isError && showLiveCampaigns && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{queryErrorMessage}</span>
              <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {showLoading ? (
          viewMode === 'calendar' ? (
            <Skeleton className="h-[420px] w-full rounded-xl" />
          ) : viewMode === 'grid' ? (
            <CampaignsGridSkeleton />
          ) : (
            <CampaignsListSkeleton />
          )
        ) : isError &&
          showLiveCampaigns &&
          !dbCampaigns?.length &&
          schemaCacheCampaignRows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Mail className="h-12 w-12 text-muted-foreground opacity-60" />
              <p className="max-w-sm text-muted-foreground">
                Campaigns could not be loaded. Check your connection and try again.
              </p>
              <Button type="button" variant="default" onClick={() => refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : isEmptyLive ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground opacity-60" />
              <div className="space-y-1">
                <p className="font-medium">No campaigns yet</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Sync from Braze to pull your campaigns into this dashboard.
                </p>
              </div>
              <Button type="button" variant="default" disabled={!brazePlatform} onClick={handleSyncFromBraze}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync from Braze
              </Button>
            </CardContent>
          </Card>
        ) : viewMode === 'calendar' ? (
          <Card>
            <CardContent className="p-4">
              <CalendarView
                campaigns={sortedCampaigns}
                briefs={BRIEF_CALENDAR_ITEMS}
                onSelectCampaign={setSelectedCampaign}
              />
            </CardContent>
          </Card>
        ) : (
          <>
          <div
            className={
              viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'
            }
          >
            {sortedCampaigns.length === 0 ? (
              <div className="col-span-full flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
                {campaigns.length > 0 ? (
                  <>
                    <FilterX className="h-10 w-10 text-muted-foreground opacity-60" aria-hidden />
                    <p className="font-medium text-foreground">No campaigns match your filters</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Try adjusting search, channel, or date range.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSearchQuery('');
                        setChannelFilter('All');
                        setDateFilter('All Time');
                      }}
                    >
                      Clear filters
                    </Button>
                  </>
                ) : (
                  <>
                    <Mail className="h-10 w-10 text-muted-foreground opacity-60" aria-hidden />
                    <p className="text-muted-foreground">No campaigns found</p>
                  </>
                )}
              </div>
            ) : (
              paginatedCampaigns.map(campaign => {
                const titleText = campaign.name;
                const previewLine =
                  campaign.creative_preview ?? getCampaignPreviewLine(toPreviewFields(campaign));
                return (
                <Card
                  key={campaign.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open campaign ${campaign.name}`}
                  className={cn(
                    'group flex cursor-pointer flex-col overflow-hidden transition-all duration-200 hover:border-primary/50 hover:shadow-md motion-safe:hover:-translate-y-0.5',
                    viewMode === 'grid' && 'h-full min-h-0',
                  )}
                  onClick={() => setSelectedCampaign(campaign)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedCampaign(campaign);
                    }
                  }}
                >
                  {viewMode === 'grid' && (
                    <CampaignCreativeHero
                      channel={campaign.channel}
                      previewText={previewLine}
                      campaignName={campaign.name}
                      variant="card"
                      gridThumbnail
                    />
                  )}
                  <CardContent
                    className={cn(
                      'flex min-h-[88px] flex-1 flex-col gap-2',
                      viewMode === 'grid' ? 'p-4' : 'p-4 sm:flex-row sm:items-start sm:gap-4',
                    )}
                  >
                    {viewMode === 'list' && (
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                          channelColors[campaign.channel],
                        )}
                      >
                        {channelIcons[campaign.channel]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <h3 className="line-clamp-2 text-left text-sm font-medium leading-snug">{titleText}</h3>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-sm">
                          {titleText}
                        </TooltipContent>
                      </Tooltip>
                      {viewMode === 'list' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="line-clamp-2 text-left text-xs leading-relaxed text-muted-foreground">
                              {previewLine}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-sm">
                            {previewLine}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div
                      className={cn(
                        'flex shrink-0 items-center gap-2',
                        viewMode === 'grid' ? 'mt-auto justify-between pt-1' : 'flex-col items-end gap-1 sm:pt-0.5',
                      )}
                    >
                      <Badge className={cn('text-xs font-normal', channelColors[campaign.channel])}>
                        {channelLabels[campaign.channel]}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                          <CalendarIcon className="h-3 w-3 shrink-0" aria-hidden />
                          {format(new Date(campaign.sent_date), 'MMM d')}
                        </span>
                        {viewMode === 'grid' && (
                          <span className="font-medium text-primary" aria-hidden>
                            Read
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
              })
            )}
          </div>
          {showPagination && totalPages > 1 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t pt-4 sm:flex-row">
              <p className="text-sm text-muted-foreground">
                Showing{' '}
                <span className="font-medium text-foreground">
                  {rangeStart}–{rangeEnd}
                </span>{' '}
                of {sortedCampaigns.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage(p => Math.max(1, p - 1));
                    scrollAppMainToTopAfterLayout('smooth');
                  }}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm tabular-nums text-muted-foreground">
                  Page {Math.min(page, totalPages)} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => {
                    setPage(p => Math.min(totalPages, p + 1));
                    scrollAppMainToTopAfterLayout('smooth');
                  }}
                  aria-label="Next page"
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

      <Dialog open={!!selectedCampaign} onOpenChange={open => !open && setSelectedCampaign(null)}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 duration-300 sm:max-w-2xl">
          {selectedCampaign && selectedCampaignModalCopy && (
            <>
              <DialogHeader className="shrink-0 space-y-2 px-6 pb-2 pt-6">
                <DialogTitle className="flex items-start gap-3 pr-8 text-left leading-snug">
                  <div
                    className={cn(
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      channelColors[selectedCampaign.channel],
                    )}
                  >
                    {channelIcons[selectedCampaign.channel]}
                  </div>
                  <span className="line-clamp-3 break-words">
                    {displaySanitized(selectedCampaign.name)}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Sent {format(new Date(selectedCampaign.sent_date), 'MMMM d, yyyy')}
                  {selectedCampaign.segment && (
                    <>
                      {' '}
                      · Segment:{' '}
                      <span className="font-medium text-foreground">{selectedCampaign.segment}</span>
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div
                ref={campaignDetailScrollRef}
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-6 pb-6 [scrollbar-gutter:stable]"
                tabIndex={-1}
                aria-label="Campaign details"
              >
                <div className="space-y-5">
                {selectedCampaign.channel === 'email' ? (
                  <EmailModalCreative
                    key={selectedCampaign.id}
                    imageUrl={emailModalPreview.url}
                    displayImageUrl={emailModalPreview.displayUrl}
                    htmlContent={emailModalPreview.html}
                    previewMode={emailModalPreview.previewType}
                    loading={creativeLoading}
                  />
                ) : (
                  <PushSmsModalHero
                    key={selectedCampaign.id}
                    channel={
                      selectedCampaign.channel === 'sms'
                        ? 'sms'
                        : selectedCampaign.channel === 'inapp'
                          ? 'inapp'
                          : 'push'
                    }
                    title={
                      selectedCampaignModalCopy.pushTitle.text.length > 0
                        ? selectedCampaignModalCopy.pushTitle.text
                        : '—'
                    }
                    body={
                      selectedCampaignModalCopy.pushBody.text.length > 0
                        ? selectedCampaignModalCopy.pushBody.text
                        : ''
                    }
                    titlePersonalized={selectedCampaignModalCopy.pushTitle.hadLiquid}
                    bodyPersonalized={selectedCampaignModalCopy.pushBody.hadLiquid}
                    previewImageUrl={modalHeroImageUrl}
                  />
                )}

                {selectedCampaign.channel === 'email' && (
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium text-muted-foreground">Subject line</p>
                        {selectedCampaignModalCopy.subject.hadLiquid && <PersonalizedLiquidBadge />}
                      </div>
                      <p className="select-text text-sm font-medium leading-snug text-foreground break-words">
                        {selectedCampaignModalCopy.subject.text.length > 0
                          ? selectedCampaignModalCopy.subject.text
                          : '—'}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium text-muted-foreground">Preheader</p>
                        {selectedCampaignModalCopy.emailPreheader.hadLiquid && <PersonalizedLiquidBadge />}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Inline preview text (below the subject)
                      </p>
                      <p className="select-text text-sm leading-relaxed text-muted-foreground break-words">
                        {selectedCampaignModalCopy.emailPreheader.text.length > 0
                          ? selectedCampaignModalCopy.emailPreheader.text
                          : '—'}
                      </p>
                    </div>
                  </div>
                )}

                {(selectedCampaign.segment || (modalStatRows && modalStatRows.rows.length > 0)) && (
                  <div className="space-y-3">
                    {selectedCampaign.segment && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Segment</p>
                        <p className="text-sm font-semibold">{selectedCampaign.segment}</p>
                      </div>
                    )}
                    {modalStatRows && modalStatRows.rows.length > 0 && (
                      <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {modalStatRows.rows.map(row => (
                            <div key={row.id} className="rounded-lg bg-muted/50 p-3">
                              <p className="text-xs text-muted-foreground">{row.label}</p>
                              <p className="text-lg font-semibold tabular-nums">{row.value}</p>
                            </div>
                          ))}
                        </div>
                        {modalStatRows.showProcessingNote && (
                          <Alert className="border-amber-500/30 bg-amber-500/[0.06] dark:bg-amber-950/30">
                            <Info className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden />
                            <AlertDescription className="text-sm text-amber-950/90 dark:text-amber-100/90">
                              Stats may still be processing from Braze.
                            </AlertDescription>
                          </Alert>
                        )}
                      </>
                    )}
                  </div>
                )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
