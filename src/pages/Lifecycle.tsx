import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLinktreeClient, useLinktreePlatforms } from '@/hooks/useLinktreeClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { 
  Search, 
  Mail, 
  Smartphone, 
  Bell, 
  ArrowRight, 
  Sparkles,
  TrendingUp,
  Gift,
  Heart,
  Zap,
  Calendar,
  ChevronRight,
  LayoutGrid,
  List,
  RefreshCw,
  AlertCircle,
  Workflow,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { parseCampaignTaxonomy, getChannelColor, getTypeColor } from '@/lib/campaign-taxonomy';
import { CanvasFlowChart } from '@/components/creative/CanvasFlowChart';

// Type definitions
interface CanvasStep {
  id: string;
  name: string;
  type: string;
  channel?: string;
  delay_seconds?: number;
  delay_formatted?: string;
  next_step_ids: string[];
  next_paths?: Array<{ name: string; next_step_id: string; percentage?: number }>;
  messages?: Array<{
    channel: string;
    subject?: string;
    preheader?: string;
    title?: string;
    body?: string;
  }>;
}

interface CanvasVariant {
  name: string;
  percentage: number;
  first_step_id: string | null;
}

interface BrazeCanvas {
  id: string;
  name: string;
  description?: string;
  draft?: boolean;
  enabled?: boolean;
  schedule_type?: string;
  first_entry?: string;
  last_entry?: string;
  tags?: string[];
  archived?: boolean;
  variants: CanvasVariant[];
  steps: Record<string, CanvasStep>;
  total_steps?: number;
}

interface BrazeSchemaCache {
  canvases?: BrazeCanvas[];
  last_sync?: string;
}

// Mock data
const MOCK_JOURNEYS: Array<{
  id: string;
  name: string;
  displayName: string;
  description: string;
  status: 'active' | 'draft';
  enabled?: boolean;
  tags: string[];
  channels: string[];
  taxonomy: { type: 'lifecycle'; channel: string; displayName: string; dateString: string };
  variants: CanvasVariant[];
  steps: Record<string, CanvasStep>;
  total_steps: number;
  first_entry?: string;
}> = [
  {
    id: 'welcome',
    name: 'Welcome Series',
    displayName: 'Welcome Series',
    description: 'Onboard new users and drive first actions',
    status: 'active',
    enabled: true,
    tags: ['onboarding', 'new-users'],
    channels: ['email', 'push'],
    taxonomy: { type: 'lifecycle', channel: 'email', displayName: 'Welcome Series', dateString: '' },
    variants: [
      { name: 'Main Path', percentage: 100, first_step_id: 'step1' }
    ],
    steps: {
      'step1': { id: 'step1', name: 'Welcome Email', type: 'message', channel: 'email', delay_formatted: '0h', next_step_ids: ['step2'] },
      'step2': { id: 'step2', name: 'Push Reminder', type: 'message', channel: 'push', delay_formatted: '24h', next_step_ids: ['step3'] },
      'step3': { id: 'step3', name: 'Feature Intro', type: 'message', channel: 'email', delay_formatted: '48h', next_step_ids: ['step4'] },
      'step4': { id: 'step4', name: 'Pro Upgrade Nudge', type: 'message', channel: 'push', delay_formatted: '72h', next_step_ids: [] },
    },
    total_steps: 4,
  },
  {
    id: 're-engagement',
    name: 'Re-engagement',
    displayName: 'Re-engagement',
    description: 'Win back inactive creators',
    status: 'active',
    enabled: true,
    tags: ['retention', 'winback'],
    channels: ['email', 'push', 'in_app_message'],
    taxonomy: { type: 'lifecycle', channel: 'email', displayName: 'Re-engagement', dateString: '' },
    variants: [
      { name: 'Main Path', percentage: 100, first_step_id: 'step1' }
    ],
    steps: {
      'step1': { id: 'step1', name: 'We Miss You Email', type: 'message', channel: 'email', delay_formatted: '0h', next_step_ids: ['step2'] },
      'step2': { id: 'step2', name: 'In-App Banner', type: 'message', channel: 'in_app_message', delay_formatted: '3d', next_step_ids: ['step3'] },
      'step3': { id: 'step3', name: "What's New Email", type: 'message', channel: 'email', delay_formatted: '7d', next_step_ids: ['step4'] },
      'step4': { id: 'step4', name: 'Last Chance Push', type: 'message', channel: 'push', delay_formatted: '14d', next_step_ids: [] },
    },
    total_steps: 4,
  },
];

