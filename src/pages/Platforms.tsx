import { useState, useCallback } from 'react';
import { useDoubleGoodClient, useDoubleGoodPlatforms, useConnectPlatform, useDisconnectPlatform } from '@/hooks/useDoubleGoodClient';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { PlatformBadge } from '@/components/ui/platform-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link as LinkIcon, Unlink } from 'lucide-react';
import { KlaviyoDataViewer } from '@/components/platforms/KlaviyoDataViewer';
import { IterableDataViewer } from '@/components/platforms/IterableDataViewer';
import { BrazeDataViewer } from '@/components/platforms/BrazeDataViewer';
import { CustomerIODataViewer } from '@/components/platforms/CustomerIODataViewer';
import { useToast } from '@/hooks/use-toast';
import type { PlatformType } from '@/lib/types';
import { PLATFORM_INFO } from '@/lib/types';

const ALL_PLATFORMS: PlatformType[] = ['customerio', 'braze', 'klaviyo', 'iterable', 'hubspot'];

export default function Platforms() {
  const { data: client, isLoading: clientLoading } = useDoubleGoodClient();
  const { data: platforms, isLoading: platformsLoading, refetch: refetchPlatforms } = useDoubleGoodPlatforms();
  const connectPlatform = useConnectPlatform();
  const disconnectPlatform = useDisconnectPlatform();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Platform connection dialog
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');

  const handleConnectPlatform = useCallback(async () => {
    if (!selectedPlatform || !apiKey) return;
    
    await connectPlatform.mutateAsync({
      platform: selectedPlatform,
      apiKey,
      apiSecret: apiSecret || undefined,
    });
    
    setConnectDialogOpen(false);
    setSelectedPlatform(null);
    setApiKey('');
    setApiSecret('');
  }, [selectedPlatform, apiKey, apiSecret, connectPlatform]);

  const handleDisconnectPlatform = useCallback(async (platform: PlatformType) => {
    await disconnectPlatform.mutateAsync(platform);
  }, [disconnectPlatform]);

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

  const connectedPlatforms = platforms?.filter((p) => p.is_connected) || [];
  const availablePlatforms = ALL_PLATFORMS.filter(
    (p) => !connectedPlatforms.some((cp) => cp.platform === p)
  );

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="Platforms"
          description="Connect your marketing platforms to generate platform-specific code"
        />

        {/* Platform Data Viewers */}
        {connectedPlatforms.map((cp) => {
          if (cp.platform === 'braze' && client) {
            return (
              <BrazeDataViewer
                key={cp.id}
                clientId={client.id}
                platformId={cp.id}
                schemaCache={cp.schema_cache as any}
                lastSyncAt={cp.last_sync_at || undefined}
                onSyncComplete={() => refetchPlatforms()}
              />
            );
          }
          if (cp.platform === 'klaviyo' && client) {
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
          if (cp.platform === 'iterable' && client) {
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
          if (cp.platform === 'customerio' && client) {
            return (
              <CustomerIODataViewer
                key={cp.id}
                clientId={client.id}
                platformId={cp.id}
              />
            );
          }
          return null;
        })}
        {/* Connected Platforms */}
        <Card>
          <CardHeader>
            <CardTitle>Connected Platforms</CardTitle>
            <CardDescription>Platforms configured for generating lifecycle code.</CardDescription>
          </CardHeader>
          <CardContent>
            {connectedPlatforms.length === 0 ? (
              <p className="text-muted-foreground text-sm">No platforms connected yet. Connect a platform to generate platform-specific template code.</p>
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
                          <span className="text-xs text-primary">
                            Synced {new Date(cp.last_sync_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDisconnectPlatform(cp.platform)}
                    >
                      <Unlink className="mr-2 h-4 w-4" />
                      Disconnect
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Platform */}
        {availablePlatforms.length > 0 && (
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
    </AppLayout>
  );
}
