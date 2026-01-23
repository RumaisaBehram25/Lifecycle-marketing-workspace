import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLinktreeClient, useLinktreePlatforms } from '@/hooks/useLinktreeClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  FolderOpen, 
  Mail, 
  Smartphone, 
  Bell, 
  ArrowRight, 
  Eye,
  Users,
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
import { parseCampaignTaxonomy, getChannelColor, getTypeColor, ParsedCampaign } from '@/lib/campaign-taxonomy';

// Type definitions for Braze data
interface BrazeCanvas {
  id: string;
  name: string;
  description?: string;
  draft?: boolean;
  schedule_type?: string;
  first_entry?: string;
  last_entry?: string;
  tags?: string[];
  archived?: boolean;
}

interface BrazeCampaign {
  id: string;
  name: string;
  description?: string;
  draft?: boolean;
  schedule_type?: string;
  channels?: string[];
  first_sent?: string;
  last_sent?: string;
  tags?: string[];
  archived?: boolean;
  subject?: string;
  preheader?: string;
  html_preview?: string;
}

interface BrazeTemplate {
  email_template_id: string;
  template_name: string;
  description?: string;
  subject?: string;
  preheader?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  html_preview?: string;
}

// Enriched campaign with parsed taxonomy
interface EnrichedCampaign {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  channels: string[];
  status: string;
  subject: string;
  preheader: string;
  tags: string[];
  first_sent?: string;
  last_sent?: string;
  html_preview?: string;
  taxonomy: ParsedCampaign;
  // Push/In-app specific fields
  push_title?: string;
  push_body?: string;
  inapp_title?: string;
  inapp_body?: string;
  inapp_cta?: string;
}

interface BrazeSchemaCache {
  canvases?: BrazeCanvas[];
  campaigns?: BrazeCampaign[];
  templates?: BrazeTemplate[];
  segments?: Array<{ id: string; name: string; description?: string; tags?: string[] }>;
  last_sync?: string;
}

// Fallback mock data when no Braze data is available
const MOCK_JOURNEYS = [
  {
    id: 'welcome',
    name: 'Welcome Series',
    displayName: 'Welcome Series',
    description: 'Onboard new users and drive first actions',
    status: 'live' as 'live' | 'draft',
    tags: ['onboarding', 'new-users'],
    channels: ['email', 'push'],
    taxonomy: { type: 'Lifecycle' as const, channel: 'email', displayName: 'Welcome Series', dateString: '' },
    steps: [
      { name: 'Entry Trigger', delay: '0h', channel: 'email', type: 'trigger' },
      { name: 'Welcome Email', delay: '0h', channel: 'email', type: 'message' },
      { name: 'Push Reminder', delay: '24h', channel: 'push', type: 'message' },
      { name: 'Feature Intro', delay: '48h', channel: 'email', type: 'message' },
      { name: 'Pro Upgrade Nudge', delay: '72h', channel: 'push', type: 'message' },
    ],
  },
  {
    id: 're-engagement',
    name: 'Re-engagement',
    displayName: 'Re-engagement',
    description: 'Win back inactive creators',
    status: 'live' as 'live' | 'draft',
    tags: ['retention', 'winback'],
    channels: ['email', 'push', 'in_app_message'],
    taxonomy: { type: 'Lifecycle' as const, channel: 'email', displayName: 'Re-engagement', dateString: '' },
    steps: [
      { name: 'Entry Trigger', delay: '0h', channel: 'email', type: 'trigger' },
      { name: 'We Miss You Email', delay: '0h', channel: 'email', type: 'message' },
      { name: 'In-App Banner', delay: '3d', channel: 'in_app_message', type: 'message' },
      { name: "What's New Email", delay: '7d', channel: 'email', type: 'message' },
      { name: 'Last Chance Push', delay: '14d', channel: 'push', type: 'message' },
    ],
  },
];

