import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDoubleGoodClient, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { useBrazeSegmentsDirectory } from '@/hooks/useBrazeSegmentsDirectory';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Users,
  Sparkles,
  Check,
  X,
  Search,
  Star,
  MessageSquare,
  PenLine,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const SEGMENTS_PAGE_SIZE = 25;

interface Segment {
  id: string;
  name: string;
  tags?: string[];
  is_starred?: boolean;
  size?: number;
}

function generateAiDescription(name: string): string {
  const lower = name.toLowerCase();

  if (lower.includes('marketing') && lower.includes('audience')) {
    return 'Core marketing audience eligible for promotional campaigns and product updates.';
  }
  if (lower.includes('transactional')) {
    return 'Users receiving transactional communications related to account activity.';
  }
  if (lower.includes('abandon') || lower.includes('cart')) {
    return "Users who started checkout but didn't complete their purchase.";
  }
  if (lower.includes('music') || lower.includes('linker')) {
    return 'Creators in the music vertical using Linktree for their audience.';
  }
  if (lower.includes('earn')) {
    return 'Users eligible for or engaged with monetization features.';
  }
  if (lower.includes('pro') || lower.includes('upgrade')) {
    return 'Segment targeted for premium tier conversion messaging.';
  }
  if (lower.includes('active') || lower.includes('engaged')) {
    return 'Highly engaged users with regular platform activity.';
  }
  if (lower.includes('lapsed') || lower.includes('inactive') || lower.includes('reactivation')) {
    return "Users who haven't engaged recently, targeted for win-back.";
  }
  if (lower.includes('free')) {
    return 'Users on free tier, potential candidates for upgrade campaigns.';
  }
  if (lower.includes('workspace') || lower.includes('owner')) {
    return 'Workspace administrators with team management capabilities.';
  }
  if (lower.includes('test')) {
    return 'Internal testing segment for QA and validation.';
  }
  if (lower.includes('education') || lower.includes('student')) {
    return 'Users in the education vertical or with student status.';
  }
  if (lower.includes('fitness') || lower.includes('health')) {
    return 'Creators in the fitness and wellness vertical.';
  }
  if (lower.includes('podcast')) {
    return 'Podcasters using Linktree to connect with their audience.';
  }

  return 'Audience segment for targeted lifecycle communications.';
}

