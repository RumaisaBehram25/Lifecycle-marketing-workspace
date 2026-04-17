import { useState, useMemo } from 'react';
import { useActiveClientRow, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { useBrazeSegmentsDirectory } from '@/hooks/useBrazeSegmentsDirectory';
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
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Code, 
  Sparkles, 
  Copy, 
  Check, 
  Database, 
  Zap, 
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

export function CodeGeneratorEmbed() {
  const { data: client } = useActiveClientRow();
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
    <div className="space-y-6">
      {/* Connection Status */}
      {!hasBrazeConnection && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Braze not connected</p>
              <p className="text-xs text-muted-foreground">
                Connect Braze in the Integrations tab to access your segments and schema data
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Synced Data Status */}
      {hasBrazeConnection && hasSyncedData && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Database className="h-5 w-5 text-emerald-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Using synced Braze data</p>
              <p className="text-xs text-muted-foreground">
                {availableEvents.length} events, {availableAttributes.length} attributes, {brazeSegments.length} segments
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              Last sync: {new Date(brazeData!.last_sync!).toLocaleDateString()}
            </Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
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
                  <ScrollArea className="h-[140px]">
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
                  <ScrollArea className="h-[140px]">
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
                    <div className="text-center py-6 text-muted-foreground">
                      <Users className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No segments synced yet</p>
                      <p className="text-xs mt-1">Sync Braze to load your segments</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[140px]">
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
                      <span className="text-xs font-medium text-muted-foreground">Attributes: </span>
                      <span className="text-xs">{selectedAttributes.join(', ')}</span>
                    </div>
                  )}
                  {selectedEvents.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">Events: </span>
                      <span className="text-xs">{selectedEvents.join(', ')}</span>
                    </div>
                  )}
                  {selectedSegments.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">Segments: </span>
                      <span className="text-xs">{selectedSegments.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional Context */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Additional Context</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Describe what you want the code to do..."
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Generate Button */}
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || selectedAttributes.length === 0}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Liquid Code
              </>
            )}
          </Button>
        </div>

        {/* Output Panel */}
        <div className="space-y-4">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  Generated Code
                </CardTitle>
                {generatedCode && (
                  <Button variant="outline" size="sm" onClick={copyToClipboard}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {generatedCode ? (
                <div className="space-y-4">
                  <ScrollArea className="h-[280px] rounded-lg border bg-muted/50 p-4">
                    <pre className="text-sm font-mono whitespace-pre-wrap">
                      {generatedCode.logic}
                    </pre>
                  </ScrollArea>
                  
                  {generatedCode.explanation && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Explanation</p>
                      <p className="text-sm">{generatedCode.explanation}</p>
                    </div>
                  )}

                  {generatedCode.assumptions?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Assumptions</p>
                      <ul className="text-sm space-y-1">
                        {generatedCode.assumptions.map((a, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-muted-foreground">•</span>
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[280px] flex flex-col items-center justify-center text-muted-foreground">
                  <Code className="h-8 w-8 mb-3 opacity-50" />
                  <p className="text-sm">Select attributes and click Generate</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
