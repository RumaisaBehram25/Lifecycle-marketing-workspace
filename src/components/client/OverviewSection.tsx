import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Globe, 
  Palette, 
  Edit2,
  Save,
  X,
  Check,
  AlertTriangle,
  Plus,
  Trash2,
  Building2,
  Swords
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Differentiator {
  title: string;
  description?: string;
}

interface OverviewSectionProps {
  client: {
    id: string;
    name: string;
    logo_url?: string | null;
    tagline?: string | null;
    website_url?: string | null;
    industry?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    brand_voice?: string | null;
    created_at: string;
    target_audience?: any[] | null;
    differentiators?: any[] | null;
    value_propositions?: any[] | null;
    do_rules?: string[] | null;
    dont_rules?: string[] | null;
    legal_requirements?: string | null;
    competitors?: string[] | null;
  };
  connectedPlatformsCount: number;
  isAdmin: boolean;
  onSave: (updates: any) => Promise<void>;
}

// Map generic competitor names to real brand names
const COMPETITOR_BRAND_MAP: Record<string, { name: string; logo?: string }> = {
  'amazon': { name: 'Amazon' },
  'walmart': { name: 'Walmart' },
  'autozone': { name: 'AutoZone' },
  'ace hardware': { name: 'Ace Hardware' },
  'home depot': { name: 'The Home Depot' },
  'lowes': { name: "Lowe's" },
  'pop-a-lock': { name: 'Pop-A-Lock' },
  'aaa': { name: 'AAA' },
  'mr. locksmith': { name: 'Mr. Locksmith' },
  'car keys express': { name: 'Car Keys Express' },
  'key.me': { name: 'KeyMe' },
  'minutekey': { name: 'MinuteKEY' },
};

function normalizeCompetitor(competitor: string): string {
  const lower = competitor.toLowerCase().trim();
  return COMPETITOR_BRAND_MAP[lower]?.name || competitor;
}

