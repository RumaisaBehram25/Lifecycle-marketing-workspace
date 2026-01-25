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
import { useLinktreeClient, useLinktreePlatforms, useConnectPlatform, useDisconnectPlatform } from '@/hooks/useLinktreeClient';
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
  const { data: client } = useLinktreeClient();
  const { data: platforms, refetch: refetchPlatforms } = useLinktreePlatforms();
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
          title="Knowledge Base"
          description="AI-powered documentation that grounds every response"
        />

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading font-bold text-xs uppercase tracking-wide text-muted-foreground">
                    Total Documents
                  </p>
                  <p className="font-heading font-black text-2xl mt-1">{documents?.length || 0}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Database className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading font-bold text-xs uppercase tracking-wide text-muted-foreground">
                    Platform Docs
                  </p>
                  <p className="font-heading font-black text-2xl mt-1">{vendorDocs.length}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-accent-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading font-bold text-xs uppercase tracking-wide text-muted-foreground">
                    Custom Docs
                  </p>
                  <p className="font-heading font-black text-2xl mt-1">{customDocs.length}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <FolderOpen className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading font-bold text-xs uppercase tracking-wide text-muted-foreground">
                    Total Words
                  </p>
                  <p className="font-heading font-black text-2xl mt-1">{totalWords.toLocaleString()}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
            <TabsTrigger value="platforms" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Platform Docs
            </TabsTrigger>
            <TabsTrigger value="ingest" className="gap-2">
              <Plus className="h-4 w-4" />
              Add New
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
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Connected Platforms
                </CardTitle>
                <CardDescription>
                  Connect your marketing platforms to sync data and generate platform-specific code.
                </CardDescription>
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
                    {connectedPlatforms.map((cp) => (
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
                    ))}
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
          </TabsContent>

          {/* Platform Docs Tab */}
          <TabsContent value="platforms" className="space-y-6">
            <SyncStatus />
            
            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Platform Documentation
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    Comprehensive docs from all marketing platforms. Auto-crawls up to 150 pages per platform.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}
                >
                  {refreshMutation.isPending ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync All Platforms
                    </>
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {VENDOR_DOCS.map((vendor) => {
                    const platformDocs = vendorDocs.filter((d) => d.platform === vendor.platform);
                    const platformInfo = PLATFORM_INFO[vendor.platform as PlatformType];
                    const isSynced = platformDocs.length > 0;
                    
                    return (
                      <Card
                        key={vendor.platform}
                        className={`transition-all ${isSynced ? 'border-success/30 bg-success/5' : ''}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`h-12 w-12 rounded-lg flex items-center justify-center text-2xl ${
                              isSynced ? 'bg-success/10' : 'bg-muted'
                            }`}>
                              {platformInfo.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium">{vendor.name}</h3>
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {isSynced ? (
                                  <span className="text-success font-medium">
                                    ✓ {platformDocs.length} pages synced
                                  </span>
                                ) : (
                                  'Not synced yet'
                                )}
                              </p>
                              {isSynced && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {platformDocs.reduce((acc, d) => acc + d.content.split(/\s+/).length, 0).toLocaleString()} words
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ingest Tab */}
          <TabsContent value="ingest" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Ingest from URL
                  </CardTitle>
                  <CardDescription>
                    Use Firecrawl to scrape and ingest content from any webpage into your knowledge base.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com/documentation"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Category (optional)</Label>
                      <Input
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="e.g., API Docs, Brand Guide"
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
                    className="w-full"
                  >
                    {ingestMutation.isPending ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        Ingesting...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Ingest Content
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-primary/5 border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    How It Works
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                        1
                      </div>
                      <div>
                        <p className="font-medium">Ingest Documents</p>
                        <p className="text-sm text-muted-foreground">Add URLs or sync platform docs to build your knowledge base.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                        2
                      </div>
                      <div>
                        <p className="font-medium">AI Searches & Retrieves</p>
                        <p className="text-sm text-muted-foreground">When you ask questions, AI searches relevant docs first.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                        3
                      </div>
                      <div>
                        <p className="font-medium">Grounded Responses</p>
                        <p className="text-sm text-muted-foreground">Responses cite sources and flag assumptions for transparency.</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
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
