import { useSearchParams } from 'react-router-dom';
import { useDoubleGoodClient } from '@/hooks/useDoubleGoodClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { BrandVoiceTab } from '@/components/brand/BrandVoiceTab';
import { DesignTab } from '@/components/brand/DesignTab';
import { RulesTab } from '@/components/brand/RulesTab';
import { AudienceTab } from '@/components/lifecycle/AudienceTab';
import { UserJourneysTab } from '@/components/resource/UserJourneysTab';
import { EventsAttributesTab } from '@/components/resource/EventsAttributesTab';
import { PageHeader } from '@/components/ui/page-header';
import { RefreshCw } from 'lucide-react';

export default function ResourceCenter() {
  const { data: client, isLoading: clientLoading, refetch: refetchClient } = useDoubleGoodClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') || 'voice';

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

        {tabFromUrl === 'voice' && (
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
        )}

        {tabFromUrl === 'design' && <DesignTab clientId={client.id} />}
        {tabFromUrl === 'rules' && <RulesTab clientId={client.id} />}
        {tabFromUrl === 'audience' && <AudienceTab />}
        {tabFromUrl === 'journeys' && <UserJourneysTab />}
        {tabFromUrl === 'events' && <EventsAttributesTab />}
      </div>
    </AppLayout>
  );
}
