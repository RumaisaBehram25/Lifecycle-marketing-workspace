import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
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
  Database,
  MessageSquare,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  format,
  parse,
  parseISO,
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
import {
  cancelWarmCampaignListThumbnailImages,
  preloadCampaignImages,
  preloadHoveredCampaignImage,
  warmCampaignListThumbnailImagesIdle,
} from '@/lib/campaignImagePreload';
import { useDoubleGoodPlatforms, useResolvedClientId } from '@/hooks/useDoubleGoodClient';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMinDurationLoading } from '@/hooks/useMinDurationLoading';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import {
  buildCampaignSearchIndex,
  formatCampaignRate,
  getCampaignPreviewLine,
  getCampaignSecondaryLine,
  normalizeCampaignChannel,
  resolveCampaignCardThumbnailUrl,
  resolveEmailModalPreview,
  getModalOptimizedImageUrl,
  isRawDetailsEmpty,
  resolveCampaignCardEmailIframeHtml,
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
  type CachedCreativePayload,
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
  /** Braze email HTML for a sandboxed card iframe when no hero image URL is available. */
  email_card_iframe_html?: string;
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

/** Grid/list: same page size as Lifecycle for a consistent 21-up layout. */
const PAGE_SIZE = 21;

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

/**
 * Same key for list cards, modal lookup, and admin dedupe: use Braze id when non-empty, else row UUID.
 * Treats `""` as missing — `"" ?? uuid` wrongly kept "" and broke row matching.
 */
function brazeCampaignListId(row: Pick<BrazeCampaignRow, 'id' | 'braze_campaign_id'>): string {
  const bc = row.braze_campaign_id;
  if (bc != null && String(bc).trim() !== '') return String(bc).trim();
  return String(row.id);
}

function rowHasImageUrl(r: Record<string, unknown>): boolean {
  const u = r.image_url;
  return typeof u === 'string' && u.trim() !== '';
}

function rawDetailsJsonLength(r: Record<string, unknown>): number {
  const rd = r.raw_details;
  if (!rd || typeof rd !== 'object' || Array.isArray(rd)) return 0;
  try {
    return JSON.stringify(rd).length;
  } catch {
    return 0;
  }
}

/**
 * When `braze_campaigns` has duplicate rows per `braze_campaign_id`, prefer the row with
 * `image_url` (S3 screenshot), then the row with richer `raw_details`.
 */
function pickBetterBrazeCampaignDuplicate(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const incImg = rowHasImageUrl(incoming);
  const exImg = rowHasImageUrl(existing);
  if (incImg && !exImg) return incoming;
  if (exImg && !incImg) return existing;

  const score = (r: Record<string, unknown>) =>
    Object.values(r).filter(v => v != null && v !== '').length + rawDetailsJsonLength(r) / 5000;
  return score(incoming) >= score(existing) ? incoming : existing;
}

const now = new Date();

/**
 * `new Date('yyyy-MM-dd')` is UTC midnight → wrong local calendar day in US timezones.
 * ISO timestamps from Supabase/Braze are parsed with `parseISO` (instant → local `format` is fine).
 */
function parseCampaignCalendarDay(value: string | null | undefined, refDate: Date): Date | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = parse(s, 'yyyy-MM-dd', refDate);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = parseISO(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sentTimestampSource(
  row: BrazeCampaignRow,
  rawDetails: Record<string, unknown>,
): string | number | Date | null | undefined {
  if (row.sent_date != null && String(row.sent_date).trim() !== '') return row.sent_date;
  const ls = rawDetails.last_sent;
  if (typeof ls === 'string' && ls.trim()) return ls.trim();
  const fs = rawDetails.first_sent;
  if (typeof fs === 'string' && fs.trim()) return fs.trim();
  const sch = rawDetails.scheduled_at;
  if (typeof sch === 'string' && sch.trim()) return sch.trim();
  if (row.updated_at != null && String(row.updated_at).trim() !== '') return row.updated_at;
  if (row.created_at != null && String(row.created_at).trim() !== '') return row.created_at;
  return null;
}

function formatCampaignSentDateYmd(row: BrazeCampaignRow, rawDetails: Record<string, unknown>): string {
  const src = sentTimestampSource(row, rawDetails);
  if (src == null) return format(new Date(), 'yyyy-MM-dd');
  const d = parseCampaignCalendarDay(typeof src === 'string' ? src : String(src), new Date());
  return d ? format(d, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
}

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
    const d = parseCampaignCalendarDay(lastSent, new Date());
    if (d) {
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
        return (
          (parseCampaignCalendarDay(b.sent_date, new Date())?.getTime() ?? 0) -
          (parseCampaignCalendarDay(a.sent_date, new Date())?.getTime() ?? 0)
        );
      }
      case 'sent_desc':
        return (
          (parseCampaignCalendarDay(b.sent_date, new Date())?.getTime() ?? 0) -
          (parseCampaignCalendarDay(a.sent_date, new Date())?.getTime() ?? 0)
        );
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

/** Neutral loading — avoids colorful fake cards; real grid/list appears once data is ready. */
function CampaignsViewLoading({ viewMode }: { viewMode: 'grid' | 'list' | 'calendar' }) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-6 py-16',
        viewMode === 'calendar' ? 'min-h-[420px]' : 'min-h-[min(400px,55vh)]',
      )}
      role="status"
      aria-live="polite"
      aria-label="Loading campaigns"
    >
      <LoadingSpinner size="lg" />
      <p className="text-sm text-muted-foreground">Loading campaigns…</p>
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
  /** Fresh anchor each render so the grid matches “this month” and avoids module-load `now` drift. */
  const calendarAnchor = new Date();
  const start = startOfMonth(calendarAnchor);
  const end = endOfMonth(calendarAnchor);
  const days = eachDayOfInterval({ start, end });
  const startDayOfWeek = getDay(start);

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">{format(calendarAnchor, 'MMMM yyyy')}</h3>
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
          const dayCampaigns = campaigns.filter(c => {
            const cd = parseCampaignCalendarDay(c.sent_date, day);
            return cd != null && isSameDay(cd, day);
          });
          const dayBriefs = briefs.filter(b => {
            const bd = parseCampaignCalendarDay(b.date, day);
            return bd != null && isSameDay(bd, day);
          });
          const isToday = isSameDay(day, calendarAnchor);
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
  /** preview_image_url from Braze creative fetches — supplements DB thumbnails for campaigns missing images in raw_details. */
  const [creativeThumbnailCache, setCreativeThumbnailCache] = useState<Map<string, string>>(() => new Map());
  const creativeThumbnailCacheLatestRef = useRef(creativeThumbnailCache);
  creativeThumbnailCacheLatestRef.current = creativeThumbnailCache;
  const [creativeEmailIframeCache, setCreativeEmailIframeCache] = useState<Map<string, string>>(() => new Map());
  const creativeEmailIframeCacheLatestRef = useRef(creativeEmailIframeCache);
  creativeEmailIframeCacheLatestRef.current = creativeEmailIframeCache;
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

  const {
    data: dbCampaigns,
    isPending: isCampaignsQueryPending,
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
          .select(
            'id, braze_campaign_id, name, channel, subject, preheader, status, sent_date, opens, clicks, deliveries, sends, open_rate, click_rate, unsubs, segment, creative_preview, raw_details, image_url, updated_at, created_at, synced_at',
          );
        // Admins see all campaigns; non-admins only see their workspace
        if (!isAdmin) {
          query = query.eq('client_id', cid);
        }
        // Order by `sent_date` only — a secondary `image_url` sort caused PostgREST 500 / PG 57014
        // (timeout) on large TEXT columns. Duplicate rows are merged in JS (prefer `image_url`).
        const { data: page, error: qErr } = await query
          .order('sent_date', { ascending: false })
          .range(from, from + pageSize - 1);
        if (qErr) throw qErr;
        if (!page || page.length === 0) break;
        allRows.push(...page);
        if (page.length < pageSize) break;
        from += pageSize;
      }
      // Duplicate rows per `braze_campaign_id` — keep the row with `image_url` (S3 screenshot), else richest `raw_details`
        const seen = new Map<string, Record<string, unknown>>();
        for (const row of allRows) {
        const key = brazeCampaignListId(row as BrazeCampaignRow);
          const existing = seen.get(key);
          if (!existing) {
            seen.set(key, row);
          } else {
          seen.set(key, pickBetterBrazeCampaignDuplicate(row, existing));
          }
        }
        return Array.from(seen.values());
    },
    enabled: showLiveCampaigns,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    placeholderData: previousData => previousData,
  });

  const campaigns: CampaignViewModel[] = useMemo(() => {
    if (showLiveCampaigns) {
      // Only clear the list before the first successful fetch. During background refetch
      // `isCampaignsQueryPending` is true only until the first successful fetch; with `placeholderData`
      // we keep the prior list during background refetch so pagination does not reset.
      if (isCampaignsQueryPending && dbCampaigns === undefined) return [];

      const dbRows = Array.isArray(dbCampaigns) ? dbCampaigns : [];
      if (dbRows.length > 0) {
      return (dbRows as BrazeCampaignRow[]).map(row => {
      const rawDetails = (row.raw_details ?? {}) as Record<string, unknown>;
      const channel = normalizeCampaignChannel(row.channel);
      const push_title = typeof rawDetails.push_title === 'string' ? rawDetails.push_title : undefined;
      const push_body = typeof rawDetails.push_body === 'string' ? rawDetails.push_body : undefined;
      const description = typeof rawDetails.description === 'string' ? rawDetails.description : undefined;
      /** Grid/list thumbnail: same discovery as modal (channels, messages, creatives, longest HTML hero). */
      const preview_image_url =
        resolveCampaignCardThumbnailUrl({
          rawDetails,
          imageUrlColumn: row.image_url,
        }) ?? '';
      const email_card_iframe_html =
        channel === 'email' ? resolveCampaignCardEmailIframeHtml(rawDetails) : undefined;

      const base: PlaceholderCampaign = {
        id: brazeCampaignListId(row),
        name: row.name,
        channel,
        subject: row.subject ?? undefined,
        preheader: row.preheader ?? undefined,
        push_title,
        push_body,
        description,
        sent_date: formatCampaignSentDateYmd(row, rawDetails),
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
        email_card_iframe_html,
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
    isCampaignsQueryPending,
    schemaCacheCampaignRows,
  ]);

  const showLoading =
    workspaceClientLoading ||
    (Boolean(workspaceClientId) && platformsLoading) ||
    Boolean(showLiveCampaigns && isCampaignsQueryPending);
  const showSampleBanner = showDemoCampaigns;
  const showSchemaSnapshotBanner =
    showLiveCampaigns &&
    !isCampaignsQueryPending &&
    Array.isArray(dbCampaigns) &&
    dbCampaigns.length === 0 &&
    schemaCacheCampaignRows.length > 0;
  const isEmptyLive =
    showLiveCampaigns &&
    !isCampaignsQueryPending &&
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
        const today = new Date();
        const sentDate = parseCampaignCalendarDay(c.sent_date, today) ?? new Date(0);
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
    // Avoid clamping while the list is empty (e.g. brief refetch / connection flicker): that would
    // set `totalPages` to 1 and force page 1 even after data returns.
    if (sortedCampaigns.length === 0) return;
    setPage(p => Math.min(p, totalPages));
  }, [totalPages, sortedCampaigns.length]);

  const paginatedCampaigns = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return sortedCampaigns.slice(start, start + PAGE_SIZE);
  }, [sortedCampaigns, page, totalPages]);

  /** Idle warm: **next page** only (visible page is handled by `preloadCampaignImages`) — avoids duplicate fetches. */
  const campaignsForIdleThumbnailWarm = useMemo(() => {
    if (sortedCampaigns.length === 0) return [];
    const safePage = Math.min(page, totalPages);
    const startNext = safePage * PAGE_SIZE;
    if (startNext >= sortedCampaigns.length) return [];
    const end = Math.min(sortedCampaigns.length, startNext + PAGE_SIZE);
    return sortedCampaigns.slice(startNext, end);
  }, [sortedCampaigns, page, totalPages]);

  const selectedRawRow = useMemo(() => {
    if (!selectedCampaign || !dbCampaigns) return null;
    const rows = dbCampaigns as BrazeCampaignRow[];
    const byListId = rows.find(r => brazeCampaignListId(r) === selectedCampaign.id);
    if (byListId) return byListId;
    /** Fallback when legacy rows used `??` with empty `braze_campaign_id` and mismatched ids. */
    return rows.find(r => String(r.id) === selectedCampaign.id) ?? null;
  }, [selectedCampaign, dbCampaigns]);

  /** Live `/campaigns/details` when preview image or email HTML is missing in DB. */
  const [brazeCreativeOverride, setBrazeCreativeOverride] = useState<{
    preview_image_url?: string;
    email_html_preview?: string;
  } | null>(null);

  /** Creative fetch; `minMs` is 0 so the modal does not add artificial delay after the edge function returns. */
  const {
    loading: creativeLoading,
    startLoading: startCreativeLoading,
    stopLoading: stopCreativeLoading,
  } = useMinDurationLoading(0);

  const creativePrefetchCacheRef = useRef(
    new Map<string, { preview_image_url?: string; email_html_preview?: string }>(),
  );
  const creativePrefetchInFlightRef = useRef(new Set<string>());
  const selectedCampaignIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!workspaceClientId || !brazePlatform?.id) {
      creativePrefetchCacheRef.current = new Map();
      setCreativeThumbnailCache(new Map());
      setCreativeEmailIframeCache(new Map());
      return;
    }
    const loaded = loadBrazeCreativeSessionCache(workspaceClientId, brazePlatform.id);
    creativePrefetchCacheRef.current = loaded;
    warmSessionCacheImagesIdle(loaded);
    const thumbs = new Map<string, string>();
    const iframes = new Map<string, string>();
    for (const [id, payload] of loaded.entries()) {
      if (payload.preview_image_url) thumbs.set(id, payload.preview_image_url);
      const html = typeof payload.email_html_preview === 'string' ? payload.email_html_preview.trim() : '';
      if (html) iframes.set(id, html);
    }
    setCreativeThumbnailCache(thumbs);
    setCreativeEmailIframeCache(iframes);
  }, [workspaceClientId, brazePlatform?.id]);

  useEffect(() => {
    const id = selectedCampaign?.id;
    selectedCampaignIdRef.current = id;
    if (!id) {
      setBrazeCreativeOverride(null);
      stopCreativeLoading(true);
      return;
    }
    const cached = creativePrefetchCacheRef.current.get(id);
    setBrazeCreativeOverride(cached ? { ...cached } : null);
    stopCreativeLoading(true);
  }, [selectedCampaign?.id, stopCreativeLoading]);

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
    } else if (selectedCampaign?.preview_image_url?.trim()) {
      /** List ViewModel already resolved `image_url` / preview; use when row lookup failed or row lacked column. */
      base.preview_image_url = selectedCampaign.preview_image_url.trim();
    }
    return resolveEmailModalPreview(Object.keys(base).length ? base : null);
  }, [selectedRawRow, brazeCreativeOverride, selectedCampaign?.preview_image_url]);

  /** When true, the modal can render email creative without waiting on `braze-campaign-creative`. */
  const emailModalPreviewReady = useMemo(() => {
    const t = emailModalPreview.previewType;
    if (t === 'html' && String(emailModalPreview.html ?? '').trim()) return true;
    if (t === 'hero' || t === 'imageUrl') {
      const u = (emailModalPreview.displayUrl ?? emailModalPreview.url)?.trim();
      return Boolean(u);
    }
    return false;
  }, [emailModalPreview]);

  const modalHeroImageUrl = emailModalPreview.displayUrl ?? emailModalPreview.url;

  const selectedRawDetailsEmpty = useMemo(
    () => (selectedRawRow ? isRawDetailsEmpty(selectedRawRow.raw_details) : false),
    [selectedRawRow],
  );

  /** Warm the HTTP cache the moment a campaign is selected so the modal image is ready. */
  useEffect(() => {
    if (!selectedCampaign) return;
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
    fallbackPreviewUrl?: string | null,
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
    } else if (typeof fallbackPreviewUrl === 'string' && fallbackPreviewUrl.trim()) {
      base.preview_image_url = fallbackPreviewUrl.trim();
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

  const runBrazeCampaignCreativeFetch = useCallback(
    async (campaignId: string) => {
      const clientId = workspaceClientId;
      const platformId = brazePlatform?.id;
      if (!clientId || !platformId) return;
      const { data, error } = await supabase.functions.invoke<{
        preview_image_url?: string | null;
        email_html_preview?: string | null;
        persisted?: boolean;
      }>('braze-campaign-creative', {
        body: {
          clientId,
          platformId,
          brazeCampaignId: campaignId,
          persist: true,
        },
      });
      if (error) {
        logger.warn('[Campaigns] braze-campaign-creative invoke failed', error);
        return;
      }
      const prev = creativePrefetchCacheRef.current.get(campaignId);
      const payload: CachedCreativePayload = {
        preview_image_url:
          typeof data?.preview_image_url === 'string' && data.preview_image_url.trim()
            ? data.preview_image_url.trim()
            : prev?.preview_image_url,
        email_html_preview:
          typeof data?.email_html_preview === 'string' && data.email_html_preview.trim()
            ? data.email_html_preview.trim()
            : prev?.email_html_preview,
      };
      commitCreativeToCaches(creativePrefetchCacheRef.current, clientId, platformId, campaignId, payload);
      if (payload.preview_image_url) {
        setCreativeThumbnailCache(prev => {
          const next = new Map(prev);
          next.set(campaignId, payload.preview_image_url!);
          return next;
        });
      }
      if (payload.email_html_preview) {
        setCreativeEmailIframeCache(prev => {
          const next = new Map(prev);
          next.set(campaignId, payload.email_html_preview!);
          return next;
        });
      }
      if (selectedCampaignIdRef.current === campaignId) {
        setBrazeCreativeOverride(payload);
      }
      if (data?.persisted) {
        queryClient.invalidateQueries({ queryKey: ['braze_campaigns', workspaceClientId, isAdmin] });
      }
    },
    [brazePlatform?.id, isAdmin, queryClient, workspaceClientId],
  );

  const handleRefreshCampaignPreview = useCallback(async () => {
    if (!selectedCampaign || !workspaceClientId || !brazePlatform?.id) return;
    const id = selectedCampaign.id;
    if (creativePrefetchInFlightRef.current.has(id)) return;
    creativePrefetchInFlightRef.current.add(id);
    startCreativeLoading();
    try {
      await runBrazeCampaignCreativeFetch(id);
    } catch (e) {
      logger.warn('[Campaigns] braze-campaign-creative', e);
    } finally {
      creativePrefetchInFlightRef.current.delete(id);
      stopCreativeLoading(true);
    }
  }, [
    brazePlatform?.id,
    runBrazeCampaignCreativeFetch,
    selectedCampaign,
    startCreativeLoading,
    stopCreativeLoading,
    workspaceClientId,
  ]);

  /** Silently pre-warms the Braze creative cache on card hover so the modal opens with no lag. */
  const prefetchCampaignCreative = useCallback((campaignId: string) => {
    if (!showLiveCampaigns || !workspaceClientId || !brazePlatform?.id) return;
    if (creativePrefetchInFlightRef.current.has(campaignId)) return;
    if (creativePrefetchCacheRef.current.has(campaignId)) return;
    const dbRow = (dbCampaigns as BrazeCampaignRow[] | undefined)?.find(
      r => String(r.braze_campaign_id ?? r.id) === campaignId,
    );
    const raw = dbRow?.raw_details;
    const base: Record<string, unknown> =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
    if (typeof dbRow?.image_url === 'string' && dbRow.image_url.trim()) {
      base.preview_image_url = dbRow.image_url.trim();
    }
    const mergedForThumb = Object.keys(base).length ? base : null;
    const colThumb = typeof dbRow?.image_url === 'string' ? dbRow.image_url.trim() : '';
    const rowChannel = normalizeCampaignChannel(String(dbRow?.channel ?? ''));
    const cardThumb =
      colThumb ||
      (mergedForThumb
        ? resolveCampaignCardThumbnailUrl({
            rawDetails: mergedForThumb,
            imageUrlColumn: dbRow?.image_url ?? null,
          }) ?? ''
        : '');
    if (cardThumb && rowChannel !== 'email') return;
    if (rowChannel === 'email' && mergedForThumb && resolveCampaignCardEmailIframeHtml(mergedForThumb)?.trim()) {
      return;
    }

    const r = resolveEmailModalPreview(mergedForThumb);
    /** Modal may resolve a hero URL the card resolver skipped (different HTML pick / Linktree rules). */
    if (!cardThumb && (r.previewType === 'hero' || r.previewType === 'imageUrl')) {
      const heroUrl = (r.displayUrl ?? r.url ?? '').trim();
      if (heroUrl && workspaceClientId && brazePlatform?.id) {
        const prevPayload = creativePrefetchCacheRef.current.get(campaignId);
        commitCreativeToCaches(creativePrefetchCacheRef.current, workspaceClientId, brazePlatform.id, campaignId, {
          preview_image_url: heroUrl,
          email_html_preview: prevPayload?.email_html_preview,
        });
        setCreativeThumbnailCache(prev => {
          const next = new Map(prev);
          next.set(campaignId, heroUrl);
          return next;
        });
      }
      return;
    }
    creativePrefetchInFlightRef.current.add(campaignId);
    void runBrazeCampaignCreativeFetch(campaignId).finally(() => {
      creativePrefetchInFlightRef.current.delete(campaignId);
    });
  }, [brazePlatform?.id, dbCampaigns, runBrazeCampaignCreativeFetch, showLiveCampaigns, workspaceClientId]);

  useEffect(() => {
    if (!showLiveCampaigns) return;
    preloadCampaignImages(paginatedCampaigns, { imageConcurrency: 4 });
  }, [paginatedCampaigns, showLiveCampaigns]);

  /** Background decode: bounded slice + sequential batches — does not compete with visible `<img>` rows. */
  useEffect(() => {
    if (!showLiveCampaigns) return;
    warmCampaignListThumbnailImagesIdle(campaignsForIdleThumbnailWarm, {
      maxUrls: 24,
      concurrency: 3,
      batchPauseMs: 140,
    });
    return () => {
      cancelWarmCampaignListThumbnailImages();
    };
  }, [campaignsForIdleThumbnailWarm, showLiveCampaigns]);

  /** Backfill `braze-campaign-creative` thumbnails for the current page when JSON still has no usable image. */
  useEffect(() => {
    if (!showLiveCampaigns || !workspaceClientId || !brazePlatform?.id) return;
    const thumbCache = creativeThumbnailCacheLatestRef.current;
    const iframeCache = creativeEmailIframeCacheLatestRef.current;
    const missing = paginatedCampaigns.filter(c => {
      if (c.channel === 'email') {
        const cachedHtml = (c.email_card_iframe_html ?? '').trim();
        if (cachedHtml) return false;
        if (iframeCache.has(c.id)) return false;
        return true;
      }
      const u = (c.preview_image_url || '').trim();
      if (u) return false;
      if (thumbCache.has(c.id)) return false;
      if ((c.email_card_iframe_html ?? '').trim()) return false;
      if (iframeCache.has(c.id)) return false;
      return true;
    });
    if (missing.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      missing.forEach((c, i) => {
        window.setTimeout(() => {
          if (!cancelled) prefetchCampaignCreative(c.id);
        }, i * 100);
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    brazePlatform?.id,
    paginatedCampaigns,
    prefetchCampaignCreative,
    showLiveCampaigns,
    workspaceClientId,
  ]);

  useEffect(() => {
    const clientId = workspaceClientId;
    const platformId = brazePlatform?.id;
    if (!selectedCampaign || !showLiveCampaigns || !clientId || !platformId) return;

    const id = selectedCampaign.id;
    const merged = mergeRawWithCachedCreative(id, selectedRawRow, selectedCampaign.preview_image_url);

    /**
     * DB `image_url` / session cache can already resolve a hero or iframe — show that immediately.
     * Do **not** block the modal with `creativeLoading`; optionally enrich `raw_details` in the background.
     */
    if (isCreativeResolvedFromMerged(merged)) {
      const needsHtmlEnrichment =
        selectedCampaign.channel === 'email' && isRawDetailsEmpty(selectedRawRow?.raw_details);
      if (needsHtmlEnrichment && !creativePrefetchInFlightRef.current.has(id)) {
        creativePrefetchInFlightRef.current.add(id);
        void runBrazeCampaignCreativeFetch(id).finally(() => {
          creativePrefetchInFlightRef.current.delete(id);
        });
      }
      return;
    }

    if (creativePrefetchInFlightRef.current.has(id)) {
      return;
    }

    let cancelled = false;
    creativePrefetchInFlightRef.current.add(id);
    startCreativeLoading();
    void (async () => {
      try {
        await runBrazeCampaignCreativeFetch(id);
        creativePrefetchInFlightRef.current.delete(id);
        if (cancelled) {
          stopCreativeLoading(true);
          return;
        }
        stopCreativeLoading(true);
      } catch (e) {
        creativePrefetchInFlightRef.current.delete(id);
        if (cancelled) {
          stopCreativeLoading(true);
          return;
        }
        logger.warn('[Campaigns] braze-campaign-creative', e);
        stopCreativeLoading(true);
      }
    })();
    return () => {
      cancelled = true;
      stopCreativeLoading(true);
    };
  }, [
    selectedCampaign?.id,
    selectedCampaign?.channel,
    selectedRawRow,
    showLiveCampaigns,
    workspaceClientId,
    brazePlatform?.id,
    runBrazeCampaignCreativeFetch,
    startCreativeLoading,
    stopCreativeLoading,
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
    <>
      <TooltipProvider delayDuration={300}>
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="Campaigns"
          description="Browse sent campaigns and one-off communications"
          actions={
            <Button asChild>
              <Link to="/chat">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate New
              </Link>
            </Button>
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

        {showSchemaSnapshotBanner && (
          <Alert className="border-teal-200 bg-teal-50/80 dark:border-teal-900 dark:bg-teal-950/40">
            <Database className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <AlertDescription className="text-sm text-teal-900 dark:text-teal-100">
              Showing campaign names from your last Braze sync snapshot (same source as Settings). Detailed metrics and
              creatives load from the <code className="rounded bg-teal-100/80 px-1 py-0.5 font-mono text-xs dark:bg-teal-900/60">braze_campaigns</code> table after Dashboard <strong className="font-medium text-foreground">Sync All from Braze</strong> writes rows for this workspace. If this list is empty after sync, check that campaigns are stored under your current client in the database.
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
          <CampaignsViewLoading viewMode={viewMode} />
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
                  Use <strong className="font-medium text-foreground">Sync All from Braze</strong> on the Dashboard to pull campaigns, journeys, and analytics into this workspace.
                </p>
              </div>
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
              paginatedCampaigns.map((campaign, index) => {
                const titleText = campaign.name;
                const previewLine =
                  campaign.creative_preview ?? getCampaignPreviewLine(toPreviewFields(campaign));
                const thumbnailUrl = campaign.channel === 'email'
                  ? undefined
                  : campaign.preview_image_url || creativeThumbnailCache.get(campaign.id);
                const emailIframeHtml =
                  campaign.email_card_iframe_html?.trim() || creativeEmailIframeCache.get(campaign.id);
                const emailThumbnailHtml = campaign.channel === 'email' ? emailIframeHtml : undefined;
                const emailThumbnailUrl = campaign.channel === 'email' ? undefined : thumbnailUrl;
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
                  onPointerEnter={() => {
                    if (thumbnailUrl) preloadHoveredCampaignImage(thumbnailUrl);
                    prefetchCampaignCreative(campaign.id);
                  }}
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
                      previewImageUrl={emailThumbnailUrl}
                      emailIframeHtml={emailThumbnailHtml}
                      campaignName={campaign.name}
                      variant="card"
                      listPageIndex={index}
                    />
                  )}
                  <CardContent
                    className={cn(
                      'flex min-h-[88px] flex-1 flex-col gap-2',
                      viewMode === 'grid' ? 'p-4' : 'p-4 sm:flex-row sm:items-start sm:gap-4',
                    )}
                  >
                    {viewMode === 'list' && (
                      <CampaignCreativeHero
                        channel={campaign.channel}
                        previewText={previewLine}
                        previewImageUrl={emailThumbnailUrl}
                        emailIframeHtml={emailThumbnailHtml}
                        campaignName={campaign.name}
                        variant="card"
                        listPageIndex={index}
                        className="h-[76px] min-h-[76px] w-[120px] shrink-0 !aspect-auto rounded-lg border border-border/50"
                      />
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
                        {format(parseCampaignCalendarDay(campaign.sent_date, new Date()) ?? new Date(), 'MMM d')}
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
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 duration-300 sm:max-w-3xl">
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
                  Sent{' '}
                  {format(
                    parseCampaignCalendarDay(selectedCampaign.sent_date, new Date()) ?? new Date(),
                    'MMMM d, yyyy',
                  )}
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
                
                {/* 1. Subject & Preheader */}
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

                {/* 2. Segment & Stats */}
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

                {/* 3. Creative Preview */}
                {selectedCampaign.channel === 'email' ? (
                  <div className="space-y-2">
                    {selectedRawDetailsEmpty && showLiveCampaigns && brazePlatform && (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                          variant="outline"
                            size="sm"
                          className="gap-1.5"
                          disabled={creativeLoading || !workspaceClientId}
                          onClick={() => void handleRefreshCampaignPreview()}
                        >
                          <RefreshCw
                            className={cn('h-3.5 w-3.5', creativeLoading && 'animate-spin')}
                            aria-hidden
                          />
                          Refresh preview
                          </Button>
                        </div>
                    )}
                    <EmailModalCreative
                      key={selectedCampaign.id}
                      imageUrl={emailModalPreview.url}
                      displayImageUrl={emailModalPreview.displayUrl}
                      htmlContent={emailModalPreview.html}
                      previewMode={emailModalPreview.previewType}
                      loading={creativeLoading && !emailModalPreviewReady}
                    />
                  </div>
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

                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