const MOCK_CAMPAIGNS = [
  {
    id: '1',
    name: 'Welcome to Linktree! 🌳',
    channels: ['email'],
    status: 'live' as const,
    subject: "Welcome to Linktree – let's get you set up!",
    preheader: 'Your link in bio is ready. Here\'s how to make it yours.',
    tags: ['welcome', 'onboarding'],
    last_sent: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  },
  {
    id: '2',
    name: 'We Miss You! 💚',
    channels: ['email'],
    status: 'live' as const,
    subject: 'Your Linktree misses you',
    preheader: "Come back and see what's new – we've been busy!",
    tags: ['re-engagement'],
    last_sent: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
  },
  {
    id: '3',
    name: 'New Feature Alert 🚀',
    channels: ['push'],
    status: 'live' as const,
    subject: '',
    preheader: '',
    push_title: 'New: QR Codes are here!',
    push_body: 'Generate custom QR codes for your Linktree. Try it now!',
    tags: ['feature', 'announcement'],
    last_sent: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
  },
  {
    id: '4',
    name: 'Pro Upgrade Prompt',
    channels: ['in_app_message'],
    status: 'live' as const,
    subject: '',
    preheader: '',
    inapp_title: 'Unlock Pro Features',
    inapp_body: 'Get advanced analytics, custom themes, and priority support.',
    inapp_cta: 'Upgrade to Pro',
    tags: ['upsell', 'monetization'],
    last_sent: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  },
  {
    id: '5',
    name: 'Multi-channel Welcome',
    channels: ['email', 'push', 'in_app_message'],
    status: 'live' as const,
    subject: 'Welcome aboard! 🎉',
    preheader: 'Your journey starts here',
    push_title: 'Welcome to Linktree!',
    push_body: 'Tap to complete your profile setup',
    inapp_title: 'Complete Your Profile',
    inapp_body: 'Add your links, customize your theme, and share with the world.',
    inapp_cta: 'Get Started',
    tags: ['welcome', 'onboarding'],
    last_sent: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
  },
];

