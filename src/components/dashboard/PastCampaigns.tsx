import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Mail, Bell, Smartphone, Calendar } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface RecentCampaign {
  id: string;
  name: string;
  channel: 'email' | 'push' | 'inapp';
  sent_date: string;
  subject?: string;
}

const now = new Date();

const RECENT_CAMPAIGNS: RecentCampaign[] = [
  { id: '1', name: 'Spring Launch Announcement', channel: 'email', sent_date: format(subDays(now, 1), 'yyyy-MM-dd'), subject: '🌸 Spring is here!' },
  { id: '2', name: 'Flash Sale Reminder', channel: 'push', sent_date: format(subDays(now, 2), 'yyyy-MM-dd'), subject: '⚡ Flash Sale ends tonight!' },
  { id: '3', name: 'Welcome Series — Day 1', channel: 'email', sent_date: format(subDays(now, 3), 'yyyy-MM-dd'), subject: 'Welcome to the family!' },
  { id: '4', name: 'Feature Update', channel: 'inapp', sent_date: format(subDays(now, 4), 'yyyy-MM-dd'), subject: 'New: Dark Mode is here!' },
  { id: '5', name: 'Weekly Digest', channel: 'email', sent_date: format(subDays(now, 5), 'yyyy-MM-dd'), subject: 'Your weekly roundup 📬' },
];

const channelIcons: Record<string, React.ReactNode> = {
  email: <Mail className="h-3 w-3" />,
  push: <Bell className="h-3 w-3" />,
  inapp: <Smartphone className="h-3 w-3" />,
};

const channelLabels: Record<string, string> = {
  email: 'Email',
  push: 'Push',
  inapp: 'In-App',
};

const channelColors: Record<string, string> = {
  email: 'bg-blue-500/10 text-blue-600',
  push: 'bg-orange-500/10 text-orange-600',
  inapp: 'bg-purple-500/10 text-purple-600',
};

export function PastCampaigns() {
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
        <div className="flex gap-4 overflow-x-auto pb-2">
          {RECENT_CAMPAIGNS.map((campaign) => (
            <Link
              key={campaign.id}
              to="/campaigns"
              className="flex-shrink-0 w-56 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <div className={cn(
                "w-full h-20 rounded-lg flex items-center justify-center mb-3",
                channelColors[campaign.channel]
              )}>
                <div className="text-center px-3">
                  <p className="text-xs font-medium line-clamp-2">{campaign.subject}</p>
                </div>
              </div>
              <p className="font-medium text-sm truncate mb-2">{campaign.name}</p>
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                {channelIcons[campaign.channel]}
                <span className="ml-1">{channelLabels[campaign.channel]}</span>
                <span className="mx-1 text-muted-foreground">•</span>
                {format(new Date(campaign.sent_date), 'MMM d')}
              </Badge>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
