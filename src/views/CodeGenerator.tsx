import { useState, useMemo } from 'react';
import { useDoubleGoodClient, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { useBrazeSegmentsDirectory } from '@/hooks/useBrazeSegmentsDirectory';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Code, 
  Sparkles, 
  Copy, 
  Check, 
  RefreshCw, 
  Database, 
  Zap, 
  Tag, 
  AlertCircle,
  Users,
  Activity,
  Settings2,
} from 'lucide-react';
import type { CodeGeneratorInput } from '@/lib/types';
import { Link } from 'react-router-dom';
import { logger } from '@/lib/logger';

const TRIGGER_TYPES = [
  { value: 'event', label: 'Event-based (user action)' },
  { value: 'segment', label: 'Segment entry' },
  { value: 'api', label: 'API triggered' },
  { value: 'scheduled', label: 'Scheduled/Recurring' },
  { value: 'property', label: 'Property change' },
];

interface BrazeSchemaCache {
  segments?: Array<{ id: string; name: string; description?: string; is_starred?: boolean }>;
  campaigns?: Array<{ id: string; name: string; channels?: string[] }>;
  canvases?: Array<{ id: string; name: string }>;
  custom_events?: Array<{ name: string; description?: string; last_received_at?: string }>;
  custom_attributes?: Array<{ name: string; data_type: string; description?: string }>;
  last_sync?: string;
}

interface GeneratedCode {
  logic: string;
  language: string;
  explanation: string;
  fallback_handling: string[];
  sources_used: string[];
  assumptions: string[];
}

// Common Braze attributes (fallback)
const COMMON_BRAZE_ATTRIBUTES = [
  { name: 'first_name', type: 'string', description: 'User first name' },
  { name: 'last_name', type: 'string', description: 'User last name' },
  { name: 'email', type: 'string', description: 'Email address' },
  { name: 'gender', type: 'string', description: 'User gender' },
  { name: 'country', type: 'string', description: 'Country code' },
  { name: 'language', type: 'string', description: 'User language' },
  { name: 'time_zone', type: 'string', description: 'Timezone' },
  { name: 'push_subscribe', type: 'boolean', description: 'Push subscription status' },
  { name: 'email_subscribe', type: 'boolean', description: 'Email subscription status' },
];

// Common Braze events (fallback)
const COMMON_BRAZE_EVENTS = [
  { name: 'purchase', description: 'User made a purchase' },
  { name: 'session_start', description: 'App session started' },
  { name: 'link_click', description: 'User clicked a link' },
  { name: 'signup_complete', description: 'User completed signup' },
  { name: 'feature_enabled', description: 'User enabled a feature' },
];

