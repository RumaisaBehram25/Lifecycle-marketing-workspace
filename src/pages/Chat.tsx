import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientChat } from '@/components/chat/ClientChat';
import { useDoubleGoodClient, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { Sparkles } from 'lucide-react';
import { BRCGIcon } from '@/components/BRCGLogo';

export default function Chat() {
  const [searchParams] = useSearchParams();
  const initialConversationId = searchParams.get('conversation') || undefined;
  const { data: client, isLoading: clientLoading } = useDoubleGoodClient();
  const { data: platforms } = useDoubleGoodPlatforms();

  const connectedPlatforms = platforms?.filter(p => p.is_connected) || [];
  const platformContexts = connectedPlatforms
    .filter(cp => cp.schema_cache)
    .map(cp => ({
      platform: cp.platform,
      events: (cp.schema_cache as any)?.metrics?.map((m: any) => m.name) || [],
      lists: (cp.schema_cache as any)?.lists?.map((l: any) => ({ 
        name: l.name, 
        count: l.profile_count 
      })) || [],
      templates: (cp.schema_cache as any)?.templates?.map((t: any) => t.name) || [],
      profile_properties: extractProfileProperties((cp.schema_cache as any)?.sample_profiles || []),
      segments: (cp.schema_cache as any)?.segments?.map((s: any) => s.name) || [],
      last_sync_at: cp.last_sync_at || undefined,
    }));

  if (clientLoading) {
    return (
      <AppLayout>
        <LoadingPage />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] lg:h-screen bg-sidebar">
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
          {client ? (
            <ClientChat
              key={client.id}
              client={{
                id: client.id,
                name: client.name,
                brand_voice: client.brand_voice || undefined,
                do_rules: client.do_rules as string[] | undefined,
                dont_rules: client.dont_rules as string[] | undefined,
                tone_presets: client.tone_presets as string[] | undefined,
                legal_requirements: client.legal_requirements || undefined,
              }}
              platformContext={platformContexts.length > 0 ? platformContexts : undefined}
              showHistory={true}
              initialConversationId={initialConversationId}
            />
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between p-3 sm:p-4 border-b gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <span className="font-bold text-base sm:text-lg truncate">BRCG Copilot</span>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                <div className="max-w-2xl w-full text-center space-y-6 sm:space-y-8">
                  <div className="flex justify-center">
                    <div className="h-20 w-20 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/30">
                      <BRCGIcon className="h-12 w-12 text-primary-foreground" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
                      How can I help you today?
                    </h1>
                    <p className="text-base sm:text-lg text-muted-foreground px-2">
                      Generate on-brand lifecycle marketing copy and build customer journeys.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function extractProfileProperties(sampleProfiles: any[]): string[] {
  const properties = new Set<string>();
  sampleProfiles.forEach(profile => {
    const extractProps = (obj: any, prefix = '') => {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach(key => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        properties.add(fullKey);
        if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          extractProps(obj[key], fullKey);
        }
      });
    };
    extractProps(profile);
  });
  return Array.from(properties);
}
