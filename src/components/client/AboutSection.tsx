import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Building, 
  Edit2, 
  Save, 
  X, 
  Globe, 
  Calendar,
  Check,
  AlertTriangle,
  Plus,
  Trash2,
  Users,
  Building2,
  Swords
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Differentiator {
  title: string;
  description?: string;
}

interface TargetAudience {
  name: string;
  demographics?: string;
  psychographics?: string;
}

interface AboutSectionProps {
  client: {
    id: string;
    name: string;
    website_url?: string | null;
    industry?: string | null;
    tagline?: string | null;
    created_at: string;
    do_rules?: string[] | null;
    dont_rules?: string[] | null;
    legal_requirements?: string | null;
    differentiators?: Differentiator[] | string[] | null;
    target_audience?: TargetAudience[] | string[] | null;
    competitors?: string[] | null;
  };
  isAdmin: boolean;
  onSave: (updates: Partial<AboutSectionProps['client']>) => Promise<void>;
}

export function AboutSection({ client, isAdmin, onSave }: AboutSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Editable state
  const [websiteUrl, setWebsiteUrl] = useState(client.website_url || '');
  const [industry, setIndustry] = useState(client.industry || '');
  const [tagline, setTagline] = useState(client.tagline || '');
  const [legalRequirements, setLegalRequirements] = useState(client.legal_requirements || '');
  const [doRules, setDoRules] = useState<string[]>(client.do_rules || []);
  const [dontRules, setDontRules] = useState<string[]>(client.dont_rules || []);

  // Normalize data
  const differentiators: Differentiator[] = (client.differentiators || []).map((d) =>
    typeof d === 'string' ? { title: d } : (d as Differentiator)
  );

  const targetAudience: TargetAudience[] = (client.target_audience || []).map((a) =>
    typeof a === 'string' ? { name: a } : (a as TargetAudience)
  );

  const competitors = client.competitors || [];

  const handleStartEdit = () => {
    setWebsiteUrl(client.website_url || '');
    setIndustry(client.industry || '');
    setTagline(client.tagline || '');
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
        tagline: tagline || null,
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
      {/* Account Details Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                Account Details
              </CardTitle>
              <CardDescription>
                Basic information about {client.name}
              </CardDescription>
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
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <div className="space-y-4">
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
              <div className="space-y-2">
                <Label>Tagline</Label>
                <Input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Company tagline or slogan"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-start gap-3">
                <Globe className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Website</p>
                  {client.website_url ? (
                    <a 
                      href={client.website_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {client.website_url}
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not set</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Building className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Industry</p>
                  <p className="text-sm">{client.industry || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Added</p>
                  <p className="text-sm">{new Date(client.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Target Audience & Competitors */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Target Audience */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Target Audience
            </CardTitle>
          </CardHeader>
          <CardContent>
            {targetAudience.length > 0 ? (
              <div className="space-y-3">
                {targetAudience.map((audience, i) => (
                  <div key={i} className="p-3 rounded-lg border bg-card">
                    <p className="font-medium text-sm">{audience.name}</p>
                    {audience.demographics && (
                      <p className="text-xs text-muted-foreground mt-1">{audience.demographics}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No target audience defined</p>
            )}
          </CardContent>
        </Card>

        {/* Competitors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" />
              Competitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {competitors.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {competitors.map((competitor, i) => (
                  <Badge key={i} variant="outline">{competitor}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No competitors listed</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Differentiators */}
      {differentiators.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-primary" />
              Differentiators
            </CardTitle>
            <CardDescription>What makes this brand unique</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {differentiators.map((diff, i) => (
                <div 
                  key={i} 
                  className="flex items-start gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20"
                >
                  <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-green-600 font-bold text-sm">{i + 1}</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">{diff.title}</h4>
                    {diff.description && (
                      <p className="text-xs text-muted-foreground mt-1">{diff.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
              <ScrollArea className="max-h-[300px]">
                {doRules.length > 0 ? (
                  <div className="space-y-2">
                    {doRules.map((rule, i) => (
                      <div 
                        key={i} 
                        className="flex items-start gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20"
                      >
                        <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{rule}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No rules defined</p>
                )}
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Don'ts */}
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <X className="h-5 w-5" />
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
              <ScrollArea className="max-h-[300px]">
                {dontRules.length > 0 ? (
                  <div className="space-y-2">
                    {dontRules.map((rule, i) => (
                      <div 
                        key={i} 
                        className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20"
                      >
                        <X className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{rule}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No rules defined</p>
                )}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Legal Requirements */}
      {(client.legal_requirements || isEditing) && (
        <Card className="border-orange-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Legal Requirements
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Textarea
                value={legalRequirements}
                onChange={(e) => setLegalRequirements(e.target.value)}
                placeholder="Enter legal disclaimers and requirements..."
                rows={4}
              />
            ) : (
              <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/20">
                <p className="text-sm whitespace-pre-wrap">{client.legal_requirements}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
