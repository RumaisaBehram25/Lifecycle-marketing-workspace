import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveClientRow, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { useBrazeDashboardClientId } from '@/hooks/useBrazeDashboardClientId';
import { useBrazeSegmentsDirectory } from '@/hooks/useBrazeSegmentsDirectory';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Layers,
  Star,
  Search,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  dashboardSurfaceCard,
  dashboardTopAccentClass,
  dashSectionTitleBorder,
  dashboardSectionHeadingClass,
  dashboardSectionDotClass,
  dashSubtitleRule,
  dashShadowSm,
  dashRingInset,
  dashRowHover,
} from '@/lib/dashboard-surface';

export function DashboardSegmentsPanel() {
  const { data: client } = useActiveClientRow();
  const { data: platforms } = useDoubleGoodPlatforms();
  const { clientId: brazeMetricsClientId } = useBrazeDashboardClientId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const effectiveClientId = brazeMetricsClientId || client?.id;
  const brazePlatform = platforms?.find((p) => p.platform === 'braze' && p.is_connected);

  const {
    data: segmentsFromSync = [],
    isLoading: segmentsLoading,
  } = useBrazeSegmentsDirectory(effectiveClientId && brazePlatform ? effectiveClientId : undefined);

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

  const starredCount = useMemo(
    () => segmentsFromSync.filter((s) => isStarred(s.id)).length,
    [segmentsFromSync, isStarred],
  );

  /* ── no Braze? don't render ── */
  if (!brazePlatform) return null;

  return (
    <Card className={cn(dashboardSurfaceCard, 'shadow-md')}>
      <div className={dashboardTopAccentClass} aria-hidden />
      <CardHeader
        className={cn(
          'pb-3 cursor-pointer hover:bg-primary/[0.03] transition-colors',
          dashSectionTitleBorder,
        )}
        onClick={() => setIsExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className={cn(dashboardSectionHeadingClass, 'text-2xl sm:text-3xl font-bold tracking-tight')}>
              <span className={dashboardSectionDotClass} aria-hidden />
              Segments
            </h2>
            <p className={cn('text-xs text-muted-foreground mt-1.5 pl-3 ml-0.5', dashSubtitleRule)}>
              {segmentsFromSync.length} segment{segmentsFromSync.length !== 1 ? 's' : ''} synced
              {starredCount > 0 ? ` · ${starredCount} starred` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {segmentsFromSync.length}
            </Badge>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-4 pb-5 space-y-4">
          {/* Search & filter bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search segments…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 text-sm"
                aria-label="Search segments"
              />
            </div>
            <div className="flex items-center gap-2">
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
              </p>
              <div
                className={cn(
                  'space-y-1.5 overflow-y-auto pr-1',
                  'max-h-[400px]',
                  /* Thin custom scrollbar */
                  '[&::-webkit-scrollbar]:w-1.5',
                  '[&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-muted/30',
                  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border',
                )}
              >
                {filteredSegments.map((segment) => {
                  const starred = isStarred(segment.id);
                  return (
                    <div
                      key={segment.id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border border-border/60 bg-card/95 px-3.5 py-2.5',
                        'transition-all duration-150',
                        dashShadowSm,
                        dashRingInset,
                        dashRowHover,
                        starred && 'border-amber-500/25 bg-amber-500/[0.04]',
                      )}
                    >
                      {/* Star toggle */}
                      <button
                        type="button"
                        onClick={() =>
                          toggleStarMutation.mutate({
                            segmentId: segment.id,
                            next: !starred,
                          })
                        }
                        disabled={toggleStarMutation.isPending}
                        className="shrink-0 rounded-md p-1 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-transform hover:scale-110"
                        aria-label={starred ? 'Remove star' : 'Star segment'}
                        title={starred ? 'Remove from starred' : 'Star this segment'}
                      >
                        {starred ? (
                          <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        ) : (
                          <Star className="h-4 w-4 text-muted-foreground/40 hover:text-amber-400 transition-colors" />
                        )}
                      </button>

                      {/* Icon */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Users className="h-4 w-4 text-primary" />
                      </div>

                      {/* Name */}
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-medium"
                        title={segment.name}
                      >
                        {segment.name}
                      </span>

                      {/* Starred badge */}
                      {starred && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px] font-normal border-amber-500/40 text-amber-600"
                        >
                          Starred
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
