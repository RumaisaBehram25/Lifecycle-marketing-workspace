import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { UserManagementPanel } from '@/components/settings/UserManagementPanel';
import { useBrazeDashboardClientId } from '@/hooks/useBrazeDashboardClientId';
import { useResolvedClientId } from '@/hooks/useDoubleGoodClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  User, 
  Shield, 
  Eye, 
  EyeOff, 
  Mail, 
  Workflow, 
  Users,
  RefreshCw,
  Search,
  Star,
  MessageSquarePlus,
  Bug,
  Lightbulb,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface BrazeSchemaCache {
  campaigns?: Array<{ id: string; name: string; last_sent?: string; draft?: boolean }>;
  canvases?: Array<{ id: string; name: string; enabled?: boolean }>;
  segments?: Array<{ id: string; name: string; is_starred?: boolean }>;
  last_sync?: string;
}

interface DataVisibility {
  id: string;
  client_id: string;
  item_type: string;
  item_id: string;
  is_visible: boolean;
}

type ClientRowBrief = { id: string; name: string; slug: string };

export default function Settings() {
  const { profile, role, isAdmin } = useAuth();
  const { clientId: driveClientId, isClientLoading: driveClientResolving } = useResolvedClientId();
  const {
    clientId: brazeDashboardClientId,
    isLoading: brazeDashboardClientResolving,
  } = useBrazeDashboardClientId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('profile');
  const [campaignSearch, setCampaignSearch] = useState('');
  const [canvasSearch, setCanvasSearch] = useState('');
  const [segmentSearch, setSegmentSearch] = useState('');
  const [showStarredOnly, setShowStarredOnly] = useState(false);

  const profileWorkspaceClientIds = useMemo(() => {
    const s = new Set<string>();
    if (driveClientId) s.add(driveClientId);
    if (brazeDashboardClientId) s.add(brazeDashboardClientId);
    return [...s];
  }, [driveClientId, brazeDashboardClientId]);

  const { data: profileWorkspaceClients } = useQuery({
    queryKey: ['settings-profile-workspace-clients', profileWorkspaceClientIds.slice().sort().join(',')],
    queryFn: async () => {
      if (profileWorkspaceClientIds.length === 0) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('id,name,slug')
        .in('id', profileWorkspaceClientIds);
      if (error) throw error;
      return (data ?? []) as ClientRowBrief[];
    },
    enabled: profileWorkspaceClientIds.length > 0,
    staleTime: 60_000,
  });

  const workspaceClientLabel = (id: string | undefined) => {
    if (!id) return '—';
    const row = profileWorkspaceClients?.find((c) => c.id === id);
    if (row?.name) {
      const slug = row.slug ? ` · ${row.slug}` : '';
      return `${row.name}${slug}`;
    }
    return `${id.slice(0, 8)}…`;
  };

  /** Same Braze client as Analytics / KPIs — admins see schema from the workspace that actually synced (not only DoubleGood). */
  const { data: dashboardBrazePlatform } = useQuery({
    queryKey: ['braze-platform-schema-dashboard', brazeDashboardClientId],
    queryFn: async () => {
      if (!brazeDashboardClientId) return null;
      const { data, error } = await supabase
        .from('client_platforms_public')
        .select('*')
        .eq('client_id', brazeDashboardClientId)
        .eq('platform', 'braze')
        .order('last_sync_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!brazeDashboardClientId,
    staleTime: 60_000,
  });

  const brazeData = dashboardBrazePlatform?.schema_cache as BrazeSchemaCache | undefined;

  const hasBrazeVisibilityCatalog =
    Boolean(brazeData?.last_sync) ||
    (brazeData?.campaigns?.length ?? 0) > 0 ||
    (brazeData?.canvases?.length ?? 0) > 0 ||
    (brazeData?.segments?.length ?? 0) > 0;

  const visibilityClientId = brazeDashboardClientId;

  // Fetch visibility settings (scoped to the same client as Braze sync / dashboard metrics)
  const { data: visibilityData } = useQuery({
    queryKey: ['data-visibility', visibilityClientId],
    queryFn: async () => {
      if (!visibilityClientId) return [];
      const { data, error } = await supabase
        .from('data_visibility')
        .select('*')
        .eq('client_id', visibilityClientId);
      if (error) throw error;
      return data as DataVisibility[];
    },
    enabled: !!visibilityClientId,
  });

  // Create visibility map for quick lookup
  const visibilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    visibilityData?.forEach(v => {
      map.set(`${v.item_type}:${v.item_id}`, v.is_visible);
    });
    return map;
  }, [visibilityData]);

  // Create starred map for segments
  const starredMap = useMemo(() => {
    const map = new Map<string, boolean>();
    visibilityData?.forEach(v => {
      if (v.item_type === 'segment_starred') {
        map.set(v.item_id, v.is_visible);
      }
    });
    return map;
  }, [visibilityData]);

  // Toggle visibility mutation
  const toggleVisibility = useMutation({
    mutationFn: async ({ itemType, itemId, isVisible }: { itemType: string; itemId: string; isVisible: boolean }) => {
      if (!visibilityClientId) throw new Error('No client');

      // Upsert visibility record
      const { error } = await supabase
        .from('data_visibility')
        .upsert({
          client_id: visibilityClientId,
          item_type: itemType,
          item_id: itemId,
          is_visible: isVisible,
        }, {
          onConflict: 'client_id,item_type,item_id',
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-visibility', visibilityClientId] });
      queryClient.invalidateQueries({ queryKey: ['data-visibility-canvas'] });
      queryClient.invalidateQueries({ queryKey: ['data-visibility-segments'] });
      queryClient.invalidateQueries({ queryKey: ['data-visibility-starred-segments'] });
    },
    onError: (error) => {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
    },
  });

  // Helper to check if a date is from 2024 or earlier
  const isOldItem = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date.getFullYear() <= 2024;
  };

  const isItemVisible = (itemType: string, itemId: string, dateStr?: string) => {
    const key = `${itemType}:${itemId}`;
    const explicitSetting = visibilityMap.get(key);
    
    // If explicitly set, use that value
    if (explicitSetting !== undefined) {
      return explicitSetting;
    }
    
    // Segments: default to NOT visible - users must manually enable
    if (itemType === 'segment') {
      return false;
    }
    
    // Campaigns/Canvases: hide items from 2024 and earlier, show newer ones
    return !isOldItem(dateStr);
  };

  const isSegmentStarred = (segmentId: string) => {
    return starredMap.get(segmentId) ?? false;
  };

  const handleToggle = (itemType: string, itemId: string, dateStr?: string) => {
    const currentlyVisible = isItemVisible(itemType, itemId, dateStr);
    toggleVisibility.mutate({ itemType, itemId, isVisible: !currentlyVisible });
  };

  const handleToggleStar = (segmentId: string) => {
    const currentlyStarred = isSegmentStarred(segmentId);
    toggleVisibility.mutate({ itemType: 'segment_starred', itemId: segmentId, isVisible: !currentlyStarred });
  };

  // Filter and sort campaigns (newest first)
  const filteredCampaigns = useMemo(() => {
    if (!brazeData?.campaigns) return [];
    return brazeData.campaigns
      .filter(c => c.name.toLowerCase().includes(campaignSearch.toLowerCase()))
      .sort((a, b) => {
        // Sort by last_sent date, newest first
        const dateA = a.last_sent ? new Date(a.last_sent).getTime() : 0;
        const dateB = b.last_sent ? new Date(b.last_sent).getTime() : 0;
        return dateB - dateA;
      });
  }, [brazeData?.campaigns, campaignSearch]);

  // Filter and sort canvases (newest first based on name or enabled status)
  const filteredCanvases = useMemo(() => {
    if (!brazeData?.canvases) return [];
    return brazeData.canvases
      .filter(c => c.name.toLowerCase().includes(canvasSearch.toLowerCase()))
      .sort((a, b) => {
        // Active canvases first, then by name
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [brazeData?.canvases, canvasSearch]);

  const filteredSegments = useMemo(() => {
    if (!brazeData?.segments) return [];
    let segments = brazeData.segments;
    if (showStarredOnly) {
      segments = segments.filter(s => isSegmentStarred(s.id));
    }
    return segments
      .filter(s => s.name.toLowerCase().includes(segmentSearch.toLowerCase()))
      .sort((a, b) => {
        // Starred first, then alphabetical
        const aStarred = isSegmentStarred(a.id);
        const bStarred = isSegmentStarred(b.id);
        if (aStarred !== bStarred) return aStarred ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [brazeData?.segments, segmentSearch, showStarredOnly, starredMap]);

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 sm:space-y-8">
        <PageHeader
          title="Settings"
          description="Manage your account and data preferences."
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="users" className="gap-2">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="data-visibility" className="gap-2">
                <Eye className="h-4 w-4" />
                Data Visibility
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="feedback" className="gap-2">
                <MessageSquarePlus className="h-4 w-4" />
                Feedback
              </TabsTrigger>
            )}
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile
                </CardTitle>
                <CardDescription>Your account information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={profile?.full_name || ''} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={profile?.email || ''} disabled />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Workflow className="h-5 w-5" />
                  Workspace &amp; data
                </CardTitle>
                <CardDescription>
                  Same rules as Dashboard <span className="font-medium text-foreground">Campaign Hygiene</span>: Braze-backed metrics and hygiene use the{' '}
                  <span className="font-medium text-foreground">analytics workspace</span> below. Drive, briefs, and onboarding CSV storage use your{' '}
                  <span className="font-medium text-foreground">resolved workspace</span>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {driveClientResolving || brazeDashboardClientResolving ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoadingSpinner size="sm" className="shrink-0" />
                    Resolving workspaces…
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                      <Label className="text-xs font-medium text-muted-foreground">Drive, briefs &amp; onboarding</Label>
                      <p className="text-sm font-medium text-foreground">{workspaceClientLabel(driveClientId)}</p>
                      {driveClientId ? (
                        <p className="text-[11px] font-mono text-muted-foreground break-all">{driveClientId}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">No workspace resolved yet.</p>
                      )}
                    </div>
                    <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Analytics, KPIs, Campaign Hygiene, Lifecycle (Braze)
                      </Label>
                      <p className="text-sm font-medium text-foreground">{workspaceClientLabel(brazeDashboardClientId)}</p>
                      {brazeDashboardClientId ? (
                        <p className="text-[11px] font-mono text-muted-foreground break-all">{brazeDashboardClientId}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Connect Braze on Platforms to attach analytics to a workspace.</p>
                      )}
                    </div>
                    {isAdmin &&
                      driveClientId &&
                      brazeDashboardClientId &&
                      driveClientId !== brazeDashboardClientId && (
                        <p className="text-xs text-muted-foreground border-l-2 border-primary/35 pl-3 leading-relaxed">
                          As an admin, KPIs and campaign lists follow the workspace where Braze last synced, which can differ from Drive&apos;s workspace
                          (same behavior as the Dashboard).
                        </p>
                      )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Role & Permissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Badge variant={isAdmin ? 'default' : 'secondary'} className="text-sm">
                    {role || 'member'}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {isAdmin 
                      ? 'You have full access to manage clients and settings.'
                      : 'You can view clients and generate content.'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab - Admin Only */}
          {isAdmin && (
            <TabsContent value="users" className="space-y-6">
              <UserManagementPanel />
            </TabsContent>
          )}

          {/* Data Visibility Tab - Admin Only */}
          {isAdmin && (
            <TabsContent value="data-visibility" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Data Visibility
                  </CardTitle>
                  <CardDescription>
                    Toggle which synced Braze data appears in Campaigns and Lifecycle pages. 
                    Hidden items are still stored but won't clutter your view.
                    <span className="block mt-2 text-xs text-primary/80 font-medium">
                      💡 Your visibility settings persist after re-syncing. New items from a sync will default to visible.
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!hasBrazeVisibilityCatalog ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No Braze data synced yet.</p>
                      <p className="text-sm mt-1">Connect and sync Braze from the Knowledge Base page first.</p>
                    </div>
                  ) : (
                    <>
                      {brazeData?.last_sync ? (
                        <div className="text-xs text-muted-foreground text-right">
                          Last synced: {new Date(brazeData.last_sync).toLocaleString()}
                        </div>
                      ) : null}

                      {/* Campaigns */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-blue-500" />
                          <h4 className="font-medium">Campaigns ({filteredCampaigns.length})</h4>
                        </div>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Search campaigns..."
                            value={campaignSearch}
                            onChange={(e) => setCampaignSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <ScrollArea className="h-[200px] border rounded-lg p-3">
                          {filteredCampaigns.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">No campaigns found</p>
                          ) : (
                            <div className="space-y-2">
                              {filteredCampaigns.map((campaign) => (
                                <div key={campaign.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{campaign.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {campaign.last_sent ? `Last sent: ${new Date(campaign.last_sent).toLocaleDateString()}` : 'Never sent'}
                                    </p>
                                  </div>
                                  <Switch
                                    checked={isItemVisible('campaign', campaign.id, campaign.last_sent)}
                                    onCheckedChange={() => handleToggle('campaign', campaign.id, campaign.last_sent)}
                                    disabled={toggleVisibility.isPending}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      </div>

                      {/* Canvases (Lifecycle) */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Workflow className="h-4 w-4 text-purple-500" />
                          <h4 className="font-medium">Lifecycle Journeys ({filteredCanvases.length})</h4>
                        </div>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Search journeys..."
                            value={canvasSearch}
                            onChange={(e) => setCanvasSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <ScrollArea className="h-[200px] border rounded-lg p-3">
                          {filteredCanvases.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">No journeys found</p>
                          ) : (
                            <div className="space-y-2">
                              {filteredCanvases.map((canvas) => (
                                <div key={canvas.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium truncate">{canvas.name}</p>
                                      <Badge variant={canvas.enabled ? 'default' : 'secondary'} className="text-xs">
                                        {canvas.enabled ? 'Active' : 'Draft'}
                                      </Badge>
                                    </div>
                                  </div>
                                  <Switch
                                    checked={isItemVisible('canvas', canvas.id)}
                                    onCheckedChange={() => handleToggle('canvas', canvas.id)}
                                    disabled={toggleVisibility.isPending}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      </div>

                      {/* Segments */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-emerald-500" />
                            <h4 className="font-medium">Segments ({filteredSegments.length})</h4>
                          </div>
                          <div className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-amber-500" />
                            <Label htmlFor="starred-only" className="text-sm">Starred only</Label>
                            <Switch
                              id="starred-only"
                              checked={showStarredOnly}
                              onCheckedChange={setShowStarredOnly}
                            />
                          </div>
                        </div>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Search segments..."
                            value={segmentSearch}
                            onChange={(e) => setSegmentSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <ScrollArea className="h-[250px] border rounded-lg p-3">
                          {filteredSegments.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              {showStarredOnly ? 'No starred segments found' : 'No segments found'}
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {filteredSegments.map((segment) => (
                                <div key={segment.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handleToggleStar(segment.id)}
                                        className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
                                        disabled={toggleVisibility.isPending}
                                      >
                                        {isSegmentStarred(segment.id) ? (
                                          <Star className="h-4 w-4 text-amber-500 fill-amber-500 flex-shrink-0 hover:scale-110 transition-transform" />
                                        ) : (
                                          <Star className="h-4 w-4 text-muted-foreground/50 flex-shrink-0 hover:text-amber-400 hover:scale-110 transition-all" />
                                        )}
                                      </button>
                                      <p className="text-sm font-medium truncate">{segment.name}</p>
                                    </div>
                                  </div>
                                  <Switch
                                    checked={isItemVisible('segment', segment.id)}
                                    onCheckedChange={() => handleToggle('segment', segment.id)}
                                    disabled={toggleVisibility.isPending}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Feedback Tab - Admin Only */}
          {isAdmin && (
            <TabsContent value="feedback" className="space-y-6">
              <FeedbackAdmin />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}

// Feedback Admin Component
function FeedbackAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: feedbackItems, isLoading } = useQuery({
    queryKey: ['feedback-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('feedback')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-admin'] });
      toast({ title: 'Status updated' });
    },
    onError: (error) => {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <Clock className="h-4 w-4 text-amber-500" />;
      case 'in_progress': return <RefreshCw className="h-4 w-4 text-blue-500" />;
      case 'resolved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'closed': return <XCircle className="h-4 w-4 text-muted-foreground" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getTypeIcon = (type: string) => {
    return type === 'bug_report' 
      ? <Bug className="h-4 w-4 text-red-500" /> 
      : <Lightbulb className="h-4 w-4 text-amber-500" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquarePlus className="h-5 w-5" />
          User Feedback
        </CardTitle>
        <CardDescription>
          Product requests and bug reports submitted by users.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!feedbackItems?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquarePlus className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No feedback submitted yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {feedbackItems.map((item) => (
                <div key={item.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      {getTypeIcon(item.type)}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString()} • {item.type === 'bug_report' ? 'Bug Report' : 'Product Request'}
                        </p>
                      </div>
                    </div>
                    <Select 
                      value={item.status} 
                      onValueChange={(status) => updateStatus.mutate({ id: item.id, status })}
                    >
                      <SelectTrigger className="w-[130px]">
                        <SelectValue>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(item.status)}
                            <span className="capitalize">{item.status.replace('_', ' ')}</span>
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-amber-500" /> Open
                          </div>
                        </SelectItem>
                        <SelectItem value="in_progress">
                          <div className="flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 text-blue-500" /> In Progress
                          </div>
                        </SelectItem>
                        <SelectItem value="resolved">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" /> Resolved
                          </div>
                        </SelectItem>
                        <SelectItem value="closed">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-muted-foreground" /> Closed
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
