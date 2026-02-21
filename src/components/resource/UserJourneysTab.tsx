import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { 
  Mail, 
  Bell, 
  Smartphone, 
  Diamond,
  GitBranch,
  Users,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface JourneyTouchpoint {
  id: string;
  name: string;
  type: 'email' | 'push' | 'inapp' | 'decision' | 'action';
  description?: string;
}

interface JourneyPhase {
  id: string;
  name: string;
  subtitle?: string;
  touchpoints: JourneyTouchpoint[];
}

interface UserJourney {
  id: string;
  name: string;
  phases: JourneyPhase[];
}

const PLACEHOLDER_JOURNEYS: UserJourney[] = [
  {
    id: '1',
    name: 'New User Onboarding',
    phases: [
      {
        id: 'awareness',
        name: 'Awareness',
        subtitle: 'First touchpoints',
        touchpoints: [
          { id: 'a1', name: 'Visit Website', type: 'action', description: 'Organic / paid traffic' },
          { id: 'a2', name: 'Social Engagement', type: 'action', description: 'Social media interaction' },
          { id: 'a3', name: 'Previous Buyer', type: 'action', description: 'Referral or past customer' },
        ],
      },
      {
        id: 'consideration',
        name: 'Consideration',
        subtitle: 'Evaluating the product',
        touchpoints: [
          { id: 'c1', name: 'Has Account?', type: 'decision', description: 'Check for existing account' },
          { id: 'c2', name: 'Download App', type: 'action', description: 'Install mobile app' },
          { id: 'c3', name: 'Onboarding Email', type: 'email', description: 'Welcome + value props' },
          { id: 'c4', name: 'Explore Features', type: 'inapp', description: 'Feature walkthrough' },
        ],
      },
      {
        id: 'activation',
        name: 'Activation',
        subtitle: 'First value moment',
        touchpoints: [
          { id: 'act1', name: 'Complete Profile', type: 'action', description: 'Fill in preferences' },
          { id: 'act2', name: 'Get Started Push', type: 'push', description: 'Nudge to complete setup' },
          { id: 'act3', name: 'First Action', type: 'action', description: 'Core product action' },
          { id: 'act4', name: 'Confirmation Email', type: 'email', description: 'Success + next steps' },
        ],
      },
      {
        id: 'engagement',
        name: 'Engagement',
        subtitle: 'Building habit',
        touchpoints: [
          { id: 'e1', name: 'Week 1 Check-in', type: 'email', description: 'How\'s it going?' },
          { id: 'e2', name: 'Feature Highlight', type: 'push', description: 'Key feature discovery' },
          { id: 'e3', name: 'Social Proof', type: 'email', description: 'Success stories + CTA' },
          { id: 'e4', name: 'Complete Schedule?', type: 'decision', description: 'Check completion' },
        ],
      },
    ],
  },
  {
    id: '2',
    name: 'Re-engagement Flow',
    phases: [
      {
        id: 'trigger',
        name: 'Trigger',
        subtitle: 'Inactivity detected',
        touchpoints: [
          { id: 't1', name: 'Inactive 14 days', type: 'decision', description: 'Activity check' },
        ],
      },
      {
        id: 'winback1',
        name: 'First Outreach',
        subtitle: 'Gentle nudge',
        touchpoints: [
          { id: 'w1', name: 'We Miss You Email', type: 'email', description: 'Personalized reminder' },
          { id: 'w2', name: 'Push Notification', type: 'push', description: 'What\'s new highlight' },
        ],
      },
      {
        id: 'winback2',
        name: 'Escalation',
        subtitle: 'Incentive offer',
        touchpoints: [
          { id: 'w3', name: 'Opened Email?', type: 'decision', description: 'Engagement check' },
          { id: 'w4', name: 'Exclusive Offer', type: 'email', description: 'Limited-time incentive' },
          { id: 'w5', name: 'In-App Banner', type: 'inapp', description: 'Return welcome' },
        ],
      },
      {
        id: 'resolution',
        name: 'Resolution',
        subtitle: 'Outcome',
        touchpoints: [
          { id: 'r1', name: 'Re-activated?', type: 'decision', description: 'Final check' },
          { id: 'r2', name: 'Welcome Back', type: 'email', description: 'Celebration email' },
        ],
      },
    ],
  },
];

const touchpointConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  email: { icon: <Mail className="h-4 w-4" />, color: 'bg-blue-500/10 text-blue-600 border-blue-200' },
  push: { icon: <Bell className="h-4 w-4" />, color: 'bg-orange-500/10 text-orange-600 border-orange-200' },
  inapp: { icon: <Smartphone className="h-4 w-4" />, color: 'bg-purple-500/10 text-purple-600 border-purple-200' },
  decision: { icon: <Diamond className="h-4 w-4" />, color: 'bg-amber-500/10 text-amber-600 border-amber-200' },
  action: { icon: <GitBranch className="h-4 w-4" />, color: 'bg-green-500/10 text-green-600 border-green-200' },
};

export function UserJourneysTab() {
  const [selectedJourney, setSelectedJourney] = useState<string>(PLACEHOLDER_JOURNEYS[0].id);
  const journey = PLACEHOLDER_JOURNEYS.find(j => j.id === selectedJourney)!;

  return (
    <div className="space-y-6">
      {/* Journey Selector */}
      <div className="flex gap-2 flex-wrap">
        {PLACEHOLDER_JOURNEYS.map(j => (
          <button
            key={j.id}
            onClick={() => setSelectedJourney(j.id)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
              selectedJourney === j.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground hover:text-foreground border-border hover:border-primary/30"
            )}
          >
            {j.name}
          </button>
        ))}
      </div>

      {/* Journey Map - Horizontal phases */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <div className="flex min-w-max">
              {journey.phases.map((phase, phaseIdx) => (
                <div key={phase.id} className="flex">
                  {/* Phase Column */}
                  <div className="w-72 border-r last:border-r-0 border-border">
                    {/* Phase Header */}
                    <div className="p-4 border-b border-border bg-muted/30">
                      <h3 className="font-semibold text-sm">{phase.name}</h3>
                      {phase.subtitle && (
                        <p className="text-xs text-muted-foreground mt-0.5">{phase.subtitle}</p>
                      )}
                    </div>

                    {/* Touchpoints */}
                    <div className="p-4 space-y-3 min-h-[300px]">
                      {phase.touchpoints.map((tp, tpIdx) => {
                        const config = touchpointConfig[tp.type];
                        return (
                          <div key={tp.id} className="group">
                            <div className={cn(
                              "rounded-lg border p-3 transition-colors hover:shadow-sm",
                              config.color
                            )}>
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5 flex-shrink-0">{config.icon}</div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium leading-tight">{tp.name}</p>
                                  {tp.description && (
                                    <p className="text-xs opacity-70 mt-0.5">{tp.description}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                            {tpIdx < phase.touchpoints.length - 1 && (
                              <div className="flex justify-center py-1">
                                <div className="w-px h-3 bg-border" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Arrow between phases */}
                  {phaseIdx < journey.phases.length - 1 && (
                    <div className="flex items-center px-2 bg-muted/10">
                      <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.entries(touchpointConfig).map(([type, config]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={cn("h-5 w-5 rounded flex items-center justify-center border", config.color)}>
              {config.icon}
            </div>
            <span className="capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
