import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { KlaviyoDetailModal } from './KlaviyoDetailModal';
import { 
  RefreshCw, 
  Users, 
  Mail, 
  List, 
  Activity, 
  Clock, 
  CheckCircle,
  Building,
  ChevronRight
} from 'lucide-react';

interface KlaviyoDataViewerProps {
  clientId: string;
  platformId: string;
  schemaCache?: {
    profiles_count?: number;
    metrics_count?: number;
    lists_count?: number;
    templates_count?: number;
    last_sync?: string;
    account?: Record<string, unknown>;
    // Full data arrays from cache
    metrics?: any[];
    lists?: any[];
    templates?: any[];
    profiles?: { count?: number; sample?: any[] };
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

export function KlaviyoDataViewer({ clientId, platformId, schemaCache, lastSyncAt }: KlaviyoDataViewerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncResult, setSyncResult] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<{ type: 'profile' | 'template' | 'metric' | 'list'; data: any } | null>(null);

  // Check if we have cached data arrays
  const hasCachedData = !!(schemaCache?.metrics?.length || schemaCache?.lists?.length || 
                          schemaCache?.templates?.length);

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
      const { data, error } = await supabase.functions.invoke('sync-klaviyo', {
        body: { clientId, platformId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSyncResult(data.data);
      queryClient.invalidateQueries({ queryKey: ['platform-schemas', platformId] });
      // Invalidate with specific clientId to ensure chat gets fresh data
      queryClient.invalidateQueries({ queryKey: ['client-platforms', clientId] });
      // Also invalidate the general query in case it's used elsewhere
      queryClient.invalidateQueries({ queryKey: ['client-platforms'] });
      toast({
        title: 'Klaviyo data synced',
        description: `Found ${data.data.metrics?.length || 0} events, ${data.data.lists?.length || 0} lists, ${data.data.templates?.length || 0} templates`,
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
  const cachedMetrics = schemaCache?.metrics || [];
  const cachedLists = schemaCache?.lists || [];
  const cachedTemplates = schemaCache?.templates || [];
  const cachedProfiles = schemaCache?.profiles?.sample || [];

  const storedMetrics = schemas?.filter(s => s.schema_type === 'metric') || [];
  const storedLists = schemas?.filter(s => s.schema_type === 'list') || [];
  const storedTemplates = schemas?.filter(s => s.schema_type === 'template') || [];

  // Determine which data source to use
  const hasLiveData = syncResult !== null;
  const metrics = hasLiveData ? syncResult.metrics : (cachedMetrics.length > 0 ? cachedMetrics : storedMetrics);
  const lists = hasLiveData ? syncResult.lists : (cachedLists.length > 0 ? cachedLists : storedLists);
  const templates = hasLiveData ? syncResult.templates : (cachedTemplates.length > 0 ? cachedTemplates : storedTemplates);
  const profiles = hasLiveData ? (syncResult.profiles?.sample || []) : cachedProfiles;

  const metricsCount = metrics?.length || 0;
  const listsCount = lists?.length || 0;
  const templatesCount = templates?.length || 0;
  const profilesCount = syncResult?.profiles?.count || schemaCache?.profiles_count || 0;

  const hasData = metricsCount > 0 || listsCount > 0 || templatesCount > 0;

  const handleItemClick = (type: 'profile' | 'template' | 'metric' | 'list', data: any) => {
    setSelectedItem({ type, data });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="text-2xl">📧</span>
              Klaviyo Data
            </CardTitle>
            <CardDescription>
              {lastSyncAt ? (
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Last synced: {new Date(lastSyncAt).toLocaleString()}
                </span>
              ) : (
                'Click sync to fetch data from Klaviyo'
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
          {(schemaCache || syncResult || storedMetrics.length > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-lg font-bold">{profilesCount}</p>
                  <p className="text-xs text-muted-foreground">Profiles</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10">
                <Activity className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-lg font-bold">{metricsCount}</p>
                  <p className="text-xs text-muted-foreground">Events</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10">
                <List className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-lg font-bold">{listsCount}</p>
                  <p className="text-xs text-muted-foreground">Lists</p>
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

          {/* Account Info */}
          {(schemaCache?.account || syncResult?.account) && (
            <div className="mb-6 p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 mb-2">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Account</span>
              </div>
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Name:</span> {(schemaCache?.account as any)?.contact_information?.organization_name || (syncResult?.account as any)?.contact_information?.organization_name || 'N/A'}</p>
                <p><span className="text-muted-foreground">Timezone:</span> {(schemaCache?.account as any)?.preferred_timezone || (syncResult?.account as any)?.preferred_timezone || 'N/A'}</p>
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
          <Tabs defaultValue="events">
              <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
                <TabsTrigger value="events" className="text-xs sm:text-sm">Events ({metricsCount})</TabsTrigger>
                <TabsTrigger value="lists" className="text-xs sm:text-sm">Lists ({listsCount})</TabsTrigger>
                <TabsTrigger value="templates" className="text-xs sm:text-sm">Templates ({templatesCount})</TabsTrigger>
                {profiles.length > 0 && (
                  <TabsTrigger value="profiles" className="text-xs sm:text-sm">Profiles ({profiles.length})</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="events" className="mt-4">
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {(metrics || []).map((m: any) => (
                      <div 
                        key={m.id} 
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleItemClick('metric', m.metadata ? { ...m, ...m.metadata } : m)}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Activity className="h-4 w-4 text-purple-500 flex-shrink-0" />
                          <span className="font-medium truncate">{m.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                          {(m.integration?.name || m.metadata?.integration?.name) && (
                            <Badge variant="secondary" className="text-xs">
                              {m.integration?.name || m.metadata?.integration?.name}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">metric</Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                        </div>
                      </div>
                    ))}
                    {metricsCount === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-8">
                        No events found. Click Sync Data to fetch from Klaviyo.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="lists" className="mt-4">
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {(lists || []).map((l: any) => (
                      <div 
                        key={l.id} 
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleItemClick('list', l.metadata ? { ...l, ...l.metadata } : l)}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <List className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <span className="font-medium truncate">{l.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                          {(l.profile_count ?? l.metadata?.profile_count) !== undefined && (
                            <Badge variant="secondary" className="text-xs">
                              {(l.profile_count ?? l.metadata?.profile_count)?.toLocaleString()} profiles
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">list</Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                        </div>
                      </div>
                    ))}
                    {listsCount === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-8">
                        No lists found. Click Sync Data to fetch from Klaviyo.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="templates" className="mt-4">
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {(templates || []).map((t: any) => (
                      <div 
                        key={t.id} 
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleItemClick('template', t.metadata ? { ...t, ...t.metadata } : t)}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Mail className="h-4 w-4 text-orange-500 flex-shrink-0" />
                          <span className="font-medium truncate">{t.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {t.editor_type || t.metadata?.editor_type || 'unknown'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">template</Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                        </div>
                      </div>
                    ))}
                    {templatesCount === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-8">
                        No templates found. Click Sync Data to fetch from Klaviyo.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {profiles.length > 0 && (
                <TabsContent value="profiles" className="mt-4">
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {profiles.map((p: any) => (
                        <div 
                          key={p.id} 
                          className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => handleItemClick('profile', p)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-blue-500" />
                              <span className="font-medium">
                                {p.first_name || ''} {p.last_name || ''} 
                                {!p.first_name && !p.last_name && 'Anonymous'}
                              </span>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-4">
                            {p.email && <span>{p.email}</span>}
                            {p.phone_number && <span>{p.phone_number}</span>}
                            {p.location?.city && <span>{p.location.city}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}
            </Tabs>
          ) : (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No data synced yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Click "Sync Data" to fetch profiles, events, lists, and templates from Klaviyo
              </p>
              <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <KlaviyoDetailModal
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        type={selectedItem?.type || 'profile'}
        data={selectedItem?.data}
      />
    </>
  );
}
