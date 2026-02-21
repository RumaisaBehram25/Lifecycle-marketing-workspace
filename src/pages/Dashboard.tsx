import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Palette } from 'lucide-react';
import { UpcomingBriefs } from '@/components/dashboard/UpcomingBriefs';
import { PastCampaigns } from '@/components/dashboard/PastCampaigns';
import { EmbeddedChat } from '@/components/dashboard/EmbeddedChat';
import { BRCGIcon, BRCGLogo } from '@/components/BRCGLogo';

export default function Dashboard() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
        {/* Brand Header */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center">
                <BRCGIcon className="h-10 w-10 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <BRCGLogo className="h-8 w-auto text-foreground" />
                <p className="text-sm text-muted-foreground mt-1">
                  CRM Copilot — Lifecycle marketing command center
                </p>
              </div>
              <Button asChild>
                <Link to="/resources">
                  <Palette className="mr-2 h-4 w-4" />
                  Resources
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
      </div>
    </AppLayout>
  );
}