export function OverviewSection({ client, connectedPlatformsCount, isAdmin, onSave }: OverviewSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Editable state
  const [websiteUrl, setWebsiteUrl] = useState(client.website_url || '');
  const [industry, setIndustry] = useState(client.industry || '');
  const [brandVoice, setBrandVoice] = useState(client.brand_voice || '');
  const [legalRequirements, setLegalRequirements] = useState(client.legal_requirements || '');
  const [doRules, setDoRules] = useState<string[]>(client.do_rules || []);
  const [dontRules, setDontRules] = useState<string[]>(client.dont_rules || []);

  const hasColors = client.primary_color || client.secondary_color;

  // Normalize differentiators
  const differentiators = (client.differentiators || []).map((d: any) =>
    typeof d === 'string' ? { title: d } : d
  );

  // Generate a one-sentence overview from brand voice or tagline
  const generateOverview = () => {
    if (client.brand_voice) {
      // Take first sentence or first 150 chars
      const firstSentence = client.brand_voice.split(/[.!?]/)[0];
      return firstSentence.length > 150 ? firstSentence.slice(0, 150) + '...' : firstSentence + '.';
    }
    if (client.tagline) {
      return client.tagline;
    }
    if (client.industry) {
      return `${client.name} is a leading company in the ${client.industry} industry.`;
    }
    return `${client.name} is a valued client partner.`;
  };

  const handleStartEdit = () => {
    setWebsiteUrl(client.website_url || '');
    setIndustry(client.industry || '');
    setBrandVoice(client.brand_voice || '');
    setLegalRequirements(client.legal_requirements || '');
    setDoRules(client.do_rules || []);
    setDontRules(client.dont_rules || []);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        website_url: websiteUrl || null,
        industry: industry || null,
        brand_voice: brandVoice || null,
        legal_requirements: legalRequirements || null,
        do_rules: doRules.filter(r => r.trim()),
        dont_rules: dontRules.filter(r => r.trim()),
      });
      setIsEditing(false);
      toast({ title: 'Account details saved' });
    } catch (error) {
      toast({ 
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addRule = (type: 'do' | 'dont') => {
    if (type === 'do') {
      setDoRules([...doRules, '']);
    } else {
      setDontRules([...dontRules, '']);
    }
  };

  const updateRule = (type: 'do' | 'dont', index: number, value: string) => {
    if (type === 'do') {
      const updated = [...doRules];
      updated[index] = value;
      setDoRules(updated);
    } else {
      const updated = [...dontRules];
      updated[index] = value;
      setDontRules(updated);
    }
  };

  const removeRule = (type: 'do' | 'dont', index: number) => {
    if (type === 'do') {
      setDoRules(doRules.filter((_, i) => i !== index));
    } else {
      setDontRules(dontRules.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="space-y-6">
      {/* Client Header Card */}
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              {/* Logo */}
              {client.logo_url ? (
                <div className="h-16 w-16 rounded-xl border bg-background flex items-center justify-center p-2 overflow-hidden flex-shrink-0">
                  <img 
                    src={client.logo_url} 
                    alt={`${client.name} logo`} 
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-primary">
                    {client.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* Name & Links */}
              <div>
                <h2 className="text-xl font-bold">{client.name}</h2>
                <div className="flex items-center gap-3 mt-1">
                  {client.website_url && (
                    <a 
                      href={client.website_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Website
                    </a>
                  )}
                  {client.industry && (
                    <span className="text-sm text-muted-foreground">
                      {client.industry}
                    </span>
                  )}
                  {hasColors && (
                    <div className="flex gap-1.5">
                      {client.primary_color && (
                        <div 
                          className="h-4 w-4 rounded-full border" 
                          style={{ backgroundColor: client.primary_color }}
                          title={`Primary: ${client.primary_color}`}
                        />
                      )}
                      {client.secondary_color && (
                        <div 
                          className="h-4 w-4 rounded-full border" 
                          style={{ backgroundColor: client.secondary_color }}
                          title={`Secondary: ${client.secondary_color}`}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isAdmin && !isEditing && (
              <Button variant="outline" size="sm" onClick={handleStartEdit}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
            {isEditing && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )}
          </div>

          {/* One sentence overview */}
          {isEditing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Brand Overview</Label>
                <Textarea
                  value={brandVoice}
                  onChange={(e) => setBrandVoice(e.target.value)}
                  placeholder="Describe the brand voice and overview..."
                  rows={3}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Website URL</Label>
                  <Input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g., Automotive, SaaS, Retail"
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {generateOverview()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Competitors & Differentiators */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Competitors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" />
              Competitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {client.competitors && client.competitors.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {client.competitors.map((competitor, i) => (
                  <Badge key={i} variant="outline" className="py-1.5 px-3">
                    {normalizeCompetitor(competitor)}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No competitors listed</p>
            )}
          </CardContent>
        </Card>

        {/* Differentiators */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Swords className="h-4 w-4 text-primary" />
              Differentiators
            </CardTitle>
          </CardHeader>
          <CardContent>
            {differentiators.length > 0 ? (
              <div className="space-y-2">
                {differentiators.slice(0, 4).map((diff: { title: string; description?: string }, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-green-600 text-xs font-bold">{i + 1}</span>
                    </div>
                    <p className="text-sm">{diff.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No differentiators defined</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Brand Rules */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Do's */}
        <Card className="border-green-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              Do's
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-2">
                {doRules.map((rule, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={rule}
                      onChange={(e) => updateRule('do', i, e.target.value)}
                      placeholder="Enter a do rule..."
                    />
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removeRule('do', i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addRule('do')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              </div>
            ) : (
              <>
                {client.do_rules && client.do_rules.length > 0 ? (
                  <ul className="space-y-2">
                    {client.do_rules.map((rule, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No rules defined</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Don'ts */}
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Don'ts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-2">
                {dontRules.map((rule, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={rule}
                      onChange={(e) => updateRule('dont', i, e.target.value)}
                      placeholder="Enter a don't rule..."
                    />
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removeRule('dont', i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addRule('dont')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              </div>
            ) : (
              <>
                {client.dont_rules && client.dont_rules.length > 0 ? (
                  <ul className="space-y-2">
                    {client.dont_rules.map((rule, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <X className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No rules defined</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Legal Requirements */}
      {(client.legal_requirements || isEditing) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4 text-primary" />
              Legal & Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Textarea
                value={legalRequirements}
                onChange={(e) => setLegalRequirements(e.target.value)}
                placeholder="Any legal requirements or compliance notes..."
                rows={3}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {client.legal_requirements}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
