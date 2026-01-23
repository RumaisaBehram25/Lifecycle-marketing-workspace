import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
} from 'lucide-react';

// Mock data for campaigns and lifecycle journeys
const LIFECYCLE_JOURNEYS = [
  {
    id: 'welcome',
    name: 'Welcome Series',
    description: 'Onboard new users and drive first actions',
    audience: 'New Signups',
    status: 'live',
    channels: ['email', 'push'],
    emails: 4,
    icon: Sparkles,
    color: 'bg-emerald-500',
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
    audience: 'Inactive 30+ Days',
    status: 'live',
    channels: ['email', 'push'],
    emails: 3,
    icon: TrendingUp,
    color: 'bg-blue-500',
    steps: [
      { name: 'We Miss You', delay: '30d', channel: 'email' },
      { name: 'What\'s New', delay: '37d', channel: 'email' },
      { name: 'Last Chance Offer', delay: '45d', channel: 'push' },
    ],
  },
  {
    id: 'upgrade',
    name: 'Pro Upgrade',
    description: 'Convert free users to paid',
    audience: 'Free Users - Active',
    status: 'live',
    channels: ['email', 'push', 'in-app'],
    emails: 5,
    icon: Zap,
    color: 'bg-purple-500',
    steps: [
      { name: 'Pro Benefits Overview', delay: 'Trigger: 10 links added', channel: 'email' },
      { name: 'Analytics Teaser', delay: '+24h', channel: 'push' },
      { name: 'Limited Offer', delay: '+48h', channel: 'email' },
      { name: 'Social Proof', delay: '+72h', channel: 'email' },
      { name: 'Final Reminder', delay: '+7d', channel: 'push' },
    ],
  },
  {
    id: 'feature-adoption',
    name: 'Feature Adoption',
    description: 'Drive usage of new features',
    audience: 'All Active Users',
    status: 'draft',
    channels: ['email', 'in-app'],
    emails: 2,
    icon: Gift,
    color: 'bg-orange-500',
    steps: [
      { name: 'New Feature Announcement', delay: 'Launch Day', channel: 'email' },
      { name: 'In-App Tutorial', delay: 'On Login', channel: 'in-app' },
    ],
  },
  {
    id: 'milestone',
    name: 'Milestone Celebrations',
    description: 'Celebrate user achievements',
    audience: 'Milestone Triggers',
    status: 'live',
    channels: ['email', 'push'],
    emails: 4,
    icon: Heart,
    color: 'bg-pink-500',
    steps: [
      { name: '100 Clicks Celebration', delay: 'Trigger', channel: 'email' },
      { name: '1K Clicks Achievement', delay: 'Trigger', channel: 'push' },
      { name: '1 Year Anniversary', delay: 'Trigger', channel: 'email' },
      { name: 'First Sale Congrats', delay: 'Trigger', channel: 'email' },
    ],
  },
];

const CAMPAIGN_EMAILS = [
  {
    id: '1',
    name: 'Welcome to Linktree! 🌳',
    journey: 'Welcome Series',
    audience: 'New Signups',
    channel: 'email',
    status: 'live',
    subject: 'Welcome to Linktree – let\'s get you set up!',
    previewText: 'Your link in bio is ready. Here\'s how to make it yours.',
    sentDate: '2024-01-15',
    openRate: '68%',
    clickRate: '24%',
  },
  {
    id: '2',
    name: 'Discover Pro Features',
    journey: 'Welcome Series',
    audience: 'New Signups',
    channel: 'email',
    status: 'live',
    subject: 'Unlock the full power of your Linktree',
    previewText: 'Analytics, customization, and more – see what Pro can do.',
    sentDate: '2024-01-16',
    openRate: '52%',
    clickRate: '18%',
  },
  {
    id: '3',
    name: 'We Miss You! 💚',
    journey: 'Re-engagement',
    audience: 'Inactive 30+ Days',
    channel: 'email',
    status: 'live',
    subject: 'Your Linktree misses you',
    previewText: 'Come back and see what\'s new – we\'ve been busy!',
    sentDate: '2024-01-10',
    openRate: '34%',
    clickRate: '12%',
  },
  {
    id: '4',
    name: 'Pro Upgrade: Limited Offer',
    journey: 'Pro Upgrade',
    audience: 'Free Users - Active',
    channel: 'email',
    status: 'live',
    subject: '50% off Pro for the next 48 hours',
    previewText: 'Your best analytics and customization – half price.',
    sentDate: '2024-01-12',
    openRate: '45%',
    clickRate: '22%',
  },
  {
    id: '5',
    name: 'You Hit 1K Clicks! 🎉',
    journey: 'Milestone Celebrations',
    audience: 'Milestone Triggers',
    channel: 'email',
    status: 'live',
    subject: 'Congrats! Your Linktree just hit 1,000 clicks',
    previewText: 'Your content is connecting. Keep the momentum going.',
    sentDate: '2024-01-18',
    openRate: '72%',
    clickRate: '31%',
  },
  {
    id: '6',
    name: 'New: Collect Payments',
    journey: 'Feature Adoption',
    audience: 'All Active Users',
    channel: 'email',
    status: 'draft',
    subject: 'Start selling directly from your Linktree',
    previewText: 'Turn your links into income with our new payments feature.',
    sentDate: null,
    openRate: null,
    clickRate: null,
  },
];

