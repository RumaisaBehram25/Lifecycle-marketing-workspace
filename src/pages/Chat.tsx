import { useSearchParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientChat } from '@/components/chat/ClientChat';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClients, useClientPlatforms } from '@/hooks/useClients';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Plus, Sparkles } from 'lucide-react';
import brcgLogo from '@/assets/brcg-logo.png';

export default function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedClientId = searchParams.get('client');
  const { data: clients, isLoading: clientsLoading } = useClients();
  const { data: platforms } = useClientPlatforms(selectedClientId || undefined);

  const selectedClient = clients?.find(c => c.id === selectedClientId);

  // Build platform context from ALL connected platforms
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

  const handleClientChange = (clientId: string) => {
    setSearchParams({ client: clientId });
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] lg:h-screen bg-sidebar">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
          {selectedClient ? (
            <ClientChat
              key={selectedClient.id}
              client={{
                id: selectedClient.id,
                name: selectedClient.name,
                brand_voice: selectedClient.brand_voice || undefined,
                do_rules: selectedClient.do_rules as string[] | undefined,
                dont_rules: selectedClient.dont_rules as string[] | undefined,
                tone_presets: selectedClient.tone_presets as string[] | undefined,
                legal_requirements: selectedClient.legal_requirements || undefined,
              }}
              platformContext={platformContexts.length > 0 ? platformContexts : undefined}
              showHistory={true}
            />
          ) : (
            /* Welcome Screen - ChatGPT Style */
            <div className="flex-1 flex flex-col">
              {/* Top bar with client selector */}
              <div className="flex items-center justify-between p-3 sm:p-4 border-b gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <span className="font-heading font-bold text-base sm:text-lg truncate">BRCG Copilot</span>
                </div>
                <Select value={selectedClientId || ''} onValueChange={handleClientChange}>
                  <SelectTrigger className="w-[140px] sm:w-[200px] flex-shrink-0">
                    <SelectValue placeholder="Select client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clientsLoading ? (
                      <div className="p-2 flex items-center justify-center">
                        <LoadingSpinner size="sm" />
                      </div>
                    ) : clients?.length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">
                        No clients yet
                      </div>
                    ) : (
                      clients?.map(client => (
                        <SelectItem key={client.id} value={client.id}>
                          <div className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {client.name.charAt(0)}
                            </div>
                            {client.name}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Centered welcome content */}
              <div className="flex-1 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                <div className="max-w-2xl w-full text-center space-y-6 sm:space-y-8">
                  {/* Logo */}
                  <div className="flex justify-center">
                    <img 
                      src={brcgLogo} 
                      alt="BRCG" 
                      className="h-16 w-auto opacity-90"
                    />
                  </div>
                  
                  {/* Title */}
                  <div className="space-y-2">
                    <h1 className="text-2xl sm:text-4xl font-heading font-black tracking-tight">
                      How can I help you today?
                    </h1>
                    <p className="text-base sm:text-lg text-muted-foreground px-2">
                      Select a client to start generating marketing copy, building journeys, and more.
                    </p>
                  </div>

                  {/* Quick actions grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                    <QuickActionCard
                      title="Generate email copy"
                      description="On-brand marketing emails"
                    />
                    <QuickActionCard
                      title="Build customer journeys"
                      description="Multi-channel flows"
                    />
                    <QuickActionCard
                      title="Segment audiences"
                      description="Entry criteria & targeting"
                    />
                    <QuickActionCard
                      title="Platform questions"
                      description="Klaviyo, Braze, & more"
                    />
                  </div>

                  {/* No clients CTA */}
                  {!clientsLoading && clients?.length === 0 && (
                    <div className="pt-4">
                      <Button asChild size="lg">
                        <Link to="/clients/new">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Your First Client
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function QuickActionCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors cursor-default text-left group">
      <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
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
