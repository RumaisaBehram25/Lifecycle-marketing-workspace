import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, Swords, Building2, Users, Megaphone, Star } from 'lucide-react';

interface MessagingPillar {
  title: string;
  description?: string;
}

interface Differentiator {
  title: string;
  description?: string;
}

interface TargetAudience {
  name: string;
  demographics?: string;
  psychographics?: string;
}

interface MessagingStrategySectionProps {
  keyMessagingPillars?: MessagingPillar[] | string[] | null;
  differentiators?: Differentiator[] | string[] | null;
  targetAudience?: TargetAudience[] | string[] | null;
  competitors?: string[] | null;
}

export function MessagingStrategySection({ 
  keyMessagingPillars, 
  differentiators, 
  targetAudience,
  competitors
}: MessagingStrategySectionProps) {
  const hasContent = 
    (keyMessagingPillars && keyMessagingPillars.length > 0) ||
    (differentiators && differentiators.length > 0) ||
    (targetAudience && targetAudience.length > 0) ||
    (competitors && competitors.length > 0);

  if (!hasContent) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Target className="h-5 w-5" />
            Messaging Strategy
          </CardTitle>
          <CardDescription>
            No messaging strategy data discovered yet. Run AI Brand Discovery to analyze the website.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Normalize arrays
  const normalizedPillars: MessagingPillar[] = (keyMessagingPillars || []).map((p) =>
    typeof p === 'string' ? { title: p } : (p as MessagingPillar)
  );

  const normalizedDifferentiators: Differentiator[] = (differentiators || []).map((d) =>
    typeof d === 'string' ? { title: d } : (d as Differentiator)
  );

  const normalizedAudience: TargetAudience[] = (targetAudience || []).map((a) =>
    typeof a === 'string' ? { name: a } : (a as TargetAudience)
  );

  return (
    <div className="space-y-6">
      {/* Key Messaging Pillars */}
      {normalizedPillars.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              Key Messaging Pillars
            </CardTitle>
            <CardDescription>
              Core themes and messages that define the brand's communication strategy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {normalizedPillars.map((pillar, i) => (
                <div 
                  key={i} 
                  className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-transparent border"
                >
                  <h4 className="font-medium flex items-center gap-2">
                    <Star className="h-4 w-4 text-blue-500" />
                    {pillar.title}
                  </h4>
                  {pillar.description && (
                    <p className="text-sm text-muted-foreground mt-2">{pillar.description}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Differentiators */}
      {normalizedDifferentiators.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-primary" />
              Differentiators
            </CardTitle>
            <CardDescription>
              What makes this brand unique and different from competitors.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {normalizedDifferentiators.map((diff, i) => (
                <div 
                  key={i} 
                  className="flex items-start gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20"
                >
                  <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-green-600 font-bold text-sm">{i + 1}</span>
                  </div>
                  <div>
                    <h4 className="font-medium">{diff.title}</h4>
                    {diff.description && (
                      <p className="text-sm text-muted-foreground mt-1">{diff.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Target Audience */}
      {normalizedAudience.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Target Audience
            </CardTitle>
            <CardDescription>
              Key audience segments and personas the brand targets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {normalizedAudience.map((audience, i) => (
                <div 
                  key={i} 
                  className="p-4 rounded-xl border bg-card"
                >
                  <h4 className="font-medium flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-purple-500" />
                    </div>
                    {audience.name}
                  </h4>
                  {audience.demographics && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Demographics</p>
                      <p className="text-sm mt-1">{audience.demographics}</p>
                    </div>
                  )}
                  {audience.psychographics && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Psychographics</p>
                      <p className="text-sm mt-1">{audience.psychographics}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Competitors */}
      {competitors && competitors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Competitors
            </CardTitle>
            <CardDescription>
              Known competitors in the market.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {competitors.map((competitor, i) => (
                <Badge key={i} variant="outline" className="px-3 py-1">
                  {competitor}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
