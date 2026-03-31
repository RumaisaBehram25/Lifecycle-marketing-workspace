import { Link, useSearchParams } from 'react-router-dom';
import { useClientForChat } from '@/hooks/useClientForChat';
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
import { RefreshCw, Volume2, Palette, Ruler, Users, Route, Database, Sparkles, MessageSquare } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const RESOURCE_TABS = [
  { id: 'voice', label: 'Brand Voice', icon: Volume2 },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'rules', label: 'Rules', icon: Ruler },
  { id: 'audience', label: 'Audience', icon: Users },
  { id: 'journeys', label: 'User Journeys', icon: Route },
  { id: 'events', label: 'Events & Attributes', icon: Database },
];

function ResourceCenterContent() {
  const { client, isLoading: clientLoading, refetch } = useClientForChat();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') || 'voice';
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  if (clientLoading) {
    return <LoadingPage />;
  }

  if (!client) {
    return (
      <div className="p-6 lg:p-8">
        <p>Failed to load resources. Please refresh.</p>
        <Button onClick={() => refetch()} className="mt-4">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex">
      {/* Inline tab nav when sidebar is collapsed */}
      {isCollapsed && (
        <nav className="w-48 flex-shrink-0 border-r bg-muted/20 p-3 space-y-1 min-h-[calc(100vh-4rem)]">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-2 mb-2">Resources</p>
          {RESOURCE_TABS.map(tab => {
            const isActive = tabFromUrl === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSearchParams({ tab: tab.id })}
                className={cn(
                  "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      )}

      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            title="Resource Center"
            description="Brand guidelines, audience segments, user journeys, and data reference"
          />
          <Button
            asChild
            className="shrink-0 bg-gradient-to-r from-primary to-violet-600 text-primary-foreground shadow-md shadow-primary/20 hover:opacity-[0.97]"
          >
            <Link to="/chat" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Open AI Chat
              <Sparkles className="h-4 w-4 opacity-90" />
            </Link>
          </Button>
        </div>

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
    </div>
  );
}

export default function ResourceCenter() {
  return (
    <AppLayout>
      <ResourceCenterContent />
    </AppLayout>
  );
}
