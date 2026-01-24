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
  Sparkles,
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
import { parseCampaignTaxonomy, getChannelColor, ParsedCampaign } from '@/lib/campaign-taxonomy';

// Type definitions
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
  push_title?: string;
  push_body?: string;
  inapp_header?: string;
  inapp_body?: string;
  inapp_cta?: string;
}

interface BrazeTemplate {
  email_template_id: string;
  template_name: string;
  description?: string;
  subject?: string;
  preheader?: string;
  tags?: string[];
  html_preview?: string;
}

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
  push_title?: string;
  push_body?: string;
  inapp_title?: string;
  inapp_body?: string;
  inapp_cta?: string;
}

interface BrazeSchemaCache {
  campaigns?: BrazeCampaign[];
  templates?: BrazeTemplate[];
  last_sync?: string;
}

const MOCK_CAMPAIGNS: EnrichedCampaign[] = [
  {
    id: '1',
    name: 'Welcome to Linktree! 🌳',
    displayName: 'Welcome to Linktree! 🌳',
    channels: ['email'],
    status: 'active',
    subject: "Welcome to Linktree – let's get you set up!",
    preheader: 'Your link in bio is ready. Here\'s how to make it yours.',
    tags: ['welcome', 'onboarding'],
    last_sent: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    taxonomy: parseCampaignTaxonomy('Welcome to Linktree! 🌳'),
  },
  {
    id: '2',
    name: 'New Feature Alert 🚀',
    displayName: 'New Feature Alert 🚀',
    channels: ['push'],
    status: 'active',
    subject: '',
    preheader: '',
    push_title: 'New: QR Codes are here!',
    push_body: 'Generate custom QR codes for your Linktree. Try it now!',
    tags: ['feature', 'announcement'],
    last_sent: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    taxonomy: parseCampaignTaxonomy('New Feature Alert 🚀'),
  },
  {
    id: '3',
    name: 'Pro Upgrade Prompt',
    displayName: 'Pro Upgrade Prompt',
    channels: ['in_app_message'],
    status: 'active',
    subject: '',
    preheader: '',
    inapp_title: 'Unlock Pro Features',
    inapp_body: 'Get advanced analytics, custom themes, and priority support.',
    inapp_cta: 'Upgrade to Pro',
    tags: ['upsell', 'monetization'],
    last_sent: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    taxonomy: parseCampaignTaxonomy('Pro Upgrade Prompt'),
  },
];

