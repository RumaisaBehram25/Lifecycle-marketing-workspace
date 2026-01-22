import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  Star,
  ShoppingCart,
  Heart,
  Clock,
  UserMinus,
  Zap,
  Gift,
  TrendingUp
} from 'lucide-react';

interface Segment {
  id: string;
  name: string;
  description: string;
  type: 'include' | 'exclude';
  icon: string;
}

interface AudienceSectionProps {
  clientId: string;
}

// Placeholder segments - these would come from Klaviyo sync in a real implementation
const PLACEHOLDER_SEGMENTS: Segment[] = [
  {
    id: '1',
    name: 'VIP Customers',
    description: 'Customers with 5+ purchases or $500+ lifetime value',
    type: 'include',
    icon: 'star',
  },
  {
    id: '2',
    name: 'Active Subscribers',
    description: 'Opened or clicked an email in the last 90 days',
    type: 'include',
    icon: 'zap',
  },
  {
    id: '3',
    name: 'Recent Purchasers',
    description: 'Made a purchase within the last 30 days',
    type: 'include',
    icon: 'shopping-cart',
  },
  {
    id: '4',
    name: 'Loyalty Members',
    description: 'Enrolled in the rewards program',
    type: 'include',
    icon: 'gift',
  },
  {
    id: '5',
    name: 'High Intent Browsers',
    description: 'Viewed 3+ products in the last 7 days without purchasing',
    type: 'include',
    icon: 'trending-up',
  },
  {
    id: '6',
    name: 'Churned Customers',
    description: 'No purchase in 180+ days, previously active',
    type: 'include',
    icon: 'clock',
  },
  {
    id: '7',
    name: 'Unengaged (30 Days)',
    description: 'No opens or clicks in the last 30 days',
    type: 'exclude',
    icon: 'user-minus',
  },
  {
    id: '8',
    name: 'Recent Unsubscribes',
    description: 'Unsubscribed within the last 60 days',
    type: 'exclude',
    icon: 'user-minus',
  },
];

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  star: Star,
  zap: Zap,
  'shopping-cart': ShoppingCart,
  gift: Gift,
  'trending-up': TrendingUp,
  clock: Clock,
  'user-minus': UserMinus,
  heart: Heart,
};

export function AudienceSection({ clientId }: AudienceSectionProps) {
  const includeSegments = PLACEHOLDER_SEGMENTS.filter(s => s.type === 'include');
  const excludeSegments = PLACEHOLDER_SEGMENTS.filter(s => s.type === 'exclude');

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Audience Segments
          </CardTitle>
          <CardDescription>
            Core segments used in Klaviyo for campaign targeting and exclusions.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Include Segments */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="default" className="bg-green-500">Include</Badge>
          <span className="text-sm text-muted-foreground">
            Segments we actively target in campaigns
          </span>
        </div>
        
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {includeSegments.map(segment => {
            const Icon = ICON_MAP[segment.icon] || Users;
            return (
              <Card key={segment.id} className="border-green-500/20 hover:border-green-500/40 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-medium text-sm">{segment.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {segment.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Exclude Segments */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="destructive">Exclude</Badge>
          <span className="text-sm text-muted-foreground">
            Segments we suppress from campaigns
          </span>
        </div>
        
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {excludeSegments.map(segment => {
            const Icon = ICON_MAP[segment.icon] || Users;
            return (
              <Card key={segment.id} className="border-destructive/20 hover:border-destructive/40 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-5 w-5 text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-medium text-sm">{segment.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {segment.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-muted/50 border-dashed">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground text-center">
            These are placeholder segments. Connect Klaviyo to sync real audience data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
