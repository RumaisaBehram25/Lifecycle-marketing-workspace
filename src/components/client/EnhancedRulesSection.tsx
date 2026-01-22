import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, X, AlertTriangle, Shield, MessageCircle, Volume2 } from 'lucide-react';

interface EnhancedRulesSectionProps {
  doRules?: string[] | null;
  dontRules?: string[] | null;
  legalRequirements?: string | null;
}

// Categorize rules by type
function categorizeRule(rule: string): 'tone' | 'content' | 'legal' | 'general' {
  const toneTriggers = ['tone', 'voice', 'friendly', 'professional', 'casual', 'formal', 'empathetic', 'energetic'];
  const legalTriggers = ['legal', 'disclaimer', 'copyright', 'trademark', 'compliance', 'regulation', 'gdpr', 'privacy'];
  const contentTriggers = ['content', 'message', 'copy', 'headline', 'subject', 'cta', 'text', 'word', 'phrase'];
  
  const lowerRule = rule.toLowerCase();
  
  if (legalTriggers.some(t => lowerRule.includes(t))) return 'legal';
  if (toneTriggers.some(t => lowerRule.includes(t))) return 'tone';
  if (contentTriggers.some(t => lowerRule.includes(t))) return 'content';
  return 'general';
}

const CATEGORY_CONFIG = {
  tone: { label: 'Tone & Voice', icon: Volume2, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  content: { label: 'Content', icon: MessageCircle, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  legal: { label: 'Legal & Compliance', icon: Shield, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  general: { label: 'General', icon: Check, color: 'text-green-500', bg: 'bg-green-500/10' },
};

export function EnhancedRulesSection({ doRules, dontRules, legalRequirements }: EnhancedRulesSectionProps) {
  const hasRules = (doRules && doRules.length > 0) || (dontRules && dontRules.length > 0);
  
  if (!hasRules && !legalRequirements) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-muted-foreground">Brand Rules</CardTitle>
          <CardDescription>
            No brand rules discovered yet. Run AI Brand Discovery to extract guidelines from the website.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Group rules by category
  const groupRules = (rules: string[] | null | undefined) => {
    if (!rules) return {};
    return rules.reduce((acc, rule) => {
      const category = categorizeRule(rule);
      if (!acc[category]) acc[category] = [];
      acc[category].push(rule);
      return acc;
    }, {} as Record<string, string[]>);
  };

  const groupedDoRules = groupRules(doRules);
  const groupedDontRules = groupRules(dontRules);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Do's */}
      <Card className="border-green-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-green-600">
            <Check className="h-5 w-5" />
            Do's
          </CardTitle>
          <CardDescription>
            Best practices and guidelines to follow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            {Object.keys(groupedDoRules).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(groupedDoRules).map(([category, rules]) => {
                  const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
                  const Icon = config.icon;
                  return (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`h-4 w-4 ${config.color}`} />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {config.label}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {rules.map((rule, i) => (
                          <div 
                            key={i} 
                            className="flex items-start gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20"
                          >
                            <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No rules defined.</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Don'ts */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <X className="h-5 w-5" />
            Don'ts
          </CardTitle>
          <CardDescription>
            Things to avoid in brand communication.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            {Object.keys(groupedDontRules).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(groupedDontRules).map(([category, rules]) => {
                  const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
                  const Icon = config.icon;
                  return (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`h-4 w-4 ${config.color}`} />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {config.label}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {rules.map((rule, i) => (
                          <div 
                            key={i} 
                            className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20"
                          >
                            <X className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No rules defined.</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Legal Requirements - Full Width */}
      {legalRequirements && (
        <Card className="md:col-span-2 border-orange-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Legal Requirements
            </CardTitle>
            <CardDescription>
              Mandatory legal disclaimers and compliance requirements.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/20">
              <p className="text-sm whitespace-pre-wrap">{legalRequirements}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