export function AudienceTab() {
  const { data: client } = useDoubleGoodClient();
  const { data: platforms } = useDoubleGoodPlatforms();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [segmentPage, setSegmentPage] = useState(1);

  const brazePlatform = platforms?.find((p) => p.platform === 'braze' && p.is_connected);
  const {
    data: segmentsFromSync = [],
    isLoading: segmentsLoading,
  } = useBrazeSegmentsDirectory(client?.id && brazePlatform ? client.id : undefined);

  const brazeSegments: Segment[] = segmentsFromSync;

  const { data: visibilityData, isLoading: visibilityLoading } = useQuery({
    queryKey: ['data-visibility', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('data_visibility')
        .select('*')
        .eq('client_id', client.id);
      if (error) throw error;
      return data as Array<{
        item_type: string;
        item_id: string;
        is_visible: boolean;
      }>;
    },
    enabled: !!client?.id,
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

  const isSegmentStarred = (segmentId: string) => starredMap.get(segmentId) === true;

  const toggleStarMutation = useMutation({
    mutationFn: async ({ segmentId, next }: { segmentId: string; next: boolean }) => {
      if (!client?.id) throw new Error('No client');
      const { error } = await supabase.from('data_visibility').upsert(
        {
          client_id: client.id,
          item_type: 'segment_starred',
          item_id: segmentId,
          is_visible: next,
        },
        { onConflict: 'client_id,item_type,item_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-visibility', client?.id] });
      queryClient.invalidateQueries({ queryKey: ['data-visibility-segments'] });
      queryClient.invalidateQueries({ queryKey: ['data-visibility-starred-segments'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update star', description: error.message, variant: 'destructive' });
    },
  });

  const { data: campaignSnippet = [] } = useQuery({
    queryKey: ['audience-tab-campaign-names', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('braze_campaigns')
        .select('name')
        .eq('client_id', client.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return (data ?? [])
        .map((r) => String((r as { name?: string }).name ?? '').trim())
        .filter(Boolean);
    },
    enabled: !!client?.id && !!brazePlatform,
    staleTime: 60_000,
  });

  const filteredSegments = useMemo(() => {
    let list = brazeSegments;
    if (showStarredOnly) {
      list = list.filter((s) => isSegmentStarred(s.id));
    }
    const q = searchQuery.toLowerCase();
    return list.filter(
      (seg) =>
        seg.name.toLowerCase().includes(q) ||
        (descriptions[seg.id] || '').toLowerCase().includes(q),
    );
  }, [brazeSegments, showStarredOnly, searchQuery, descriptions, starredMap]);

  const segmentTotalPages = Math.max(1, Math.ceil(filteredSegments.length / SEGMENTS_PAGE_SIZE));

  useEffect(() => {
    setSegmentPage(1);
  }, [searchQuery, showStarredOnly]);

  useEffect(() => {
    setSegmentPage((p) => Math.min(p, segmentTotalPages));
  }, [segmentTotalPages]);

  const paginatedSegments = useMemo(() => {
    const start = (segmentPage - 1) * SEGMENTS_PAGE_SIZE;
    return filteredSegments.slice(start, start + SEGMENTS_PAGE_SIZE);
  }, [filteredSegments, segmentPage]);

  const segmentRangeStart =
    filteredSegments.length === 0 ? 0 : (segmentPage - 1) * SEGMENTS_PAGE_SIZE + 1;
  const segmentRangeEnd = Math.min(segmentPage * SEGMENTS_PAGE_SIZE, filteredSegments.length);

  const starredSegmentsForEffect = useMemo(
    () => brazeSegments.filter((s) => isSegmentStarred(s.id)),
    [brazeSegments, starredMap],
  );

  useEffect(() => {
    const newDescriptions: Record<string, string> = {};
    starredSegmentsForEffect.forEach((seg) => {
      if (!descriptions[seg.id]) {
        newDescriptions[seg.id] = generateAiDescription(seg.name);
      }
    });
    if (Object.keys(newDescriptions).length > 0) {
      setDescriptions((prev) => ({ ...prev, ...newDescriptions }));
    }
  }, [starredSegmentsForEffect.length]);

  const handleEditStart = (segmentId: string) => {
    setEditingId(segmentId);
    setEditValue(
      descriptions[segmentId] ||
        generateAiDescription(
          brazeSegments.find((s) => s.id === segmentId)?.name || '',
        ),
    );
  };

  const handleEditSave = (segmentId: string) => {
    setDescriptions((prev) => ({ ...prev, [segmentId]: editValue }));
    setEditingId(null);
    setEditValue('');
    toast({ title: 'Description updated' });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleRegenerateDescription = async (segmentId: string, name: string) => {
    setGeneratingFor(segmentId);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const newDescription = generateAiDescription(name);
    setDescriptions((prev) => ({ ...prev, [segmentId]: newDescription }));
    setGeneratingFor(null);
    toast({ title: 'Description regenerated' });
  };

  if (!brazePlatform) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="font-semibold mb-2">Connect Braze</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Connect Braze on Platforms to sync segments into this workspace.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (segmentsLoading || visibilityLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <Card className="min-w-0 border-primary/20 bg-gradient-to-br from-primary/[0.06] to-transparent">
        <CardHeader className="min-w-0 pb-2">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <PenLine className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="text-base">Draft on-brand content</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                CRM Copilot uses your <strong className="font-medium text-foreground">Brand Voice</strong> and{' '}
                <strong className="font-medium text-foreground">Rules</strong> from this Resource Center, plus synced{' '}
                <strong className="font-medium text-foreground">campaigns</strong> and the segments you star below.
              </CardDescription>
              {campaignSnippet.length > 0 && (
                <div className="flex min-w-0 flex-wrap gap-1.5 pt-2">
                  {campaignSnippet.slice(0, 8).map((n, idx) => (
                    <Badge
                      key={`${idx}-${n.slice(0, 64)}`}
                      variant="secondary"
                      className="h-auto max-w-full min-w-0 shrink whitespace-normal break-words py-1.5 text-left font-normal leading-snug"
                    >
                      {n}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Button
            asChild
            className="bg-gradient-to-r from-primary to-violet-600 text-primary-foreground shadow-md"
          >
            <Link to="/chat" className="inline-flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Open CRM Copilot to draft
              <Sparkles className="h-4 w-4 opacity-90" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search segments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search segments"
          />
        </div>
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-500" />
          <Label htmlFor="audience-starred-only" className="text-sm whitespace-nowrap">
            Starred only
          </Label>
          <Switch
            id="audience-starred-only"
            checked={showStarredOnly}
            onCheckedChange={setShowStarredOnly}
          />
        </div>
      </div>

      {brazeSegments.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No segments synced yet. Run a full Braze sync (segments phase) from Campaigns or Platforms.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {paginatedSegments.map((segment) => {
            const starred = isSegmentStarred(segment.id);
            return (
              <Card
                key={segment.id}
                className="group min-w-0 hover:border-primary/30 transition-colors"
              >
                <CardContent className="min-w-0 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        toggleStarMutation.mutate({
                          segmentId: segment.id,
                          next: !starred,
                        })
                      }
                      disabled={toggleStarMutation.isPending}
                      className="mt-0.5 shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      aria-label={starred ? 'Remove star' : 'Star segment'}
                      title={starred ? 'Remove from starred' : 'Star for targeting & Copilot context'}
                    >
                      {starred ? (
                        <Star className="h-5 w-5 text-amber-500 fill-amber-500 shrink-0 hover:scale-110 transition-transform" />
                      ) : (
                        <Star className="h-5 w-5 text-muted-foreground/50 shrink-0 hover:text-amber-400 hover:scale-110 transition-all" />
                      )}
                    </button>

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3
                              className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]"
                              title={segment.name}
                            >
                              {segment.name}
                            </h3>
                            {starred && (
                              <Badge variant="outline" className="shrink-0 text-[10px] font-normal border-amber-500/40">
                                Starred
                              </Badge>
                            )}
                            {segment.size !== undefined && segment.size > 0 && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {segment.size.toLocaleString()} users
                              </span>
                            )}
                          </div>

                          {starred && (
                            <>
                              {editingId === segment.id ? (
                                <div className="mt-2 space-y-2">
                                  <Input
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    placeholder="Describe this segment..."
                                    className="text-sm"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleEditSave(segment.id);
                                      if (e.key === 'Escape') handleEditCancel();
                                    }}
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleEditSave(segment.id)}
                                    >
                                      <Check className="h-3 w-3 mr-1" />
                                      Save
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={handleEditCancel}>
                                      <X className="h-3 w-3 mr-1" />
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="group">
                                  <p
                                    className="mt-1 cursor-pointer text-pretty break-words text-sm text-muted-foreground transition-colors hover:text-foreground"
                                    onClick={() => handleEditStart(segment.id)}
                                    title="Click to edit"
                                  >
                                    {descriptions[segment.id] || generateAiDescription(segment.name)}
                                  </p>
                                </div>
                              )}
                            </>
                          )}

                          {!starred && (
                            <p className="mt-1 text-pretty break-words text-xs text-muted-foreground">
                              Star this segment to add notes and include it in your Copilot context.
                            </p>
                          )}
                        </div>

                        {starred && editingId !== segment.id && (
                          <div className="flex shrink-0 flex-wrap justify-end gap-1 sm:justify-start">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              onClick={() => handleEditStart(segment.id)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              onClick={() => handleRegenerateDescription(segment.id, segment.name)}
                              disabled={generatingFor === segment.id}
                            >
                              {generatingFor === segment.id ? (
                                <LoadingSpinner size="sm" className="mr-1" />
                              ) : (
                                <Sparkles className="h-3 w-3 mr-1" />
                              )}
                              Regenerate
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredSegments.length > SEGMENTS_PAGE_SIZE && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-4 sm:flex-row">
              <p className="text-sm text-muted-foreground">
                Showing{' '}
                <span className="font-medium text-foreground">
                  {segmentRangeStart}–{segmentRangeEnd}
                </span>{' '}
                of {filteredSegments.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={segmentPage <= 1}
                  onClick={() => setSegmentPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page of segments"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm tabular-nums text-muted-foreground">
                  Page {Math.min(segmentPage, segmentTotalPages)} of {segmentTotalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={segmentPage >= segmentTotalPages}
                  onClick={() => setSegmentPage((p) => Math.min(segmentTotalPages, p + 1))}
                  aria-label="Next page of segments"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {brazeSegments.length > 0 && filteredSegments.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {showStarredOnly ? (
            <p>No starred segments match. Turn off &quot;Starred only&quot; or star a segment.</p>
          ) : (
            <p>No segments match &quot;{searchQuery}&quot;</p>
          )}
        </div>
      )}
    </div>
  );
}
