import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
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

// Normalized content structure from Braze sync
interface NormalizedContent {
  title?: string;
  subject?: string;
  preheader?: string;
  body_text?: string;
  body_html?: string;
  image_url?: string;
  deep_link?: string;
  buttons?: Array<{ text: string; action?: string; url?: string }>;
  extras?: Record<string, unknown>;
}

interface NormalizedVariant {
  variant_id: string;
  name: string;
  platforms: string[];
  content: NormalizedContent;
  raw: Record<string, unknown>;
}

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
  // Normalized structure
  campaign_type?: 'email' | 'push' | 'inapp' | 'sms' | 'webhook' | 'content_card' | 'unknown';
  variants?: NormalizedVariant[];
  warnings?: string[];
  // Legacy flattened fields
  subject?: string;
  preheader?: string;
  html_preview?: string;
  push_title?: string;
  push_body?: string;
  push_deep_link?: string;
  push_extras?: Record<string, unknown>;
  inapp_header?: string;
  inapp_body?: string;
  inapp_cta?: string;
  inapp_image_url?: string;
  inapp_buttons?: Array<{ text: string; action?: string; url?: string }>;
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
  campaignType: 'email' | 'push' | 'inapp' | 'sms' | 'webhook' | 'content_card' | 'unknown';
  status: string;
  subject: string;
  preheader: string;
  tags: string[];
  first_sent?: string;
  last_sent?: string;
  html_preview?: string;
  taxonomy: ParsedCampaign;
  // Enhanced push fields
  push_title?: string;
  push_body?: string;
  push_deep_link?: string;
  push_extras?: Record<string, unknown>;
  // Enhanced in-app fields
  inapp_title?: string;
  inapp_body?: string;
  inapp_cta?: string;
  inapp_image_url?: string;
  inapp_buttons?: Array<{ text: string; action?: string; url?: string }>;
  // Normalized variants
  variants?: NormalizedVariant[];
  warnings?: string[];
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
    campaignType: 'email',
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
    campaignType: 'push',
    status: 'active',
    subject: '',
    preheader: '',
    push_title: 'New: QR Codes are here!',
    push_body: 'Generate custom QR codes for your Linktree. Try it now!',
    push_deep_link: 'linktree://features/qr',
    tags: ['feature', 'announcement'],
    last_sent: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    taxonomy: parseCampaignTaxonomy('New Feature Alert 🚀'),
  },
  {
    id: '3',
    name: 'Pro Upgrade Prompt',
    displayName: 'Pro Upgrade Prompt',
    channels: ['in_app_message'],
    campaignType: 'inapp',
    status: 'active',
    subject: '',
    preheader: '',
    inapp_title: 'Unlock Pro Features',
    inapp_body: 'Get advanced analytics, custom themes, and priority support.',
    inapp_cta: 'Upgrade to Pro',
    inapp_image_url: 'https://example.com/pro-banner.png',
    inapp_buttons: [{ text: 'Upgrade to Pro', action: 'deep_link', url: 'linktree://upgrade' }],
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
  const [launchDateFilter, setLaunchDateFilter] = useState<string>('All');
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

        // Determine campaign type - use normalized type or infer from channels
        let campaignType = campaign.campaign_type || 'unknown';
        if (campaignType === 'unknown' && campaign.channels?.length) {
          const ch = campaign.channels[0].toLowerCase();
          if (ch.includes('email')) campaignType = 'email';
          else if (ch.includes('push')) campaignType = 'push';
          else if (ch.includes('in_app') || ch.includes('inapp')) campaignType = 'inapp';
          else if (ch.includes('sms')) campaignType = 'sms';
        }

        return {
          id: campaign.id,
          name: campaign.name,
          displayName: taxonomy.displayName,
          description: campaign.description,
          channels: taxonomy.channel ? [taxonomy.channel] : (campaign.channels || ['email']),
          campaignType: campaignType as EnrichedCampaign['campaignType'],
          status: campaign.draft ? 'draft' : 'active',
          subject: campaign.subject || matchingTemplate?.subject || '',
          preheader: campaign.preheader || matchingTemplate?.preheader || '',
          tags: campaign.tags || [],
          first_sent: campaign.first_sent,
          last_sent: campaign.last_sent,
          html_preview: campaign.html_preview || matchingTemplate?.html_preview,
          taxonomy,
          // Enhanced push fields
          push_title: campaign.push_title,
          push_body: campaign.push_body,
          push_deep_link: campaign.push_deep_link,
          push_extras: campaign.push_extras,
          // Enhanced in-app fields
          inapp_title: campaign.inapp_header,
          inapp_body: campaign.inapp_body,
          inapp_cta: campaign.inapp_cta,
          inapp_image_url: campaign.inapp_image_url,
          inapp_buttons: campaign.inapp_buttons,
          // Normalized data
          variants: campaign.variants,
          warnings: campaign.warnings,
        };
      });
  }, [brazeData?.campaigns, brazeData?.templates]);

  // Get unique tags for filter
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    campaigns.forEach(c => c.tags?.forEach((t: string) => tags.add(t)));
    return ['All', ...Array.from(tags)];
  }, [campaigns]);

  // Helper to check if a date is from 2024 or earlier
  const isOldItem = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date.getFullYear() <= 2024;
  };

  // Check visibility with date-based default (hide 2024 and older)
  const isItemVisible = (campaignId: string, dateStr?: string) => {
    const explicitSetting = visibilityMap.get(campaignId);
    if (explicitSetting !== undefined) return explicitSetting;
    return !isOldItem(dateStr);
  };

  // Filter campaigns (including visibility with date-based defaults)
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(campaign => {
      // Check visibility with date-based default
      if (!isItemVisible(campaign.id, campaign.first_sent || campaign.last_sent)) return false;
      
      const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           campaign.subject?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = tagFilter === 'All' || campaign.tags?.includes(tagFilter);
      
      let matchesChannel = true;
      if (channelFilter !== 'All') {
        if (channelFilter === 'multi') {
          matchesChannel = campaign.channels?.length > 1;
        } else {
          // Check if any channel matches (handles both exact match and partial match for in_app variants)
          matchesChannel = campaign.channels?.some(ch => {
            const normalizedCh = ch.toLowerCase().replace(/[-_]/g, '');
            const normalizedFilter = channelFilter.toLowerCase().replace(/[-_]/g, '');
            return normalizedCh === normalizedFilter || normalizedCh.includes(normalizedFilter) || normalizedFilter.includes(normalizedCh);
          }) || false;
        }
      }
      
      // Filter by launch date (first_sent)
      let matchesLaunchDate = true;
      if (launchDateFilter !== 'All') {
        if (!campaign.first_sent) {
          matchesLaunchDate = false;
        } else {
          const launchDate = new Date(campaign.first_sent);
          const now = new Date();
          const daysDiff = Math.floor((now.getTime() - launchDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (launchDateFilter === '7days') matchesLaunchDate = daysDiff <= 7;
          else if (launchDateFilter === '30days') matchesLaunchDate = daysDiff <= 30;
          else if (launchDateFilter === '90days') matchesLaunchDate = daysDiff <= 90;
        }
      }
      
      return matchesSearch && matchesTag && matchesChannel && matchesLaunchDate;
    });
  }, [campaigns, searchQuery, tagFilter, channelFilter, launchDateFilter, visibilityMap]);

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
                <SelectItem value="inapp">In-App</SelectItem>
                <SelectItem value="multi">Multi-channel</SelectItem>
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
            <div className="space-y-4 mt-2">
              {/* Email Content - compact layout jumping straight to subject */}
              {selectedCampaign.channels?.includes('email') && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Subject</p>
                    <p className="font-medium">{selectedCampaign.subject || <span className="text-muted-foreground italic">No subject line</span>}</p>
                  </div>
                  {selectedCampaign.preheader && (
                    <p className="text-sm text-muted-foreground line-clamp-1">{selectedCampaign.preheader}</p>
                  )}
                  {selectedCampaign.html_preview && (
                    <div className="border rounded-lg overflow-hidden bg-white mt-2">
                      <iframe
                        srcDoc={selectedCampaign.html_preview}
                        className="w-full"
                        style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}
                        title="Email Preview"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Push Content - Enhanced */}
              {(selectedCampaign.channels?.includes('push') || selectedCampaign.campaignType === 'push') && (
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
                  
                  {/* Deep Link */}
                  {selectedCampaign.push_deep_link && (
                    <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Deep Link</p>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{selectedCampaign.push_deep_link}</code>
                    </div>
                  )}
                  
                  {/* Extras */}
                  {selectedCampaign.push_extras && Object.keys(selectedCampaign.push_extras).length > 0 && (
                    <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Extras</p>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(selectedCampaign.push_extras, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {!selectedCampaign.push_title && !selectedCampaign.push_body && (
                    <p className="text-sm text-muted-foreground">Push content not synced from Braze</p>
                  )}
                </div>
              )}

              {/* In-App Content - Enhanced */}
              {(selectedCampaign.channels?.includes('in_app_message') || selectedCampaign.campaignType === 'inapp') && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-purple-500" />
                    In-App Message
                  </h4>
                  <div className="max-w-sm">
                    <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-2 border-purple-500/30 rounded-2xl p-6 text-center">
                      {/* Image */}
                      {selectedCampaign.inapp_image_url && (
                        <div className="mb-4 rounded-lg overflow-hidden">
                          <img 
                            src={selectedCampaign.inapp_image_url} 
                            alt="In-app image" 
                            className="w-full h-32 object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                      {!selectedCampaign.inapp_image_url && (
                        <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                          <Smartphone className="h-6 w-6 text-purple-500" />
                        </div>
                      )}
                      <h4 className="font-bold text-lg">
                        {selectedCampaign.inapp_title || selectedCampaign.displayName}
                      </h4>
                      {selectedCampaign.inapp_body && (
                        <div 
                          className="text-sm text-muted-foreground mt-2 prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ 
                            __html: DOMPurify.sanitize(selectedCampaign.inapp_body, {
                              ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'span', 'div'],
                              ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style']
                            })
                          }}
                        />
                      )}
                      
                      {/* Buttons */}
                      <div className="flex flex-col gap-2 mt-4">
                        {selectedCampaign.inapp_buttons?.length ? (
                          selectedCampaign.inapp_buttons.map((btn, idx) => (
                            <Button 
                              key={idx} 
                              size="sm" 
                              variant={idx === 0 ? 'default' : 'outline'}
                              className="w-full"
                            >
                              {btn.text}
                            </Button>
                          ))
                        ) : selectedCampaign.inapp_cta ? (
                          <Button size="sm">{selectedCampaign.inapp_cta}</Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  
                  {/* Button URLs for debugging */}
                  {selectedCampaign.inapp_buttons?.some(b => b.url) && (
                    <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Button Actions</p>
                      <div className="space-y-1">
                        {selectedCampaign.inapp_buttons.filter(b => b.url).map((btn, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <span className="font-medium">{btn.text}:</span>
                            <code className="bg-muted px-1 py-0.5 rounded truncate">{btn.url}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {!selectedCampaign.inapp_title && !selectedCampaign.inapp_body && (
                    <p className="text-sm text-muted-foreground">In-app content not synced from Braze</p>
                  )}
                </div>
              )}

              {/* Warnings */}
              {selectedCampaign.warnings && selectedCampaign.warnings.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-xs font-medium text-amber-600 mb-1">Sync Warnings</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedCampaign.warnings.map((warning, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs text-amber-600 border-amber-500/30">
                        {warning.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
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

// Campaign Card Component - with inline content preview like Lifecycle
function CampaignCard({ campaign, viewMode, onClick }: { campaign: EnrichedCampaign; viewMode: 'grid' | 'list'; onClick: () => void }) {
  const { taxonomy } = campaign;
  
  // Determine primary channel for display
  const primaryChannel = campaign.channels?.[0] || 'email';
  const displayChannel = primaryChannel === 'in_app_message' ? 'In-App' : 
                         primaryChannel.charAt(0).toUpperCase() + primaryChannel.slice(1);
  
  if (viewMode === 'list') {
    return (
      <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={onClick}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* Content Preview Column */}
            <div className="w-48 flex-shrink-0">
              {campaign.campaignType === 'email' || campaign.channels?.includes('email') ? (
                campaign.html_preview ? (
                  <div className="border rounded-lg overflow-hidden bg-white h-32">
                    <iframe
                      srcDoc={campaign.html_preview}
                      className="w-full h-full pointer-events-none"
                      title="Email Preview"
                      sandbox="allow-same-origin"
                      style={{ transform: 'scale(0.25)', transformOrigin: 'top left', width: '400%', height: '400%' }}
                    />
                  </div>
                ) : (
                  <div className="bg-muted/50 rounded-lg p-3 h-32 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-[10px] text-primary-foreground font-bold">L</span>
                      </div>
                      <span className="text-[10px] font-medium">Linktree</span>
                    </div>
                    <p className="text-xs font-medium line-clamp-2">{campaign.subject || campaign.displayName}</p>
                    {campaign.preheader && (
                      <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{campaign.preheader}</p>
                    )}
                  </div>
                )
              ) : campaign.campaignType === 'push' || campaign.channels?.includes('push') ? (
              <div className="bg-muted/50 rounded-lg p-3 h-32">
                  <div className="bg-card border rounded-xl p-2 shadow-sm h-full flex flex-col justify-center">
                    <div className="flex items-start gap-2">
                      <img 
                        src="/logos/linktree-logo.png" 
                        alt="Linktree" 
                        className="h-5 w-5 rounded object-contain flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] text-muted-foreground">Linktree • now</p>
                        <p className="text-[11px] font-semibold line-clamp-1">{campaign.push_title || campaign.displayName}</p>
                        {campaign.push_body && (
                          <p className="text-[9px] text-muted-foreground line-clamp-2 mt-0.5">{campaign.push_body}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-lg p-3 h-32 flex flex-col justify-center text-center">
                  <Smartphone className="h-5 w-5 text-purple-500 mx-auto mb-1" />
                  <p className="text-xs font-semibold line-clamp-1">{campaign.inapp_title || campaign.displayName}</p>
                  {campaign.inapp_body && (
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{campaign.inapp_body}</p>
                  )}
                </div>
              )}
            </div>
            
            {/* Info Column */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold line-clamp-1">{campaign.displayName}</h3>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {campaign.first_sent && (
                  <Badge variant="outline" className="text-xs bg-muted/50">
                    <Calendar className="h-3 w-3 mr-1" />
                    {new Date(campaign.first_sent).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Badge>
                )}
                <Badge variant="outline" className={`text-xs ${getChannelColor(primaryChannel)}`}>
                  {displayChannel}
                </Badge>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Grid view with large content preview
  return (
    <Card className="group hover:border-primary/50 hover:shadow-md transition-all overflow-hidden cursor-pointer" onClick={onClick}>
      {/* Header badges - date and channel */}
      <div className="px-4 py-2 bg-muted/30 border-b flex items-center gap-1.5">
        {campaign.first_sent && (
          <Badge variant="outline" className="text-xs bg-background">
            <Calendar className="h-3 w-3 mr-1" />
            {new Date(campaign.first_sent).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Badge>
        )}
        <Badge variant="outline" className={`text-xs bg-background ${getChannelColor(primaryChannel)}`}>
          {displayChannel}
        </Badge>
      </div>

      {/* Content Preview - Large */}
      <div className="bg-muted/30 border-b">
        {campaign.campaignType === 'email' || campaign.channels?.includes('email') ? (
          campaign.html_preview ? (
            <div className="bg-white overflow-hidden" style={{ height: '280px' }}>
              <iframe
                srcDoc={campaign.html_preview}
                className="w-full h-full pointer-events-none"
                title="Email Preview"
                sandbox="allow-same-origin"
                style={{ transform: 'scale(0.4)', transformOrigin: 'top left', width: '250%', height: '250%' }}
              />
            </div>
          ) : (
            <div className="p-6 flex flex-col items-center justify-center" style={{ height: '280px' }}>
              <div className="bg-card rounded-lg p-4 shadow-sm w-full max-w-xs">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-sm text-primary-foreground font-bold">L</span>
                  </div>
                  <span className="text-sm font-medium">Linktree</span>
                </div>
                <p className="font-medium line-clamp-2">{campaign.subject || campaign.displayName}</p>
                {campaign.preheader && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{campaign.preheader}</p>
                )}
              </div>
            </div>
          )
        ) : campaign.campaignType === 'push' || campaign.channels?.includes('push') ? (
          <div className="p-6 flex items-center justify-center" style={{ height: '280px' }}>
            <div className="bg-card border rounded-2xl p-4 shadow-lg w-full max-w-xs">
              <div className="flex items-start gap-3">
                <img 
                  src="/logos/linktree-logo.png" 
                  alt="Linktree" 
                  className="h-10 w-10 rounded-lg object-contain flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">Linktree • now</p>
                  <p className="font-semibold text-sm mt-0.5 line-clamp-1">{campaign.push_title || campaign.displayName}</p>
                  {campaign.push_body && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{campaign.push_body}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : campaign.campaignType === 'inapp' || campaign.channels?.some(ch => ch.toLowerCase().includes('in_app') || ch.toLowerCase().includes('inapp')) ? (
          // Check if there's HTML content for in-app
          (() => {
            const variant = campaign.variants?.[0];
            const htmlContent = variant?.content?.body_html || campaign.inapp_body;
            const isHtml = htmlContent && (htmlContent.includes('<') || htmlContent.includes('&lt;'));
            
            if (isHtml) {
              return (
                <div className="bg-white overflow-hidden" style={{ height: '280px' }}>
                  <iframe
                    srcDoc={htmlContent}
                    className="w-full h-full pointer-events-none"
                    title="In-App Preview"
                    sandbox="allow-same-origin"
                    style={{ transform: 'scale(0.4)', transformOrigin: 'top left', width: '250%', height: '250%' }}
                  />
                </div>
              );
            }
            
            return (
              <div className="p-6 flex items-center justify-center" style={{ height: '280px' }}>
                <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-2 border-purple-500/30 rounded-2xl p-6 text-center w-full max-w-xs">
                  {campaign.inapp_image_url ? (
                    <img 
                      src={campaign.inapp_image_url} 
                      alt="In-app" 
                      className="w-full h-20 object-cover rounded-lg mb-3"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-3">
                      <Smartphone className="h-6 w-6 text-purple-500" />
                    </div>
                  )}
                  <h4 className="font-bold line-clamp-2">{campaign.inapp_title || campaign.displayName}</h4>
                  {campaign.inapp_body && !isHtml && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{campaign.inapp_body}</p>
                  )}
                  {campaign.inapp_cta && (
                    <Button size="sm" className="mt-3">{campaign.inapp_cta}</Button>
                  )}
                </div>
              </div>
            );
          })()
        ) : null}
      </div>

      {/* Footer - just title */}
      <CardContent className="p-4">
        <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-2">{campaign.displayName}</h3>
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
