import { Link } from 'react-router-dom';
import { useLinktreePlatforms } from '@/hooks/useLinktreeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Mail, Bell, Smartphone, CheckCircle2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface BrazeCampaign {
  id: string;
  name: string;
  last_sent?: string;
  channels?: string[];
  state?: string;
  messages?: any;
}

export function PastCampaigns() {
  const { data: platforms, isLoading: platformsLoading } = useLinktreePlatforms();

  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const schemaCache = brazePlatform?.schema_cache as any;
  
  // Get all campaigns, sorted by most recent activity (last_sent or created_at)
  const allCampaigns: BrazeCampaign[] = (schemaCache?.campaigns || [])
    .map((c: any) => ({
      ...c,
      sortDate: c.last_sent || c.created_at || c.first_sent || null
    }))
    .filter((c: any) => c.sortDate)
    .sort((a: any, b: any) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime())
    .slice(0, 5);

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email': return <Mail className="h-3 w-3" />;
      case 'push': return <Bell className="h-3 w-3" />;
      case 'in_app_message': return <Smartphone className="h-3 w-3" />;
      default: return <Mail className="h-3 w-3" />;
    }
  };

  const inferChannels = (campaign: BrazeCampaign): string[] => {
    const channels: string[] = [];
    if (campaign.messages) {
      if (campaign.messages.email || campaign.messages.apple_push || campaign.messages.android_push) {
        if (campaign.messages.email) channels.push('email');
        if (campaign.messages.apple_push || campaign.messages.android_push) channels.push('push');
        if (campaign.messages.in_app_message) channels.push('in_app_message');
      }
    }
    return channels.length > 0 ? channels : ['email'];
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
              <Skeleton className="h-10 w-10 rounded-lg" />
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

  // Get display date (prefer last_sent, fallback to created_at)
  const getDisplayDate = (campaign: any): string => {
    const date = campaign.last_sent || campaign.created_at || campaign.first_sent;
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
              return (
                <div key={campaign.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{campaign.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {getDisplayDate(campaign)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {channels.map((channel) => (
                      <div key={channel} className="h-6 w-6 rounded bg-muted flex items-center justify-center">
                        {getChannelIcon(channel)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No campaigns yet</p>
            <p className="text-xs text-muted-foreground mt-1">Connect Braze to see campaigns</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
