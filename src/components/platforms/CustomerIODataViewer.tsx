import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Eye, Copy, Check, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────
interface CampaignItem {
  type: 'campaign';
  id: number;
  name: string;
  status: string | null;
  updated_at: string | null;
  message_ids: string[];
}

interface NewsletterItem {
  type: 'newsletter';
  id: number;
  name: string;
  status: string | null;
  updated_at: string | null;
  variant_ids: string[];
}

interface Creative {
  subject: string;
  html_body: string;
  text_body: string;
}

interface HealthResult {
  ok: boolean;
  status?: number;
  hint?: string;
}

// ── API helpers ─────────────────────────────────────────────────────────
async function cioProxy(path: string) {
  const { data, error } = await supabase.functions.invoke('customerio-proxy', {
    body: null,
    headers: { 'x-cio-path': path },
  });
  // Edge function returns JSON body; if it signaled an error shape, throw
  if (error) throw new Error(error.message || 'Edge function error');
  if (data && data.ok === false) {
    throw new Error(data.hint || `Error ${data.status}: ${data.endpoint}`);
  }
  return data;
}

// We need to pass the path via the URL since edge functions don't support sub-routing via headers easily.
// Instead we'll POST with a JSON body specifying the sub-route.
async function cioCall(subPath: string) {
  const res = await supabase.functions.invoke('customerio-proxy', {
    method: 'POST',
    body: { path: subPath },
  });
  if (res.error) throw new Error(res.error.message || 'Edge function error');
  const d = res.data;
  if (d && d.ok === false) {
    throw new Error(d.hint || `Error ${d.status}: ${d.endpoint}`);
  }
  return d;
}

// ── Component ───────────────────────────────────────────────────────────
interface Props {
  clientId: string;
  platformId: string;
}

