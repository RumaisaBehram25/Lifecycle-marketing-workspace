import { useState, useCallback } from 'react';
import { useLinktreeClient, useLinktreePlatforms, useUpdateLinktreeClient } from '@/hooks/useLinktreeClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { BrandDiscoveryChat } from '@/components/client/BrandDiscoveryChat';
import { OverviewSection } from '@/components/client/OverviewSection';
import { BrandGuidelinesSection } from '@/components/client/BrandGuidelinesSection';
import { AudienceSection } from '@/components/client/AudienceSection';
import { EmailSection } from '@/components/client/EmailSection';
import { MessageSquare, RefreshCw } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ClientChat } from '@/components/chat/ClientChat';
import { useQueryClient } from '@tanstack/react-query';

export default function Brand() {
  const { data: client, isLoading: clientLoading, refetch: refetchClient } = useLinktreeClient();
  const { data: platforms } = useLinktreePlatforms();
  const updateClient = useUpdateLinktreeClient();
  const queryClient = useQueryClient();

  const [chatOpen, setChatOpen] = useState(false);

  const handleSaveAbout = useCallback(async (updates: any) => {
    await updateClient.mutateAsync(updates);
    refetchClient();
  }, [updateClient, refetchClient]);

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
          <p>Failed to load brand. Please refresh.</p>
          <Button onClick={() => refetchClient()} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </AppLayout>
    );
  }

  const connectedPlatforms = platforms?.filter((p) => p.is_connected) || [];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <PageHeader
          title="Brand Guidelines"
          description="Your Linktree brand voice, messaging, and identity"
        />

        {/* Brand Discovery with Chat */}
        <div className="mt-6">
          <BrandDiscoveryChat 
            client={{
              id: client.id,
              name: client.name,
              website_url: client.website_url,
              brand_voice: client.brand_voice,
              tagline: (client as any).tagline,
              industry: (client as any).industry,
              value_propositions: (client as any).value_propositions,
              differentiators: (client as any).differentiators,
              target_audience: (client as any).target_audience,
              key_messaging_pillars: (client as any).key_messaging_pillars,
              do_rules: client.do_rules as any,
              dont_rules: client.dont_rules as any,
            }}
            onRefreshClient={() => refetchClient()}
          />
        </div>

        <Tabs defaultValue="overview" className="mt-8">
          <TabsList className="w-full sm:w-auto h-auto flex-wrap gap-1">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="guidelines" className="text-xs sm:text-sm">Brand Guidelines</TabsTrigger>
            <TabsTrigger value="audience" className="text-xs sm:text-sm">Audience</TabsTrigger>
            <TabsTrigger value="email" className="text-xs sm:text-sm">Email</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewSection 
              client={{
                id: client.id,
                name: client.name,
                logo_url: client.logo_url,
                tagline: (client as any).tagline,
                website_url: client.website_url,
                industry: (client as any).industry,
                primary_color: (client as any).primary_color,
                secondary_color: (client as any).secondary_color,
                brand_voice: client.brand_voice,
                created_at: client.created_at,
                target_audience: (client as any).target_audience,
                differentiators: (client as any).differentiators,
                value_propositions: (client as any).value_propositions,
                do_rules: client.do_rules as string[] | null,
                dont_rules: client.dont_rules as string[] | null,
                legal_requirements: client.legal_requirements,
                competitors: (client as any).competitors,
              }}
              connectedPlatformsCount={connectedPlatforms.length}
              isAdmin={true}
              onSave={handleSaveAbout}
            />
          </TabsContent>

          <TabsContent value="guidelines" className="mt-6">
            <BrandGuidelinesSection 
              client={{
                name: client.name,
                logo_url: client.logo_url,
                tagline: (client as any).tagline,
                primary_color: (client as any).primary_color,
                secondary_color: (client as any).secondary_color,
                industry: (client as any).industry,
                brand_voice: client.brand_voice,
                tone_presets: client.tone_presets as string[] | null,
                value_propositions: (client as any).value_propositions,
                key_messaging_pillars: (client as any).key_messaging_pillars,
                copy_examples: (client as any).copy_examples,
              }}
            />
          </TabsContent>

          <TabsContent value="audience" className="mt-6">
            <AudienceSection clientId={client.id} />
          </TabsContent>

          <TabsContent value="email" className="mt-6">
            <EmailSection clientId={client.id} clientName={client.name} client={client} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating Chat Button */}
      <Button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40"
        size="icon"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>

      {/* Chat Drawer */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0">
          <ClientChat
            client={{
              id: client.id,
              name: client.name,
              brand_voice: client.brand_voice || undefined,
              do_rules: client.do_rules as string[] | undefined,
              dont_rules: client.dont_rules as string[] | undefined,
              tone_presets: client.tone_presets as string[] | undefined,
            }}
          />
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