export default function Creative() {
  const { data: client } = useLinktreeClient();
  const { data: platforms, refetch: refetchPlatforms } = useLinktreePlatforms();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState('lifecycle');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('All');
  const [channelFilter, setChannelFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<string>('live');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [lastSentFilter, setLastSentFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedJourney, setSelectedJourney] = useState<any>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<EnrichedCampaign | null>(null);
  const [selectedTouchpoint, setSelectedTouchpoint] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  // Get Braze platform data
  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const brazeData = brazePlatform?.schema_cache as BrazeSchemaCache | undefined;
  const hasBrazeData = !!brazeData?.last_sync;

  // Transform Braze canvases to journey format with taxonomy parsing
  // Include draft canvases for status filtering
  const journeys = useMemo(() => {
    if (!brazeData?.canvases?.length) return MOCK_JOURNEYS;
    
    return brazeData.canvases
      .filter(canvas => !canvas.archived) // Only filter out archived
      .map(canvas => {
        const taxonomy = parseCampaignTaxonomy(canvas.name);
        // Parse channels from taxonomy or infer from name
        const inferredChannels: string[] = [];
        const nameLower = canvas.name.toLowerCase();
        if (nameLower.includes('email') || taxonomy.channel === 'Email') inferredChannels.push('email');
        if (nameLower.includes('push')) inferredChannels.push('push');
        if (nameLower.includes('sms')) inferredChannels.push('sms');
        if (nameLower.includes('in-app') || nameLower.includes('in_app')) inferredChannels.push('in_app_message');
        // Default to email if nothing found
        if (inferredChannels.length === 0) inferredChannels.push('email');
        
        return {
          id: canvas.id,
          name: canvas.name,
          displayName: taxonomy.displayName,
          description: canvas.description || 'Braze Canvas journey',
          status: canvas.draft ? 'draft' : 'live' as 'draft' | 'live',
          tags: canvas.tags || [],
          channels: inferredChannels,
          first_entry: canvas.first_entry,
          last_entry: canvas.last_entry,
          schedule_type: canvas.schedule_type,
          taxonomy,
          // Multi-touch steps - in real use would come from canvas details API
          steps: [
            { name: 'Entry Trigger', delay: '0h', channel: inferredChannels[0] || 'email', type: 'trigger' },
            { name: 'Primary Message', delay: '0h', channel: inferredChannels[0] || 'email', type: 'message' },
            ...(inferredChannels.length > 1 ? [{ name: 'Secondary Touch', delay: '24h', channel: inferredChannels[1], type: 'message' }] : []),
            { name: 'Follow-up', delay: '48h', channel: inferredChannels[0] || 'email', type: 'message' },
            { name: 'Final Nudge', delay: '72h', channel: inferredChannels.includes('push') ? 'push' : 'email', type: 'message' },
          ],
        };
      });
  }, [brazeData?.canvases]);

  // Transform Braze campaigns with taxonomy parsing - filter out archived
  const campaigns = useMemo((): EnrichedCampaign[] => {
    if (!brazeData?.campaigns?.length) {
      return MOCK_CAMPAIGNS.map(c => ({
        ...c,
        displayName: c.name,
        description: '',
        taxonomy: parseCampaignTaxonomy(c.name),
        push_title: (c as any).push_title,
        push_body: (c as any).push_body,
        inapp_title: (c as any).inapp_title,
        inapp_body: (c as any).inapp_body,
        inapp_cta: (c as any).inapp_cta,
      }));
    }
    
    // Combine campaigns with template info
    const templateMap = new Map(
      (brazeData.templates || []).map(t => [t.template_name, t])
    );

    return brazeData.campaigns
      .filter(campaign => !campaign.archived) // Exclude archived campaigns
      .map(campaign => {
        const taxonomy = parseCampaignTaxonomy(campaign.name);
        
        // Try to find matching template for subject/preheader if not in campaign
        const matchingTemplate = Array.from(templateMap.values()).find(t => 
          campaign.name.toLowerCase().includes(t.template_name.toLowerCase()) ||
          t.template_name.toLowerCase().includes(campaign.name.toLowerCase())
        );

        return {
          id: campaign.id,
          name: campaign.name,
          displayName: taxonomy.displayName,
          description: campaign.description,
          channels: taxonomy.channel ? [taxonomy.channel] : (campaign.channels || ['email']),
          status: campaign.draft ? 'draft' : 'live',
          subject: campaign.subject || matchingTemplate?.subject || '',
          preheader: campaign.preheader || matchingTemplate?.preheader || '',
          tags: campaign.tags || [],
          first_sent: campaign.first_sent,
          last_sent: campaign.last_sent,
          html_preview: campaign.html_preview || matchingTemplate?.html_preview,
          taxonomy,
        };
      });
  }, [brazeData?.campaigns, brazeData?.templates]);

  // Get unique tags for filter
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    journeys.forEach(j => j.tags?.forEach((t: string) => tags.add(t)));
    campaigns.forEach(c => c.tags?.forEach((t: string) => tags.add(t)));
    return ['All', ...Array.from(tags)];
  }, [journeys, campaigns]);

  // Get unique types from taxonomy for filter
  const allTypes = useMemo(() => {
    const types = new Set<string>();
    campaigns.forEach(c => {
      if (c.taxonomy?.type && c.taxonomy.type !== 'unknown') {
        types.add(c.taxonomy.type);
      }
    });
    journeys.forEach(j => {
      if (j.taxonomy?.type && j.taxonomy.type !== 'unknown') {
        types.add(j.taxonomy.type);
      }
    });
    return ['All', ...Array.from(types)];
  }, [campaigns, journeys]);

  // Filter journeys (canvases only)
  const filteredJourneys = useMemo(() => {
    return journeys.filter(journey => {
      const matchesSearch = journey.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           journey.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = tagFilter === 'All' || journey.tags?.includes(tagFilter);
      const matchesType = typeFilter === 'All' || journey.taxonomy?.type === typeFilter;
      const matchesChannel = channelFilter === 'All' || journey.channels?.includes(channelFilter);
      const matchesStatus = statusFilter === 'All' || journey.status === statusFilter;
      return matchesSearch && matchesTag && matchesType && matchesChannel && matchesStatus;
    });
  }, [journeys, searchQuery, tagFilter, typeFilter, channelFilter, statusFilter]);

  // Filter campaigns
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(campaign => {
      const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           campaign.subject?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = tagFilter === 'All' || campaign.tags?.includes(tagFilter);
      
      // Channel filter with multi support
      let matchesChannel = true;
      if (channelFilter !== 'All') {
        if (channelFilter === 'multi') {
          matchesChannel = campaign.channels?.length > 1;
        } else {
          matchesChannel = campaign.channels?.includes(channelFilter) || false;
        }
      }
      
      const matchesType = typeFilter === 'All' || campaign.taxonomy?.type === typeFilter;
      const matchesStatus = statusFilter === 'All' || campaign.status === statusFilter;
      
      // Last sent filter - fixed to work properly
      let matchesLastSent = true;
      if (lastSentFilter !== 'All') {
        if (!campaign.last_sent) {
          matchesLastSent = false;
        } else {
          const lastSentDate = new Date(campaign.last_sent);
          const now = new Date();
          const daysDiff = Math.floor((now.getTime() - lastSentDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (lastSentFilter === '7days') matchesLastSent = daysDiff <= 7;
          else if (lastSentFilter === '30days') matchesLastSent = daysDiff <= 30;
          else if (lastSentFilter === '90days') matchesLastSent = daysDiff <= 90;
        }
      }
      
      return matchesSearch && matchesTag && matchesChannel && matchesType && matchesStatus && matchesLastSent;
    });
  }, [campaigns, searchQuery, tagFilter, channelFilter, typeFilter, statusFilter, lastSentFilter]);

  const handleSyncBraze = async () => {
    if (!client?.id || !brazePlatform?.id) {
      toast({ title: 'Connect Braze first', description: 'Go to Platforms to connect Braze', variant: 'destructive' });
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
          title="Creative"
          description="Browse live lifecycle journeys and campaign emails"
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
                    ? 'Click "Sync Braze" to pull your live canvases and campaigns'
                    : 'Connect Braze on the Platforms page to see your real data'
                  }
                </p>
              </div>
              {!brazePlatform && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/platforms">Connect Braze</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <TabsList>
              <TabsTrigger value="lifecycle" className="gap-2">
                <Workflow className="h-4 w-4" />
                Lifecycle Journeys ({filteredJourneys.length})
              </TabsTrigger>
              <TabsTrigger value="campaigns" className="gap-2">
                <Mail className="h-4 w-4" />
                Campaigns ({filteredCampaigns.length})
              </TabsTrigger>
            </TabsList>

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

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
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
                <SelectItem value="in_app_message">In-App</SelectItem>
                <SelectItem value="multi">Multi-channel</SelectItem>
              </SelectContent>
            </Select>

            {allTypes.length > 1 && (
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {allTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Status</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            
            {allTags.length > 1 && (
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  {allTags.map(tag => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Lifecycle Journeys Tab */}
          <TabsContent value="lifecycle" className="mt-0">
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
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="mt-0">
            {/* Last Sent Filter for Campaigns */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-muted-foreground">Last scheduled:</span>
              <Select value={lastSentFilter} onValueChange={setLastSentFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Any time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Any time</SelectItem>
                  <SelectItem value="7days">Last 7 days</SelectItem>
                  <SelectItem value="30days">Last 30 days</SelectItem>
                  <SelectItem value="90days">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className={viewMode === 'grid' 
              ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' 
              : 'space-y-3'
            }>
              {filteredCampaigns.length === 0 ? (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No campaigns found</p>
                </div>
              ) : (
                filteredCampaigns.map(campaign => (
                  <CampaignCard 
                    key={campaign.id} 
                    campaign={campaign} 
                    viewMode={viewMode}
                    onClick={() => setSelectedCampaign(campaign)}
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
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
                  {/* Push Notification Preview */}
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
                  {/* In-App Message Preview */}
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

      {/* Campaign Detail Modal */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCampaign?.channels?.length === 1 ? (
                <ChannelIcon channel={selectedCampaign.channels[0]} size="lg" />
              ) : (
                <Workflow className="h-5 w-5" />
              )}
              {selectedCampaign?.displayName || selectedCampaign?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedCampaign?.channels?.length > 1 
                ? 'Multi-channel campaign details' 
                : `${selectedCampaign?.channels?.[0] === 'email' ? 'Email' : 
                    selectedCampaign?.channels?.[0] === 'push' ? 'Push notification' : 
                    selectedCampaign?.channels?.[0] === 'in_app_message' ? 'In-app message' : 
                    'Campaign'} details`}
            </DialogDescription>
          </DialogHeader>
          
          {selectedCampaign && (
            <div className="space-y-6 mt-4">
              {/* Taxonomy Tags */}
              <div className="flex flex-wrap gap-2">
                {selectedCampaign.channels?.map((ch: string) => (
                  <Badge key={ch} variant="outline" className={getChannelColor(ch)}>
                    {ch === 'in_app_message' ? 'In-App' : ch}
                  </Badge>
                ))}
                {selectedCampaign.channels?.length > 1 && (
                  <Badge variant="secondary">Multi-channel</Badge>
                )}
                <Badge variant={selectedCampaign.status === 'live' ? 'default' : 'secondary'}>
                  {selectedCampaign.status}
                </Badge>
              </div>

              {/* Email Content */}
              {selectedCampaign.channels?.includes('email') && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-500" />
                    Email
                  </h4>
                  <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                    <div className="grid gap-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Subject Line</p>
                        <p className="font-medium">{selectedCampaign.subject || <span className="text-muted-foreground italic">No subject line</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Preheader</p>
                        <p className="text-sm">{selectedCampaign.preheader || <span className="text-muted-foreground italic">No preheader</span>}</p>
                      </div>
                    </div>
                    {selectedCampaign.html_preview && (
                      <div className="mt-3 border rounded-lg overflow-hidden bg-white">
                        <iframe
                          srcDoc={selectedCampaign.html_preview}
                          className="w-full h-[300px]"
                          title="Email Preview"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Push Content */}
              {selectedCampaign.channels?.includes('push') && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Bell className="h-4 w-4 text-orange-500" />
                    Push Notification
                  </h4>
                  <div className="max-w-sm">
                    <div className="bg-card border rounded-2xl p-4 shadow-lg">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-primary-foreground">L</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">Linktree • now</p>
                          <p className="font-semibold text-sm mt-0.5">
                            {selectedCampaign.push_title || selectedCampaign.displayName}
                          </p>
                          {selectedCampaign.push_body && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {selectedCampaign.push_body}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {!selectedCampaign.push_title && !selectedCampaign.push_body && (
                    <p className="text-sm text-muted-foreground">Push content not synced from Braze</p>
                  )}
                </div>
              )}

              {/* In-App Content */}
              {selectedCampaign.channels?.includes('in_app_message') && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-purple-500" />
                    In-App Message
                  </h4>
                  <div className="max-w-sm">
                    <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-2 border-purple-500/30 rounded-2xl p-6 text-center">
                      <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                        <Smartphone className="h-6 w-6 text-purple-500" />
                      </div>
                      <h4 className="font-bold text-lg">
                        {selectedCampaign.inapp_title || selectedCampaign.displayName}
                      </h4>
                      {selectedCampaign.inapp_body && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {selectedCampaign.inapp_body}
                        </p>
                      )}
                      <Button className="mt-4" size="sm">
                        {selectedCampaign.inapp_cta || 'Take Action'}
                      </Button>
                    </div>
                  </div>
                  {!selectedCampaign.inapp_title && !selectedCampaign.inapp_body && (
                    <p className="text-sm text-muted-foreground">In-app content not synced from Braze</p>
                  )}
                </div>
              )}

              {/* Tags */}
              {selectedCampaign.tags?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedCampaign.tags.map((tag: string) => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Dates */}
              {(selectedCampaign.first_sent || selectedCampaign.last_sent) && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  {selectedCampaign.first_sent && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">First Sent</p>
                      <p className="text-sm">{new Date(selectedCampaign.first_sent).toLocaleDateString()}</p>
                    </div>
                  )}
                  {selectedCampaign.last_sent && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Last Sent</p>
                      <p className="text-sm">{new Date(selectedCampaign.last_sent).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Original name for reference */}
              {selectedCampaign.name !== selectedCampaign.displayName && (
                <div className="pt-4 border-t">
                  <p className="text-xs text-muted-foreground">Original name: {selectedCampaign.name}</p>
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
                <Badge variant={journey.status === 'live' ? 'default' : 'secondary'}>
                  {journey.status}
                </Badge>
              </div>
              {/* Taxonomy Tags */}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {journey.taxonomy?.type && journey.taxonomy.type !== 'unknown' && (
                  <Badge variant="outline" className={`text-xs ${getTypeColor(journey.taxonomy.type)}`}>
                    {journey.taxonomy.type}
                  </Badge>
                )}
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
                <span>{journey.steps?.length || 0} touches</span>
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
      {/* Taxonomy Tags Header */}
      <div className="px-4 py-2 bg-muted/30 border-b flex items-center gap-1.5 flex-wrap">
        {journey.taxonomy?.type && journey.taxonomy.type !== 'unknown' && (
          <Badge variant="outline" className={`text-xs bg-background ${getTypeColor(journey.taxonomy.type)}`}>
            {journey.taxonomy.type}
          </Badge>
        )}
        {journey.channels?.map((ch: string) => (
          <Badge key={ch} variant="outline" className={`text-xs bg-background ${getChannelColor(ch)}`}>
            {ch === 'in_app_message' ? 'In-App' : ch}
          </Badge>
        ))}
        <Badge variant={journey.status === 'live' ? 'default' : 'secondary'} className="text-xs ml-auto">
          {journey.status}
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

        {/* Multi-touch indicator */}
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <Workflow className="h-3.5 w-3.5" />
          <span>{journey.steps?.length || 0} touchpoints</span>
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
  const [selectedStep, setSelectedStep] = useState<number | null>(null);

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

  // Count touchpoints by channel
  const channelCounts = journey.steps?.reduce((acc: Record<string, number>, step: any) => {
    const ch = step.channel || 'email';
    acc[ch] = (acc[ch] || 0) + 1;
    return acc;
  }, {}) || {};

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
                <Badge variant={journey.status === 'live' ? 'default' : 'secondary'}>
                  {journey.status}
                </Badge>
              </div>
              <p className="text-muted-foreground">{journey.description}</p>
              
              {/* Channel breakdown */}
              <div className="flex flex-wrap gap-2 mt-3">
                {journey.taxonomy?.type && journey.taxonomy.type !== 'unknown' && (
                  <Badge variant="outline" className={getTypeColor(journey.taxonomy.type)}>
                    {journey.taxonomy.type}
                  </Badge>
                )}
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

          {/* Touchpoints Row */}
          {journey.steps && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Workflow className="h-4 w-4" />
                  Touchpoints ({journey.steps.length})
                </h3>
                <p className="text-xs text-muted-foreground">Click a touchpoint to expand, then view creative</p>
              </div>
              
              {/* Horizontal Touchpoints */}
              <div className="overflow-x-auto pb-4">
                <div className="flex items-center gap-2 min-w-max">
                  {journey.steps.map((step: any, index: number) => {
                    const isSelected = selectedStep === index;
                    const channelBorder = step.channel === 'email' ? 'border-blue-500' :
                                          step.channel === 'push' ? 'border-orange-500' :
                                          step.channel === 'in_app_message' ? 'border-purple-500' :
                                          step.channel === 'sms' ? 'border-green-500' :
                                          'border-primary';
                    const channelBg = step.channel === 'email' ? 'bg-blue-500/10' :
                                      step.channel === 'push' ? 'bg-orange-500/10' :
                                      step.channel === 'in_app_message' ? 'bg-purple-500/10' :
                                      step.channel === 'sms' ? 'bg-green-500/10' :
                                      'bg-primary/10';
                    return (
                      <div key={index} className="flex items-center">
                        <button
                          onClick={() => setSelectedStep(isSelected ? null : index)}
                          className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all min-w-[100px] ${
                            isSelected 
                              ? `${channelBorder} ${channelBg} ring-2 ring-offset-2 ring-primary/20` 
                              : 'border-border hover:border-muted-foreground/50 bg-card'
                          }`}
                        >
                          <div className={`h-10 w-10 rounded-full border-2 ${channelBorder} ${channelBg} flex items-center justify-center mb-2`}>
                            <ChannelIcon channel={step.channel} size="lg" />
                          </div>
                          <span className="text-xs font-medium text-center line-clamp-2">{step.name}</span>
                          <span className="text-[10px] text-muted-foreground mt-1">{step.delay}</span>
                        </button>
                        {index < journey.steps.length - 1 && (
                          <ArrowRight className="h-4 w-4 text-muted-foreground mx-1 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected Touchpoint Details */}
              {selectedStep !== null && journey.steps[selectedStep] && (
                <Card className="mt-4 border-primary/30 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                          journey.steps[selectedStep].channel === 'email' ? 'bg-blue-500/20' :
                          journey.steps[selectedStep].channel === 'push' ? 'bg-orange-500/20' :
                          journey.steps[selectedStep].channel === 'in_app_message' ? 'bg-purple-500/20' :
                          'bg-primary/20'
                        }`}>
                          <ChannelIcon channel={journey.steps[selectedStep].channel} size="lg" />
                        </div>
                        <div>
                          <h4 className="font-semibold">{journey.steps[selectedStep].name}</h4>
                          <p className="text-sm text-muted-foreground capitalize">
                            {journey.steps[selectedStep].channel === 'in_app_message' ? 'In-App Message' : journey.steps[selectedStep].channel}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {journey.steps[selectedStep].type === 'trigger' && (
                          <Badge variant="secondary">Trigger</Badge>
                        )}
                        <Badge variant="outline" className="gap-1">
                          <Calendar className="h-3 w-3" />
                          {journey.steps[selectedStep].delay}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex gap-6 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Step</p>
                          <p className="font-medium">{selectedStep + 1} of {journey.steps.length}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Type</p>
                          <p className="font-medium capitalize">{journey.steps[selectedStep].type || 'Message'}</p>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        onClick={() => onViewTouchpoint(journey.steps[selectedStep])}
                        className="gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        View Creative
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Campaign Card Component
function CampaignCard({ campaign, viewMode, onClick }: { campaign: EnrichedCampaign; viewMode: 'grid' | 'list'; onClick: () => void }) {
  const { taxonomy } = campaign;
  
  if (viewMode === 'list') {
    return (
      <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={onClick}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{campaign.displayName}</h3>
                <Badge variant={campaign.status === 'live' ? 'default' : 'secondary'}>
                  {campaign.status}
                </Badge>
              </div>
              {/* Taxonomy Tags */}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {taxonomy.dateString && (
                  <Badge variant="outline" className="text-xs bg-muted/50">
                    <Calendar className="h-3 w-3 mr-1" />
                    {taxonomy.dateString}
                  </Badge>
                )}
                {taxonomy.type !== 'unknown' && (
                  <Badge variant="outline" className={`text-xs ${getTypeColor(taxonomy.type)}`}>
                    {taxonomy.type}
                  </Badge>
                )}
                {taxonomy.channel && (
                  <Badge variant="outline" className={`text-xs ${getChannelColor(taxonomy.channel)}`}>
                    {taxonomy.channel}
                  </Badge>
                )}
              </div>
              {campaign.subject && (
                <p className="text-sm text-muted-foreground truncate mt-1">{campaign.subject}</p>
              )}
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group hover:border-primary/50 hover:shadow-md transition-all overflow-hidden cursor-pointer" onClick={onClick}>
      {/* Taxonomy Tags Header */}
      <div className="px-4 py-2 bg-muted/30 border-b flex items-center gap-1.5 flex-wrap">
        {taxonomy.dateString && (
          <Badge variant="outline" className="text-xs bg-background">
            <Calendar className="h-3 w-3 mr-1" />
            {taxonomy.dateString}
          </Badge>
        )}
        {taxonomy.type !== 'unknown' && (
          <Badge variant="outline" className={`text-xs ${getTypeColor(taxonomy.type)}`}>
            {taxonomy.type}
          </Badge>
        )}
        {taxonomy.channel && (
          <Badge variant="outline" className={`text-xs ${getChannelColor(taxonomy.channel)}`}>
            {taxonomy.channel}
          </Badge>
        )}
        <Badge variant={campaign.status === 'live' ? 'default' : 'secondary'} className="text-xs ml-auto">
          {campaign.status}
        </Badge>
      </div>

      {/* Email Preview */}
      <div className="bg-muted/50 p-4 border-b">
        <div className="bg-card rounded-lg p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs text-primary-foreground font-bold">L</span>
            </div>
            <span className="text-xs font-medium">Linktree</span>
          </div>
          {campaign.subject ? (
            <>
              <p className="text-sm font-medium line-clamp-1">{campaign.subject}</p>
              {campaign.preheader && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{campaign.preheader}</p>
              )}
            </>
          ) : (
            <p className="text-sm font-medium line-clamp-1">{campaign.displayName}</p>
          )}
        </div>
      </div>

      <CardContent className="p-4">
        <div className="mb-3">
          <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-2">{campaign.displayName}</h3>
          {campaign.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{campaign.description}</p>
          )}
        </div>

        {/* Original tags from Braze */}
        {campaign.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {campaign.tags.slice(0, 3).map((tag: string) => (
              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
            ))}
          </div>
        )}

        {campaign.last_sent && (
          <div className="flex items-center justify-between pt-3 border-t text-xs text-muted-foreground">
            <span>Last sent: {new Date(campaign.last_sent).toLocaleDateString()}</span>
            <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary">
              View Details →
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
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
