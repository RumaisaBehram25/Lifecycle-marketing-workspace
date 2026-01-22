import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Check, Type, Mail, Zap, AlignLeft, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

interface CopyExample {
  text: string;
  type?: 'headline' | 'subject_line' | 'cta' | 'body' | 'tagline';
  channel?: string;
  context?: string;
}

interface CopyExamplesSectionProps {
  copyExamples: CopyExample[] | string[] | null | undefined;
}

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  headline: { label: 'Headlines', icon: Type, color: 'text-blue-500' },
  subject_line: { label: 'Subject Lines', icon: Mail, color: 'text-orange-500' },
  cta: { label: 'CTAs', icon: Zap, color: 'text-green-500' },
  body: { label: 'Body Copy', icon: AlignLeft, color: 'text-purple-500' },
  tagline: { label: 'Taglines', icon: MessageSquare, color: 'text-pink-500' },
};

export function CopyExamplesSection({ copyExamples }: CopyExamplesSectionProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!copyExamples || copyExamples.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Type className="h-5 w-5" />
            Copy Examples
          </CardTitle>
          <CardDescription>
            No copy examples discovered yet. Run AI Brand Discovery to extract them from the website.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Normalize examples
  const normalizedExamples: CopyExample[] = copyExamples.map((ex) => {
    if (typeof ex === 'string') {
      return { text: ex, type: 'headline' as const };
    }
    return ex as CopyExample;
  });

  // Group by type
  const grouped = normalizedExamples.reduce((acc, ex) => {
    const type = ex.type || 'headline';
    if (!acc[type]) acc[type] = [];
    acc[type].push(ex);
    return acc;
  }, {} as Record<string, CopyExample[]>);

  const types = Object.keys(grouped);
  const defaultType = types[0] || 'headline';

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Type className="h-5 w-5 text-primary" />
          Copy Examples
        </CardTitle>
        <CardDescription>
          Real examples of brand copy to use as reference and inspiration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {types.length > 1 ? (
          <Tabs defaultValue={defaultType}>
            <TabsList className="mb-4">
              {types.map((type) => {
                const config = TYPE_CONFIG[type] || { label: type, icon: Type, color: 'text-foreground' };
                const Icon = config.icon;
                return (
                  <TabsTrigger key={type} value={type} className="gap-2">
                    <Icon className={`h-4 w-4 ${config.color}`} />
                    {config.label} ({grouped[type].length})
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {types.map((type) => (
              <TabsContent key={type} value={type}>
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-3">
                    {grouped[type].map((ex, i) => (
                      <CopyExampleItem 
                        key={i} 
                        example={ex} 
                        index={i}
                        isCopied={copiedIndex === i}
                        onCopy={handleCopy}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {normalizedExamples.map((ex, i) => (
                <CopyExampleItem 
                  key={i} 
                  example={ex} 
                  index={i}
                  isCopied={copiedIndex === i}
                  onCopy={handleCopy}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function CopyExampleItem({ 
  example, 
  index, 
  isCopied, 
  onCopy 
}: { 
  example: CopyExample; 
  index: number; 
  isCopied: boolean;
  onCopy: (text: string, index: number) => void;
}) {
  return (
    <div className="group flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      <p className="flex-1 text-sm leading-relaxed">&ldquo;{example.text}&rdquo;</p>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {example.channel && (
          <Badge variant="outline" className="text-xs">
            {example.channel}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onCopy(example.text, index)}
        >
          {isCopied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