const AUDIENCES = ['All', 'New Signups', 'Free Users - Active', 'Inactive 30+ Days', 'Pro Users', 'Milestone Triggers'];
const CHANNELS = ['All', 'email', 'push', 'in-app'];

export default function Creative() {
  const [activeTab, setActiveTab] = useState('lifecycle');
  const [searchQuery, setSearchQuery] = useState('');
  const [audienceFilter, setAudienceFilter] = useState('All');
  const [channelFilter, setChannelFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedJourney, setSelectedJourney] = useState<typeof LIFECYCLE_JOURNEYS[0] | null>(null);

  // Filter campaigns
  const filteredCampaigns = CAMPAIGN_EMAILS.filter(campaign => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         campaign.subject.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAudience = audienceFilter === 'All' || campaign.audience === audienceFilter;
    const matchesChannel = channelFilter === 'All' || campaign.channel === channelFilter;
    return matchesSearch && matchesAudience && matchesChannel;
  });

  // Filter journeys
  const filteredJourneys = LIFECYCLE_JOURNEYS.filter(journey => {
    const matchesSearch = journey.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAudience = audienceFilter === 'All' || journey.audience === audienceFilter;
    return matchesSearch && matchesAudience;
  });

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Creative"
          description="Browse live lifecycle journeys and campaign emails"
          actions={
            <Button asChild>
              <Link to="/chat">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate New
              </Link>
            </Button>
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <TabsList>
              <TabsTrigger value="lifecycle" className="gap-2">
                <FolderOpen className="h-4 w-4" />
                Lifecycle Journeys
              </TabsTrigger>
              <TabsTrigger value="campaigns" className="gap-2">
                <Mail className="h-4 w-4" />
                Campaigns
              </TabsTrigger>
            </TabsList>

            {/* View Mode Toggle */}
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
            <Select value={audienceFilter} onValueChange={setAudienceFilter}>
              <SelectTrigger className="w-[180px]">
                <Users className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Audience" />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCES.map(audience => (
                  <SelectItem key={audience} value={audience}>{audience}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[140px]">
                <Bell className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map(channel => (
                  <SelectItem key={channel} value={channel}>
                    {channel === 'All' ? 'All Channels' : channel.charAt(0).toUpperCase() + channel.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lifecycle Journeys Tab */}
          <TabsContent value="lifecycle" className="mt-0">
            {selectedJourney ? (
              <JourneyDetail journey={selectedJourney} onBack={() => setSelectedJourney(null)} />
            ) : (
              <div className={viewMode === 'grid' 
                ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' 
                : 'space-y-3'
              }>
                {filteredJourneys.map(journey => (
                  <JourneyCard 
                    key={journey.id} 
                    journey={journey} 
                    viewMode={viewMode}
                    onClick={() => setSelectedJourney(journey)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="mt-0">
            <div className={viewMode === 'grid' 
              ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' 
              : 'space-y-3'
            }>
              {filteredCampaigns.map(campaign => (
                <CampaignCard key={campaign.id} campaign={campaign} viewMode={viewMode} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function JourneyCard({ 
  journey, 
  viewMode,
  onClick,
}: { 
  journey: typeof LIFECYCLE_JOURNEYS[0]; 
  viewMode: 'grid' | 'list';
  onClick: () => void;
}) {
  const Icon = journey.icon;
  
  if (viewMode === 'list') {
    return (
      <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={onClick}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className={`h-12 w-12 rounded-xl ${journey.color} flex items-center justify-center flex-shrink-0`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{journey.name}</h3>
                <Badge variant={journey.status === 'live' ? 'default' : 'secondary'}>
                  {journey.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{journey.description}</p>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {journey.audience}
              </span>
              <span className="flex items-center gap-1">
                <Mail className="h-4 w-4" />
                {journey.emails} emails
              </span>
              <ChevronRight className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group hover:border-primary/50 hover:shadow-md transition-all cursor-pointer overflow-hidden" onClick={onClick}>
      <div className={`h-2 ${journey.color}`} />
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className={`h-10 w-10 rounded-lg ${journey.color} flex items-center justify-center flex-shrink-0`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold group-hover:text-primary transition-colors">{journey.name}</h3>
              <Badge variant={journey.status === 'live' ? 'default' : 'secondary'} className="text-xs">
                {journey.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-1">{journey.description}</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span className="truncate max-w-[100px]">{journey.audience}</span>
          </div>
          <div className="flex items-center gap-2">
            {journey.channels.map(channel => (
              <ChannelIcon key={channel} channel={channel} />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <span className="text-sm text-muted-foreground">{journey.emails} emails</span>
          <Button variant="ghost" size="sm" className="gap-1">
            View Journey
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function JourneyDetail({ journey, onBack }: { journey: typeof LIFECYCLE_JOURNEYS[0]; onBack: () => void }) {
  const Icon = journey.icon;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="mb-4">
        ← Back to Journeys
      </Button>

      <Card className="overflow-hidden">
        <div className={`h-3 ${journey.color}`} />
        <CardContent className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className={`h-14 w-14 rounded-xl ${journey.color} flex items-center justify-center flex-shrink-0`}>
              <Icon className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold">{journey.name}</h2>
                <Badge variant={journey.status === 'live' ? 'default' : 'secondary'}>
                  {journey.status}
                </Badge>
              </div>
              <p className="text-muted-foreground">{journey.description}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {journey.audience}
                </span>
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {journey.emails} touchpoints
                </span>
              </div>
            </div>
          </div>

          {/* Journey Wireframe */}
          <div className="mt-8">
            <h3 className="font-semibold mb-4">Journey Flow</h3>
            <div className="relative">
              {/* Connection line */}
              <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-border" />
              
              <div className="space-y-4">
                {journey.steps.map((step, index) => (
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
        </CardContent>
      </Card>

      {/* Related Emails */}
      <div>
        <h3 className="font-semibold mb-4">Emails in this Journey</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPAIGN_EMAILS.filter(e => e.journey === journey.name).map(email => (
            <CampaignCard key={email.id} campaign={email} viewMode="grid" />
          ))}
        </div>
      </div>
    </div>
  );
}

function CampaignCard({ campaign, viewMode }: { campaign: typeof CAMPAIGN_EMAILS[0]; viewMode: 'grid' | 'list' }) {
  if (viewMode === 'list') {
    return (
      <Card className="hover:border-primary/50 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{campaign.name}</h3>
                <Badge variant={campaign.status === 'live' ? 'default' : 'secondary'}>
                  {campaign.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate">{campaign.subject}</p>
            </div>
            {campaign.openRate && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  <Eye className="h-4 w-4 inline mr-1" />
                  {campaign.openRate}
                </span>
                <span className="text-primary font-medium">{campaign.clickRate} CTR</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group hover:border-primary/50 hover:shadow-md transition-all overflow-hidden">
      {/* Email Preview Mock */}
      <div className="bg-muted/50 p-4 border-b">
        <div className="bg-card rounded-lg p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs text-primary-foreground font-bold">L</span>
            </div>
            <span className="text-xs font-medium">Linktree</span>
          </div>
          <p className="text-sm font-medium line-clamp-1">{campaign.subject}</p>
          <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{campaign.previewText}</p>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-semibold group-hover:text-primary transition-colors">{campaign.name}</h3>
            <p className="text-xs text-muted-foreground">{campaign.journey}</p>
          </div>
          <Badge variant={campaign.status === 'live' ? 'default' : 'secondary'} className="text-xs">
            {campaign.status}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {campaign.audience}
          </span>
          <ChannelIcon channel={campaign.channel} />
        </div>

        {campaign.openRate && (
          <div className="flex items-center justify-between pt-3 border-t">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" />
              {campaign.openRate} opens
            </span>
            <span className="text-sm text-primary font-medium">{campaign.clickRate} CTR</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelIcon({ channel, size = 'sm' }: { channel: string; size?: 'sm' | 'lg' }) {
  const iconSize = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  
  switch (channel) {
    case 'email':
      return <Mail className={`${iconSize} text-blue-500`} />;
    case 'push':
      return <Bell className={`${iconSize} text-orange-500`} />;
    case 'in-app':
      return <Smartphone className={`${iconSize} text-purple-500`} />;
    default:
      return null;
  }
}
