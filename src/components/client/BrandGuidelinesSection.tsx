import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Palette, 
  Quote, 
  Tag, 
  Lightbulb, 
  Sparkles, 
  Megaphone, 
  Star,
  FileText,
  Volume2 
} from 'lucide-react';

interface ValueProp {
  title: string;
  description?: string;
}

interface MessagingPillar {
  title: string;
  description?: string;
}

interface CopyExample {
  type?: string;
  category?: string;
  content: string;
  source?: string;
}

interface BrandGuidelinesSectionProps {
  client: {
    name: string;
    logo_url?: string | null;
    tagline?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    industry?: string | null;
    brand_voice?: string | null;
    tone_presets?: string[] | null;
    value_propositions?: ValueProp[] | string[] | null;
    key_messaging_pillars?: MessagingPillar[] | string[] | null;
    copy_examples?: CopyExample[] | null;
  };
}

export function BrandGuidelinesSection({ client }: BrandGuidelinesSectionProps) {
  const hasColors = client.primary_color || client.secondary_color;

  // Normalize value propositions
  const valueProps: ValueProp[] = (client.value_propositions || []).map((vp) =>
    typeof vp === 'string' ? { title: vp } : (vp as ValueProp)
  );

  // Normalize messaging pillars
  const messagingPillars: MessagingPillar[] = (client.key_messaging_pillars || []).map((p) =>
    typeof p === 'string' ? { title: p } : (p as MessagingPillar)
  );

  // Copy examples
  const copyExamples = client.copy_examples || [];

  return (
    <ScrollArea className="h-[calc(100vh-280px)]">
      <div className="space-y-8 pr-4">
        {/* Brand Identity Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Palette className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Brand Identity</h2>
          </div>
          
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Logo and Basic Info */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
                {client.logo_url ? (
                  <div className="h-20 w-20 rounded-xl border bg-background flex items-center justify-center p-2 overflow-hidden flex-shrink-0">
                    <img 
                      src={client.logo_url} 
                      alt={`${client.name} logo`} 
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-3xl font-bold text-primary">
                      {client.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold break-words">{client.name}</h3>
                  {client.tagline && (
                    <p className="text-muted-foreground mt-1 flex items-center justify-center sm:justify-start gap-2">
                      <Quote className="h-4 w-4 flex-shrink-0" />
                      <span className="break-words">{client.tagline}</span>
                    </p>
                  )}
                  {client.industry && (
                    <Badge variant="outline" className="mt-2">
                      <Tag className="h-3 w-3 mr-1" />
                      {client.industry}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Color Palette */}
              {hasColors && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    Brand Colors
                  </h4>
                  <div className="flex flex-wrap gap-4">
                    {client.primary_color && (
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-10 w-10 rounded-lg border shadow-sm flex-shrink-0" 
                          style={{ backgroundColor: client.primary_color }}
                        />
                        <div>
                          <p className="text-xs text-muted-foreground">Primary</p>
                          <p className="font-mono text-xs">{client.primary_color}</p>
                        </div>
                      </div>
                    )}
                    {client.secondary_color && (
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-10 w-10 rounded-lg border shadow-sm flex-shrink-0" 
                          style={{ backgroundColor: client.secondary_color }}
                        />
                        <div>
                          <p className="text-xs text-muted-foreground">Secondary</p>
                          <p className="font-mono text-xs">{client.secondary_color}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Brand Voice Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Volume2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Brand Voice</h2>
          </div>
          
          <Card>
            <CardContent className="pt-6 space-y-6">
              {client.brand_voice ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Voice Description</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed bg-muted/50 p-4 rounded-lg">
                    {client.brand_voice}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No brand voice defined yet. Run AI Brand Discovery to extract it.
                </p>
              )}

              {client.tone_presets && client.tone_presets.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Tone Presets</h4>
                  <div className="flex flex-wrap gap-2">
                    {client.tone_presets.map((tone, i) => (
                      <Badge key={i} variant="secondary" className="rounded-full">
                        {tone}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Value Propositions Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Value Propositions</h2>
          </div>
          
          {valueProps.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {valueProps.map((vp, i) => (
                <Card key={i} className="bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Lightbulb className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">{vp.title}</h4>
                        {vp.description && (
                          <p className="text-sm text-muted-foreground mt-1">{vp.description}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8">
                <p className="text-sm text-muted-foreground text-center">
                  No value propositions discovered yet. Run AI Brand Discovery.
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        <Separator />

        {/* Key Messaging Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Key Messaging Pillars</h2>
          </div>
          
          {messagingPillars.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {messagingPillars.map((pillar, i) => (
                <Card key={i} className="bg-gradient-to-br from-blue-500/10 to-transparent">
                  <CardContent className="pt-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Star className="h-4 w-4 text-blue-500" />
                      {pillar.title}
                    </h4>
                    {pillar.description && (
                      <p className="text-sm text-muted-foreground mt-2">{pillar.description}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8">
                <p className="text-sm text-muted-foreground text-center">
                  No key messaging pillars discovered yet. Run AI Brand Discovery.
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        <Separator />

        {/* Copy Examples Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Copy Examples</h2>
          </div>
          
          {copyExamples.length > 0 ? (
            <div className="space-y-4">
              {copyExamples.map((example, i) => (
                <Card key={i}>
                  <CardContent className="pt-4">
                    {(example.type || example.category) && (
                      <Badge variant="outline" className="mb-2">
                        {example.type || example.category}
                      </Badge>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{example.content}</p>
                    {example.source && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Source: {example.source}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8">
                <p className="text-sm text-muted-foreground text-center">
                  No copy examples discovered yet. Run AI Brand Discovery.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