export default function CodeGenerator() {
  const { data: client, isLoading: clientLoading } = useDoubleGoodClient();
  const { data: platforms } = useDoubleGoodPlatforms();
  const { toast } = useToast();

  const [activeDataTab, setActiveDataTab] = useState('attributes');
  const [triggerType, setTriggerType] = useState('event');
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [customAttribute, setCustomAttribute] = useState('');
  const [customEvent, setCustomEvent] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null);
  const [copied, setCopied] = useState(false);

  // Get Braze platform data
  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const brazeData = brazePlatform?.schema_cache as BrazeSchemaCache | undefined;
  const hasBrazeConnection = !!brazePlatform;
  const hasSyncedData = !!brazeData?.last_sync;
  const { data: segmentsFromSync = [] } = useBrazeSegmentsDirectory(
    client?.id && brazePlatform ? client.id : undefined,
  );

  // Use synced data or fall back to common defaults
  const availableAttributes = useMemo(() => {
    if (brazeData?.custom_attributes?.length) {
      return brazeData.custom_attributes.map(a => ({
        name: a.name,
        type: a.data_type,
        description: a.description || `Custom attribute: ${a.name}`,
      }));
    }
    return COMMON_BRAZE_ATTRIBUTES;
  }, [brazeData?.custom_attributes]);

  const availableEvents = useMemo(() => {
    if (brazeData?.custom_events?.length) {
      return brazeData.custom_events.map(e => ({
        name: e.name,
        description: e.description || `Custom event: ${e.name}`,
        last_received_at: e.last_received_at,
      }));
    }
    return COMMON_BRAZE_EVENTS;
  }, [brazeData?.custom_events]);

  const brazeSegments = useMemo(() => {
    if (segmentsFromSync.length > 0) return segmentsFromSync;
    return brazeData?.segments || [];
  }, [segmentsFromSync, brazeData?.segments]);

  if (clientLoading) {
    return (
      <AppLayout>
        <LoadingPage />
      </AppLayout>
    );
  }

  const toggleAttribute = (attr: string) => {
    setSelectedAttributes(prev => 
      prev.includes(attr) ? prev.filter(a => a !== attr) : [...prev, attr]
    );
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents(prev => 
      prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
    );
  };

  const toggleSegment = (segment: string) => {
    setSelectedSegments(prev => 
      prev.includes(segment) ? prev.filter(s => s !== segment) : [...prev, segment]
    );
  };

  const addCustomAttribute = () => {
    if (customAttribute.trim() && !selectedAttributes.includes(customAttribute.trim())) {
      setSelectedAttributes([...selectedAttributes, customAttribute.trim()]);
      setCustomAttribute('');
    }
  };

  const addCustomEvent = () => {
    if (customEvent.trim() && !selectedEvents.includes(customEvent.trim())) {
      setSelectedEvents([...selectedEvents, customEvent.trim()]);
      setCustomEvent('');
    }
  };

  const handleGenerate = async () => {
    if (!client) {
      toast({ title: 'Loading...', description: 'Please wait for the brand to load.', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    setGeneratedCode(null);

    try {
      const input: CodeGeneratorInput = {
        client_id: client.id,
        platform: 'braze',
        trigger_type: triggerType,
        available_attributes: selectedAttributes,
        edge_cases: selectedEvents.map(e => `Handle ${e} event`),
        additional_context: `
Events to handle: ${selectedEvents.join(', ')}
${selectedSegments.length > 0 ? `Target segments: ${selectedSegments.join(', ')}` : ''}
${brazeSegments.length > 0 ? `Available segments: ${brazeSegments.slice(0, 10).map(s => s.name).join(', ')}` : ''}
${additionalContext}
        `.trim(),
      };

      const { data, error } = await supabase.functions.invoke('generate-code', {
        body: { input, client },
      });

      if (error) throw error;

      setGeneratedCode(data);
      toast({ title: 'Code generated!', description: 'Your Braze Liquid code is ready.' });
    } catch (error) {
      logger.error('Generation error:', error);
      toast({ 
        title: 'Generation failed', 
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive' 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (generatedCode) {
      await navigator.clipboard.writeText(generatedCode.logic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Copied!', description: 'Code copied to clipboard.' });
    }
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <PageHeader
          title="Braze Code Generator"
          description="Generate Liquid code for Braze email templates using your synced data"
        />

        {/* Connection Status */}
        {!hasBrazeConnection && (
          <Card className="mt-6 border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Braze not connected</p>
                <p className="text-xs text-muted-foreground">
                  Connect Braze in the Knowledge Base to access your segments and schema data
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/knowledge">Connect Braze</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Synced Data Status */}
        {hasBrazeConnection && hasSyncedData && (
          <Card className="mt-6 border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <Database className="h-5 w-5 text-emerald-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Using synced Braze data</p>
                <p className="text-xs text-muted-foreground">
                  {availableEvents.length} events, {availableAttributes.length} attributes, {brazeSegments.length} segments
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Last sync: {new Date(brazeData.last_sync!).toLocaleDateString()}
              </Badge>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 sm:mt-8 grid gap-6 lg:gap-8 lg:grid-cols-2">
          {/* Input Form */}
          <div className="space-y-6">
            {/* Trigger Type */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Trigger Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={triggerType} onValueChange={setTriggerType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map((trigger) => (
                      <SelectItem key={trigger.value} value={trigger.value}>
                        {trigger.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Data Selection Tabs */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Braze Data
                </CardTitle>
                <CardDescription>
                  {hasSyncedData ? 'Select from your synced Braze schema' : 'Using common Braze attributes and events'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeDataTab} onValueChange={setActiveDataTab}>
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="attributes" className="gap-1.5 text-xs">
                      <Settings2 className="h-3.5 w-3.5" />
                      Attributes
                    </TabsTrigger>
                    <TabsTrigger value="events" className="gap-1.5 text-xs">
                      <Activity className="h-3.5 w-3.5" />
                      Events
                    </TabsTrigger>
                    <TabsTrigger value="segments" className="gap-1.5 text-xs">
                      <Users className="h-3.5 w-3.5" />
                      Segments
                    </TabsTrigger>
                  </TabsList>

                  {/* Attributes Tab */}
                  <TabsContent value="attributes" className="space-y-4 mt-0">
                    <ScrollArea className="h-[180px]">
                      <div className="flex flex-wrap gap-2">
                        {availableAttributes.map((attr) => (
                          <button
                            key={attr.name}
                            onClick={() => toggleAttribute(attr.name)}
                            className={`px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${
                              selectedAttributes.includes(attr.name)
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted hover:bg-muted/80'
                            }`}
                            title={attr.description}
                          >
                            {attr.name}
                            <span className="ml-1 opacity-60">({attr.type})</span>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="flex gap-2">
                      <Input
                        value={customAttribute}
                        onChange={(e) => setCustomAttribute(e.target.value)}
                        placeholder="Add custom attribute..."
                        className="font-mono text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomAttribute())}
                      />
                      <Button variant="outline" size="sm" onClick={addCustomAttribute}>
                        Add
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Events Tab */}
                  <TabsContent value="events" className="space-y-4 mt-0">
                    <ScrollArea className="h-[180px]">
                      <div className="flex flex-wrap gap-2">
                        {availableEvents.map((event) => (
                          <button
                            key={event.name}
                            onClick={() => toggleEvent(event.name)}
                            className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                              selectedEvents.includes(event.name)
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted hover:bg-muted/80'
                            }`}
                            title={event.description}
                          >
                            {event.name}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="flex gap-2">
                      <Input
                        value={customEvent}
                        onChange={(e) => setCustomEvent(e.target.value)}
                        placeholder="Add custom event..."
                        className="text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomEvent())}
                      />
                      <Button variant="outline" size="sm" onClick={addCustomEvent}>
                        Add
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Segments Tab */}
                  <TabsContent value="segments" className="space-y-4 mt-0">
                    {brazeSegments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No segments synced yet</p>
                        <p className="text-xs mt-1">Sync Braze to load your segments</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[180px]">
                        <div className="flex flex-wrap gap-2">
                          {brazeSegments.map((segment) => (
                            <button
                              key={segment.id}
                              onClick={() => toggleSegment(segment.name)}
                              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                                selectedSegments.includes(segment.name)
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted hover:bg-muted/80'
                              }`}
                              title={segment.description}
                            >
                              {segment.is_starred && '⭐ '}
                              {segment.name}
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </TabsContent>
                </Tabs>

                {/* Selected Items Summary */}
                {(selectedAttributes.length > 0 || selectedEvents.length > 0 || selectedSegments.length > 0) && (
                  <div className="pt-4 border-t mt-4 space-y-2">
                    {selectedAttributes.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Attributes ({selectedAttributes.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedAttributes.map((attr) => (
                            <Badge 
                              key={attr} 
                              variant="secondary" 
                              className="font-mono text-xs cursor-pointer"
                              onClick={() => toggleAttribute(attr)}
                            >
                              {attr} ×
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedEvents.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Events ({selectedEvents.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedEvents.map((event) => (
                            <Badge 
                              key={event} 
                              variant="secondary" 
                              className="text-xs cursor-pointer"
                              onClick={() => toggleEvent(event)}
                            >
                              {event} ×
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedSegments.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Segments ({selectedSegments.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedSegments.map((segment) => (
                            <Badge 
                              key={segment} 
                              variant="secondary" 
                              className="text-xs cursor-pointer"
                              onClick={() => toggleSegment(segment)}
                            >
                              {segment} ×
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Additional Context */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <Label>Additional Context (optional)</Label>
                  <Textarea
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    placeholder="Describe what the logic should do, edge cases to handle..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Button 
              className="w-full" 
              size="lg"
              onClick={handleGenerate}
              disabled={!client || isGenerating || selectedAttributes.length === 0}
            >
              {isGenerating ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Generate Braze Liquid
                </>
              )}
            </Button>
          </div>

          {/* Output */}
          <div className="space-y-6">
            {!generatedCode ? (
              <Card className="h-full min-h-[400px] flex items-center justify-center">
                <CardContent>
                  <EmptyState
                    icon={Code}
                    title="No code generated yet"
                    description="Select attributes and events, then click Generate to create Braze Liquid code."
                  />
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Code Block */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Code className="h-4 w-4" />
                        {generatedCode.language}
                      </CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyToClipboard}
                      >
                        {copied ? (
                          <>
                            <Check className="mr-2 h-4 w-4 text-success" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="p-4 rounded-lg bg-sidebar text-sidebar-foreground overflow-x-auto text-sm font-mono">
                      <code>{generatedCode.logic}</code>
                    </pre>
                  </CardContent>
                </Card>

                {/* Explanation */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Explanation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {generatedCode.explanation}
                    </p>
                  </CardContent>
                </Card>

                {/* Fallback Handling */}
                {generatedCode.fallback_handling.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Fallback Handling</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {generatedCode.fallback_handling.map((fallback, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-success">✓</span>
                            {fallback}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Sources & Assumptions */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Sources & Assumptions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    {generatedCode.sources_used.length > 0 && (
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Sources Used:</p>
                        <ul className="list-disc list-inside text-muted-foreground">
                          {generatedCode.sources_used.map((source, i) => (
                            <li key={i}>{source}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {generatedCode.assumptions.length > 0 && (
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Assumptions Made:</p>
                        <ul className="list-disc list-inside text-muted-foreground">
                          {generatedCode.assumptions.map((assumption, i) => (
                            <li key={i}>{assumption}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Button variant="outline" className="w-full" onClick={handleGenerate}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
