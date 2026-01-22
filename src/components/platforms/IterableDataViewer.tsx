import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { IterableDetailModal } from './IterableDetailModal';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  RefreshCw, 
  List, 
  Mail, 
  Megaphone,
  Radio,
  Clock, 
  CheckCircle,
  ChevronRight
} from 'lucide-react';

interface IterableDataViewerProps {
  clientId: string;
  platformId: string;
  schemaCache?: {
    lists_count?: number;
    channels_count?: number;
    campaigns_count?: number;
    templates_count?: number;
    last_sync?: string;
    // Full data arrays from cache
    lists?: any[];
    channels?: any[];
    campaigns?: any[];
    templates?: any[];
  };
  lastSyncAt?: string;
}

interface PlatformSchema {
  id: string;
  name: string;
  schema_type: string;
  description: string | null;
  last_seen_at: string | null;
  metadata: Record<string, unknown> | null;
}

export function IterableDataViewer({ clientId, platformId, schemaCache, lastSyncAt }: IterableDataViewerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncResult, setSyncResult] = useState<any>(null);
  
  // Detail modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'list' | 'channel' | 'campaign' | 'template'>('list');
  const [modalData, setModalData] = useState<any>(null);

  const openDetail = (type: 'list' | 'channel' | 'campaign' | 'template', data: any) => {
    setModalType(type);
    setModalData(data);
    setModalOpen(true);
  };

  // Check if we have cached data arrays
  const hasCachedData = !!(schemaCache?.lists?.length || schemaCache?.channels?.length || 
                          schemaCache?.campaigns?.length || schemaCache?.templates?.length);

  // Fetch stored schema data only if no cached data
  const { data: schemas, isLoading: schemasLoading } = useQuery({
    queryKey: ['platform-schemas', platformId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_schemas')
        .select('*')
        .eq('client_platform_id', platformId)
        .order('schema_type', { ascending: true });

      if (error) throw error;
      return data as PlatformSchema[];
    },
    enabled: !hasCachedData, // Skip query if we have cached data
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-iterable', {
        body: { clientId, platformId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSyncResult(data.data);
      queryClient.invalidateQueries({ queryKey: ['platform-schemas', platformId] });
      queryClient.invalidateQueries({ queryKey: ['client-platforms', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-platforms'] });
      toast({
        title: 'Iterable data synced',
        description: `Found ${data.data.lists?.length || 0} lists, ${data.data.campaigns?.length || 0} campaigns, ${data.data.templates?.length || 0} templates`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Sync failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Priority: syncResult > schemaCache > platform_schemas table
  const cachedLists = schemaCache?.lists || [];
  const cachedChannels = schemaCache?.channels || [];
  const cachedCampaigns = schemaCache?.campaigns || [];
  const cachedTemplates = schemaCache?.templates || [];

  const storedLists = schemas?.filter(s => s.schema_type === 'list') || [];
  const storedChannels = schemas?.filter(s => s.schema_type === 'channel') || [];
  const storedCampaigns = schemas?.filter(s => s.schema_type === 'campaign') || [];
  const storedTemplates = schemas?.filter(s => s.schema_type === 'template') || [];

  // Determine which data source to use
  const hasLiveData = syncResult !== null;
  const lists = hasLiveData ? syncResult.lists : (cachedLists.length > 0 ? cachedLists : storedLists);
  const channels = hasLiveData ? syncResult.channels : (cachedChannels.length > 0 ? cachedChannels : storedChannels);
  const campaigns = hasLiveData ? syncResult.campaigns : (cachedCampaigns.length > 0 ? cachedCampaigns : storedCampaigns);
  const templates = hasLiveData ? syncResult.templates : (cachedTemplates.length > 0 ? cachedTemplates : storedTemplates);

  const listsCount = lists?.length || 0;
  const channelsCount = channels?.length || 0;
  const campaignsCount = campaigns?.length || 0;
  const templatesCount = templates?.length || 0;

  const hasData = listsCount > 0 || channelsCount > 0 || campaignsCount > 0 || templatesCount > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <span className="text-2xl">🔄</span>
            Iterable Data
          </CardTitle>
          <CardDescription>
            {lastSyncAt ? (
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                Last synced: {new Date(lastSyncAt).toLocaleString()}
              </span>
            ) : (
              'Click sync to fetch data from Iterable'
            )}
          </CardDescription>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          variant="outline"
          size="sm"
        >
          {syncMutation.isPending ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync Data
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        {(schemaCache || syncResult || storedLists.length > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10">
              <List className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-lg font-bold">{listsCount}</p>
                <p className="text-xs text-muted-foreground">Lists</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10">
              <Radio className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-lg font-bold">{channelsCount}</p>
                <p className="text-xs text-muted-foreground">Channels</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10">
              <Megaphone className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-lg font-bold">{campaignsCount}</p>
                <p className="text-xs text-muted-foreground">Campaigns</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/10">
              <Mail className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-lg font-bold">{templatesCount}</p>
                <p className="text-xs text-muted-foreground">Templates</p>
              </div>
            </div>
          </div>
        )}

        {schemasLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : hasData ? (
          <Tabs defaultValue="lists">
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
              <TabsTrigger value="lists" className="text-xs sm:text-sm">Lists ({listsCount})</TabsTrigger>
              <TabsTrigger value="channels" className="text-xs sm:text-sm">Channels ({channelsCount})</TabsTrigger>
              <TabsTrigger value="campaigns" className="text-xs sm:text-sm">Campaigns ({campaignsCount})</TabsTrigger>
              <TabsTrigger value="templates" className="text-xs sm:text-sm">Templates ({templatesCount})</TabsTrigger>
            </TabsList>

            <TabsContent value="lists" className="mt-4">
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {(lists || []).map((l: any) => (
                    <button 
                      key={l.id || l.name} 
                      onClick={() => openDetail('list', l.metadata ? { ...l, ...l.metadata } : l)}
                      className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <List className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span className="font-medium truncate">{l.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        {(l.subscriberCount ?? l.metadata?.subscriberCount) !== undefined && (
                          <Badge variant="secondary" className="text-xs">
                            {(l.subscriberCount ?? l.metadata?.subscriberCount)?.toLocaleString()} subs
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">{l.listType || l.metadata?.listType || 'list'}</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                      </div>
                    </button>
                  ))}
                  {listsCount === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-8">
                      No lists found. Click Sync Data to fetch from Iterable.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="channels" className="mt-4">
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {(channels || []).map((c: any) => (
                    <button 
                      key={c.id || c.name} 
                      onClick={() => openDetail('channel', c.metadata ? { ...c, ...c.metadata } : c)}
                      className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Radio className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <span className="font-medium truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {c.channelType || c.metadata?.channelType || 'unknown'}
                        </Badge>
                        {(c.messageMedium || c.metadata?.messageMedium) && (
                          <Badge variant="outline" className="text-xs">
                            {c.messageMedium || c.metadata?.messageMedium}
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                      </div>
                    </button>
                  ))}
                  {channelsCount === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-8">
                      No channels found. Click Sync Data to fetch from Iterable.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="campaigns" className="mt-4">
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {(campaigns || []).map((c: any) => (
                    <button 
                      key={c.id || c.name} 
                      onClick={() => openDetail('campaign', c.metadata ? { ...c, ...c.metadata } : c)}
                      className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Megaphone className="h-4 w-4 text-purple-500 flex-shrink-0" />
                        <span className="font-medium truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {c.type || c.metadata?.type || 'unknown'}
                        </Badge>
                        {(c.campaignState || c.metadata?.campaignState) && (
                          <Badge 
                            variant="outline"
                            className={`text-xs ${
                              (c.campaignState || c.metadata?.campaignState) === 'Running' 
                                ? 'border-green-500 text-green-500' 
                                : ''
                            }`}
                          >
                            {c.campaignState || c.metadata?.campaignState}
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                      </div>
                    </button>
                  ))}
                  {campaignsCount === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-8">
                      No campaigns found. Click Sync Data to fetch from Iterable.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="templates" className="mt-4">
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {(templates || []).map((t: any) => (
                    <button 
                      key={t.templateId || t.name} 
                      onClick={() => openDetail('template', t.metadata ? { ...t, ...t.metadata } : t)}
                      className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Mail className="h-4 w-4 text-orange-500 flex-shrink-0" />
                        <span className="font-medium truncate">{t.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {t.messageMedium || t.metadata?.messageMedium || 'Email'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">template</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                      </div>
                    </button>
                  ))}
                  {templatesCount === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-8">
                      No templates found. Click Sync Data to fetch from Iterable.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No data synced yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Click "Sync Data" to fetch lists, campaigns, and templates from Iterable
            </p>
            <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
            </Button>
          </div>
        )}
      </CardContent>

      {/* Detail Modal */}
      <IterableDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        type={modalType}
        data={modalData}
      />
    </Card>
  );
}
