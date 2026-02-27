import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  Search, Mail, Bell, Smartphone, LayoutGrid, List,
  Sparkles, Calendar as CalendarIcon, Image, CalendarDays,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getDay } from 'date-fns';
import { cn } from '@/lib/utils';

interface PlaceholderCampaign {
  id: string;
  name: string;
  channel: 'email' | 'push' | 'inapp';
  subject?: string;
  preheader?: string;
  push_title?: string;
  push_body?: string;
  sent_date: string;
  status: 'sent' | 'scheduled' | 'draft';
  opens?: number;
  clicks?: number;
  segment?: string;
  deliveries?: number;
  open_rate?: string;
  click_rate?: string;
  unsubs?: number;
  creative_preview?: string;
}

const now = new Date();

const PLACEHOLDER_CAMPAIGNS: PlaceholderCampaign[] = [
  {
    id: '1', name: 'Spring Launch Announcement', channel: 'email',
    subject: '🌸 Spring is here! Check out what\'s new',
    preheader: 'New products, fresh deals, and more inside',
    sent_date: format(subDays(now, 1), 'yyyy-MM-dd'), status: 'sent',
    opens: 12450, clicks: 3200, segment: 'Engaged 180d', deliveries: 42300,
    open_rate: '29.4%', click_rate: '7.6%', unsubs: 84,
    creative_preview: 'Hero banner with spring floral imagery and CTA button',
  },
  {
    id: '2', name: 'Flash Sale Reminder', channel: 'push',
    push_title: '⚡ Flash Sale ends tonight!',
    push_body: 'Don\'t miss 40% off everything. Tap to shop now.',
    sent_date: format(subDays(now, 2), 'yyyy-MM-dd'), status: 'sent',
    opens: 8900, clicks: 2100, segment: 'All Subscribers', deliveries: 31200,
    open_rate: '28.5%', click_rate: '6.7%', unsubs: 45,
    creative_preview: 'Bold "40% OFF" text with countdown timer',
  },
  {
    id: '3', name: 'Welcome Series — Day 1', channel: 'email',
    subject: 'Welcome to the family! Here\'s what to do first',
    preheader: 'Get started in 3 easy steps',
    sent_date: format(subDays(now, 3), 'yyyy-MM-dd'), status: 'sent',
    opens: 15600, clicks: 5400, segment: 'New Subscribers', deliveries: 28400,
    open_rate: '54.9%', click_rate: '19.0%', unsubs: 12,
    creative_preview: 'Clean welcome layout with 3-step getting started guide',
  },
  {
    id: '4', name: 'Feature Update — In-App', channel: 'inapp',
    push_title: 'New: Dark Mode is here!',
    push_body: 'Try our brand-new dark mode. Easier on your eyes.',
    sent_date: format(subDays(now, 4), 'yyyy-MM-dd'), status: 'sent',
    segment: 'Active Users', deliveries: 18500,
    open_rate: '—', click_rate: '12.1%', unsubs: 0,
    creative_preview: 'Split-screen light/dark mode comparison',
  },
  {
    id: '5', name: 'Weekly Digest', channel: 'email',
    subject: 'Your weekly roundup is here 📬',
    preheader: 'Top stories, tips, and what\'s trending',
    sent_date: format(subDays(now, 5), 'yyyy-MM-dd'), status: 'sent',
    opens: 9800, clicks: 1500, segment: 'Engaged 90d', deliveries: 37200,
    open_rate: '26.3%', click_rate: '4.0%', unsubs: 62,
    creative_preview: 'Newsletter-style layout with featured articles',
  },
  {
    id: '6', name: 'Cart Abandonment Nudge', channel: 'push',
    push_title: 'You left something behind!',
    push_body: 'Your cart is waiting. Complete your order before items sell out.',
    sent_date: format(subDays(now, 6), 'yyyy-MM-dd'), status: 'sent',
    opens: 6200, clicks: 1800, segment: 'Cart Abandoners', deliveries: 14800,
    open_rate: '41.9%', click_rate: '12.2%', unsubs: 18,
    creative_preview: 'Product thumbnail with urgency messaging',
  },
  {
    id: '7', name: 'Loyalty Reward Unlocked', channel: 'email',
    subject: '🎉 You\'ve earned a reward!',
    preheader: 'Redeem your points before they expire',
    sent_date: format(subDays(now, 7), 'yyyy-MM-dd'), status: 'sent',
    opens: 11200, clicks: 4100, segment: 'Loyalty Members', deliveries: 22100,
    open_rate: '50.7%', click_rate: '18.6%', unsubs: 8,
    creative_preview: 'Reward badge with confetti animation and CTA',
  },
  {
    id: '8', name: 'Summer Preview', channel: 'email',
    subject: '☀️ Summer Preview: First look inside',
    preheader: 'Be the first to see our summer collection',
    sent_date: format(subDays(now, 10), 'yyyy-MM-dd'), status: 'sent',
    opens: 13400, clicks: 3800, segment: 'Engaged 180d', deliveries: 41500,
    open_rate: '32.3%', click_rate: '9.2%', unsubs: 71,
    creative_preview: 'Product grid with summer color palette',
  },
];

