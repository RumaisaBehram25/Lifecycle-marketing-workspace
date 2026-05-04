import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveClientRow, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { useBrazeDashboardClientId } from '@/hooks/useBrazeDashboardClientId';
import { useBrazeSegmentsDirectoryRich } from '@/hooks/useBrazeSegmentsDirectoryRich';
import type { BrazeSegmentDirectoryRichRow } from '@/hooks/useBrazeSegmentsDirectoryRich';
import { useBrazeSegmentPanelEnrichment } from '@/hooks/useBrazeSegmentPanelEnrichment';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DashboardSegmentDetailDialog } from '@/components/dashboard/DashboardSegmentDetailDialog';
import {
  Layers,
  Star,
  Search,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  List,
} from 'lucide-react';
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

const DESC_PREVIEW_LEN = 140;
const CARDS_PER_PAGE = 20;

function segmentDescriptionPreview(raw: Record<string, unknown> | null): string {
  const d = raw?.braze_export_segment_details;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const o = d as Record<string, unknown>;
    const t = o.description ?? o.text_description;
    if (typeof t === 'string' && t.trim()) {
      const s = t.trim();
      return s.length > DESC_PREVIEW_LEN ? `${s.slice(0, DESC_PREVIEW_LEN)}…` : s;
    }
  }
  return '';
}

