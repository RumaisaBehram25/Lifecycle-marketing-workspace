import { useMemo, useState, useEffect } from 'react';
import { useActiveClientRow, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { useBrazeDashboardClientId } from '@/hooks/useBrazeDashboardClientId';
import { useBrazeCustomEventsTableRows } from '@/hooks/useBrazeCustomEventsTableRows';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DashboardCustomEventDetailDialog } from '@/components/dashboard/DashboardCustomEventDetailDialog';
import { Activity, ChevronLeft, ChevronRight, Database, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  dashboardSurfaceCard,
  dashboardTopAccentClass,
  dashSectionTitleBorder,
  dashboardSectionHeadingClass,
  dashSubtitleRule,
  dashShadowSm,
  dashRingInset,
} from '@/lib/dashboard-surface';

const CARDS_PER_PAGE = 20;

type StatusFilter = 'all' | 'active' | 'blocklist';

/** Map Braze GET /events status label to a coarse bucket for filtering. */
function classifyGetEventsStatus(s: string | null | undefined): 'active' | 'blocklist' | 'unknown' {
  if (s == null || !String(s).trim()) return 'unknown';
  const t = String(s).trim().toLowerCase();
  if (
    /\binactive\b/.test(t) ||
    /\bblock(ed|list|listed)?\b/.test(t) ||
    /\bblacklist/.test(t) ||
    /\bnot active\b/.test(t) ||
    /\bdisabled\b/.test(t)
  ) {
    return 'blocklist';
  }
  if (t === 'active' || /^active\b/.test(t)) return 'active';
  return 'unknown';
}

function getEventsStatusBadgeClass(synced: boolean, raw: string | null | undefined): string {
  if (!synced || raw == null || !String(raw).trim()) {
    return 'border-border/50 bg-muted/40 text-muted-foreground font-normal';
  }
  const bucket = classifyGetEventsStatus(raw);
  if (bucket === 'active') {
    return 'border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-800 dark:text-emerald-300 font-medium';
  }
  if (bucket === 'blocklist') {
    return 'border-destructive/35 bg-destructive/[0.08] text-destructive font-medium';
  }
  return 'border-border/60 bg-muted/40 text-foreground font-normal';
}

