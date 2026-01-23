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
    description: 'Onboard new users and drive first actions',
    status: 'live' as const,
    tags: ['onboarding', 'new-users'],
    channels: ['email', 'push'],
    steps: [
      { name: 'Welcome Email', delay: '0h', channel: 'email' },
      { name: 'Feature Intro', delay: '24h', channel: 'email' },
      { name: 'Pro Upgrade Nudge', delay: '72h', channel: 'push' },
      { name: 'Success Tips', delay: '7d', channel: 'email' },
    ],
  },
  {
    id: 're-engagement',
    name: 'Re-engagement',
    description: 'Win back inactive creators',
    status: 'live' as const,
    tags: ['retention', 'winback'],
    channels: ['email', 'push'],
    steps: [
      { name: 'We Miss You', delay: '30d', channel: 'email' },
      { name: "What's New", delay: '37d', channel: 'email' },
      { name: 'Last Chance Offer', delay: '45d', channel: 'push' },
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
  },
  {
    id: '2',
    name: 'We Miss You! 💚',
    channels: ['email'],
    status: 'live' as const,
    subject: 'Your Linktree misses you',
    preheader: "Come back and see what's new – we've been busy!",
    tags: ['re-engagement'],
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedJourney, setSelectedJourney] = useState<any>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<EnrichedCampaign | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Get Braze platform data
  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const brazeData = brazePlatform?.schema_cache as BrazeSchemaCache | undefined;
  const hasBrazeData = !!brazeData?.last_sync;

  // Transform Braze canvases to journey format with taxonomy parsing
  // Filter out archived and stopped canvases by default
  const journeys = useMemo(() => {
    if (!brazeData?.canvases?.length) return MOCK_JOURNEYS;
    
    return brazeData.canvases
      .filter(canvas => !canvas.archived && !canvas.draft) // Only show live, non-archived
      .map(canvas => {
        const taxonomy = parseCampaignTaxonomy(canvas.name);
        return {
          id: canvas.id,
          name: canvas.name,
          displayName: taxonomy.displayName,
          description: canvas.description || 'Braze Canvas journey',
          status: 'live' as const,
          tags: canvas.tags || [],
          channels: taxonomy.channel ? [taxonomy.channel] : ['email', 'push'],
          first_entry: canvas.first_entry,
          last_entry: canvas.last_entry,
          schedule_type: canvas.schedule_type,
          taxonomy,
          // Placeholder steps for visual - in real use would come from canvas details API
          steps: [
            { name: 'Entry', delay: '0h', channel: taxonomy.channel || 'email' },
            { name: 'Follow-up', delay: '24h', channel: taxonomy.channel || 'email' },
            { name: 'Final', delay: '72h', channel: taxonomy.channel || 'push' },
          ],
        };
      });
  }, [brazeData?.canvases]);

  // Transform Braze campaigns with taxonomy parsing
  const campaigns = useMemo((): EnrichedCampaign[] => {
    if (!brazeData?.campaigns?.length) {
      return MOCK_CAMPAIGNS.map(c => ({
        ...c,
        displayName: c.name,
        taxonomy: parseCampaignTaxonomy(c.name),
      }));
    }
    
    // Combine campaigns with template info
    const templateMap = new Map(
      (brazeData.templates || []).map(t => [t.template_name, t])
    );

    return brazeData.campaigns.map(campaign => {
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

  // Filter journeys
  const filteredJourneys = useMemo(() => {
    return journeys.filter(journey => {
      const matchesSearch = journey.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           journey.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = tagFilter === 'All' || journey.tags?.includes(tagFilter);
      return matchesSearch && matchesTag;
    });
  }, [journeys, searchQuery, tagFilter]);

  // Filter campaigns
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(campaign => {
      const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           campaign.subject?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = tagFilter === 'All' || campaign.tags?.includes(tagFilter);
      const matchesChannel = channelFilter === 'All' || campaign.channels?.includes(channelFilter);
      return matchesSearch && matchesTag && matchesChannel;
    });
  }, [campaigns, searchQuery, tagFilter, channelFilter]);

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
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by tag" />
              </SelectTrigger>
              <SelectContent>
                {allTags.map(tag => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeTab === 'campaigns' && (
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-[140px]">
                  <Bell className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Channels</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="push">Push</SelectItem>
                  <SelectItem value="in_app_message">In-App</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Lifecycle Journeys Tab */}
          <TabsContent value="lifecycle" className="mt-0">
            {selectedJourney ? (
              <JourneyDetail 
                journey={selectedJourney} 
                campaigns={campaigns}
                onBack={() => setSelectedJourney(null)} 
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

      {/* Campaign Detail Modal */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {selectedCampaign?.displayName || selectedCampaign?.name}
            </DialogTitle>
            <DialogDescription>
              Campaign details and email preview
            </DialogDescription>
          </DialogHeader>
          
          {selectedCampaign && (
            <div className="space-y-6 mt-4">
              {/* Taxonomy Tags */}
              {selectedCampaign.taxonomy && (
                <div className="flex flex-wrap gap-2">
                  {selectedCampaign.taxonomy.dateString && (
                    <Badge variant="outline" className="bg-muted/50">
                      <Calendar className="h-3 w-3 mr-1" />
                      {selectedCampaign.taxonomy.dateString}
                    </Badge>
                  )}
                  {selectedCampaign.taxonomy.type !== 'unknown' && (
                    <Badge variant="outline" className={getTypeColor(selectedCampaign.taxonomy.type)}>
                      {selectedCampaign.taxonomy.type}
                    </Badge>
                  )}
                  {selectedCampaign.taxonomy.channel && (
                    <Badge variant="outline" className={getChannelColor(selectedCampaign.taxonomy.channel)}>
                      {selectedCampaign.taxonomy.channel}
                    </Badge>
                  )}
                  <Badge variant={selectedCampaign.status === 'live' ? 'default' : 'secondary'}>
                    {selectedCampaign.status}
                  </Badge>
                </div>
              )}

              {/* Subject & Preheader - Compact */}
              <div className="grid grid-cols-1 gap-2 p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Subject Line</p>
                  <p className="font-medium">{selectedCampaign.subject || <span className="text-muted-foreground italic">No subject line</span>}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Preheader</p>
                  <p className="text-sm">{selectedCampaign.preheader || <span className="text-muted-foreground italic">No preheader</span>}</p>
                </div>
              </div>

              {/* HTML Preview - Full height */}
              {selectedCampaign.html_preview ? (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Email Creative</p>
                  <div className="border rounded-lg overflow-hidden bg-white">
                    <iframe
                      srcDoc={selectedCampaign.html_preview}
                      className="w-full h-[600px]"
                      title="Email Preview"
                      sandbox="allow-same-origin allow-scripts"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 bg-muted/20 rounded-lg border border-dashed">
                  <Mail className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Email preview not available</p>
                  <p className="text-xs text-muted-foreground mt-1">Sync again to fetch email content</p>
                </div>
              )}

              {/* Channels & Tags */}
              <div className="grid grid-cols-2 gap-4">
                {selectedCampaign.channels?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Channels</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedCampaign.channels.map((ch: string) => (
                        <Badge key={ch} variant="secondary">{ch}</Badge>
                      ))}
                    </div>
                  </div>
                )}
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
              </div>

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
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{journey.name}</h3>
                <Badge variant={journey.status === 'live' ? 'default' : 'secondary'}>
                  {journey.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-1">{journey.description}</p>
            </div>
            <div className="flex items-center gap-2">
              {journey.tags?.slice(0, 2).map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group hover:border-primary/50 hover:shadow-md transition-all cursor-pointer overflow-hidden" onClick={onClick}>
      <div className={`h-2 ${color}`} />
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-1">{journey.name}</h3>
              <Badge variant={journey.status === 'live' ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                {journey.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{journey.description}</p>
          </div>
        </div>

        {journey.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {journey.tags.slice(0, 3).map((tag: string) => (
              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t">
          <div className="flex items-center gap-2">
            {journey.channels?.map((channel: string) => (
              <ChannelIcon key={channel} channel={channel} />
            ))}
          </div>
          <Button variant="ghost" size="sm" className="gap-1">
            View
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Journey Detail Component
function JourneyDetail({ journey, campaigns, onBack }: { journey: any; campaigns: any[]; onBack: () => void }) {
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

  // Find campaigns that might be related (by tag overlap)
  const relatedCampaigns = campaigns.filter(c => 
    c.tags?.some((t: string) => journey.tags?.includes(t))
  );

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
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold">{journey.name}</h2>
                <Badge variant={journey.status === 'live' ? 'default' : 'secondary'}>
                  {journey.status}
                </Badge>
              </div>
              <p className="text-muted-foreground">{journey.description}</p>
              
              {journey.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {journey.tags.map((tag: string) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
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

          {/* Mock Journey Flow for non-Braze data */}
          {journey.steps && (
            <div className="mt-8">
              <h3 className="font-semibold mb-4">Journey Flow</h3>
              <div className="relative">
                <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-border" />
                
                <div className="space-y-4">
                  {journey.steps.map((step: any, index: number) => (
                    <div key={index} className="flex items-center gap-4 relative">
                      <div className="h-12 w-12 rounded-full bg-card border-2 border-primary flex items-center justify-center z-10 flex-shrink-0">
                        <ChannelIcon channel={step.channel} size="lg" />
                      </div>
                      <Card className="flex-1">
                        <CardContent className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-medium">{step.name}</p>
                            <p className="text-sm text-muted-foreground">{step.channel}</p>
                          </div>
                          <Badge variant="outline" className="gap-1">
                            <Calendar className="h-3 w-3" />
                            {step.delay}
                          </Badge>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Related Campaigns */}
      {relatedCampaigns.length > 0 && (
        <div>
          <h3 className="font-semibold mb-4">Related Campaigns</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {relatedCampaigns.map(campaign => (
              <CampaignCard key={campaign.id} campaign={campaign} viewMode="grid" onClick={() => {}} />
            ))}
          </div>
        </div>
      )}
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
