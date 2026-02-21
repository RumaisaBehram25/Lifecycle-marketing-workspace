import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Building2, 
  Palette, 
  Users, 
  Target, 
  Cpu,
  Upload,
  Swords,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingData {
  companyName: string;
  industry: string;
  website: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  brandVoice: string;
  toneKeywords: string;
  primaryAudience: string;
  audienceAge: string;
  audienceInterests: string;
  primaryGoal: string;
  currentChannels: string[];
  monthlyEmailVolume: string;
  // Tech Stack
  techTools: string[];
  apiKeys: Record<string, string>;
  // Competitors
  competitors: string[];
  competitorInput: string;
  // Brand Resources
  uploadedFiles: string[];
}

const SECTIONS = [
  { id: 'company', label: 'Company Info', icon: Building2 },
  { id: 'brand', label: 'Brand Identity', icon: Palette },
  { id: 'audience', label: 'Audience & Goals', icon: Users },
  { id: 'tech', label: 'Tech Stack', icon: Cpu },
  { id: 'competitors', label: 'Competitors', icon: Swords },
  { id: 'resources', label: 'Brand Resources', icon: Upload },
];

const TECH_TOOLS = [
  'Braze', 'Klaviyo', 'Iterable', 'Customer.io', 'HubSpot',
  'Salesforce', 'Segment', 'Amplitude', 'Mixpanel', 'Snowflake',
  'Looker', 'Google Analytics', 'Figma', 'Webflow', 'Shopify',
];

const INITIAL_DATA: OnboardingData = {
  companyName: '', industry: '', website: '', tagline: '',
  primaryColor: '#3b82f6', secondaryColor: '#8b5cf6',
  brandVoice: '', toneKeywords: '',
  primaryAudience: '', audienceAge: '', audienceInterests: '',
  primaryGoal: '', currentChannels: [], monthlyEmailVolume: '',
  techTools: [], apiKeys: {},
  competitors: [], competitorInput: '',
  uploadedFiles: [],
};

