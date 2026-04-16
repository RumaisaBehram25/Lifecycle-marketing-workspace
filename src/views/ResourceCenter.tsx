/**
 * Resource Center — `/resources`
 *
 * Tab query: `?tab=voice|design|rules|audience|events`. Unknown values fall back to Brand Voice.
 * Legacy `?tab=journeys` redirects to Brand Voice (journeys live under Lifecycle).
 * Sidebar deep links must stay in sync with `RESOURCE_TABS` and `AppSidebar` `resourceSubItems`.
 */
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useClientForChat } from '@/hooks/useClientForChat';
import { Button } from '@/components/ui/button';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { BrandVoiceTab } from '@/components/brand/BrandVoiceTab';
import { DesignTab } from '@/components/brand/DesignTab';
import { RulesTab } from '@/components/brand/RulesTab';
import { AudienceTab } from '@/components/lifecycle/AudienceTab';
import { EventsAttributesTab } from '@/components/resource/EventsAttributesTab';
import { PageHeader } from '@/components/ui/page-header';
import { RefreshCw, Volume2, Palette, Ruler, Users, Database, Sparkles, MessageSquare } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const RESOURCE_TABS = [
  { id: 'voice', label: 'Brand Voice', icon: Volume2 },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'rules', label: 'Rules', icon: Ruler },
  { id: 'audience', label: 'Audience', icon: Users },
  { id: 'events', label: 'Events & Attributes', icon: Database },
] as const;

const RESOURCE_TAB_IDS = new Set<string>(RESOURCE_TABS.map((t) => t.id));
const LEGACY_RESOURCE_TAB_JOURNEYS = 'journeys';

function ResourceCenterContent() {
  const queryClient = useQueryClient();
  const { client, isLoading: clientLoading, refetch } = useClientForChat();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');

  const activeTab = useMemo(() => {
    if (!rawTab || rawTab === LEGACY_RESOURCE_TAB_JOURNEYS || !RESOURCE_TAB_IDS.has(rawTab)) {
      return 'voice';
    }
    return rawTab;
  }, [rawTab]);

  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  useEffect(() => {
    if (
      rawTab === LEGACY_RESOURCE_TAB_JOURNEYS ||
      (rawTab && !RESOURCE_TAB_IDS.has(rawTab))
    ) {
      setSearchParams({ tab: 'voice' }, { replace: true });
    }
  }, [rawTab, setSearchParams]);

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

  /** Keeps Resource Center + AI Chat in sync: same React Query key as `useClientForChat` / Chat. CRM Copilot still reloads brand fields from DB on every `ops-chat` request. */
  const invalidateWorkspaceClient = () => {
    void refetch();
    queryClient.invalidateQueries({ queryKey: ['client-row-for-chat', client.id] });
  };

  return (
    <div className="flex w-full min-w-0 max-w-full">
      {/* Inline tab nav when sidebar is collapsed */}
      {isCollapsed && (
        <nav className="w-48 flex-shrink-0 border-r bg-muted/20 p-3 space-y-1 min-h-[calc(100vh-4rem)]">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-2 mb-2">Resources</p>
          {RESOURCE_TABS.map(tab => {
            const isActive = activeTab === tab.id;
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

      <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex w-full min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <PageHeader
              title="Resource Center"
              description="Brand guidelines, audience segments, and data reference — star segments here and draft copy in CRM Copilot."
            />
          </div>
          <Button
            asChild
            className="w-full shrink-0 bg-gradient-to-r from-primary to-violet-600 text-primary-foreground shadow-md shadow-primary/20 hover:opacity-[0.97] sm:w-auto"
          >
            <Link to="/chat" className="inline-flex items-center justify-center gap-2">
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Open AI Chat</span>
              <Sparkles className="h-4 w-4 shrink-0 opacity-90" />
            </Link>
          </Button>
        </div>

        {activeTab === 'voice' && (
          <BrandVoiceTab 
            clientId={client.id}
            onSaved={invalidateWorkspaceClient}
            client={{
              brand_voice: client.brand_voice,
              do_rules: Array.isArray(client.do_rules) ? client.do_rules as string[] : null,
              dont_rules: Array.isArray(client.dont_rules) ? client.dont_rules as string[] : null,
              tone_presets: Array.isArray(client.tone_presets) ? client.tone_presets as string[] : null,
              value_propositions: Array.isArray((client as any).value_propositions) 
                ? (client as any).value_propositions as string[] 
                : null,
              key_messaging_pillars: Array.isArray((client as any).key_messaging_pillars)
                ? (client as any).key_messaging_pillars as string[]
                : null,
            }}
          />
        )}

        {activeTab === 'design' && <DesignTab clientId={client.id} />}
        {activeTab === 'rules' && (
          <RulesTab
            clientId={client.id}
            initialCopyRules={client.copy_rules}
            onPersist={invalidateWorkspaceClient}
          />
        )}
        {activeTab === 'audience' && <AudienceTab />}
        {activeTab === 'events' && <EventsAttributesTab />}
      </div>
    </div>
  );
}

export default function ResourceCenter() {
  return <ResourceCenterContent />;
}