export default function Lifecycle() {
  const { data: client } = useLinktreeClient();
  const { data: platforms, refetch: refetchPlatforms } = useLinktreePlatforms();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('All');
  const [channelFilter, setChannelFilter] = useState('All');
  const [launchDateFilter, setLaunchDateFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedJourney, setSelectedJourney] = useState<any>(null);
  const [selectedTouchpoint, setSelectedTouchpoint] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const brazeData = brazePlatform?.schema_cache as BrazeSchemaCache | undefined;
  const hasBrazeData = !!brazeData?.last_sync;

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
    enabled: !!client?.id,
  });

  const visibilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    visibilityData?.forEach(v => map.set(v.item_id, v.is_visible));
    return map;
  }, [visibilityData]);

  // Transform Braze canvases to journey format
  const journeys = useMemo(() => {
    if (!brazeData?.canvases?.length) return MOCK_JOURNEYS;
    
    return brazeData.canvases
      .filter(canvas => !canvas.archived)
      .map(canvas => {
        const taxonomy = parseCampaignTaxonomy(canvas.name);
        
        const stepsRecord = canvas.steps || {};
        const stepsList = Object.values(stepsRecord);
        
        let inferredChannels: string[] = [];
        if (stepsList.length > 0) {
          const channels = stepsList
            .filter((s): s is CanvasStep => s.channel !== undefined)
            .map(s => s.channel as string);
          inferredChannels = [...new Set(channels)];
        }
        if (inferredChannels.length === 0) {
          const nameLower = canvas.name.toLowerCase();
          if (nameLower.includes('email') || taxonomy.channel === 'email') inferredChannels.push('email');
          if (nameLower.includes('push')) inferredChannels.push('push');
          if (nameLower.includes('sms')) inferredChannels.push('sms');
          if (nameLower.includes('in-app') || nameLower.includes('in_app')) inferredChannels.push('in_app_message');
          if (inferredChannels.length === 0) inferredChannels.push('email');
        }
        
        const isActive = canvas.enabled === true;
        
        return {
          id: canvas.id,
          name: canvas.name,
          displayName: taxonomy.displayName,
          description: canvas.description || 'Braze Canvas journey',
          status: isActive ? 'active' : 'draft' as 'active' | 'draft',
          enabled: canvas.enabled,
          draft: canvas.draft,
          tags: canvas.tags || [],
          channels: inferredChannels,
          first_entry: canvas.first_entry,
          last_entry: canvas.last_entry,
          schedule_type: canvas.schedule_type,
          taxonomy: { ...taxonomy, type: 'lifecycle' as const },
          variants: canvas.variants || [],
          steps: stepsRecord,
          total_steps: canvas.total_steps || stepsList.length,
        };
      });
  }, [brazeData?.canvases]);

  // Get unique tags for filter
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    journeys.forEach(j => j.tags?.forEach((t: string) => tags.add(t)));
    return ['All', ...Array.from(tags)];
  }, [journeys]);

  // Helper to check if a date is from 2024 or earlier
  const isOldItem = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date.getFullYear() <= 2024;
  };

  // Check visibility with date-based default (hide 2024 and older)
  const isItemVisible = (canvasId: string, dateStr?: string) => {
    const explicitSetting = visibilityMap.get(canvasId);
    if (explicitSetting !== undefined) return explicitSetting;
    return !isOldItem(dateStr);
  };

  // Filter journeys (including visibility with date-based defaults)
  const filteredJourneys = useMemo(() => {
    return journeys.filter(journey => {
      // Check visibility with date-based default
      if (!isItemVisible(journey.id, journey.first_entry)) return false;
      
      const matchesSearch = journey.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           journey.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = tagFilter === 'All' || journey.tags?.includes(tagFilter);
      
      // Channel filter with normalized matching
      let matchesChannel = true;
      if (channelFilter !== 'All') {
        matchesChannel = journey.channels?.some(ch => {
          const normalizedCh = ch.toLowerCase().replace(/[-_]/g, '');
          const normalizedFilter = channelFilter.toLowerCase().replace(/[-_]/g, '');
          return normalizedCh === normalizedFilter || normalizedCh.includes(normalizedFilter) || normalizedFilter.includes(normalizedCh);
        }) || false;
      }
      
      // Filter by launch date (first_entry)
      let matchesLaunchDate = true;
      if (launchDateFilter !== 'All') {
        if (!journey.first_entry) {
          matchesLaunchDate = false;
        } else {
          const launchDate = new Date(journey.first_entry);
          const now = new Date();
          const daysDiff = Math.floor((now.getTime() - launchDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (launchDateFilter === '7days') matchesLaunchDate = daysDiff <= 7;
          else if (launchDateFilter === '30days') matchesLaunchDate = daysDiff <= 30;
          else if (launchDateFilter === '90days') matchesLaunchDate = daysDiff <= 90;
        }
      }
      
      return matchesSearch && matchesTag && matchesChannel && matchesLaunchDate;
    });
  }, [journeys, searchQuery, tagFilter, channelFilter, launchDateFilter, visibilityMap]);

  const handleSyncBraze = async () => {
    if (!client?.id || !brazePlatform?.id) {
      toast({ title: 'Connect Braze first', description: 'Go to Knowledge Base to connect Braze', variant: 'destructive' });
      return;
    }
    
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('sync-braze', {
        body: { clientId: client.id, platformId: brazePlatform.id },
      });
      if (error) throw error;
      toast({ title: 'Braze data synced' });
      refetchPlatforms();
    } catch (err: any) {
      toast({ title: 'Sync failed', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Lifecycle"
          description="Browse multi-touch lifecycle journeys and automated flows"
          actions={
            <div className="flex items-center gap-2">
              {brazePlatform && (
                <Button variant="outline" size="sm" onClick={handleSyncBraze} disabled={syncing}>
                  {syncing ? <LoadingSpinner size="sm" className="mr-2" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Sync Braze
                </Button>
              )}
              <Button asChild>
                <Link to="/chat">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate New
                </Link>
              </Button>
            </div>
          }
        />

        {/* Data Source Indicator */}
        {!hasBrazeData && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Showing sample data</p>
                <p className="text-xs text-muted-foreground">
                  {brazePlatform 
                    ? 'Click "Sync Braze" to pull your live canvases'
                    : 'Connect Braze on the Knowledge Base page to see your real data'
                  }
                </p>
              </div>
              {!brazePlatform && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/knowledge">Connect Braze</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search journeys..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
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
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="inapp">In-App</SelectItem>
              </SelectContent>
            </Select>

            <Select value={launchDateFilter} onValueChange={setLaunchDateFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Launched" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">Any time</SelectItem>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="90days">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            
            {allTags.length > 1 && (
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Tags" />
                </SelectTrigger>
                <SelectContent>
                  {allTags.map(tag => (
                    <SelectItem key={tag} value={tag === 'All' ? 'All' : tag}>
                      {tag === 'All' ? 'All Tags' : tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Journeys Grid/List */}
        {selectedJourney ? (
          <JourneyDetail 
            journey={selectedJourney} 
            onBack={() => setSelectedJourney(null)}
            onViewTouchpoint={(step: any) => setSelectedTouchpoint(step)}
          />
        ) : (
          <div className={viewMode === 'grid' 
            ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' 
            : 'space-y-3'
          }>
            {filteredJourneys.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <Workflow className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No journeys found</p>
              </div>
            ) : (
              filteredJourneys.map(journey => (
                <JourneyCard 
                  key={journey.id} 
                  journey={journey} 
                  viewMode={viewMode}
                  onClick={() => setSelectedJourney(journey)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Touchpoint Creative Modal */}
      <Dialog open={!!selectedTouchpoint} onOpenChange={() => setSelectedTouchpoint(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChannelIcon channel={selectedTouchpoint?.channel || 'email'} size="lg" />
              {selectedTouchpoint?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedTouchpoint?.channel === 'email' ? 'Email creative preview' :
               selectedTouchpoint?.channel === 'push' ? 'Push notification preview' :
               selectedTouchpoint?.channel === 'in_app_message' ? 'In-app message preview' :
               'Message preview'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTouchpoint && (
            <div className="space-y-4 mt-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={getChannelColor(selectedTouchpoint.channel)}>
                  {selectedTouchpoint.channel === 'in_app_message' ? 'In-App' : selectedTouchpoint.channel}
                </Badge>
                {selectedTouchpoint.type === 'trigger' && (
                  <Badge variant="secondary">Trigger</Badge>
                )}
                <Badge variant="outline" className="gap-1">
                  <Calendar className="h-3 w-3" />
                  {selectedTouchpoint.delay}
                </Badge>
              </div>

              {/* Channel-specific preview */}
              {selectedTouchpoint.channel === 'email' && (
                <div className="space-y-3">
                  {selectedTouchpoint.subject && (
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Subject Line</p>
                      <p className="font-medium">{selectedTouchpoint.subject}</p>
                    </div>
                  )}
                  {selectedTouchpoint.html_preview ? (
                    <div className="border rounded-lg overflow-hidden bg-white">
                      <iframe
                        srcDoc={selectedTouchpoint.html_preview}
                        className="w-full h-[400px]"
                        title="Email Preview"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-muted/20 rounded-lg border border-dashed">
                      <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Email preview not available</p>
                      <p className="text-xs text-muted-foreground mt-1">Creative content would be synced from Braze</p>
                    </div>
                  )}
                </div>
              )}

              {selectedTouchpoint.channel === 'push' && (
                <div className="space-y-3">
                  <div className="max-w-sm mx-auto">
                    <div className="bg-card border rounded-2xl p-4 shadow-lg">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-primary-foreground">L</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">Linktree • now</p>
                          <p className="font-semibold text-sm mt-0.5">{selectedTouchpoint.title || selectedTouchpoint.name}</p>
                          {selectedTouchpoint.body && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{selectedTouchpoint.body}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-center text-muted-foreground mt-3">Push notification preview</p>
                  </div>
                  {!selectedTouchpoint.title && !selectedTouchpoint.body && (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      Push content would be synced from Braze canvas details
                    </div>
                  )}
                </div>
              )}

              {selectedTouchpoint.channel === 'in_app_message' && (
                <div className="space-y-3">
                  <div className="max-w-sm mx-auto">
                    <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/30 rounded-2xl p-6 text-center">
                      <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                        <Smartphone className="h-6 w-6 text-primary" />
                      </div>
                      <h4 className="font-bold text-lg">{selectedTouchpoint.title || selectedTouchpoint.name}</h4>
                      {selectedTouchpoint.body && (
                        <p className="text-sm text-muted-foreground mt-2">{selectedTouchpoint.body}</p>
                      )}
                      <Button className="mt-4" size="sm">
                        {selectedTouchpoint.cta || 'Take Action'}
                      </Button>
                    </div>
                    <p className="text-xs text-center text-muted-foreground mt-3">In-app message preview</p>
                  </div>
                  {!selectedTouchpoint.title && !selectedTouchpoint.body && (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      In-app content would be synced from Braze canvas details
                    </div>
                  )}
                </div>
              )}

              {selectedTouchpoint.channel === 'sms' && (
                <div className="space-y-3">
                  <div className="max-w-sm mx-auto">
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
                      <p className="text-sm">{selectedTouchpoint.body || 'SMS message content would appear here'}</p>
                    </div>
                    <p className="text-xs text-center text-muted-foreground mt-3">SMS preview</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// Journey Card Component
function JourneyCard({ 
  journey, 
  viewMode,
  onClick,
}: { 
  journey: any; 
  viewMode: 'grid' | 'list';
  onClick: () => void;
}) {
  const getIcon = () => {
    const name = journey.name.toLowerCase();
    if (name.includes('welcome') || name.includes('onboard')) return Sparkles;
    if (name.includes('re-engage') || name.includes('winback')) return TrendingUp;
    if (name.includes('upgrade') || name.includes('upsell')) return Zap;
    if (name.includes('milestone') || name.includes('anniversary')) return Heart;
    if (name.includes('feature') || name.includes('announce')) return Gift;
    return Workflow;
  };
  
  const getColor = () => {
    const name = journey.name.toLowerCase();
    if (name.includes('welcome')) return 'bg-emerald-500';
    if (name.includes('re-engage')) return 'bg-blue-500';
    if (name.includes('upgrade')) return 'bg-purple-500';
    if (name.includes('milestone')) return 'bg-pink-500';
    return 'bg-primary';
  };

  const Icon = getIcon();
  const color = getColor();
  
  if (viewMode === 'list') {
    return (
      <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={onClick}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className={`h-12 w-12 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{journey.displayName || journey.name}</h3>
                <Badge variant={journey.status === 'active' ? 'default' : 'secondary'}>
                  {journey.status === 'active' ? 'Active' : 'Draft'}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {journey.channels?.map((ch: string) => (
                  <Badge key={ch} variant="outline" className={`text-xs ${getChannelColor(ch)}`}>
                    {ch === 'in_app_message' ? 'In-App' : ch}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{journey.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right text-xs text-muted-foreground">
                <span>{Object.keys(journey.steps || {}).length} touches</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group hover:border-primary/50 hover:shadow-md transition-all cursor-pointer overflow-hidden" onClick={onClick}>
      {/* Channel Pills Header */}
      <div className="px-4 py-2 bg-muted/30 border-b flex items-center gap-1.5 flex-wrap">
        {journey.channels?.map((ch: string) => (
          <Badge key={ch} variant="outline" className={`text-xs bg-background ${getChannelColor(ch)}`}>
            {ch === 'in_app_message' ? 'In-App' : ch}
          </Badge>
        ))}
        <Badge variant={journey.status === 'active' ? 'default' : 'secondary'} className="text-xs ml-auto">
          {journey.status === 'active' ? 'Active' : 'Draft'}
        </Badge>
      </div>
      
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-1">
              {journey.displayName || journey.name}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{journey.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <Workflow className="h-3.5 w-3.5" />
          <span>{journey.total_steps || Object.keys(journey.steps || {}).length} touchpoints</span>
          <span className="text-muted-foreground/50">•</span>
          <span>{journey.channels?.length || 0} channels</span>
        </div>

        {journey.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {journey.tags.slice(0, 3).map((tag: string) => (
              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t">
          <div className="flex items-center gap-1">
            {journey.channels?.map((channel: string) => (
              <ChannelIcon key={channel} channel={channel} />
            ))}
          </div>
          <Button variant="ghost" size="sm" className="gap-1">
            View Journey
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Journey Detail Component
function JourneyDetail({ 
  journey, 
  onBack,
  onViewTouchpoint 
}: { 
  journey: any; 
  onBack: () => void;
  onViewTouchpoint: (step: any) => void;
}) {
  const getIcon = () => {
    const name = journey.name.toLowerCase();
    if (name.includes('welcome')) return Sparkles;
    if (name.includes('re-engage')) return TrendingUp;
    if (name.includes('upgrade')) return Zap;
    if (name.includes('milestone')) return Heart;
    return Workflow;
  };
  
  const getColor = () => {
    const name = journey.name.toLowerCase();
    if (name.includes('welcome')) return 'bg-emerald-500';
    if (name.includes('re-engage')) return 'bg-blue-500';
    if (name.includes('upgrade')) return 'bg-purple-500';
    if (name.includes('milestone')) return 'bg-pink-500';
    return 'bg-primary';
  };

  const Icon = getIcon();
  const color = getColor();

  const stepsList = journey.steps ? Object.values(journey.steps) : [];
  const channelCounts = stepsList.reduce((acc: Record<string, number>, step: any) => {
    const ch = step.channel || 'email';
    acc[ch] = (acc[ch] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="mb-4">
        ← Back to Journeys
      </Button>

      <Card className="overflow-hidden">
        <div className={`h-3 ${color}`} />
        <CardContent className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className={`h-14 w-14 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
              <Icon className="h-7 w-7 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-2xl font-bold">{journey.displayName || journey.name}</h2>
                <Badge variant={journey.status === 'active' ? 'default' : 'secondary'}>
                  {journey.status === 'active' ? 'Active' : 'Draft'}
                </Badge>
              </div>
              <p className="text-muted-foreground">{journey.description}</p>
              
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(channelCounts).map(([channel, count]) => (
                  <Badge key={channel} variant="outline" className={getChannelColor(channel)}>
                    {channel === 'in_app_message' ? 'In-App' : channel}: {count as number}
                  </Badge>
                ))}
              </div>
              
              {journey.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {journey.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              )}

              {(journey.first_entry || journey.last_entry) && (
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  {journey.first_entry && (
                    <span>First entry: {new Date(journey.first_entry).toLocaleDateString()}</span>
                  )}
                  {journey.last_entry && (
                    <span>Last entry: {new Date(journey.last_entry).toLocaleDateString()}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Canvas Flowchart */}
          {journey.steps && Object.keys(journey.steps).length > 0 && (
            <div className="mt-8">
              <CanvasFlowChart 
                canvas={{
                  id: journey.id,
                  name: journey.name,
                  description: journey.description,
                  enabled: journey.enabled,
                  draft: journey.draft,
                  variants: journey.variants || [],
                  steps: journey.steps,
                  tags: journey.tags,
                  first_entry: journey.first_entry,
                  last_entry: journey.last_entry,
                }}
                onViewStep={(step) => onViewTouchpoint({
                  ...step,
                  delay: step.delay_formatted,
                })}
              />
            </div>
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
    case 'email':
      return <Mail className={`${iconSize} text-blue-500`} />;
    case 'push':
    case 'ios-push':
    case 'android-push':
    case 'web-push':
      return <Bell className={`${iconSize} text-orange-500`} />;
    case 'in-app':
    case 'in-app-message':
      return <Smartphone className={`${iconSize} text-purple-500`} />;
    default:
      return <Mail className={`${iconSize} text-muted-foreground`} />;
  }
}
