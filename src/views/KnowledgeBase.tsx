import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { DocumentPreview } from '@/components/knowledge/DocumentPreview';
import { SyncStatus } from '@/components/knowledge/SyncStatus';
import { CodeGeneratorEmbed } from '@/components/knowledge/CodeGeneratorEmbed';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDoubleGoodClient, useDoubleGoodPlatforms, useConnectPlatform, useDisconnectPlatform } from '@/hooks/useDoubleGoodClient';
import { 
  Database, 
  Plus, 
  Globe, 
  FileText, 
  Trash2, 
  RefreshCw, 
  Eye,
  BookOpen,
  Sparkles,
  Search,
  Filter,
  FolderOpen,
  Link as LinkIcon,
  Unlink,
} from 'lucide-react';
import type { KnowledgeDocument, PlatformType } from '@/lib/types';
import { PLATFORM_INFO } from '@/lib/types';

const VENDOR_DOCS = [
  { platform: 'braze', name: 'Braze Documentation', url: 'https://www.braze.com/docs' },
  { platform: 'klaviyo', name: 'Klaviyo Documentation', url: 'https://developers.klaviyo.com' },
  { platform: 'iterable', name: 'Iterable Documentation', url: 'https://support.iterable.com' },
  { platform: 'customerio', name: 'Customer.io Documentation', url: 'https://customer.io/docs' },
  { platform: 'hubspot', name: 'HubSpot Documentation', url: 'https://developers.hubspot.com' },
];

const CATEGORY_ICONS: Record<string, string> = {
  'liquid_templating': '🧪',
  'api_reference': '📡',
  'flows_journeys': '🔄',
  'segmentation': '🎯',
  'channels_email': '📧',
  'channels_push': '📱',
  'channels_sms': '💬',
  'analytics': '📊',
  'integrations': '🔗',
  'best_practices': '✨',
  'webhooks': '🪝',
  'data_management': '🗄️',
};

const ALL_PLATFORMS: PlatformType[] = ['braze', 'klaviyo', 'iterable', 'customerio', 'hubspot'];

