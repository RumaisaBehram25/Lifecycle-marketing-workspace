import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Zap, Tag } from 'lucide-react';

interface Event {
  name: string;
  description: string;
  category: string;
  frequency: string;
}

interface Attribute {
  name: string;
  type: string;
  description: string;
  category: string;
}

const PLACEHOLDER_EVENTS: Event[] = [
  { name: 'user_signed_up', description: 'Fired when a new user creates an account', category: 'Lifecycle', frequency: 'High' },
  { name: 'purchase_completed', description: 'Fired after successful checkout', category: 'Commerce', frequency: 'Medium' },
  { name: 'cart_abandoned', description: 'Triggered when cart inactive for 30min', category: 'Commerce', frequency: 'High' },
  { name: 'email_opened', description: 'User opens a marketing email', category: 'Engagement', frequency: 'High' },
  { name: 'push_clicked', description: 'User taps on a push notification', category: 'Engagement', frequency: 'Medium' },
  { name: 'feature_activated', description: 'User enables a new product feature', category: 'Product', frequency: 'Medium' },
  { name: 'subscription_renewed', description: 'Subscription auto-renews', category: 'Commerce', frequency: 'Low' },
  { name: 'profile_updated', description: 'User updates their profile information', category: 'Lifecycle', frequency: 'Low' },
  { name: 'referral_sent', description: 'User sends a referral invite', category: 'Growth', frequency: 'Low' },
  { name: 'support_ticket_created', description: 'User submits a support request', category: 'Support', frequency: 'Low' },
];

const PLACEHOLDER_ATTRIBUTES: Attribute[] = [
  { name: 'first_name', type: 'string', description: 'User\'s first name', category: 'Profile' },
  { name: 'email', type: 'string', description: 'Primary email address', category: 'Profile' },
  { name: 'plan_type', type: 'string', description: 'Current subscription plan (free, pro, enterprise)', category: 'Subscription' },
  { name: 'signup_date', type: 'date', description: 'Account creation date', category: 'Profile' },
  { name: 'total_purchases', type: 'number', description: 'Lifetime purchase count', category: 'Commerce' },
  { name: 'last_active_at', type: 'date', description: 'Most recent app activity timestamp', category: 'Engagement' },
  { name: 'preferred_channel', type: 'string', description: 'User\'s preferred communication channel', category: 'Preferences' },
  { name: 'lifetime_value', type: 'number', description: 'Total revenue attributed to user', category: 'Commerce' },
  { name: 'referral_count', type: 'number', description: 'Number of successful referrals', category: 'Growth' },
  { name: 'timezone', type: 'string', description: 'User\'s local timezone', category: 'Profile' },
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

export function EventsAttributesTab() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEvents = PLACEHOLDER_EVENTS.filter(e =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAttributes = PLACEHOLDER_ATTRIBUTES.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search events & attributes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
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
          <div className="space-y-2">
            {filteredEvents.map(event => (
              <Card key={event.name}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-medium">{event.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{event.category}</Badge>
                  <Badge className={`text-xs ${frequencyColors[event.frequency]}`}>{event.frequency}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="attributes">
          <div className="space-y-2">
            {filteredAttributes.map(attr => (
              <Card key={attr.name}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Tag className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-medium">{attr.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{attr.description}</p>
                  </div>
                  <Badge className={`text-xs ${typeColors[attr.type]}`}>{attr.type}</Badge>
                  <Badge variant="outline" className="text-xs">{attr.category}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
