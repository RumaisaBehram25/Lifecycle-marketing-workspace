import { useState, useMemo } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { DocumentPreview } from '@/components/knowledge/DocumentPreview';
import { SyncStatus } from '@/components/knowledge/SyncStatus';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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
  FolderOpen
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

export default function KnowledgeBase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [platform, setPlatform] = useState<PlatformType | ''>('');
  const [isVendorDoc, setIsVendorDoc] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<KnowledgeDocument | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');

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

        <Tabs defaultValue="library" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="library" className="gap-2">
              <Database className="h-4 w-4" />
              Library
            </TabsTrigger>
            <TabsTrigger value="platforms" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Platforms
            </TabsTrigger>
            <TabsTrigger value="ingest" className="gap-2">
              <Plus className="h-4 w-4" />
              Add New
            </TabsTrigger>
          </TabsList>

          {/* Library Tab */}
          <TabsContent value="library" className="space-y-6">
            {/* Search & Filter Bar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search documents..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterPlatform} onValueChange={setFilterPlatform}>
                    <SelectTrigger className="w-full sm:w-48">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filter by platform" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Platforms</SelectItem>
                      {Object.entries(PLATFORM_INFO).map(([key, info]) => (
                        <SelectItem key={key} value={key}>
                          {info.icon} {info.name} ({platformCounts[key] || 0})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Category Overview */}
            {Object.keys(categoryCounts).length > 1 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(categoryCounts).slice(0, 8).map(([cat, count]) => (
                  <button
                    key={cat}
                    onClick={() => setSearchQuery(cat)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-sm transition-colors"
                  >
                    <span>{CATEGORY_ICONS[cat] || '📄'}</span>
                    <span className="capitalize">{cat.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground">({count})</span>
                  </button>
                ))}
              </div>
            )}

            {/* Document List */}
            {filteredDocuments.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <EmptyState
                    icon={Database}
                    title={searchQuery ? "No matching documents" : "No documents yet"}
                    description={searchQuery ? "Try adjusting your search or filters." : "Start by syncing platform docs or ingesting custom content."}
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filteredDocuments.map((doc) => (
                  <Card 
                    key={doc.id} 
                    className="group cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
                    onClick={() => setPreviewDoc(doc)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-lg">{CATEGORY_ICONS[doc.category || ''] || '📄'}</span>
                            <h3 className="font-medium truncate group-hover:text-primary transition-colors">
                              {doc.title || 'Untitled'}
                            </h3>
                            {doc.is_vendor_doc && (
                              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                                Vendor
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate mb-2">
                            {doc.source_url}
                          </p>
                          <div className="flex items-center gap-3 flex-wrap">
                            {doc.platform && <PlatformBadge platform={doc.platform} size="sm" />}
                            {doc.category && (
                              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                                {doc.category.replace(/_/g, ' ')}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {doc.content.split(/\s+/).length.toLocaleString()} words
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(doc.updated_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(doc.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Platforms Tab */}
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
      </div>
    </AppLayout>
  );
}