export default function KnowledgeBase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Platform connection hooks
  const { data: client } = useDoubleGoodClient();
  const { data: platforms, refetch: refetchPlatforms } = useDoubleGoodPlatforms();
  const connectPlatform = useConnectPlatform();
  const disconnectPlatform = useDisconnectPlatform();

  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [platform, setPlatform] = useState<PlatformType | ''>('');
  const [isVendorDoc, setIsVendorDoc] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<KnowledgeDocument | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  
  // Platform connection dialog
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');

  const { data: documents, isLoading } = useQuery({
    queryKey: ['knowledge-documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as KnowledgeDocument[];
    },
  });

  const ingestMutation = useMutation({
    mutationFn: async (sourceUrl: string) => {
      const { data, error } = await supabase.functions.invoke('ingest-knowledge', {
        body: { 
          url: sourceUrl,
          category,
          platform: platform || null,
          is_vendor_doc: isVendorDoc,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-documents'] });
      toast({ title: 'Document ingested', description: 'Knowledge has been added to the database.' });
      setUrl('');
      setCategory('');
      setPlatform('');
    },
    onError: (error: Error) => {
      toast({ title: 'Ingestion failed', description: error.message, variant: 'destructive' });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('refresh-vendor-docs');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-documents'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-sync-logs'] });
      toast({ 
        title: 'Sync started', 
        description: 'Crawling all platform documentation. This may take a few minutes.' 
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Refresh failed', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('knowledge_documents')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-documents'] });
      toast({ title: 'Document deleted', description: 'Knowledge has been removed.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleIngest = () => {
    if (!url.trim()) {
      toast({ title: 'URL required', description: 'Please enter a URL to ingest.', variant: 'destructive' });
      return;
    }
    ingestMutation.mutate(url);
  };

  // Platform connection handlers
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

  const handleDisconnectPlatform = useCallback(async (platformType: PlatformType) => {
    await disconnectPlatform.mutateAsync(platformType);
  }, [disconnectPlatform]);

  const openConnectDialog = useCallback((platformType: PlatformType) => {
    setSelectedPlatform(platformType);
    setConnectDialogOpen(true);
  }, []);

  const connectedPlatforms = platforms?.filter((p) => p.is_connected) || [];
  const availablePlatforms = ALL_PLATFORMS.filter(
    (p) => !connectedPlatforms.some((cp) => cp.platform === p)
  );

  // Computed values
  const vendorDocs = useMemo(() => documents?.filter((d) => d.is_vendor_doc) || [], [documents]);
  const customDocs = useMemo(() => documents?.filter((d) => !d.is_vendor_doc) || [], [documents]);
  
  const totalWords = useMemo(() => {
    return documents?.reduce((acc, doc) => acc + doc.content.split(/\s+/).length, 0) || 0;
  }, [documents]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    documents?.forEach(doc => {
      const cat = doc.category || 'uncategorized';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [documents]);

  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    documents?.forEach(doc => {
      if (doc.platform) {
        counts[doc.platform] = (counts[doc.platform] || 0) + 1;
      }
    });
    return counts;
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    if (!documents) return [];
    return documents.filter(doc => {
      const matchesSearch = !searchQuery || 
        doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.category?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlatform = filterPlatform === 'all' || doc.platform === filterPlatform;
      return matchesSearch && matchesPlatform;
    });
  }, [documents, searchQuery, filterPlatform]);

  if (isLoading) {
    return (
      <AppLayout>
        <LoadingPage />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
        <PageHeader
          title="Integrations"
          description="Connect your marketing platforms and generate platform-specific code"
        />

        <Tabs defaultValue="integrations" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="integrations" className="gap-2">
              <LinkIcon className="h-4 w-4" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-2">
              <Database className="h-4 w-4" />
              Code Generator
            </TabsTrigger>
          </TabsList>

          {/* Code Generator Tab - Fully Embedded */}
          <TabsContent value="code" className="space-y-6">
            <CodeGeneratorEmbed />
          </TabsContent>


          {/* Integrations Tab */}
          <TabsContent value="integrations" className="space-y-6">
            {/* Connected Platforms */}
            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <LinkIcon className="h-5 w-5" />
                    Connected Platforms
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    Connect your marketing platforms to sync data and generate platform-specific code.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}
                >
                  {refreshMutation.isPending ? (
                    <><LoadingSpinner size="sm" className="mr-2" />Syncing...</>
                  ) : (
                    <><RefreshCw className="mr-2 h-4 w-4" />Sync Docs</>
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                {connectedPlatforms.length === 0 ? (
                  <div className="text-center py-8">
                    <LinkIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No platforms connected yet.</p>
                    <p className="text-sm text-muted-foreground mt-1">Connect a platform below to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {connectedPlatforms.map((cp) => {
                      const platformDocs = vendorDocs.filter((d) => d.platform === cp.platform);
                      return (
                        <div key={cp.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
                              {PLATFORM_INFO[cp.platform].icon}
                            </div>
                            <div>
                              <p className="font-medium">{PLATFORM_INFO[cp.platform].name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Connected {new Date(cp.created_at).toLocaleDateString()}</span>
                                {cp.last_sync_at && (
                                  <>
                                    <span>•</span>
                                    <span className="text-primary">Synced {new Date(cp.last_sync_at).toLocaleString()}</span>
                                  </>
                                )}
                                {platformDocs.length > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="text-success">{platformDocs.length} docs</span>
                                  </>
                                )}
                              </div>
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
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Available Platforms */}
            {availablePlatforms.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Add Platform</CardTitle>
                  <CardDescription>Connect additional marketing platforms.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {availablePlatforms.map((platformType) => (
                      <button
                        key={platformType}
                        onClick={() => openConnectDialog(platformType)}
                        className="flex items-center gap-3 p-4 rounded-lg border border-dashed hover:border-primary hover:bg-primary/5 transition-colors text-left"
                      >
                        <span className="text-2xl">{PLATFORM_INFO[platformType].icon}</span>
                        <div>
                          <p className="font-medium">{PLATFORM_INFO[platformType].name}</p>
                          <p className="text-xs text-muted-foreground">Click to connect</p>
                        </div>
                        <LinkIcon className="ml-auto h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Ingest URL */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Add Custom Document
                </CardTitle>
                <CardDescription>
                  Ingest content from any URL into your knowledge base.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>URL</Label>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com/documentation"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Platform (optional)</Label>
                    <Select value={platform || 'none'} onValueChange={(v) => setPlatform(v === 'none' ? '' : v as PlatformType)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {Object.entries(PLATFORM_INFO).map(([key, info]) => (
                          <SelectItem key={key} value={key}>
                            {info.icon} {info.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button 
                  onClick={handleIngest} 
                  disabled={ingestMutation.isPending}
                  size="sm"
                >
                  {ingestMutation.isPending ? (
                    <><LoadingSpinner size="sm" className="mr-2" />Ingesting...</>
                  ) : (
                    <><Plus className="mr-2 h-4 w-4" />Ingest Content</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        <DocumentPreview 
          document={previewDoc} 
          open={!!previewDoc} 
          onOpenChange={(open) => !open && setPreviewDoc(null)} 
        />

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
      </div>
    </AppLayout>
  );
}
