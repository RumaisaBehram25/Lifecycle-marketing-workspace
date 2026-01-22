import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building, Palette, Quote, Tag } from 'lucide-react';

interface BrandIdentityCardProps {
  client: {
    name: string;
    logo_url?: string | null;
    tagline?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    industry?: string | null;
    brand_voice?: string | null;
    tone_presets?: string[] | null;
  };
}

export function BrandIdentityCard({ client }: BrandIdentityCardProps) {
  const hasColors = client.primary_color || client.secondary_color;
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5 text-primary" />
          Brand Identity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo and Name */}
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
                    <p className="font-mono text-xs break-all">{client.primary_color}</p>
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
                    <p className="font-mono text-xs break-all">{client.secondary_color}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Brand Voice */}
        {client.brand_voice && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Brand Voice</h4>
            <p className="text-sm text-muted-foreground leading-relaxed bg-muted/50 p-3 rounded-lg">
              {client.brand_voice}
            </p>
          </div>
        )}

        {/* Tone Presets */}
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
  );
}