export default function Campaigns() {
  const { data: client } = useLinktreeClient();
  const { data: platforms, refetch: refetchPlatforms } = useLinktreePlatforms();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('All');
  const [channelFilter, setChannelFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [lastSentFilter, setLastSentFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCampaign, setSelectedCampaign] = useState<EnrichedCampaign | null>(null);
  const [syncing, setSyncing] = useState(false);

  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const brazeData = brazePlatform?.schema_cache as BrazeSchemaCache | undefined;
  const hasBrazeData = !!brazeData?.last_sync;

  // Fetch visibility settings
  const { data: visibilityData } = useQuery({
    queryKey: ['data-visibility', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('data_visibility')
        .select('*')
        .eq('client_id', client.id)
        .eq('item_type', 'campaign');
      if (error) throw error;
      return data as Array<{ item_id: string; is_visible: boolean }>;
    },
    enabled: !!client?.id,
  });

  // Create visibility map
  const visibilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    visibilityData?.forEach(v => map.set(v.item_id, v.is_visible));
    return map;
  }, [visibilityData]);

  // Transform Braze campaigns with taxonomy parsing
  const campaigns = useMemo((): EnrichedCampaign[] => {
    if (!brazeData?.campaigns?.length) {
      return MOCK_CAMPAIGNS;
    }
    
    const templateMap = new Map(
      (brazeData.templates || []).map(t => [t.template_name, t])
    );

    return brazeData.campaigns
      .filter(campaign => !campaign.archived)
      .map(campaign => {
        const taxonomy = parseCampaignTaxonomy(campaign.name);
        
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
          status: campaign.draft ? 'draft' : 'active',
          subject: campaign.subject || matchingTemplate?.subject || '',
          preheader: campaign.preheader || matchingTemplate?.preheader || '',
          tags: campaign.tags || [],
          first_sent: campaign.first_sent,
          last_sent: campaign.last_sent,
          html_preview: campaign.html_preview || matchingTemplate?.html_preview,
          taxonomy,
          push_title: campaign.push_title,
          push_body: campaign.push_body,
          inapp_title: campaign.inapp_header,
          inapp_body: campaign.inapp_body,
          inapp_cta: campaign.inapp_cta,
        };
      });
  }, [brazeData?.campaigns, brazeData?.templates]);

  // Get unique tags for filter
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    campaigns.forEach(c => c.tags?.forEach((t: string) => tags.add(t)));
    return ['All', ...Array.from(tags)];
  }, [campaigns]);

  // Filter campaigns (including visibility)
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(campaign => {
      // Check visibility first - default to visible if not set
      const isVisible = visibilityMap.get(campaign.id) !== false;
      if (!isVisible) return false;
      
      const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           campaign.subject?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = tagFilter === 'All' || campaign.tags?.includes(tagFilter);
      
      let matchesChannel = true;
      if (channelFilter !== 'All') {
        if (channelFilter === 'multi') {
          matchesChannel = campaign.channels?.length > 1;
        } else {
          matchesChannel = campaign.channels?.includes(channelFilter) || false;
        }
      }
      
      const matchesStatus = statusFilter === 'All' || campaign.status === statusFilter;
      
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
      
      return matchesSearch && matchesTag && matchesChannel && matchesStatus && matchesLastSent;
    });
  }, [campaigns, searchQuery, tagFilter, channelFilter, statusFilter, lastSentFilter, visibilityMap]);

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
          title="Campaigns"
          description="Browse single-send campaigns and one-off communications"
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
                    ? 'Click "Sync Braze" to pull your live campaigns'
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
                placeholder="Search campaigns..."
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
            
            <Select value="active" onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>

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

        {/* Campaigns Grid/List */}
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
      </div>

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
              {/* Channel badges */}
              <div className="flex flex-wrap gap-2">
                {selectedCampaign.channels?.map((ch: string) => (
                  <Badge key={ch} variant="outline" className={getChannelColor(ch)}>
                    {ch === 'in_app_message' ? 'In-App' : ch}
                  </Badge>
                ))}
                {selectedCampaign.channels?.length > 1 && (
                  <Badge variant="secondary">Multi-channel</Badge>
                )}
                <Badge variant={selectedCampaign.status === 'active' ? 'default' : 'secondary'}>
                  {selectedCampaign.status === 'active' ? 'Active' : 'Draft'}
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// Campaign Card Component - simplified with just date badge
function CampaignCard({ campaign, viewMode, onClick }: { campaign: EnrichedCampaign; viewMode: 'grid' | 'list'; onClick: () => void }) {
  const { taxonomy } = campaign;
  
  if (viewMode === 'list') {
    return (
      <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={onClick}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ChannelIcon channel={campaign.channels?.[0] || 'email'} size="lg" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{campaign.displayName}</h3>
              </div>
              {/* Date only */}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {taxonomy.dateString && (
                  <Badge variant="outline" className="text-xs bg-muted/50">
                    <Calendar className="h-3 w-3 mr-1" />
                    {taxonomy.dateString}
                  </Badge>
                )}
                {campaign.channels?.map((ch: string) => (
                  <Badge key={ch} variant="outline" className={`text-xs ${getChannelColor(ch)}`}>
                    {ch === 'in_app_message' ? 'In-App' : ch}
                  </Badge>
                ))}
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
      {/* Header with date only */}
      <div className="px-4 py-2 bg-muted/30 border-b flex items-center gap-1.5 flex-wrap">
        {taxonomy.dateString && (
          <Badge variant="outline" className="text-xs bg-background">
            <Calendar className="h-3 w-3 mr-1" />
            {taxonomy.dateString}
          </Badge>
        )}
        {campaign.channels?.map((ch: string) => (
          <Badge key={ch} variant="outline" className={`text-xs bg-background ${getChannelColor(ch)}`}>
            {ch === 'in_app_message' ? 'In-App' : ch}
          </Badge>
        ))}
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
          ) : campaign.push_title ? (
            <>
              <p className="text-sm font-medium line-clamp-1">{campaign.push_title}</p>
              {campaign.push_body && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{campaign.push_body}</p>
              )}
            </>
          ) : campaign.inapp_title ? (
            <>
              <p className="text-sm font-medium line-clamp-1">{campaign.inapp_title}</p>
              {campaign.inapp_body && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{campaign.inapp_body}</p>
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
