import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  MessageSquare,
  Code,
  Palette,
  Database,
} from 'lucide-react';
import { UpcomingBriefs } from '@/components/dashboard/UpcomingBriefs';
import { PastCampaigns } from '@/components/dashboard/PastCampaigns';
import { EmbeddedChat } from '@/components/dashboard/EmbeddedChat';
import { DoubleGoodIcon } from '@/components/DoubleGoodLogo';

export default function Dashboard() {
  const quickActions = [
    { 
      name: 'Generate Lifecycle Copy', 
      description: 'Create on-brand email & push messaging',
      href: '/chat',
      icon: MessageSquare,
    },
    { 
      name: 'Generate Template Code', 
      description: 'Build Liquid/Handlebars for your platform',
      href: '/knowledge',
      icon: Code,
    },
    { 
      name: 'Update Brand Voice', 
      description: 'Refine your messaging guidelines',
      href: '/brand',
      icon: Palette,
    },
    { 
      name: 'Add Knowledge', 
      description: 'Ingest docs with Firecrawl',
      href: '/knowledge',
      icon: Database,
    },
  ];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
        {/* Brand Header */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center">
                <DoubleGoodIcon className="h-10 w-10 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">Double Good</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  CRM Copilot — Lifecycle marketing command center
                </p>
              </div>
              <Button asChild>
                <Link to="/brand">
                  <Palette className="mr-2 h-4 w-4" />
                  View Brand
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Briefs and Campaigns - Stacked */}
        <div className="grid gap-6">
          <UpcomingBriefs />
          <PastCampaigns />
        </div>

        {/* AI Chat Module */}
        <EmbeddedChat />

        {/* Quick Actions */}
        <div>
          <h2 className="font-semibold text-sm uppercase tracking-wide mb-4 text-muted-foreground">Quick Actions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <Link key={action.name} to={action.href}>
                <Card className="group hover:border-primary transition-all cursor-pointer h-full">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/10">
                        <action.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm group-hover:text-primary transition-colors">
                          {action.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
