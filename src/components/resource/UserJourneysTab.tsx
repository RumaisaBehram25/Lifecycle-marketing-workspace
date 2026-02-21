import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { 
  Plus, 
  Route, 
  Mail, 
  Bell, 
  Smartphone, 
  Clock, 
  Users,
  ChevronRight,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface JourneyStep {
  id: string;
  name: string;
  channel: 'email' | 'push' | 'inapp' | 'wait';
  delay?: string;
  description?: string;
}

interface UserJourney {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'draft' | 'paused';
  trigger: string;
  audience: string;
  steps: JourneyStep[];
  conversionRate?: number;
}

const PLACEHOLDER_JOURNEYS: UserJourney[] = [
  {
    id: '1',
    name: 'Welcome Series',
    description: 'Onboard new users with a 5-touch welcome sequence',
    status: 'active',
    trigger: 'User signs up',
    audience: 'New Users',
    conversionRate: 34,
    steps: [
      { id: '1a', name: 'Welcome Email', channel: 'email', description: 'Introduction + value props' },
      { id: '1b', name: 'Wait 1 day', channel: 'wait', delay: '1 day' },
      { id: '1c', name: 'Setup Nudge', channel: 'push', description: 'Complete profile reminder' },
      { id: '1d', name: 'Wait 2 days', channel: 'wait', delay: '2 days' },
      { id: '1e', name: 'Feature Highlight', channel: 'email', description: 'Key feature walkthrough' },
      { id: '1f', name: 'Wait 3 days', channel: 'wait', delay: '3 days' },
      { id: '1g', name: 'Social Proof', channel: 'email', description: 'Success stories + CTA' },
    ],
  },
  {
    id: '2',
    name: 'Re-engagement',
    description: 'Win back lapsed users who haven\'t been active in 30+ days',
    status: 'active',
    trigger: 'Inactive 30 days',
    audience: 'Lapsed Users',
    conversionRate: 12,
    steps: [
      { id: '2a', name: 'We Miss You', channel: 'email', description: 'Personalized return incentive' },
      { id: '2b', name: 'Wait 3 days', channel: 'wait', delay: '3 days' },
      { id: '2c', name: 'What\'s New', channel: 'push', description: 'New feature announcement' },
      { id: '2d', name: 'Wait 5 days', channel: 'wait', delay: '5 days' },
      { id: '2e', name: 'Final Offer', channel: 'email', description: 'Limited-time offer' },
    ],
  },
  {
    id: '3',
    name: 'Upgrade Flow',
    description: 'Convert free users to paid with targeted messaging',
    status: 'draft',
    trigger: 'Free trial day 7',
    audience: 'Free Tier Users',
    conversionRate: 8,
    steps: [
      { id: '3a', name: 'Value Recap', channel: 'email', description: 'Usage stats + premium benefits' },
      { id: '3b', name: 'Wait 2 days', channel: 'wait', delay: '2 days' },
      { id: '3c', name: 'Upgrade CTA', channel: 'inapp', description: 'In-app upgrade prompt' },
      { id: '3d', name: 'Wait 1 day', channel: 'wait', delay: '1 day' },
      { id: '3e', name: 'Last Chance', channel: 'push', description: 'Trial ending reminder' },
    ],
  },
  {
    id: '4',
    name: 'Post-Purchase',
    description: 'Nurture customers after their first purchase',
    status: 'paused',
    trigger: 'First purchase',
    audience: 'New Customers',
    steps: [
      { id: '4a', name: 'Order Confirmation', channel: 'email', description: 'Receipt + next steps' },
      { id: '4b', name: 'Wait 3 days', channel: 'wait', delay: '3 days' },
      { id: '4c', name: 'How-to Guide', channel: 'email', description: 'Getting started content' },
      { id: '4d', name: 'Wait 7 days', channel: 'wait', delay: '7 days' },
      { id: '4e', name: 'Review Request', channel: 'push', description: 'Ask for feedback' },
    ],
  },
];

const channelIcons: Record<string, React.ReactNode> = {
  email: <Mail className="h-4 w-4" />,
  push: <Bell className="h-4 w-4" />,
  inapp: <Smartphone className="h-4 w-4" />,
  wait: <Clock className="h-4 w-4" />,
};

const channelColors: Record<string, string> = {
  email: 'bg-blue-500/10 text-blue-600 border-blue-200',
  push: 'bg-orange-500/10 text-orange-600 border-orange-200',
  inapp: 'bg-purple-500/10 text-purple-600 border-purple-200',
  wait: 'bg-muted text-muted-foreground border-border',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-500/20 text-green-700',
  draft: 'bg-muted text-muted-foreground',
  paused: 'bg-amber-500/20 text-amber-700',
};

export function UserJourneysTab() {
  const [journeys] = useState<UserJourney[]>(PLACEHOLDER_JOURNEYS);
  const [selectedJourney, setSelectedJourney] = useState<UserJourney | null>(null);

  return (
    <div className="space-y-6">
      {/* Journey Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {journeys.map(journey => (
          <Card 
            key={journey.id} 
            className="hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => setSelectedJourney(journey)}
          >
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Route className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{journey.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{journey.description}</p>
                  </div>
                </div>
                <Badge className={cn("text-xs", statusColors[journey.status])}>
                  {journey.status}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {journey.audience}
                </span>
                <span>{journey.steps.filter(s => s.channel !== 'wait').length} touchpoints</span>
              </div>

              {/* Mini step visualization */}
              <div className="flex items-center gap-1">
                {journey.steps.filter(s => s.channel !== 'wait').map((step, i) => (
                  <div 
                    key={step.id}
                    className={cn("h-7 w-7 rounded flex items-center justify-center border", channelColors[step.channel])}
                    title={step.name}
                  >
                    {channelIcons[step.channel]}
                  </div>
                ))}
              </div>

              {journey.conversionRate !== undefined && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Conversion</span>
                    <span className="font-medium">{journey.conversionRate}%</span>
                  </div>
                  <Progress value={journey.conversionRate} className="h-1.5" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Journey Detail Modal */}
      <Dialog open={!!selectedJourney} onOpenChange={() => setSelectedJourney(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedJourney && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Route className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <DialogTitle>{selectedJourney.name}</DialogTitle>
                    <p className="text-sm text-muted-foreground mt-1">{selectedJourney.description}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Trigger</p>
                    <p className="font-medium mt-1">{selectedJourney.trigger}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Audience</p>
                    <p className="font-medium mt-1">{selectedJourney.audience}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge className={cn("mt-1 text-xs", statusColors[selectedJourney.status])}>
                      {selectedJourney.status}
                    </Badge>
                  </div>
                </div>

                {/* Journey Steps */}
                <div className="space-y-0">
                  <h4 className="text-sm font-semibold mb-3">Journey Steps</h4>
                  {selectedJourney.steps.map((step, i) => (
                    <div key={step.id} className="flex items-start gap-3">
                      {/* Connector line */}
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center border",
                          channelColors[step.channel]
                        )}>
                          {channelIcons[step.channel]}
                        </div>
                        {i < selectedJourney.steps.length - 1 && (
                          <div className="w-px h-6 bg-border" />
                        )}
                      </div>
                      <div className="pb-6">
                        <p className="text-sm font-medium">{step.name}</p>
                        {step.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                        )}
                        {step.delay && (
                          <p className="text-xs text-muted-foreground mt-0.5">⏱ {step.delay}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
