import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Zap, Tag, ChevronDown, ChevronUp, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Event {
  name: string;
  description: string;
  category: string;
  frequency: string;
  source: string;
}

interface Attribute {
  name: string;
  type: string;
  description: string;
  category: string;
  source: string;
  sampleValues?: string[];
}

const PLACEHOLDER_EVENTS: Event[] = [
  { name: 'user_signed_up', description: 'Fired when a new user creates an account', category: 'Lifecycle', frequency: 'High', source: 'Backend' },
  { name: 'purchase_completed', description: 'Fired after successful checkout', category: 'Commerce', frequency: 'Medium', source: 'Backend' },
  { name: 'cart_abandoned', description: 'Triggered when cart inactive for 30min', category: 'Commerce', frequency: 'High', source: 'Backend' },
  { name: 'email_opened', description: 'User opens a marketing email', category: 'Engagement', frequency: 'High', source: 'ESP' },
  { name: 'push_clicked', description: 'User taps on a push notification', category: 'Engagement', frequency: 'Medium', source: 'SDK' },
  { name: 'feature_activated', description: 'User enables a new product feature', category: 'Product', frequency: 'Medium', source: 'Frontend' },
  { name: 'subscription_renewed', description: 'Subscription auto-renews', category: 'Commerce', frequency: 'Low', source: 'Backend' },
  { name: 'profile_updated', description: 'User updates their profile information', category: 'Lifecycle', frequency: 'Low', source: 'Frontend' },
  { name: 'referral_sent', description: 'User sends a referral invite', category: 'Growth', frequency: 'Low', source: 'Backend' },
  { name: 'support_ticket_created', description: 'User submits a support request', category: 'Support', frequency: 'Low', source: 'Backend' },
  { name: 'page_viewed', description: 'User views a page in the app', category: 'Product', frequency: 'High', source: 'Frontend' },
  { name: 'item_added_to_cart', description: 'User adds a product to cart', category: 'Commerce', frequency: 'High', source: 'Frontend' },
];

const PLACEHOLDER_ATTRIBUTES: Attribute[] = [
  { name: 'first_name', type: 'string', description: 'User\'s first name', category: 'Profile', source: 'Backend', sampleValues: ['John', 'Sarah', 'Mike'] },
  { name: 'email', type: 'string', description: 'Primary email address', category: 'Profile', source: 'Backend', sampleValues: ['user@example.com'] },
  { name: 'plan_type', type: 'string', description: 'Current subscription plan (free, pro, enterprise)', category: 'Subscription', source: 'Backend', sampleValues: ['free', 'pro', 'enterprise'] },
  { name: 'signup_date', type: 'date', description: 'Account creation date', category: 'Profile', source: 'Backend' },
  { name: 'total_purchases', type: 'number', description: 'Lifetime purchase count', category: 'Commerce', source: 'Backend', sampleValues: ['0', '5', '23'] },
  { name: 'last_active_at', type: 'date', description: 'Most recent app activity timestamp', category: 'Engagement', source: 'Backend' },
  { name: 'preferred_channel', type: 'string', description: 'User\'s preferred communication channel', category: 'Preferences', source: 'Backend', sampleValues: ['email', 'push', 'sms'] },
  { name: 'lifetime_value', type: 'number', description: 'Total revenue attributed to user', category: 'Commerce', source: 'Backend', sampleValues: ['$0', '$150', '$2,400'] },
  { name: 'referral_count', type: 'number', description: 'Number of successful referrals', category: 'Growth', source: 'Backend', sampleValues: ['0', '3'] },
  { name: 'timezone', type: 'string', description: 'User\'s local timezone', category: 'Profile', source: 'Backend', sampleValues: ['America/New_York', 'UTC'] },
  { name: 'device_type', type: 'string', description: 'Primary device type', category: 'Profile', source: 'SDK', sampleValues: ['iOS', 'Android', 'Web'] },
  { name: 'opted_in_sms', type: 'boolean', description: 'SMS marketing opt-in status', category: 'Preferences', source: 'Backend', sampleValues: ['true', 'false'] },
];

const frequencyColors: Record<string, string> = {
  High: 'bg-green-500/20 text-green-700',
  Medium: 'bg-amber-500/20 text-amber-700',
  Low: 'bg-muted text-muted-foreground',
};

const typeColors: Record<string, string> = {
  string: 'bg-blue-500/20 text-blue-700',
  number: 'bg-purple-500/20 text-purple-700',
  date: 'bg-orange-500/20 text-orange-700',
  boolean: 'bg-green-500/20 text-green-700',
};

type EventSortKey = 'name' | 'category' | 'frequency' | 'source';
type AttrSortKey = 'name' | 'type' | 'category' | 'source';

