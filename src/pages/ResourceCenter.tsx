import { useState } from 'react';
import { useDoubleGoodClient } from '@/hooks/useDoubleGoodClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrandVoiceTab } from '@/components/brand/BrandVoiceTab';
import { DesignTab } from '@/components/brand/DesignTab';
import { RulesTab } from '@/components/brand/RulesTab';
import { AudienceTab } from '@/components/lifecycle/AudienceTab';
import { UserJourneysTab } from '@/components/resource/UserJourneysTab';
import { EventsAttributesTab } from '@/components/resource/EventsAttributesTab';
import { OnboardingTab } from '@/components/resource/OnboardingTab';
import { PageHeader } from '@/components/ui/page-header';
import { 
  Volume2,
  Palette,
  Ruler,
  Users,
  Route,
  Database,
  RefreshCw,
  ClipboardList,
} from 'lucide-react';

export default function ResourceCenter() {
  const { data: client, isLoading: clientLoading, refetch: refetchClient } = useDoubleGoodClient();

  if (clientLoading) {
    return (
      <AppLayout>
        <LoadingPage />
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout>
        <div className="p-6 lg:p-8">
          <p>Failed to load resources. Please refresh.</p>
          <Button onClick={() => refetchClient()} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Resource Center"
          description="Brand guidelines, audience segments, user journeys, and data reference"
        />

        <Tabs defaultValue="onboarding" className="space-y-6">
          <TabsList className="bg-muted/50 p-1 flex-wrap h-auto gap-1">
            <TabsTrigger value="onboarding" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Onboarding
            </TabsTrigger>
            <TabsTrigger value="voice" className="gap-2">
              <Volume2 className="h-4 w-4" />
              Brand Voice
            </TabsTrigger>
            <TabsTrigger value="design" className="gap-2">
              <Palette className="h-4 w-4" />
              Design
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2">
              <Ruler className="h-4 w-4" />
              Rules
            </TabsTrigger>
            <TabsTrigger value="audience" className="gap-2">
              <Users className="h-4 w-4" />
              Audience
            </TabsTrigger>
            <TabsTrigger value="journeys" className="gap-2">
              <Route className="h-4 w-4" />
              User Journeys
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-2">
              <Database className="h-4 w-4" />
              Events & Attributes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="onboarding">
            <OnboardingTab />
          </TabsContent>

          <TabsContent value="voice">
            <BrandVoiceTab 
              client={{
                brand_voice: client.brand_voice,
                do_rules: Array.isArray(client.do_rules) ? client.do_rules as string[] : null,
                dont_rules: Array.isArray(client.dont_rules) ? client.dont_rules as string[] : null,
                value_propositions: Array.isArray((client as any).value_propositions) 
                  ? (client as any).value_propositions as string[] 
                  : null,
                key_messaging_pillars: Array.isArray((client as any).key_messaging_pillars)
                  ? (client as any).key_messaging_pillars as string[]
                  : null,
              }}
            />
          </TabsContent>

          <TabsContent value="design">
            <DesignTab clientId={client.id} />
          </TabsContent>

          <TabsContent value="rules">
            <RulesTab clientId={client.id} />
          </TabsContent>

          <TabsContent value="audience">
            <AudienceTab />
          </TabsContent>

          <TabsContent value="journeys">
            <UserJourneysTab />
          </TabsContent>

          <TabsContent value="events">
            <EventsAttributesTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
