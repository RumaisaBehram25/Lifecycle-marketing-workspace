import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCreateClient } from '@/hooks/useClients';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  ArrowLeft, 
  Sparkles, 
  Globe, 
  Building2, 
  Wand2, 
  CheckCircle2, 
  Loader2, 
  Upload, 
  XCircle,
  AlertCircle
} from 'lucide-react';
import { Navigate } from 'react-router-dom';

type SetupStep = 'idle' | 'creating' | 'discovering' | 'complete';

interface BulkImportItem {
  url: string;
  name: string;
  status: 'pending' | 'creating' | 'discovering' | 'complete' | 'error';
  error?: string;
  clientId?: string;
}

export default function NewClient() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const createClient = useCreateClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Single client state
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [setupStep, setSetupStep] = useState<SetupStep>('idle');
  const [discoveryProgress, setDiscoveryProgress] = useState('');

  // Bulk import state
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkItems, setBulkItems] = useState<BulkImportItem[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  if (!isAdmin) {
    return <Navigate to="/clients" replace />;
  }

  // Extract client name from URL
  const extractNameFromUrl = (url: string): string => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      const hostname = urlObj.hostname.replace(/^www\./, '');
      // Get the main domain part
      const parts = hostname.split('.');
      const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
      // Capitalize first letter
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      return url.split('/')[0].replace(/^www\./, '');
    }
  };

  // Parse URLs from text
  const parseUrls = (text: string): BulkImportItem[] => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const items: BulkImportItem[] = [];
    
    for (const line of lines) {
      // Skip obvious non-URLs
      if (!line.includes('.')) continue;
      
      let url = line;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      
      try {
        new URL(url); // Validate URL
        const name = extractNameFromUrl(url);
        items.push({ url, name, status: 'pending' });
      } catch {
        // Skip invalid URLs
      }
    }
    
    return items;
  };

  // Handle single client submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({ title: 'Name required', description: 'Please enter a client name.', variant: 'destructive' });
      return;
    }

    setSetupStep('creating');
    setDiscoveryProgress('Creating client...');

    try {
      const client = await createClient.mutateAsync({
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        website_url: websiteUrl || null,
        brand_voice: null,
        legal_requirements: null,
        is_active: true,
        do_rules: [],
        dont_rules: [],
        tone_presets: [],
        logo_url: null,
      });

      if (websiteUrl.trim()) {
        setSetupStep('discovering');
        setDiscoveryProgress('Analyzing website & extracting brand guidelines...');

        try {
          await supabase.functions.invoke('discover-brand', {
            body: {
              clientId: client.id,
              websiteUrl: websiteUrl.trim(),
              clientName: name,
            },
          });
          setDiscoveryProgress('Brand guidelines extracted successfully!');
        } catch (discoverError) {
          console.error('Discovery failed:', discoverError);
        }
      }

      setSetupStep('complete');
      setDiscoveryProgress('Setup complete!');
      
      setTimeout(() => {
        navigate(`/clients/${client.id}`);
      }, 1000);

    } catch (error) {
      console.error('Error creating client:', error);
      setSetupStep('idle');
      toast({ 
        title: 'Failed to create client', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Handle bulk import
  const handleBulkPreview = () => {
    const items = parseUrls(bulkUrls);
    if (items.length === 0) {
      toast({ 
        title: 'No valid URLs found', 
        description: 'Please enter valid website URLs, one per line.',
        variant: 'destructive',
      });
      return;
    }
    setBulkItems(items);
  };

  const handleBulkImport = async () => {
    if (bulkItems.length === 0) return;
    
    setIsBulkProcessing(true);
    
    for (let i = 0; i < bulkItems.length; i++) {
      const item = bulkItems[i];
      
      // Update status to creating
      setBulkItems(prev => prev.map((it, idx) => 
        idx === i ? { ...it, status: 'creating' } : it
      ));

      try {
        // Create the client
        const { data: client, error: createError } = await supabase
          .from('clients')
          .insert({
            name: item.name,
            slug: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
            website_url: item.url,
            is_active: true,
            do_rules: [],
            dont_rules: [],
            tone_presets: [],
          })
          .select()
          .single();

        if (createError) throw createError;

        // Update status to discovering
        setBulkItems(prev => prev.map((it, idx) => 
          idx === i ? { ...it, status: 'discovering', clientId: client.id } : it
        ));

        // Trigger brand discovery (don't wait for it to complete)
        supabase.functions.invoke('discover-brand', {
          body: {
            clientId: client.id,
            websiteUrl: item.url,
            clientName: item.name,
          },
        }).catch(err => console.error('Brand discovery error for', item.name, err));

        // Mark as complete
        setBulkItems(prev => prev.map((it, idx) => 
          idx === i ? { ...it, status: 'complete', clientId: client.id } : it
        ));

      } catch (error) {
        console.error('Error creating client:', item.name, error);
        setBulkItems(prev => prev.map((it, idx) => 
          idx === i ? { ...it, status: 'error', error: error instanceof Error ? error.message : 'Failed' } : it
        ));
      }

      // Small delay between clients
      await new Promise(r => setTimeout(r, 300));
    }

    setIsBulkProcessing(false);
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    
    const successCount = bulkItems.filter(it => it.status === 'complete').length;
    toast({ 
      title: 'Bulk import complete', 
      description: `${successCount} of ${bulkItems.length} clients created. Brand discovery running in background.`,
    });
  };

  const removeBulkItem = (index: number) => {
    setBulkItems(prev => prev.filter((_, i) => i !== index));
  };

  const isProcessing = setupStep !== 'idle';
  const completedCount = bulkItems.filter(it => it.status === 'complete').length;
  const errorCount = bulkItems.filter(it => it.status === 'error').length;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <Button variant="ghost" className="mb-4" onClick={() => navigate('/clients')} disabled={isProcessing || isBulkProcessing}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Clients
        </Button>

        <PageHeader
          title="Add Clients"
          description="Create clients individually or import multiple at once from URLs."
        />

        <Tabs defaultValue="single" className="mt-8">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single" className="gap-2" disabled={isBulkProcessing}>
              <Building2 className="h-4 w-4" />
              Single Client
            </TabsTrigger>
            <TabsTrigger value="bulk" className="gap-2" disabled={isProcessing}>
              <Upload className="h-4 w-4" />
              Bulk Import
            </TabsTrigger>
          </TabsList>

          {/* Single Client Tab */}
          <TabsContent value="single" className="space-y-6 mt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Client Details
                  </CardTitle>
                  <CardDescription>
                    Just the essentials - AI will extract the rest from the website.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-base font-medium">
                      Client Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Acme Corp"
                      className="text-lg h-12"
                      disabled={isProcessing}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website" className="text-base font-medium flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Website URL
                      <span className="text-xs font-normal text-muted-foreground ml-1">(recommended)</span>
                    </Label>
                    <Input
                      id="website"
                      type="url"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="h-12"
                      disabled={isProcessing}
                    />
                    <p className="text-sm text-muted-foreground">
                      We'll analyze this to extract brand voice, tone, colors, and content rules automatically.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* AI Features Card */}
              <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Wand2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-3 flex-1">
                      <div>
                        <h3 className="font-heading font-bold">AI-Powered Setup</h3>
                        <p className="text-sm text-muted-foreground">
                          When you provide a website, we automatically extract:
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span>Brand voice & tone</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span>Content do's & don'ts</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span>Logo & brand colors</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span>Legal requirements</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Progress Indicator */}
              {isProcessing && (
                <Card className="border-primary bg-primary/5">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      {setupStep === 'complete' ? (
                        <CheckCircle2 className="h-6 w-6 text-success" />
                      ) : (
                        <Loader2 className="h-6 w-6 text-primary animate-spin" />
                      )}
                      <div>
                        <p className="font-medium">{discoveryProgress}</p>
                        <div className="flex gap-3 mt-2">
                          <StepIndicator label="Create" active={setupStep === 'creating'} done={setupStep === 'discovering' || setupStep === 'complete'} />
                          <StepIndicator label="Analyze" active={setupStep === 'discovering'} done={setupStep === 'complete'} />
                          <StepIndicator label="Complete" active={setupStep === 'complete'} done={false} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => navigate('/clients')} disabled={isProcessing}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isProcessing || !name.trim()} className="min-w-32">
                  {isProcessing ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      {setupStep === 'creating' ? 'Creating...' : setupStep === 'discovering' ? 'Analyzing...' : 'Done!'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Create Client
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* Bulk Import Tab */}
          <TabsContent value="bulk" className="space-y-6 mt-6">
            {bulkItems.length === 0 ? (
              // Input phase
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-primary" />
                    Bulk Import from URLs
                  </CardTitle>
                  <CardDescription>
                    Paste website URLs (one per line) and we'll create clients with AI-extracted brand guidelines.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="bulk-urls">Website URLs</Label>
                    <Textarea
                      id="bulk-urls"
                      value={bulkUrls}
                      onChange={(e) => setBulkUrls(e.target.value)}
                      placeholder={`https://acme.com\nhttps://example.org\nwww.company.io`}
                      rows={8}
                      className="font-mono text-sm"
                    />
                    <p className="text-sm text-muted-foreground">
                      Enter one URL per line. Client names will be extracted from domain names.
                    </p>
                  </div>
                  <Button onClick={handleBulkPreview} disabled={!bulkUrls.trim()}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Preview & Import
                  </Button>
                </CardContent>
              </Card>
            ) : (
              // Preview/Progress phase
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Upload className="h-5 w-5 text-primary" />
                          {isBulkProcessing ? 'Importing Clients...' : 'Review & Import'}
                        </CardTitle>
                        <CardDescription>
                          {isBulkProcessing 
                            ? `${completedCount} of ${bulkItems.length} complete${errorCount > 0 ? `, ${errorCount} failed` : ''}`
                            : `${bulkItems.length} clients ready to import`
                          }
                        </CardDescription>
                      </div>
                      {!isBulkProcessing && (
                        <Button variant="ghost" size="sm" onClick={() => setBulkItems([])}>
                          Start Over
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {bulkItems.map((item, index) => (
                        <div
                          key={index}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                            item.status === 'complete' ? 'bg-success/5 border-success/30' :
                            item.status === 'error' ? 'bg-destructive/5 border-destructive/30' :
                            item.status === 'creating' || item.status === 'discovering' ? 'bg-primary/5 border-primary/30' :
                            'bg-muted/30'
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {item.status === 'pending' && (
                              <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                            )}
                            {(item.status === 'creating' || item.status === 'discovering') && (
                              <Loader2 className="h-5 w-5 text-primary animate-spin" />
                            )}
                            {item.status === 'complete' && (
                              <CheckCircle2 className="h-5 w-5 text-success" />
                            )}
                            {item.status === 'error' && (
                              <XCircle className="h-5 w-5 text-destructive" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.name}</span>
                              {item.status === 'discovering' && (
                                <span className="text-xs text-primary">Analyzing brand...</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                            {item.error && (
                              <p className="text-xs text-destructive mt-1">{item.error}</p>
                            )}
                          </div>
                          {item.status === 'pending' && !isBulkProcessing && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeBulkItem(index)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {item.status === 'complete' && item.clientId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/clients/${item.clientId}`)}
                            >
                              View
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Info card */}
                <Card className="bg-accent/30 border-accent">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-accent-foreground flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium">Brand discovery runs in the background</p>
                        <p className="text-muted-foreground">
                          Clients are created immediately, and AI brand analysis continues in the background. 
                          Check back in a few minutes to see extracted guidelines.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => { setBulkItems([]); setBulkUrls(''); }}
                    disabled={isBulkProcessing}
                  >
                    Cancel
                  </Button>
                  {completedCount === bulkItems.length && bulkItems.length > 0 ? (
                    <Button onClick={() => navigate('/clients')}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      View All Clients
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleBulkImport} 
                      disabled={isBulkProcessing || bulkItems.length === 0}
                    >
                      {isBulkProcessing ? (
                        <>
                          <LoadingSpinner size="sm" className="mr-2" />
                          Importing {completedCount + 1} of {bulkItems.length}...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Import {bulkItems.length} Clients
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function StepIndicator({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  const textClass = active ? 'text-primary font-medium' : done ? 'text-success' : 'text-muted-foreground';
  const dotClass = active ? 'bg-primary animate-pulse' : done ? 'bg-success' : 'bg-muted';
  
  return (
    <div className={`flex items-center gap-1.5 text-xs ${textClass}`}>
      <div className={`h-2 w-2 rounded-full ${dotClass}`} />
      {label}
    </div>
  );
}
