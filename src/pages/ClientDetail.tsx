import { useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useClient, useClientPlatforms, useUpdateClient, useConnectPlatform, useDisconnectPlatform } from '@/hooks/useClients';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Link as LinkIcon, Unlink, MessageSquare } from 'lucide-react';
import { KlaviyoDataViewer } from '@/components/platforms/KlaviyoDataViewer';
import { IterableDataViewer } from '@/components/platforms/IterableDataViewer';
import { ClientChat } from '@/components/chat/ClientChat';
import { BrandDiscoveryChat } from '@/components/client/BrandDiscoveryChat';
import { OverviewSection } from '@/components/client/OverviewSection';
import { BrandGuidelinesSection } from '@/components/client/BrandGuidelinesSection';
import { AudienceSection } from '@/components/client/AudienceSection';
import { EmailSection } from '@/components/client/EmailSection';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { PlatformType } from '@/lib/types';
import { PLATFORM_INFO } from '@/lib/types';

const ALL_PLATFORMS: PlatformType[] = ['braze', 'klaviyo', 'iterable', 'customerio', 'hubspot'];

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: client, isLoading: clientLoading, refetch: refetchClient } = useClient(id);
  const { data: platforms, isLoading: platformsLoading, refetch: refetchPlatforms } = useClientPlatforms(id);
  const updateClient = useUpdateClient();
  const connectPlatform = useConnectPlatform();
  const disconnectPlatform = useDisconnectPlatform();

  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Platform connection dialog
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');

  // Chat drawer state
  const [chatOpen, setChatOpen] = useState(false);
  const [isSyncingForChat, setIsSyncingForChat] = useState(false);

  const handleSyncPlatformForChat = useCallback(async () => {
    const connectedPlatformsList = platforms?.filter((p) => p.is_connected) || [];
    const klaviyoPlatform = connectedPlatformsList.find(cp => cp.platform === 'klaviyo');
    if (!klaviyoPlatform || !client) return;

    setIsSyncingForChat(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-klaviyo', {
        body: { clientId: client.id, platformId: klaviyoPlatform.id },
      });
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['client-platforms', client.id] });
      await refetchPlatforms();
      
      toast({
        title: 'Platform data synced',
        description: `Found ${data.data?.metrics?.length || 0} events, ${data.data?.lists?.length || 0} lists`,
      });
    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Failed to sync platform data',
        variant: 'destructive',
      });
    } finally {
      setIsSyncingForChat(false);
    }
  }, [platforms, client, queryClient, refetchPlatforms, toast]);

  const handleSaveChanges = useCallback(async () => {
    if (!client) return;
    await updateClient.mutateAsync({
      id: client.id,
      name: name || client.name,
      brand_voice: brandVoice || client.brand_voice,
      is_active: isActive,
    });
    setEditMode(false);
  }, [client, name, brandVoice, isActive, updateClient]);

  const handleSaveAbout = useCallback(async (updates: any) => {
    if (!client) return;
    await updateClient.mutateAsync({ id: client.id, ...updates });
    refetchClient();
  }, [client, updateClient, refetchClient]);

  const handleConnectPlatform = useCallback(async () => {
    if (!selectedPlatform || !apiKey || !client) return;
    
    await connectPlatform.mutateAsync({
      clientId: client.id,
      platform: selectedPlatform,
      apiKey,
      apiSecret: apiSecret || undefined,
    });
    
    setConnectDialogOpen(false);
    setSelectedPlatform(null);
    setApiKey('');
    setApiSecret('');
  }, [selectedPlatform, apiKey, apiSecret, client, connectPlatform]);

  const handleDisconnectPlatform = useCallback(async (platform: PlatformType) => {
    if (!client) return;
    await disconnectPlatform.mutateAsync({
      clientId: client.id,
      platform,
    });
  }, [client, disconnectPlatform]);

  const openConnectDialog = useCallback((platform: PlatformType) => {
    setSelectedPlatform(platform);
    setConnectDialogOpen(true);
  }, []);

  if (clientLoading || platformsLoading) {
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
          <p>Client not found.</p>
          <Button asChild className="mt-4">
            <Link to="/clients">Back to Clients</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const connectedPlatforms = platforms?.filter((p) => p.is_connected) || [];
  const availablePlatforms = ALL_PLATFORMS.filter(
    (p) => !connectedPlatforms.some((cp) => cp.platform === p)
  );

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <Button variant="ghost" className="mb-4" onClick={() => navigate('/clients')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Clients
        </Button>

        <PageHeader
          title={client.name}
          actions={
            <div className="flex gap-2">
              {isAdmin && !editMode && (
                <Button onClick={() => {
                  setName(client.name);
                  setBrandVoice(client.brand_voice || '');
                  setIsActive(client.is_active);
                  setEditMode(true);
                }}>
                  Edit Client
                </Button>
              )}
            </div>
          }
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
            <TabsTrigger value="platforms" className="text-xs sm:text-sm">Platforms</TabsTrigger>
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
              isAdmin={isAdmin}
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

          <TabsContent value="platforms" className="mt-6 space-y-6">
            {connectedPlatforms.map((cp) => {
              if (cp.platform === 'klaviyo') {
                return (
                  <KlaviyoDataViewer
                    key={cp.id}
                    clientId={client.id}
                    platformId={cp.id}
                    schemaCache={cp.schema_cache as any}
                    lastSyncAt={cp.last_sync_at || undefined}
                  />
                );
              }
              if (cp.platform === 'iterable') {
                return (
                  <IterableDataViewer
                    key={cp.id}
                    clientId={client.id}
                    platformId={cp.id}
                    schemaCache={cp.schema_cache as any}
                    lastSyncAt={cp.last_sync_at || undefined}
                  />
                );
              }
              return null;
            })}

            <Card>
              <CardHeader>
                <CardTitle>Connected Platforms</CardTitle>
                <CardDescription>Platforms configured for this client.</CardDescription>
              </CardHeader>
              <CardContent>
                {connectedPlatforms.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No platforms connected yet.</p>
                ) : (
                  <div className="space-y-3">
                    {connectedPlatforms.map((cp) => (
                      <div key={cp.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <PlatformBadge platform={cp.platform} />
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">
                              Connected {new Date(cp.created_at).toLocaleDateString()}
                            </span>
                            {cp.last_sync_at && (
                              <span className="text-xs text-green-600">
                                Synced {new Date(cp.last_sync_at).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => handleDisconnectPlatform(cp.platform)}
                          >
                            <Unlink className="mr-2 h-4 w-4" />
                            Disconnect
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {isAdmin && availablePlatforms.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Add Platform</CardTitle>
                  <CardDescription>Connect additional marketing platforms.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {availablePlatforms.map((platform) => (
                      <button
                        key={platform}
                        onClick={() => openConnectDialog(platform)}
                        className="flex items-center gap-3 p-4 rounded-lg border border-dashed hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <span className="text-2xl">{PLATFORM_INFO[platform].icon}</span>
                        <div className="text-left">
                          <p className="font-medium">{PLATFORM_INFO[platform].name}</p>
                          <p className="text-xs text-muted-foreground">Click to connect</p>
                        </div>
                        <LinkIcon className="ml-auto h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

        </Tabs>
      </div>

      {/* Connect Platform Dialog */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Connect {selectedPlatform && PLATFORM_INFO[selectedPlatform].name}
            </DialogTitle>
            <DialogDescription>
              Enter the API credentials for this platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key *</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter API key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiSecret">API Secret (optional)</Label>
              <Input
                id="apiSecret"
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter API secret if required"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnectPlatform} disabled={!apiKey || connectPlatform.isPending}>
              {connectPlatform.isPending && <LoadingSpinner size="sm" className="mr-2" />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              legal_requirements: client.legal_requirements || undefined,
            }}
            platformContext={connectedPlatforms
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
              }))
            }
            onClose={() => setChatOpen(false)}
            isDrawer={true}
            hasPlatformConnections={connectedPlatforms.length > 0}
            onSyncPlatform={handleSyncPlatformForChat}
            isSyncing={isSyncingForChat}
          />
        </SheetContent>
      </Sheet>
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