export function DashboardCustomEventsPanel() {
  const { data: client } = useActiveClientRow();
  const { data: platforms } = useDoubleGoodPlatforms();
  const { clientId: brazeMetricsClientId } = useBrazeDashboardClientId();

  const [detailEventName, setDetailEventName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [cardPage, setCardPage] = useState(0);

  const effectiveClientId = brazeMetricsClientId || client?.id;
  const brazePlatform = platforms?.find((p) => p.platform === 'braze' && p.is_connected);

  const {
    data: rows = [],
    isLoading,
    isError,
  } = useBrazeCustomEventsTableRows(
    effectiveClientId && brazePlatform ? effectiveClientId : undefined,
  );

  const filteredRows = useMemo(() => {
    let list = rows;
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter((r) => r.event_name.toLowerCase().includes(q));
    }
    if (statusFilter === 'active') {
      list = list.filter((r) => classifyGetEventsStatus(r.get_events_status) === 'active');
    } else if (statusFilter === 'blocklist') {
      list = list.filter((r) => classifyGetEventsStatus(r.get_events_status) === 'blocklist');
    }
    return list;
  }, [rows, searchQuery, statusFilter]);

  const cardPageCount = Math.max(1, Math.ceil(filteredRows.length / CARDS_PER_PAGE));
  const cardPageClamped = Math.min(cardPage, cardPageCount - 1);
  const pagedRows = useMemo(() => {
    const start = cardPageClamped * CARDS_PER_PAGE;
    return filteredRows.slice(start, start + CARDS_PER_PAGE);
  }, [filteredRows, cardPageClamped]);

  useEffect(() => {
    setCardPage(0);
  }, [searchQuery, statusFilter, rows.length]);

  useEffect(() => {
    setCardPage((p) => Math.min(p, Math.max(0, cardPageCount - 1)));
  }, [cardPageCount]);

  const subtitle = useMemo(() => {
    if (isLoading && rows.length === 0) return 'Loading…';
    if (isError) return 'Could not load custom events.';
    const total = rows.length;
    const match = filteredRows.length;
    const hasFilter = searchQuery.trim() !== '' || statusFilter !== 'all';
    const countPart =
      hasFilter && match !== total
        ? `${match} of ${total} events`
        : `${total} event${total !== 1 ? 's' : ''}`;
    return `${countPart} · click a row for series detail`;
  }, [isLoading, isError, rows.length, filteredRows.length, searchQuery, statusFilter]);

  if (!brazePlatform) return null;

  return (
    <>
      <Card className={cn(dashboardSurfaceCard, 'shadow-md')}>
        <div className={dashboardTopAccentClass} aria-hidden />
        <CardHeader className={cn('pb-4', dashSectionTitleBorder)}>
          <div className="min-w-0">
            <h2
              className={cn(
                dashboardSectionHeadingClass,
                'flex items-center gap-2.5 text-2xl sm:text-3xl font-bold tracking-tight',
              )}
            >
              <Activity className="h-7 w-7 shrink-0 text-primary" aria-hidden />
              Custom events
            </h2>
            <p className={cn('mt-1.5 text-xs text-muted-foreground', dashSubtitleRule)}>{subtitle}</p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pb-5 pt-2">
          {isLoading && rows.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
              No custom events in this workspace. Run <strong className="font-medium text-foreground">Sync All from Braze</strong> on the Dashboard.
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm',
                  'sm:p-4',
                )}
              >
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Find &amp; filter
                </p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="relative min-w-0 max-w-md flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search events…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={cn(
                        'h-10 border-border/70 bg-background pl-10 text-sm shadow-sm',
                        'focus-visible:ring-primary/25',
                      )}
                      aria-label="Search custom events"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:items-end">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      GET /events status
                    </span>
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                      <SelectTrigger
                        className="h-10 w-full min-w-[11rem] border-border/70 bg-background text-sm shadow-sm sm:w-[200px]"
                        aria-label="Filter by event status"
                      >
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="blocklist">Blocklist</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {filteredRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 py-10 text-center text-sm text-muted-foreground">
                  No events match your search or status filter.
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Showing {filteredRows.length} event{filteredRows.length !== 1 ? 's' : ''}
                    {filteredRows.length > 0
                      ? ` · page ${cardPageClamped + 1} of ${cardPageCount} (${CARDS_PER_PAGE} per page)`
                      : ''}
                  </p>

                  <div
                    className={cn(
                      'space-y-2',
                      'max-h-[min(65vh,640px)] overflow-y-auto pr-1',
                      '[&::-webkit-scrollbar]:w-2',
                      '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border',
                    )}
                  >
                    {pagedRows.map((r) => {
                      const statusLabel = r.get_events_synced ? (r.get_events_status ?? '—') : '—';
                      return (
                        <Card
                          key={r.event_name}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'group cursor-pointer overflow-hidden border-border/60 bg-card/90 text-left',
                            'transition-all duration-200',
                            'hover:border-primary/35 hover:bg-muted/15 hover:shadow-md',
                            dashShadowSm,
                            dashRingInset,
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailEventName(r.event_name);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setDetailEventName(r.event_name);
                            }
                          }}
                        >
                          <CardContent className="p-0">
                            <div
                              className={cn(
                                'flex min-h-[3.5rem] flex-wrap items-center gap-3 border-l-[3px] border-transparent px-3 py-2.5 sm:gap-5 sm:px-4',
                                'group-hover:border-primary/50',
                              )}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                  <Activity className="h-4 w-4" aria-hidden />
                                </div>
                                <p
                                  className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary"
                                  title={r.event_name}
                                >
                                  {r.event_name}
                                </p>
                              </div>
                              <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'max-w-[200px] truncate text-xs tabular-nums',
                                    getEventsStatusBadgeClass(!!r.get_events_synced, r.get_events_status),
                                  )}
                                  title={statusLabel}
                                >
                                  {statusLabel}
                                </Badge>
                                <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1">
                                  <Database className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    Buckets
                                  </span>
                                  <span className="text-sm font-semibold tabular-nums">
                                    {r.data_series_buckets}
                                  </span>
                                </div>
                                <ChevronRight
                                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                                  aria-hidden
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {filteredRows.length > CARDS_PER_PAGE && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
                      <p className="text-xs text-muted-foreground">
                        Page {cardPageClamped + 1} of {cardPageCount}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={cardPageClamped <= 0}
                          onClick={() => setCardPage((p) => Math.max(0, p - 1))}
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={cardPageClamped >= cardPageCount - 1}
                          onClick={() => setCardPage((p) => Math.min(cardPageCount - 1, p + 1))}
                          aria-label="Next page"
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {effectiveClientId ? (
        <DashboardCustomEventDetailDialog
          open={detailEventName != null}
          onOpenChange={(o) => {
            if (!o) setDetailEventName(null);
          }}
          clientId={effectiveClientId}
          eventName={detailEventName}
        />
      ) : null}
    </>
  );
}