export function CustomerIODataViewer({ clientId, platformId }: Props) {
  const { toast } = useToast();

  // Health
  const [healthStatus, setHealthStatus] = useState<HealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Campaigns
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);

  // Newsletters
  const [newsletters, setNewsletters] = useState<NewsletterItem[]>([]);
  const [newslettersLoading, setNewslettersLoading] = useState(false);
  const [newslettersLoaded, setNewslettersLoaded] = useState(false);

  // Creative detail
  const [creative, setCreative] = useState<Creative | null>(null);
  const [creativeLoading, setCreativeLoading] = useState(false);
  const [creativeTitle, setCreativeTitle] = useState('');
  const [creativeOpen, setCreativeOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Health check ────────────────────────────────────────────────────
  const testConnection = useCallback(async () => {
    setHealthLoading(true);
    try {
      await cioCall('/health');
      setHealthStatus({ ok: true });
      toast({ title: 'Connection successful', description: 'Customer.io API key is valid.' });
    } catch (err: any) {
      setHealthStatus({ ok: false, hint: err.message });
      toast({ title: 'Connection failed', description: err.message, variant: 'destructive' });
    } finally {
      setHealthLoading(false);
    }
  }, [toast]);

  // ── Load campaigns ──────────────────────────────────────────────────
  const loadCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      const data = await cioCall('/campaigns');
      setCampaigns(data.items || []);
      setCampaignsLoaded(true);
    } catch (err: any) {
      toast({ title: 'Failed to load campaigns', description: err.message, variant: 'destructive' });
    } finally {
      setCampaignsLoading(false);
    }
  }, [toast]);

  // ── Load newsletters ────────────────────────────────────────────────
  const loadNewsletters = useCallback(async () => {
    setNewslettersLoading(true);
    try {
      const data = await cioCall('/newsletters');
      setNewsletters(data.items || []);
      setNewslettersLoaded(true);
    } catch (err: any) {
      toast({ title: 'Failed to load newsletters', description: err.message, variant: 'destructive' });
    } finally {
      setNewslettersLoading(false);
    }
  }, [toast]);

  // ── View creative ───────────────────────────────────────────────────
  const viewCampaignCreative = useCallback(async (campaignId: number, messageId: string, name: string) => {
    setCreativeTitle(name);
    setCreativeOpen(true);
    setCreativeLoading(true);
    setCreative(null);
    try {
      const data = await cioCall(`/campaigns/${campaignId}/messages/${messageId}/creative`);
      setCreative(data.creative);
    } catch (err: any) {
      toast({ title: 'Failed to load creative', description: err.message, variant: 'destructive' });
      setCreativeOpen(false);
    } finally {
      setCreativeLoading(false);
    }
  }, [toast]);

  const viewNewsletterCreative = useCallback(async (newsletterId: number, variantId: string, name: string) => {
    setCreativeTitle(name);
    setCreativeOpen(true);
    setCreativeLoading(true);
    setCreative(null);
    try {
      const data = await cioCall(`/newsletters/${newsletterId}/variants/${variantId}/creative`);
      setCreative(data.creative);
    } catch (err: any) {
      toast({ title: 'Failed to load creative', description: err.message, variant: 'destructive' });
      setCreativeOpen(false);
    } finally {
      setCreativeLoading(false);
    }
  }, [toast]);

  const copyHtml = useCallback(() => {
    if (creative?.html_body) {
      navigator.clipboard.writeText(creative.html_body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [creative]);

  // ── Status badge ────────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string | null }) => {
    if (!status) return <span className="text-xs text-muted-foreground">—</span>;
    const variant = status === 'active' || status === 'sent' ? 'default' : 'secondary';
    return <Badge variant={variant} className="text-xs">{status}</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="text-2xl">👤</span> Customer.io Creative Extractor
            </CardTitle>
            <CardDescription>Browse campaigns & newsletters, view HTML creatives and subjects.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {healthStatus && (
              healthStatus.ok
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <XCircle className="h-5 w-5 text-destructive" />
            )}
            <Button variant="outline" size="sm" onClick={testConnection} disabled={healthLoading}>
              {healthLoading ? <LoadingSpinner size="sm" className="mr-2" /> : null}
              Test Connection
            </Button>
          </div>
        </CardHeader>

        {healthStatus && !healthStatus.ok && (
          <div className="mx-6 mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Connection error</p>
              <p className="text-xs mt-1">{healthStatus.hint}</p>
            </div>
          </div>
        )}

        <CardContent>
          <Tabs defaultValue="campaigns">
            <TabsList>
              <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
              <TabsTrigger value="newsletters">Newsletters</TabsTrigger>
            </TabsList>

            {/* ── Campaigns Tab ─────────────────────────────────────── */}
            <TabsContent value="campaigns" className="space-y-3">
              {!campaignsLoaded ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Click below to fetch campaigns from Customer.io</p>
                  <Button onClick={loadCampaigns} disabled={campaignsLoading}>
                    {campaignsLoading && <LoadingSpinner size="sm" className="mr-2" />}
                    <RefreshCw className="mr-2 h-4 w-4" /> Load Campaigns
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={loadCampaigns} disabled={campaignsLoading}>
                      {campaignsLoading && <LoadingSpinner size="sm" className="mr-2" />}
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  {campaigns.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No campaigns found.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead>Messages</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {campaigns.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium max-w-[250px] truncate">{c.name}</TableCell>
                            <TableCell><StatusBadge status={c.status} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '—'}
                            </TableCell>
                            <TableCell className="text-xs">{c.message_ids.length}</TableCell>
                            <TableCell className="text-right">
                              {c.message_ids.length > 0 ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => viewCampaignCreative(c.id, c.message_ids[0], c.name)}
                                >
                                  <Eye className="mr-1 h-4 w-4" /> View
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">No messages</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </TabsContent>

            {/* ── Newsletters Tab ───────────────────────────────────── */}
            <TabsContent value="newsletters" className="space-y-3">
              {!newslettersLoaded ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Click below to fetch newsletters from Customer.io</p>
                  <Button onClick={loadNewsletters} disabled={newslettersLoading}>
                    {newslettersLoading && <LoadingSpinner size="sm" className="mr-2" />}
                    <RefreshCw className="mr-2 h-4 w-4" /> Load Newsletters
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={loadNewsletters} disabled={newslettersLoading}>
                      {newslettersLoading && <LoadingSpinner size="sm" className="mr-2" />}
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  {newsletters.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No newsletters found.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead>Variants</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {newsletters.map((n) => (
                          <TableRow key={n.id}>
                            <TableCell className="font-medium max-w-[250px] truncate">{n.name}</TableCell>
                            <TableCell><StatusBadge status={n.status} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {n.updated_at ? new Date(n.updated_at).toLocaleDateString() : '—'}
                            </TableCell>
                            <TableCell className="text-xs">{n.variant_ids.length}</TableCell>
                            <TableCell className="text-right">
                              {n.variant_ids.length > 0 ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => viewNewsletterCreative(n.id, n.variant_ids[0], n.name)}
                                >
                                  <Eye className="mr-1 h-4 w-4" /> View
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">No variants</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Creative Detail Modal ──────────────────────────────────── */}
      <Dialog open={creativeOpen} onOpenChange={setCreativeOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate">{creativeTitle}</DialogTitle>
          </DialogHeader>
          {creativeLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : creative ? (
            <div className="space-y-4">
              {/* Subject */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</label>
                <p className="mt-1 text-sm font-medium bg-muted/50 rounded-lg p-3">
                  {creative.subject || <span className="text-muted-foreground italic">No subject</span>}
                </p>
              </div>

              {/* HTML Preview */}
              {creative.html_body && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">HTML Preview</label>
                    <Button variant="ghost" size="sm" onClick={copyHtml} className="h-7">
                      {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                      {copied ? 'Copied' : 'Copy HTML'}
                    </Button>
                  </div>
                  <div className="border rounded-lg overflow-hidden bg-white">
                    <iframe
                      srcDoc={creative.html_body}
                      title="Creative preview"
                      className="w-full h-[400px] border-0"
                      sandbox="allow-same-origin"
                      style={{ background: 'white' }}
                    />
                  </div>
                </div>
              )}

              {/* Text body */}
              {creative.text_body && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Text Body</label>
                  <pre className="mt-1 text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-[200px]">
                    {creative.text_body}
                  </pre>
                </div>
              )}

              {!creative.html_body && !creative.text_body && (
                <p className="text-sm text-muted-foreground text-center py-6">No creative content found for this item.</p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
