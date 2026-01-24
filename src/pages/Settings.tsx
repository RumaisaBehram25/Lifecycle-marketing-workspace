import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLinktreeClient, useLinktreePlatforms } from '@/hooks/useLinktreeClient';
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

export default function Settings() {
  const { profile, role, isAdmin } = useAuth();
  const { data: client } = useLinktreeClient();
  const { data: platforms, refetch: refetchPlatforms } = useLinktreePlatforms();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('profile');
  const [searchQuery, setSearchQuery] = useState('');
  const [showStarredOnly, setShowStarredOnly] = useState(false);

  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const brazeData = brazePlatform?.schema_cache as BrazeSchemaCache | undefined;

  // Fetch visibility settings
  const { data: visibilityData, isLoading: visibilityLoading } = useQuery({
    queryKey: ['data-visibility', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('data_visibility')
        .select('*')
        .eq('client_id', client.id);
      if (error) throw error;
      return data as DataVisibility[];
    },
    enabled: !!client?.id,
  });

  // Create visibility map for quick lookup
  const visibilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    visibilityData?.forEach(v => {
      map.set(`${v.item_type}:${v.item_id}`, v.is_visible);
    });
    return map;
  }, [visibilityData]);

  // Toggle visibility mutation
  const toggleVisibility = useMutation({
    mutationFn: async ({ itemType, itemId, isVisible }: { itemType: string; itemId: string; isVisible: boolean }) => {
      if (!client?.id) throw new Error('No client');
      
      // Upsert visibility record
      const { error } = await supabase
        .from('data_visibility')
        .upsert({
          client_id: client.id,
          item_type: itemType,
          item_id: itemId,
          is_visible: isVisible,
        }, {
          onConflict: 'client_id,item_type,item_id',
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-visibility', client?.id] });
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

  const handleToggle = (itemType: string, itemId: string, dateStr?: string) => {
    const currentlyVisible = isItemVisible(itemType, itemId, dateStr);
    toggleVisibility.mutate({ itemType, itemId, isVisible: !currentlyVisible });
  };

  // Filter and sort campaigns (newest first)
  const filteredCampaigns = useMemo(() => {
    if (!brazeData?.campaigns) return [];
    return brazeData.campaigns
      .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        // Sort by last_sent date, newest first
        const dateA = a.last_sent ? new Date(a.last_sent).getTime() : 0;
        const dateB = b.last_sent ? new Date(b.last_sent).getTime() : 0;
        return dateB - dateA;
      });
  }, [brazeData?.campaigns, searchQuery]);

  // Filter and sort canvases (newest first based on name or enabled status)
  const filteredCanvases = useMemo(() => {
    if (!brazeData?.canvases) return [];
    return brazeData.canvases
      .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        // Active canvases first, then by name
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [brazeData?.canvases, searchQuery]);

  const filteredSegments = useMemo(() => {
    if (!brazeData?.segments) return [];
    let segments = brazeData.segments;
    if (showStarredOnly) {
      segments = segments.filter(s => s.is_starred);
    }
    return segments
      .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        // Starred first, then alphabetical
        if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [brazeData?.segments, searchQuery, showStarredOnly]);

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
              <TabsTrigger value="data-visibility" className="gap-2">
                <Eye className="h-4 w-4" />
                Data Visibility
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
                  {!brazeData?.last_sync ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No Braze data synced yet.</p>
                      <p className="text-sm mt-1">Connect and sync Braze from the Knowledge Base page first.</p>
                    </div>
                  ) : (
                    <>
                      {/* Search and Filters */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Search items..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Last synced: {new Date(brazeData.last_sync).toLocaleString()}
                        </div>
                      </div>

                      {/* Campaigns */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-blue-500" />
                          <h4 className="font-medium">Campaigns ({filteredCampaigns.length})</h4>
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
                        <ScrollArea className="h-[200px] border rounded-lg p-3">
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
                                      {segment.is_starred ? (
                                        <Star className="h-4 w-4 text-amber-500 fill-amber-500 flex-shrink-0" />
                                      ) : (
                                        <Star className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
                                      )}
                                      <p className="text-sm font-medium truncate">{segment.name}</p>
                                      {segment.is_starred && (
                                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/30">
                                          Starred in Braze
                                        </Badge>
                                      )}
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
        </Tabs>
      </div>
    </AppLayout>
  );
}