export function OnboardingTab() {
  const [activeSection, setActiveSection] = useState('company');
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [submitted, setSubmitted] = useState(false);

  const updateField = (field: keyof OnboardingData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const toggleChannel = (channel: string) => {
    setData(prev => ({
      ...prev,
      currentChannels: prev.currentChannels.includes(channel)
        ? prev.currentChannels.filter(c => c !== channel)
        : [...prev.currentChannels, channel],
    }));
  };

  const toggleTool = (tool: string) => {
    setData(prev => ({
      ...prev,
      techTools: prev.techTools.includes(tool)
        ? prev.techTools.filter(t => t !== tool)
        : [...prev.techTools, tool],
    }));
  };

  const addCompetitor = () => {
    if (data.competitorInput.trim()) {
      setData(prev => ({
        ...prev,
        competitors: [...prev.competitors, prev.competitorInput.trim()],
        competitorInput: '',
      }));
    }
  };

  const removeCompetitor = (idx: number) => {
    setData(prev => ({
      ...prev,
      competitors: prev.competitors.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = () => {
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold">Onboarding Complete!</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your client profile has been set up. The dashboard and resources will now be populated with your brand information.
            </p>
            <Button onClick={() => { setSubmitted(false); }} variant="outline">
              Edit Responses
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Section Nav */}
      <div className="w-56 flex-shrink-0 space-y-1 hidden md:block">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left",
                activeSection === section.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {section.label}
            </button>
          );
        })}
        <div className="pt-4">
          <Button onClick={handleSubmit} className="w-full">
            <Check className="h-4 w-4 mr-2" />
            Complete Setup
          </Button>
        </div>
      </div>

      {/* Mobile section selector */}
      <div className="md:hidden w-full space-y-4">
        <div className="flex gap-2 flex-wrap">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                activeSection === section.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <Card>
          <CardContent className="p-6 space-y-6">
            {/* Company Info */}
            {activeSection === 'company' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Company Information</h3>
                  <p className="text-sm text-muted-foreground">Tell us about the company.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input value={data.companyName} onChange={e => updateField('companyName', e.target.value)} placeholder="Acme Corp" />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Select value={data.industry} onValueChange={v => updateField('industry', v)}>
                      <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ecommerce">E-Commerce</SelectItem>
                        <SelectItem value="saas">SaaS</SelectItem>
                        <SelectItem value="fintech">Fintech</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="education">Education</SelectItem>
                        <SelectItem value="media">Media & Entertainment</SelectItem>
                        <SelectItem value="nonprofit">Non-Profit</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Website URL</Label>
                    <Input value={data.website} onChange={e => updateField('website', e.target.value)} placeholder="https://example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Tagline / Positioning</Label>
                    <Input value={data.tagline} onChange={e => updateField('tagline', e.target.value)} placeholder="The best way to..." />
                  </div>
                </div>
              </>
            )}

            {/* Brand Identity */}
            {activeSection === 'brand' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Brand Identity</h3>
                  <p className="text-sm text-muted-foreground">Define the visual and verbal identity for CRM communications.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Primary Brand Color</Label>
                    <div className="flex gap-2">
                      <input type="color" value={data.primaryColor} onChange={e => updateField('primaryColor', e.target.value)} className="h-10 w-14 rounded border cursor-pointer" />
                      <Input value={data.primaryColor} onChange={e => updateField('primaryColor', e.target.value)} className="flex-1" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Secondary Color</Label>
                    <div className="flex gap-2">
                      <input type="color" value={data.secondaryColor} onChange={e => updateField('secondaryColor', e.target.value)} className="h-10 w-14 rounded border cursor-pointer" />
                      <Input value={data.secondaryColor} onChange={e => updateField('secondaryColor', e.target.value)} className="flex-1" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Brand Voice</Label>
                  <Textarea value={data.brandVoice} onChange={e => updateField('brandVoice', e.target.value)} placeholder="Describe the brand's communication style..." rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Tone Keywords</Label>
                  <Input value={data.toneKeywords} onChange={e => updateField('toneKeywords', e.target.value)} placeholder="e.g., Warm, Bold, Playful, Professional" />
                  <p className="text-xs text-muted-foreground">Comma-separated keywords that describe the tone</p>
                </div>
              </>
            )}

            {/* Audience & Goals */}
            {activeSection === 'audience' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Audience & Goals</h3>
                  <p className="text-sm text-muted-foreground">Who are you reaching, and what's the objective?</p>
                </div>
                <div className="space-y-2">
                  <Label>Primary Audience</Label>
                  <Textarea value={data.primaryAudience} onChange={e => updateField('primaryAudience', e.target.value)} placeholder="Describe your primary audience..." rows={3} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Age Range</Label>
                    <Select value={data.audienceAge} onValueChange={v => updateField('audienceAge', v)}>
                      <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="18-24">18–24</SelectItem>
                        <SelectItem value="25-34">25–34</SelectItem>
                        <SelectItem value="35-44">35–44</SelectItem>
                        <SelectItem value="45-54">45–54</SelectItem>
                        <SelectItem value="55+">55+</SelectItem>
                        <SelectItem value="mixed">Mixed / All Ages</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Key Interests</Label>
                    <Input value={data.audienceInterests} onChange={e => updateField('audienceInterests', e.target.value)} placeholder="e.g., Fitness, Technology, Travel" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Primary Goal</Label>
                  <Select value={data.primaryGoal} onValueChange={v => updateField('primaryGoal', v)}>
                    <SelectTrigger><SelectValue placeholder="Select primary goal" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="acquisition">Customer Acquisition</SelectItem>
                      <SelectItem value="retention">Retention & Loyalty</SelectItem>
                      <SelectItem value="reactivation">Win-back / Re-engagement</SelectItem>
                      <SelectItem value="upsell">Upsell & Cross-sell</SelectItem>
                      <SelectItem value="onboarding">User Onboarding</SelectItem>
                      <SelectItem value="full-lifecycle">Full Lifecycle Optimization</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Active Channels</Label>
                  <div className="flex flex-wrap gap-2">
                    {['Email', 'Push', 'SMS', 'In-App', 'Webhooks'].map(ch => (
                      <button
                        key={ch}
                        onClick={() => toggleChannel(ch)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                          data.currentChannels.includes(ch)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-muted-foreground border-border hover:border-primary/30"
                        )}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Monthly Email Volume</Label>
                  <Select value={data.monthlyEmailVolume} onValueChange={v => updateField('monthlyEmailVolume', v)}>
                    <SelectTrigger><SelectValue placeholder="Estimated volume" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="<10k">Under 10K</SelectItem>
                      <SelectItem value="10k-50k">10K – 50K</SelectItem>
                      <SelectItem value="50k-250k">50K – 250K</SelectItem>
                      <SelectItem value="250k-1m">250K – 1M</SelectItem>
                      <SelectItem value="1m+">1M+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Tech Stack */}
            {activeSection === 'tech' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Tech Stack</h3>
                  <p className="text-sm text-muted-foreground">Select all tools the client uses. You can add API keys for connected integrations.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TECH_TOOLS.map(tool => (
                    <button
                      key={tool}
                      onClick={() => toggleTool(tool)}
                      className={cn(
                        "px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                        data.techTools.includes(tool)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-primary/30"
                      )}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
                {data.techTools.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <p className="text-sm font-medium">API Keys (optional)</p>
                    {data.techTools.map(tool => (
                      <div key={tool} className="flex items-center gap-3">
                        <Label className="w-28 text-sm flex-shrink-0">{tool}</Label>
                        <Input
                          type="password"
                          placeholder={`${tool} API key`}
                          value={data.apiKeys[tool] || ''}
                          onChange={e => setData(prev => ({
                            ...prev,
                            apiKeys: { ...prev.apiKeys, [tool]: e.target.value },
                          }))}
                        />
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">Keys are optional and can be configured later in Settings.</p>
                  </div>
                )}
              </>
            )}

            {/* Competitors */}
            {activeSection === 'competitors' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Competitors</h3>
                  <p className="text-sm text-muted-foreground">List key competitors so we can differentiate messaging.</p>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={data.competitorInput}
                    onChange={e => updateField('competitorInput', e.target.value)}
                    placeholder="Add a competitor name"
                    onKeyDown={e => e.key === 'Enter' && addCompetitor()}
                  />
                  <Button variant="outline" onClick={addCompetitor}>Add</Button>
                </div>
                {data.competitors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {data.competitors.map((comp, idx) => (
                      <Badge key={idx} variant="secondary" className="gap-1 text-sm py-1 px-3">
                        {comp}
                        <button onClick={() => removeCompetitor(idx)} className="ml-1 hover:text-destructive">×</button>
                      </Badge>
                    ))}
                  </div>
                )}
                {data.competitors.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No competitors added yet. Type a name and press Enter or click Add.</p>
                )}
              </>
            )}

            {/* Brand Resources */}
            {activeSection === 'resources' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Brand Resources</h3>
                  <p className="text-sm text-muted-foreground">Upload logos, style guides, or any brand documentation to enrich your dashboard.</p>
                </div>
                <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
                  <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="font-medium mb-1">Drag & drop files here</p>
                  <p className="text-sm text-muted-foreground mb-4">or click to browse. PDF, PNG, JPG, SVG accepted.</p>
                  <Button variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    Browse Files
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Uploaded brand resources will be analyzed and used to populate your Brand Voice, Design, and Rules tabs automatically.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Mobile submit */}
        <div className="md:hidden pt-4">
          <Button onClick={handleSubmit} className="w-full">
            <Check className="h-4 w-4 mr-2" />
            Complete Setup
          </Button>
        </div>
      </div>
    </div>
  );
}