// Placeholder briefs as calendar items
const BRIEF_CALENDAR_ITEMS = [
  { id: 'b1', name: 'Memorial Day Sale Brief', date: format(subDays(now, -3), 'yyyy-MM-dd'), type: 'brief' as const },
  { id: 'b2', name: 'June Newsletter Brief', date: format(subDays(now, -7), 'yyyy-MM-dd'), type: 'brief' as const },
];

const channelIcons: Record<string, React.ReactNode> = {
  email: <Mail className="h-4 w-4" />,
  push: <Bell className="h-4 w-4" />,
  inapp: <Smartphone className="h-4 w-4" />,
};

const channelLabels: Record<string, string> = {
  email: 'Email', push: 'Push', inapp: 'In-App',
};

const channelColors: Record<string, string> = {
  email: 'bg-blue-500/10 text-blue-600',
  push: 'bg-orange-500/10 text-orange-600',
  inapp: 'bg-purple-500/10 text-purple-600',
};

const creativeGradients: Record<string, string> = {
  email: 'from-blue-100 to-blue-50',
  push: 'from-orange-100 to-orange-50',
  inapp: 'from-purple-100 to-purple-50',
};

function CalendarView({ campaigns, briefs, onSelectCampaign }: {
  campaigns: PlaceholderCampaign[];
  briefs: typeof BRIEF_CALENDAR_ITEMS;
  onSelectCampaign: (c: PlaceholderCampaign) => void;
}) {
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  const days = eachDayOfInterval({ start, end });
  const startDayOfWeek = getDay(start);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">{format(now, 'MMMM yyyy')}</h3>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
        {Array.from({ length: startDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-card p-2 min-h-[80px]" />
        ))}
        {days.map(day => {
          const dayCampaigns = campaigns.filter(c => isSameDay(new Date(c.sent_date), day));
          const dayBriefs = briefs.filter(b => isSameDay(new Date(b.date), day));
          const isToday = isSameDay(day, now);
          return (
            <div key={day.toISOString()} className={cn("bg-card p-1.5 min-h-[80px]", isToday && "ring-1 ring-primary/50")}>
              <span className={cn("text-xs font-medium", isToday ? "text-primary" : "text-muted-foreground")}>{format(day, 'd')}</span>
              <div className="mt-1 space-y-0.5">
                {dayCampaigns.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onSelectCampaign(c)}
                    className={cn("w-full text-left text-[10px] px-1 py-0.5 rounded truncate", channelColors[c.channel])}
                  >
                    {c.name}
                  </button>
                ))}
                {dayBriefs.map(b => (
                  <div key={b.id} className="text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 truncate">
                    📋 {b.name}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Campaigns() {
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'calendar'>('grid');
  const [selectedCampaign, setSelectedCampaign] = useState<PlaceholderCampaign | null>(null);
  const [dateFilter, setDateFilter] = useState('All Time');

  const filtered = PLACEHOLDER_CAMPAIGNS.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.push_title?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesChannel = channelFilter === 'All' || c.channel === channelFilter;
    return matchesSearch && matchesChannel;
  });

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Campaigns"
          description="Browse sent campaigns and one-off communications"
          actions={
            <Button asChild>
              <Link to="/chat">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate New
              </Link>
            </Button>
          }
        />

        {/* Filters — date + channel inline */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search campaigns..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Channel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="push">Push</SelectItem>
                <SelectItem value="inapp">In-App</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Date Range" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All Time">All Time</SelectItem>
                <SelectItem value="Last 7 Days">Last 7 Days</SelectItem>
                <SelectItem value="Last 30 Days">Last 30 Days</SelectItem>
                <SelectItem value="This Quarter">This Quarter</SelectItem>
                <SelectItem value="Last Quarter">Last Quarter</SelectItem>
                <SelectItem value="YTD">YTD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('grid')}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('list')}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'calendar' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('calendar')}>
              <CalendarDays className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Calendar View */}
        {viewMode === 'calendar' ? (
          <Card>
            <CardContent className="p-4">
              <CalendarView campaigns={filtered} briefs={BRIEF_CALENDAR_ITEMS} onSelectCampaign={setSelectedCampaign} />
            </CardContent>
          </Card>
        ) : (
          /* Campaign Grid / List */
          <div className={viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
            {filtered.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No campaigns found</p>
              </div>
            ) : (
              filtered.map(campaign => (
                <Card key={campaign.id} className="hover:border-primary/50 transition-colors cursor-pointer overflow-hidden" onClick={() => setSelectedCampaign(campaign)}>
                  {viewMode === 'grid' && (
                    <div className={cn("h-32 bg-gradient-to-br flex items-center justify-center", creativeGradients[campaign.channel])}>
                      <div className="text-center px-4">
                        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center mx-auto mb-2", channelColors[campaign.channel])}>
                          {channelIcons[campaign.channel]}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{campaign.creative_preview}</p>
                      </div>
                    </div>
                  )}
                  <CardContent className={viewMode === 'grid' ? 'p-4 space-y-2' : 'p-4 flex items-center gap-4'}>
                    {viewMode === 'list' && (
                      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0", channelColors[campaign.channel])}>
                        {channelIcons[campaign.channel]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{campaign.name}</h3>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {campaign.subject || campaign.push_title}
                      </p>
                    </div>
                    <div className={viewMode === 'grid' ? 'flex items-center justify-between' : 'flex items-center gap-3'}>
                      <Badge className={cn("text-xs", channelColors[campaign.channel])}>
                        {channelLabels[campaign.channel]}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {format(new Date(campaign.sent_date), 'MMM d')}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* Campaign Detail Modal — enhanced with full metrics */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-lg">
          {selectedCampaign && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", channelColors[selectedCampaign.channel])}>
                    {channelIcons[selectedCampaign.channel]}
                  </div>
                  {selectedCampaign.name}
                </DialogTitle>
                <DialogDescription>
                  Sent {format(new Date(selectedCampaign.sent_date), 'MMMM d, yyyy')}
                  {selectedCampaign.segment && <> · Segment: <span className="font-medium text-foreground">{selectedCampaign.segment}</span></>}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {/* Creative Preview */}
                <div className={cn("rounded-lg p-6 bg-gradient-to-br flex items-center justify-center", creativeGradients[selectedCampaign.channel])}>
                  <div className="text-center">
                    <Image className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">{selectedCampaign.creative_preview}</p>
                  </div>
                </div>

                {selectedCampaign.channel === 'email' && (
                  <>
                    {selectedCampaign.subject && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Subject Line</p>
                        <p className="font-medium">{selectedCampaign.subject}</p>
                      </div>
                    )}
                    {selectedCampaign.preheader && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Preview Text</p>
                        <p className="text-sm text-muted-foreground">{selectedCampaign.preheader}</p>
                      </div>
                    )}
                  </>
                )}
                {(selectedCampaign.channel === 'push' || selectedCampaign.channel === 'inapp') && (
                  <div className="max-w-sm mx-auto">
                    <div className="bg-card border rounded-2xl p-4 shadow-lg">
                      <p className="font-semibold text-sm">{selectedCampaign.push_title}</p>
                      {selectedCampaign.push_body && (
                        <p className="text-sm text-muted-foreground mt-1">{selectedCampaign.push_body}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Full Metrics Grid */}
                <div className="grid grid-cols-3 gap-3">
                  {selectedCampaign.segment && (
                    <div className="p-3 rounded-lg bg-muted/50 col-span-3">
                      <p className="text-xs text-muted-foreground">Segment</p>
                      <p className="text-sm font-semibold">{selectedCampaign.segment}</p>
                    </div>
                  )}
                  {selectedCampaign.deliveries != null && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Deliveries</p>
                      <p className="text-lg font-semibold">{selectedCampaign.deliveries.toLocaleString()}</p>
                    </div>
                  )}
                  {selectedCampaign.opens != null && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Opens</p>
                      <p className="text-lg font-semibold">{selectedCampaign.opens.toLocaleString()}</p>
                    </div>
                  )}
                  {selectedCampaign.open_rate && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Open Rate</p>
                      <p className="text-lg font-semibold">{selectedCampaign.open_rate}</p>
                    </div>
                  )}
                  {selectedCampaign.clicks != null && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Clicks</p>
                      <p className="text-lg font-semibold">{selectedCampaign.clicks.toLocaleString()}</p>
                    </div>
                  )}
                  {selectedCampaign.click_rate && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Click Rate</p>
                      <p className="text-lg font-semibold">{selectedCampaign.click_rate}</p>
                    </div>
                  )}
                  {selectedCampaign.unsubs != null && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Unsubs</p>
                      <p className="text-lg font-semibold">{selectedCampaign.unsubs.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