export function EventsAttributesTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [eventSort, setEventSort] = useState<{ key: EventSortKey; asc: boolean }>({ key: 'name', asc: true });
  const [attrSort, setAttrSort] = useState<{ key: AttrSortKey; asc: boolean }>({ key: 'name', asc: true });

  const eventCategories = [...new Set(PLACEHOLDER_EVENTS.map(e => e.category))].sort();
  const attrCategories = [...new Set(PLACEHOLDER_ATTRIBUTES.map(a => a.category))].sort();

  const filteredEvents = PLACEHOLDER_EVENTS
    .filter(e =>
      (e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
       e.description.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (categoryFilter === 'All' || e.category === categoryFilter)
    )
    .sort((a, b) => {
      const mul = eventSort.asc ? 1 : -1;
      return mul * (a[eventSort.key] || '').localeCompare(b[eventSort.key] || '');
    });

  const filteredAttributes = PLACEHOLDER_ATTRIBUTES
    .filter(a =>
      (a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
       a.description.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (categoryFilter === 'All' || a.category === categoryFilter)
    )
    .sort((a, b) => {
      const mul = attrSort.asc ? 1 : -1;
      return mul * (a[attrSort.key] || '').localeCompare(b[attrSort.key] || '');
    });

  const handleEventSort = (key: EventSortKey) => {
    setEventSort(prev => ({ key, asc: prev.key === key ? !prev.asc : true }));
  };

  const handleAttrSort = (key: AttrSortKey) => {
    setAttrSort(prev => ({ key, asc: prev.key === key ? !prev.asc : true }));
  };

  const SortIcon = ({ active, asc }: { active: boolean; asc: boolean }) => {
    if (!active) return <ChevronDown className="inline h-3 w-3 ml-0.5 opacity-30" />;
    return asc ? <ChevronUp className="inline h-3 w-3 ml-0.5" /> : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
  };

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{PLACEHOLDER_EVENTS.length}</p>
            <p className="text-xs text-muted-foreground">Events Tracked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{PLACEHOLDER_ATTRIBUTES.length}</p>
            <p className="text-xs text-muted-foreground">User Attributes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{eventCategories.length}</p>
            <p className="text-xs text-muted-foreground">Categories</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">3</p>
            <p className="text-xs text-muted-foreground">Data Sources</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search events & attributes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Categories</SelectItem>
            {[...new Set([...eventCategories, ...attrCategories])].sort().map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events" className="gap-2">
            <Zap className="h-4 w-4" />
            Events ({filteredEvents.length})
          </TabsTrigger>
          <TabsTrigger value="attributes" className="gap-2">
            <Tag className="h-4 w-4" />
            Attributes ({filteredAttributes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleEventSort('name')}>
                        Event Name <SortIcon active={eventSort.key === 'name'} asc={eventSort.asc} />
                      </TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleEventSort('category')}>
                        Category <SortIcon active={eventSort.key === 'category'} asc={eventSort.asc} />
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleEventSort('frequency')}>
                        Frequency <SortIcon active={eventSort.key === 'frequency'} asc={eventSort.asc} />
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleEventSort('source')}>
                        Source <SortIcon active={eventSort.key === 'source'} asc={eventSort.asc} />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map(event => (
                      <TableRow key={event.name}>
                        <TableCell className="font-mono text-sm font-medium py-2.5">{event.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2.5 max-w-[240px]">{event.description}</TableCell>
                        <TableCell className="py-2.5"><Badge variant="outline" className="text-xs">{event.category}</Badge></TableCell>
                        <TableCell className="py-2.5"><Badge className={cn("text-xs", frequencyColors[event.frequency])}>{event.frequency}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2.5">{event.source}</TableCell>
                      </TableRow>
                    ))}
                    {filteredEvents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No events found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attributes">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleAttrSort('name')}>
                        Attribute <SortIcon active={attrSort.key === 'name'} asc={attrSort.asc} />
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleAttrSort('type')}>
                        Type <SortIcon active={attrSort.key === 'type'} asc={attrSort.asc} />
                      </TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleAttrSort('category')}>
                        Category <SortIcon active={attrSort.key === 'category'} asc={attrSort.asc} />
                      </TableHead>
                      <TableHead className="text-xs">Sample Values</TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => handleAttrSort('source')}>
                        Source <SortIcon active={attrSort.key === 'source'} asc={attrSort.asc} />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAttributes.map(attr => (
                      <TableRow key={attr.name}>
                        <TableCell className="font-mono text-sm font-medium py-2.5">{attr.name}</TableCell>
                        <TableCell className="py-2.5"><Badge className={cn("text-xs", typeColors[attr.type])}>{attr.type}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2.5 max-w-[200px]">{attr.description}</TableCell>
                        <TableCell className="py-2.5"><Badge variant="outline" className="text-xs">{attr.category}</Badge></TableCell>
                        <TableCell className="py-2.5">
                          {attr.sampleValues?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {attr.sampleValues.slice(0, 3).map((v, i) => (
                                <code key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{v}</code>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2.5">{attr.source}</TableCell>
                      </TableRow>
                    ))}
                    {filteredAttributes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No attributes found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
