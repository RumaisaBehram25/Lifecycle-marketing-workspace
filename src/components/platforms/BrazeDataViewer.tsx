import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { RefreshCw, Mail, Workflow, Users, FileText, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface BrazeSchemaCache {
  cache_version?: number;
  saved_at?: string;
  rest_endpoint?: string;
  campaigns_count?: number;
  canvases_count?: number;
  templates_count?: number;
  segments_count?: number;
  subscription_groups_count?: number;
  last_sync?: string;
  campaigns?: Array<{
    id: string;
    name: string;
    description?: string;
    draft?: boolean;
    schedule_type?: string;
    channels?: string[];
    first_sent?: string;
    last_sent?: string;
    tags?: string[];
    archived?: boolean;
  }>;
  canvases?: Array<{
    id: string;
    name: string;
    description?: string;
    draft?: boolean;
    schedule_type?: string;
    first_entry?: string;
    last_entry?: string;
    tags?: string[];
    archived?: boolean;
  }>;
  templates?: Array<{
    email_template_id: string;
    template_name: string;
    description?: string;
    subject?: string;
    preheader?: string;
    tags?: string[];
    created_at?: string;
    updated_at?: string;
  }>;
  segments?: Array<{
    id: string;
    name: string;
    description?: string;
    tags?: string[];
  }>;
  subscription_groups?: Array<{
    id: string;
    name: string;
    channel: string;
    is_active?: boolean;
  }>;
}

interface BrazeDataViewerProps {
  clientId: string;
  platformId: string;
  schemaCache?: BrazeSchemaCache;
  lastSyncAt?: string;
  onSyncComplete?: () => void;
}

export function BrazeDataViewer({ 
  clientId, 
  platformId, 
  schemaCache, 
  lastSyncAt,
  onSyncComplete 
}: BrazeDataViewerProps) {
  const [syncing, setSyncing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [detailType, setDetailType] = useState<string>('');
  const { toast } = useToast();

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-braze', {
        body: { clientId, platformId },
      });
      
      if (error) throw error;
      
      toast({ title: 'Braze data synced successfully' });
      onSyncComplete?.();
    } catch (error: any) {
      console.error('Sync error:', error);
      toast({ 
        title: 'Sync failed', 
        description: error.message,
        variant: 'destructive' 
      });
    } finally {
      setSyncing(false);
    }
  };

  const campaigns = schemaCache?.campaigns || [];
  const canvases = schemaCache?.canvases || [];
  const templates = schemaCache?.templates || [];
  const segments = schemaCache?.segments || [];

  const openDetail = (item: any, type: string) => {
    setSelectedItem(item);
    setDetailType(type);
  };

  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-[#FF6B6B]/10 flex items-center justify-center">
                <span className="text-xl">🔥</span>
              </div>
              <div>
                <CardTitle className="text-lg">Braze</CardTitle>
                <CardDescription>
                  {lastSyncAt 
                    ? `Last synced ${new Date(lastSyncAt).toLocaleString()}`
                    : 'Not synced yet'
                  }
                </CardDescription>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync Data
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!schemaCache?.last_sync ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-3">Click "Sync Data" to pull campaigns, canvases, templates, and segments from Braze.</p>
            </div>
          ) : (
            <Tabs defaultValue="campaigns" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="campaigns" className="text-xs">
                  <Mail className="h-3 w-3 mr-1" />
                  Campaigns ({campaigns.length})
                </TabsTrigger>
                <TabsTrigger value="canvases" className="text-xs">
                  <Workflow className="h-3 w-3 mr-1" />
                  Canvases ({canvases.length})
                </TabsTrigger>
                <TabsTrigger value="templates" className="text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  Templates ({templates.length})
                </TabsTrigger>
                <TabsTrigger value="segments" className="text-xs">
                  <Users className="h-3 w-3 mr-1" />
                  Segments ({segments.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="campaigns" className="mt-4">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {campaigns.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No campaigns found</p>
                  ) : (
                    campaigns.map((campaign) => (
                      <button
                        key={campaign.id}
                        onClick={() => openDetail(campaign, 'campaign')}
                        className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{campaign.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {campaign.draft && <Badge variant="outline" className="text-xs">Draft</Badge>}
                            {campaign.channels?.map(ch => (
                              <Badge key={ch} variant="secondary" className="text-xs">{ch}</Badge>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="canvases" className="mt-4">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {canvases.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No canvases found</p>
                  ) : (
                    canvases.map((canvas) => (
                      <button
                        key={canvas.id}
                        onClick={() => openDetail(canvas, 'canvas')}
                        className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{canvas.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {canvas.draft && <Badge variant="outline" className="text-xs">Draft</Badge>}
                            {canvas.schedule_type && (
                              <Badge variant="secondary" className="text-xs">{canvas.schedule_type}</Badge>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="templates" className="mt-4">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {templates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No templates found</p>
                  ) : (
                    templates.map((template) => (
                      <button
                        key={template.email_template_id}
                        onClick={() => openDetail(template, 'template')}
                        className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{template.template_name}</p>
                          {template.subject && (
                            <p className="text-xs text-muted-foreground truncate mt-1">{template.subject}</p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="segments" className="mt-4">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {segments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No segments found</p>
                  ) : (
                    segments.map((segment) => (
                      <button
                        key={segment.id}
                        onClick={() => openDetail(segment, 'segment')}
                        className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{segment.name}</p>
                          {segment.description && (
                            <p className="text-xs text-muted-foreground truncate mt-1">{segment.description}</p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailType === 'campaign' && <Mail className="h-5 w-5" />}
              {detailType === 'canvas' && <Workflow className="h-5 w-5" />}
              {detailType === 'template' && <FileText className="h-5 w-5" />}
              {detailType === 'segment' && <Users className="h-5 w-5" />}
              {selectedItem?.name || selectedItem?.template_name}
            </DialogTitle>
            <DialogDescription>
              Braze {detailType} details
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4 mt-4">
              {selectedItem.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Description</p>
                  <p className="text-sm">{selectedItem.description}</p>
                </div>
              )}
              
              {selectedItem.subject && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Subject Line</p>
                  <p className="text-sm">{selectedItem.subject}</p>
                </div>
              )}

              {selectedItem.preheader && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Preheader</p>
                  <p className="text-sm">{selectedItem.preheader}</p>
                </div>
              )}

              {selectedItem.channels && selectedItem.channels.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Channels</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.channels.map((ch: string) => (
                      <Badge key={ch} variant="secondary">{ch}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedItem.tags && selectedItem.tags.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.tags.map((tag: string) => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {(selectedItem.first_sent || selectedItem.last_sent || selectedItem.first_entry || selectedItem.last_entry) && (
                <div className="grid grid-cols-2 gap-4">
                  {(selectedItem.first_sent || selectedItem.first_entry) && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">First Sent</p>
                      <p className="text-sm">{new Date(selectedItem.first_sent || selectedItem.first_entry).toLocaleDateString()}</p>
                    </div>
                  )}
                  {(selectedItem.last_sent || selectedItem.last_entry) && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Last Sent</p>
                      <p className="text-sm">{new Date(selectedItem.last_sent || selectedItem.last_entry).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">ID: {selectedItem.id || selectedItem.email_template_id}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