export function DashboardSegmentsPanel() {
  const { data: client } = useActiveClientRow();
  const { data: platforms } = useDoubleGoodPlatforms();
  const { clientId: brazeMetricsClientId } = useBrazeDashboardClientId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('cards');
  const [cardPage, setCardPage] = useState(0);
  const [detailSegment, setDetailSegment] = useState<BrazeSegmentDirectoryRichRow | null>(null);

  const effectiveClientId = brazeMetricsClientId || client?.id;
  const brazePlatform = platforms?.find((p) => p.platform === 'braze' && p.is_connected);

  const {
    data: segmentsFromSync = [],
    isLoading: segmentsLoading,
  } = useBrazeSegmentsDirectoryRich(effectiveClientId && brazePlatform ? effectiveClientId : undefined);

  const {
    data: enrichment,
    isLoading: enrichmentLoading,
    isError: enrichmentError,
  } = useBrazeSegmentPanelEnrichment(
    effectiveClientId && brazePlatform ? effectiveClientId : undefined,
  );

  const formatIsoShort = useCallback((iso: string | null) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(t),
    );
  }, []);

  const segmentSummaryLine = useMemo(() => {
    const n = segmentsFromSync.length;
    if (segmentsLoading && n === 0) return 'Loading…';
    if (enrichmentLoading && n > 0) return `${enrichment?.listCount ?? n} segments · loading…`;
    const total = enrichment?.listCount ?? n;
    const ds = enrichment ? formatIsoShort(enrichment.lastListSyncedAt) : null;
    if (enrichmentError) return `${total} segments · summary unavailable`;
    const parts = [`${total} segments from Braze`];
    if (ds) parts.push(`last sync ${ds}`);
    return parts.join(' · ');
  }, [
    segmentsFromSync.length,
    segmentsLoading,
    enrichment,
    enrichmentLoading,
    enrichmentError,
    formatIsoShort,
  ]);

  /* ── starred state from data_visibility ── */
  const { data: visibilityData } = useQuery({
    queryKey: ['data-visibility', effectiveClientId],
    queryFn: async () => {
      if (!effectiveClientId) return [];
      const { data, error } = await supabase
        .from('data_visibility')
        .select('*')
        .eq('client_id', effectiveClientId);
      if (error) throw error;
      return data as Array<{
        item_type: string;
        item_id: string;
        is_visible: boolean;
      }>;
    },
    enabled: !!effectiveClientId,
  });

  const starredMap = useMemo(() => {
    const m = new Map<string, boolean>();
    visibilityData?.forEach((v) => {
      if (v.item_type === 'segment_starred') {
        m.set(v.item_id, v.is_visible);
      }
    });
    return m;
  }, [visibilityData]);

  const isStarred = useCallback(
    (segId: string) => starredMap.get(segId) === true,
    [starredMap],
  );

  const toggleStarMutation = useMutation({
    mutationFn: async ({ segmentId, next }: { segmentId: string; next: boolean }) => {
      if (!effectiveClientId) throw new Error('No client');
      const { error } = await supabase.from('data_visibility').upsert(
        {
          client_id: effectiveClientId,
          item_type: 'segment_starred',
          item_id: segmentId,
          is_visible: next,
        },
        { onConflict: 'client_id,item_type,item_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-visibility', effectiveClientId] });
      queryClient.invalidateQueries({ queryKey: ['data-visibility-segments'] });
      queryClient.invalidateQueries({ queryKey: ['data-visibility-starred-segments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-starred-segments'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update star', description: error.message, variant: 'destructive' });
    },
  });

  /* ── filtering ── */
  const filteredSegments = useMemo(() => {
    let list = segmentsFromSync;
    if (showStarredOnly) {
      list = list.filter((s) => isStarred(s.id));
    }
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [segmentsFromSync, showStarredOnly, searchQuery, isStarred]);

  const cardPageCount = Math.max(1, Math.ceil(filteredSegments.length / CARDS_PER_PAGE));
  const cardPageClamped = Math.min(cardPage, cardPageCount - 1);
  const pagedCardSegments = useMemo(() => {
    const start = cardPageClamped * CARDS_PER_PAGE;
    return filteredSegments.slice(start, start + CARDS_PER_PAGE);
  }, [filteredSegments, cardPageClamped]);

  useEffect(() => {
    setCardPage(0);
  }, [searchQuery, showStarredOnly, segmentsFromSync.length]);

  useEffect(() => {
    setCardPage((p) => Math.min(p, Math.max(0, cardPageCount - 1)));
  }, [cardPageCount]);

  const starredCount = useMemo(
    () => segmentsFromSync.filter((s) => isStarred(s.id)).length,
    [segmentsFromSync, isStarred],
  );

  /* ── no Braze? don't render ── */
  if (!brazePlatform) return null;

  return (
    <Card className={cn(dashboardSurfaceCard, 'shadow-md')}>
      <div className={dashboardTopAccentClass} aria-hidden />
      <CardHeader className={cn('pb-4', dashSectionTitleBorder)}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2
              className={cn(
                dashboardSectionHeadingClass,
                'flex items-center gap-2.5 text-2xl sm:text-3xl font-bold tracking-tight',
              )}
            >
              <Layers className="h-7 w-7 shrink-0 text-primary" aria-hidden />
              Segments
            </h2>
            <p className={cn('text-xs text-muted-foreground mt-1.5', dashSubtitleRule)}>
              {segmentSummaryLine}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">
            {segmentsFromSync.length}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-5 pt-4">
          {/* Search & filter bar */}
          <div
            className={cn(
              'rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm sm:p-4',
            )}
          >
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Find &amp; filter
            </p>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="relative min-w-0 max-w-md flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search segments…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 border-border/70 bg-background pl-10 text-sm shadow-sm focus-visible:ring-primary/25"
                  aria-label="Search segments"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="inline-flex rounded-lg border border-border/80 bg-background/80 p-0.5 shadow-sm">
                  <Button
                    type="button"
                    variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    onClick={() => setViewMode('cards')}
                    aria-pressed={viewMode === 'cards'}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Cards
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    onClick={() => setViewMode('list')}
                    aria-pressed={viewMode === 'list'}
                  >
                    <List className="h-3.5 w-3.5" />
                    List
                  </Button>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1.5">
                  <Star className="h-4 w-4 text-amber-500" />
                  <Label htmlFor="dash-seg-starred" className="text-sm whitespace-nowrap cursor-pointer">
                    Starred only
                  </Label>
                  <Switch
                    id="dash-seg-starred"
                    checked={showStarredOnly}
                    onCheckedChange={setShowStarredOnly}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Segments list — scrollable */}
          {segmentsLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              Loading segments…
            </div>
          ) : segmentsFromSync.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
              <Layers className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
              No segments synced yet. Run a Braze sync to populate.
            </div>
          ) : filteredSegments.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {showStarredOnly
                ? 'No starred segments match your search.'
                : `No segments match "${searchQuery}"`}
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Showing {filteredSegments.length} segment{filteredSegments.length !== 1 ? 's' : ''}
                {viewMode === 'cards' && filteredSegments.length > 0 ?
                  ` · cards page ${cardPageClamped + 1} of ${cardPageCount} (${CARDS_PER_PAGE} per page)`
                : ''}
              </p>

              {viewMode === 'list' ? (
                <div
                  className={cn(
                    'space-y-1.5 overflow-y-auto pr-1',
                    'max-h-[min(520px,55vh)]',
                    '[&::-webkit-scrollbar]:w-1.5',
                    '[&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-muted/30',
                    '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border',
                  )}
                >
                  {filteredSegments.map((segment) => {
                    const starred = isStarred(segment.id);
                    const audienceSize = enrichment?.sizeBySegmentId.get(segment.id);
                    const preview = segmentDescriptionPreview(segment.raw);
                    return (
                      <div
                        key={segment.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDetailSegment(segment)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDetailSegment(segment);
                          }
                        }}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-card/95 px-3.5 py-2.5',
                          'transition-all duration-150 hover:border-primary/35 hover:shadow-sm',
                          dashShadowSm,
                          dashRingInset,
                          starred && 'border-amber-500/25 bg-amber-500/[0.04]',
                        )}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStarMutation.mutate({
                              segmentId: segment.id,
                              next: !starred,
                            });
                          }}
                          disabled={toggleStarMutation.isPending}
                          className="shrink-0 rounded-md p-1 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-transform hover:scale-110"
                          aria-label={starred ? 'Remove star' : 'Star segment'}
                        >
                          {starred ? (
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                          ) : (
                            <Star className="h-4 w-4 text-muted-foreground/40 hover:text-amber-400 transition-colors" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium" title={segment.name}>
                            {segment.name}
                          </span>
                          {preview ? (
                            <span className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                              {preview}
                            </span>
                          ) : null}
                        </div>

                        {audienceSize != null && (
                          <span
                            className="shrink-0 tabular-nums text-xs text-muted-foreground"
                            title="Latest audience size (braze_segment_analytics)"
                          >
                            {audienceSize.toLocaleString()}
                          </span>
                        )}

                        {starred && (
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[10px] font-normal border-amber-500/40 text-amber-600"
                          >
                            Starred
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={cn(
                    'grid gap-3 sm:grid-cols-2 max-h-[min(520px,55vh)] overflow-y-auto pr-1',
                    '[&::-webkit-scrollbar]:w-1.5',
                    '[&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-muted/30',
                    '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border',
                  )}
                >
                  {pagedCardSegments.map((segment) => {
                    const starred = isStarred(segment.id);
                    const audienceSize = enrichment?.sizeBySegmentId.get(segment.id);
                    const preview = segmentDescriptionPreview(segment.raw);
                    const hasDetails =
                      segment.raw &&
                      typeof segment.raw.braze_export_segment_details === 'object' &&
                      segment.raw.braze_export_segment_details != null;
                    return (
                      <Card
                        key={segment.id}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'cursor-pointer overflow-hidden transition-all duration-200',
                          'hover:border-primary/45 hover:shadow-md motion-safe:hover:-translate-y-0.5',
                          'border-border/70 bg-card/95',
                          starred && 'border-amber-500/30 bg-amber-500/[0.03]',
                        )}
                        onClick={() => setDetailSegment(segment)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDetailSegment(segment);
                          }
                        }}
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleStarMutation.mutate({
                                    segmentId: segment.id,
                                    next: !starred,
                                  });
                                }}
                                disabled={toggleStarMutation.isPending}
                                className="mt-0.5 shrink-0 rounded-md p-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
                                aria-label={starred ? 'Remove star' : 'Star segment'}
                              >
                                {starred ? (
                                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                                ) : (
                                  <Star className="h-4 w-4 text-muted-foreground/35 hover:text-amber-400" />
                                )}
                              </button>
                              <div className="min-w-0 flex-1 space-y-1">
                                <p
                                  className="text-sm font-semibold leading-snug line-clamp-2"
                                  title={segment.name}
                                >
                                  {segment.name}
                                </p>
                                {preview ? (
                                  <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                                    {preview}
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-muted-foreground/80 italic">No description in export</p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2">
                            {audienceSize != null && (
                              <Badge variant="secondary" className="text-[10px] font-normal tabular-nums">
                                Size {audienceSize.toLocaleString()}
                              </Badge>
                            )}
                            {hasDetails && (
                              <Badge variant="outline" className="text-[10px] font-normal border-emerald-500/35 text-emerald-700 dark:text-emerald-400">
                                Details export
                              </Badge>
                            )}
                            {starred && (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal border-amber-500/40 text-amber-600"
                              >
                                Starred
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {viewMode === 'cards' && filteredSegments.length > CARDS_PER_PAGE && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
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
        </CardContent>

      {effectiveClientId && (
        <DashboardSegmentDetailDialog
          open={detailSegment != null}
          onOpenChange={(o) => {
            if (!o) setDetailSegment(null);
          }}
          clientId={effectiveClientId}
          segment={detailSegment}
          latestSize={
            detailSegment ? enrichment?.sizeBySegmentId.get(detailSegment.id) : undefined
          }
        />
      )}
    </Card>
  );
}
