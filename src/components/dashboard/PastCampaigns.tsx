import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowRight, Mail, Bell, Smartphone } from 'lucide-react';
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
  subject?: string;
  preheader?: string;
}

export function PastCampaigns() {
  const { data: platforms, isLoading: platformsLoading } = useDoubleGoodPlatforms();
  const [selectedCampaign, setSelectedCampaign] = useState<BrazeCampaign | null>(null);

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
    if (campaign.campaign_type) {
      if (campaign.campaign_type === 'email') return ['email'];
      if (campaign.campaign_type === 'push') return ['push'];
      if (campaign.campaign_type === 'inapp') return ['in_app_message'];
    }
    if (campaign.channels?.length) return campaign.channels;
    if (campaign.html_preview) return ['email'];
    if (campaign.push_title || campaign.push_body) return ['push'];
    if (campaign.inapp_header || campaign.inapp_body) return ['in_app_message'];
    return ['email'];
  };

  const getDisplayDate = (campaign: BrazeCampaign): string => {
    const date = campaign.first_sent || campaign.last_sent;
    if (!date) return '';
    try {
      return format(parseISO(date), 'MMM d, yyyy');
    } catch {
      return '';
    }
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

  return (
    <>
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
            <div className="flex gap-4 overflow-x-auto pb-2">
              {allCampaigns.map((campaign) => {
                const channels = inferChannels(campaign);
                const primaryChannel = channels[0] || 'email';
                const displayDate = getDisplayDate(campaign);
                
                return (
                  <div 
                    key={campaign.id} 
                    onClick={() => setSelectedCampaign(campaign)}
                    className="flex-shrink-0 w-56 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    {/* Mini preview */}
                    <div className="w-full h-32 rounded-lg overflow-hidden bg-muted/50 mb-3">
                      {primaryChannel === 'email' && campaign.html_preview ? (
                        <div className="w-full h-full bg-white overflow-hidden">
                          <iframe
                            srcDoc={campaign.html_preview}
                            className="w-full h-full pointer-events-none"
                            title="Preview"
                            sandbox="allow-same-origin"
                            style={{ transform: 'scale(0.1)', transformOrigin: 'top left', width: '1000%', height: '1000%' }}
                          />
                        </div>
                      ) : primaryChannel.includes('push') ? (
                        <div className="w-full h-full flex items-center justify-center p-2">
                          <div className="bg-card border rounded-lg p-2 w-full">
                            <div className="flex items-start gap-1.5">
                              <img src="/logos/linktree-logo.png" alt="L" className="h-4 w-4 rounded flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[9px] text-muted-foreground">now</p>
                                <p className="text-[10px] font-medium line-clamp-1">{campaign.push_title || campaign.name}</p>
                                {campaign.push_body && (
                                  <p className="text-[9px] text-muted-foreground line-clamp-2">{campaign.push_body}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-purple-500/10">
                          <Smartphone className="h-6 w-6 text-purple-500" />
                        </div>
                      )}
                    </div>
                    
                    <p className="font-medium text-sm truncate mb-2">{campaign.name}</p>
                    <Badge variant="outline" className="text-xs px-2 py-0.5">
                      {getChannelIcon(primaryChannel)}
                      <span className="ml-1">{getChannelLabel(primaryChannel)}</span>
                      {displayDate && (
                        <>
                          <span className="mx-1 text-muted-foreground">•</span>
                          {displayDate}
                        </>
                      )}
                    </Badge>
                  </div>
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

      {/* Campaign Detail Modal */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCampaign && (
                <>
                  {inferChannels(selectedCampaign)[0] === 'email' && <Mail className="h-5 w-5 text-blue-500" />}
                  {inferChannels(selectedCampaign)[0]?.includes('push') && <Bell className="h-5 w-5 text-orange-500" />}
                  {inferChannels(selectedCampaign)[0]?.includes('in_app') && <Smartphone className="h-5 w-5 text-purple-500" />}
                  {selectedCampaign.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedCampaign && getDisplayDate(selectedCampaign) && (
                <span>Sent {getDisplayDate(selectedCampaign)}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedCampaign && (
            <div className="space-y-4 mt-2">
              {/* Email Content */}
              {inferChannels(selectedCampaign)[0] === 'email' && (
                <div className="space-y-2">
                  {selectedCampaign.subject && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Subject</p>
                      <p className="font-medium">{selectedCampaign.subject}</p>
                    </div>
                  )}
                  {selectedCampaign.preheader && (
                    <p className="text-sm text-muted-foreground line-clamp-1">{selectedCampaign.preheader}</p>
                  )}
                  {selectedCampaign.html_preview && (
                    <div className="border rounded-lg overflow-hidden bg-white mt-2">
                      <iframe
                        srcDoc={selectedCampaign.html_preview}
                        className="w-full"
                        style={{ height: 'calc(100vh - 350px)', minHeight: '500px' }}
                        title="Email Preview"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Push Content */}
              {inferChannels(selectedCampaign)[0]?.includes('push') && (
                <div className="space-y-3">
                  <div className="max-w-sm mx-auto">
                    <div className="bg-card border rounded-2xl p-4 shadow-lg">
                      <div className="flex items-start gap-3">
                        <img 
                          src="/logos/linktree-logo.png" 
                          alt="Linktree" 
                          className="h-10 w-10 rounded-lg object-contain flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">Linktree • now</p>
                          <p className="font-semibold text-sm mt-0.5">
                            {selectedCampaign.push_title || selectedCampaign.name}
                          </p>
                          {selectedCampaign.push_body && (
                            <p className="text-sm text-muted-foreground line-clamp-3 mt-1">
                              {selectedCampaign.push_body}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* In-App Content */}
              {inferChannels(selectedCampaign)[0]?.includes('in_app') && (
                <div className="space-y-3">
                  <div className="max-w-sm mx-auto bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-xl p-6 text-center">
                    <Smartphone className="h-8 w-8 text-purple-500 mx-auto mb-3" />
                    <p className="font-semibold">{selectedCampaign.inapp_header || selectedCampaign.name}</p>
                    {selectedCampaign.inapp_body && (
                      <p className="text-sm text-muted-foreground mt-2">{selectedCampaign.inapp_body}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
