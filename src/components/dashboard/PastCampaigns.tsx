import { Link } from 'react-router-dom';
import { useLinktreePlatforms } from '@/hooks/useLinktreeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Mail, Bell, Smartphone, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface BrazeCampaign {
  id: string;
  name: string;
  first_sent?: string;
  last_sent?: string;
  channels?: string[];
  state?: string;
  campaign_type?: string;
  html_preview?: string;
  push_title?: string;
  push_body?: string;
  inapp_header?: string;
  inapp_body?: string;
}

export function PastCampaigns() {
  const { data: platforms, isLoading: platformsLoading } = useLinktreePlatforms();

  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const schemaCache = brazePlatform?.schema_cache as any;
  
  // Get the 5 most recent campaigns, sorted by most recent activity (last_sent or first_sent)
  const allCampaigns: BrazeCampaign[] = (schemaCache?.campaigns || [])
    .map((c: any) => ({
      ...c,
      sortDate: c.last_sent || c.first_sent || c.created_at || null
    }))
    .filter((c: any) => !c.archived)
    .sort((a: any, b: any) => {
      const dateA = a.sortDate ? new Date(a.sortDate).getTime() : 0;
      const dateB = b.sortDate ? new Date(b.sortDate).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 5);

  const getChannelIcon = (channel: string) => {
    const normalized = channel.toLowerCase().replace(/_/g, '-');
    if (normalized.includes('email')) return <Mail className="h-3 w-3" />;
    if (normalized.includes('push')) return <Bell className="h-3 w-3" />;
    if (normalized.includes('in-app') || normalized.includes('inapp')) return <Smartphone className="h-3 w-3" />;
    return <Mail className="h-3 w-3" />;
  };

  const getChannelLabel = (channel: string) => {
    const normalized = channel.toLowerCase().replace(/_/g, '-');
    if (normalized.includes('email')) return 'Email';
    if (normalized.includes('push')) return 'Push';
    if (normalized.includes('in-app') || normalized.includes('inapp')) return 'In-App';
    return 'Email';
  };

  const inferChannels = (campaign: BrazeCampaign): string[] => {
    // Use campaign_type if available
    if (campaign.campaign_type) {
      if (campaign.campaign_type === 'email') return ['email'];
      if (campaign.campaign_type === 'push') return ['push'];
      if (campaign.campaign_type === 'inapp') return ['in_app_message'];
    }
    // Otherwise use channels array
    if (campaign.channels?.length) return campaign.channels;
    // Infer from content
    if (campaign.html_preview) return ['email'];
    if (campaign.push_title || campaign.push_body) return ['push'];
    if (campaign.inapp_header || campaign.inapp_body) return ['in_app_message'];
    return ['email'];
  };

  if (platformsLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Recent Campaigns</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-16 w-24 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Get display date (prefer first_sent for launch date, then last_sent)
  const getDisplayDate = (campaign: BrazeCampaign): string => {
    const date = campaign.first_sent || campaign.last_sent;
    if (!date) return 'Unknown';
    try {
      return format(parseISO(date), 'MMM d, yyyy');
    } catch {
      return 'Unknown';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Recent Campaigns</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/campaigns">
            View All
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {allCampaigns.length > 0 ? (
          <div className="space-y-3">
            {allCampaigns.map((campaign) => {
              const channels = inferChannels(campaign);
              const primaryChannel = channels[0] || 'email';
              
              return (
                <Link 
                  key={campaign.id} 
                  to="/campaigns"
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  {/* Mini preview */}
                  <div className="w-24 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-muted/50">
                    {primaryChannel === 'email' && campaign.html_preview ? (
                      <div className="w-full h-full bg-white overflow-hidden">
                        <iframe
                          srcDoc={campaign.html_preview}
                          className="w-full h-full pointer-events-none"
                          title="Preview"
                          sandbox="allow-same-origin"
                          style={{ transform: 'scale(0.15)', transformOrigin: 'top left', width: '667%', height: '667%' }}
                        />
                      </div>
                    ) : primaryChannel.includes('push') ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="bg-card border rounded-lg p-1.5 scale-75">
                          <div className="flex items-center gap-1">
                            <img src="/logos/linktree-logo.png" alt="L" className="h-4 w-4 rounded" />
                            <div className="text-[8px] truncate max-w-[50px]">{campaign.push_title || campaign.name}</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-purple-500/10">
                        <Smartphone className="h-5 w-5 text-purple-500" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{campaign.name}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant="outline" className="text-xs bg-muted/50">
                        <Calendar className="h-3 w-3 mr-1" />
                        {getDisplayDate(campaign)}
                      </Badge>
                      {channels.map((channel) => (
                        <Badge key={channel} variant="outline" className="text-xs">
                          {getChannelIcon(channel)}
                          <span className="ml-1">{getChannelLabel(channel)}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No campaigns yet</p>
            <p className="text-xs text-muted-foreground mt-1">Connect Braze to see campaigns</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
