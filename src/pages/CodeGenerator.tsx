import { useState } from 'react';
import { useLinktreeClient, useLinktreePlatforms } from '@/hooks/useLinktreeClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Code, Sparkles, Copy, Check, RefreshCw, Plus, X } from 'lucide-react';
import type { PlatformType, CodeGeneratorInput } from '@/lib/types';
import { PLATFORM_INFO } from '@/lib/types';

const TRIGGER_TYPES = [
  { value: 'event', label: 'Event-based (user action)' },
  { value: 'segment', label: 'Segment entry' },
  { value: 'api', label: 'API triggered' },
  { value: 'scheduled', label: 'Scheduled/Recurring' },
  { value: 'property', label: 'Property change' },
];

interface GeneratedCode {
  logic: string;
  language: string;
  explanation: string;
  fallback_handling: string[];
  sources_used: string[];
  assumptions: string[];
}

export default function CodeGenerator() {
  const { data: client, isLoading: clientLoading } = useLinktreeClient();
  const { data: platforms } = useLinktreePlatforms();
  const { toast } = useToast();

  const [platform, setPlatform] = useState<PlatformType>('braze');
  const [triggerType, setTriggerType] = useState('event');
  const [attributes, setAttributes] = useState<string[]>([]);
  const [newAttribute, setNewAttribute] = useState('');
  const [edgeCases, setEdgeCases] = useState<string[]>([]);
  const [newEdgeCase, setNewEdgeCase] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null);
  const [copied, setCopied] = useState(false);

  const connectedPlatforms = platforms?.filter((p) => p.is_connected) || [];

  if (clientLoading) {
    return (
      <AppLayout>
        <LoadingPage />
      </AppLayout>
    );
  }

  const addAttribute = () => {
    if (newAttribute.trim() && !attributes.includes(newAttribute.trim())) {
      setAttributes([...attributes, newAttribute.trim()]);
      setNewAttribute('');
    }
  };

  const removeAttribute = (index: number) => {
    setAttributes(attributes.filter((_, i) => i !== index));
  };

  const addEdgeCase = () => {
    if (newEdgeCase.trim() && !edgeCases.includes(newEdgeCase.trim())) {
      setEdgeCases([...edgeCases, newEdgeCase.trim()]);
      setNewEdgeCase('');
    }
  };

  const removeEdgeCase = (index: number) => {
    setEdgeCases(edgeCases.filter((_, i) => i !== index));
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
        platform,
        trigger_type: triggerType,
        available_attributes: attributes,
        edge_cases: edgeCases,
        additional_context: additionalContext,
      };

      const { data, error } = await supabase.functions.invoke('generate-code', {
        body: { input, client },
      });

      if (error) throw error;

      setGeneratedCode(data);
      toast({ title: 'Code generated!', description: 'Your lifecycle logic is ready.' });
    } catch (error) {
      console.error('Generation error:', error);
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
          title="Code Generator"
          description="Generate Liquid/Handlebars lifecycle logic for your email templates."
        />

        <div className="mt-6 sm:mt-8 grid gap-6 lg:gap-8 lg:grid-cols-2">
          {/* Input Form */}
          <div className="space-y-6">
            {/* Platform & Trigger */}
            <Card>
              <CardHeader>
                <CardTitle>Platform & Trigger</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={platform} onValueChange={(v) => setPlatform(v as PlatformType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLATFORM_INFO).map(([key, info]) => (
                        <SelectItem key={key} value={key}>
                          {info.icon} {info.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {connectedPlatforms.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-xs text-muted-foreground">Connected:</span>
                      {connectedPlatforms.map((cp) => (
                        <PlatformBadge key={cp.id} platform={cp.platform} size="sm" />
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Trigger Type</Label>
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
                </div>
              </CardContent>
            </Card>

            {/* Attributes */}
            <Card>
              <CardHeader>
                <CardTitle>Available Attributes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={newAttribute}
                    onChange={(e) => setNewAttribute(e.target.value)}
                    placeholder="e.g., first_name, last_purchase_date"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAttribute())}
                  />
                  <Button type="button" variant="outline" onClick={addAttribute}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {attributes.map((attr, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-mono"
                    >
                      {attr}
                      <button type="button" onClick={() => removeAttribute(index)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Edge Cases */}
            <Card>
              <CardHeader>
                <CardTitle>Edge Cases to Handle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={newEdgeCase}
                    onChange={(e) => setNewEdgeCase(e.target.value)}
                    placeholder="e.g., missing first_name, invalid date"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEdgeCase())}
                  />
                  <Button type="button" variant="outline" onClick={addEdgeCase}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {edgeCases.map((ec, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-warning/10 text-warning-foreground text-sm"
                    >
                      ⚠️ {ec}
                      <button type="button" onClick={() => removeEdgeCase(index)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
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
                    placeholder="Describe what the logic should do, any specific requirements..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Button 
              className="w-full" 
              size="lg"
              onClick={handleGenerate}
              disabled={!client || isGenerating}
            >
              {isGenerating ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Generate Code
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
                    description="Fill in the parameters and click Generate to create lifecycle logic."
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
