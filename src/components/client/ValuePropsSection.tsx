import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Lightbulb, Sparkles } from 'lucide-react';

interface ValueProp {
  title: string;
  description?: string;
}

interface ValuePropsSectionProps {
  valuePropositions: ValueProp[] | string[] | null | undefined;
}

export function ValuePropsSection({ valuePropositions }: ValuePropsSectionProps) {
  if (!valuePropositions || valuePropositions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-5 w-5" />
            Value Propositions
          </CardTitle>
          <CardDescription>
            No value propositions discovered yet. Run AI Brand Discovery to extract them from the website.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Normalize: could be array of strings or objects
  const normalizedProps: ValueProp[] = valuePropositions.map((vp) => {
    if (typeof vp === 'string') {
      return { title: vp };
    }
    return vp as ValueProp;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Value Propositions
        </CardTitle>
        <CardDescription>
          Core benefits and promises the brand makes to customers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {normalizedProps.map((vp, i) => (
            <div 
              key={i} 
              className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-primary/5 to-transparent border"
            >
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
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
