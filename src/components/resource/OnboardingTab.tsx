import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  ClipboardList, 
  Building2, 
  Globe, 
  Palette, 
  Users, 
  Target, 
  MessageSquare,
  Mail,
  Smartphone,
  Check,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingData {
  // Company Info
  companyName: string;
  industry: string;
  website: string;
  tagline: string;
  // Brand Identity
  primaryColor: string;
  secondaryColor: string;
  brandVoice: string;
  toneKeywords: string;
  // Target Audience
  primaryAudience: string;
  audienceAge: string;
  audienceInterests: string;
  // Marketing Goals
  primaryGoal: string;
  currentChannels: string[];
  monthlyEmailVolume: string;
  // Platform
  currentPlatform: string;
  platformApiKey: string;
}

const STEPS = [
  { id: 'company', label: 'Company Info', icon: Building2 },
  { id: 'brand', label: 'Brand Identity', icon: Palette },
  { id: 'audience', label: 'Target Audience', icon: Users },
  { id: 'goals', label: 'Marketing Goals', icon: Target },
  { id: 'platform', label: 'Platform Setup', icon: Mail },
];

const INITIAL_DATA: OnboardingData = {
  companyName: '',
  industry: '',
  website: '',
  tagline: '',
  primaryColor: '#3b82f6',
  secondaryColor: '#8b5cf6',
  brandVoice: '',
  toneKeywords: '',
  primaryAudience: '',
  audienceAge: '',
  audienceInterests: '',
  primaryGoal: '',
  currentChannels: [],
  monthlyEmailVolume: '',
  currentPlatform: '',
  platformApiKey: '',
};

export function OnboardingTab() {
  const [currentStep, setCurrentStep] = useState(0);
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

  const canProceed = () => {
    switch (currentStep) {
      case 0: return data.companyName.trim().length > 0;
      case 1: return data.brandVoice.trim().length > 0;
      case 2: return data.primaryAudience.trim().length > 0;
      case 3: return data.primaryGoal.trim().length > 0;
      case 4: return true;
      default: return true;
    }
  };

  const handleSubmit = () => {
    setSubmitted(true);
    // In production, this would save to the database
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
            <Button onClick={() => { setSubmitted(false); setCurrentStep(0); }} variant="outline">
              Edit Responses
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Progress */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Step {currentStep + 1} of {STEPS.length}</span>
          <span className="font-medium">{STEPS[currentStep].label}</span>
        </div>
        <div className="flex gap-1">
          {STEPS.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-colors cursor-pointer",
                i <= currentStep ? 'bg-primary' : 'bg-muted'
              )}
              onClick={() => i <= currentStep && setCurrentStep(i)}
            />
          ))}
        </div>
        {/* Step indicators */}
        <div className="flex justify-between">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                onClick={() => i <= currentStep && setCurrentStep(i)}
                className={cn(
                  "flex flex-col items-center gap-1 text-xs transition-colors",
                  i <= currentStep ? "text-primary" : "text-muted-foreground",
                  i <= currentStep && "cursor-pointer"
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center border",
                  i < currentStep ? "bg-primary text-primary-foreground border-primary" :
                  i === currentStep ? "border-primary text-primary" :
                  "border-border text-muted-foreground"
                )}>
                  {i < currentStep ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className="hidden sm:block">{step.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="p-6 space-y-6">
          {currentStep === 0 && (
            <>
              <div>
                <h3 className="text-lg font-semibold mb-1">Company Information</h3>
                <p className="text-sm text-muted-foreground">Tell us about the company we're working with.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Company Name *</Label>
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

          {currentStep === 1 && (
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
                <Label>Brand Voice *</Label>
                <Textarea value={data.brandVoice} onChange={e => updateField('brandVoice', e.target.value)} placeholder="Describe the brand's communication style... (e.g., Friendly, approachable, and knowledgeable. We speak like a trusted friend who happens to be an expert.)" rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Tone Keywords</Label>
                <Input value={data.toneKeywords} onChange={e => updateField('toneKeywords', e.target.value)} placeholder="e.g., Warm, Bold, Playful, Professional" />
                <p className="text-xs text-muted-foreground">Comma-separated keywords that describe the tone</p>
              </div>
            </>
          )}

          {currentStep === 2 && (
            <>
              <div>
                <h3 className="text-lg font-semibold mb-1">Target Audience</h3>
                <p className="text-sm text-muted-foreground">Who are you reaching with lifecycle marketing?</p>
              </div>
              <div className="space-y-2">
                <Label>Primary Audience *</Label>
                <Textarea value={data.primaryAudience} onChange={e => updateField('primaryAudience', e.target.value)} placeholder="Describe your primary audience... (e.g., Health-conscious millennials who value convenience and sustainability)" rows={3} />
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
            </>
          )}

          {currentStep === 3 && (
            <>
              <div>
                <h3 className="text-lg font-semibold mb-1">Marketing Goals</h3>
                <p className="text-sm text-muted-foreground">What's the primary objective for CRM?</p>
              </div>
              <div className="space-y-2">
                <Label>Primary Goal *</Label>
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

          {currentStep === 4 && (
            <>
              <div>
                <h3 className="text-lg font-semibold mb-1">Platform Setup</h3>
                <p className="text-sm text-muted-foreground">Connect your email/CRM platform (optional — can be done later).</p>
              </div>
              <div className="space-y-2">
                <Label>Current Platform</Label>
                <Select value={data.currentPlatform} onValueChange={v => updateField('currentPlatform', v)}>
                  <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="braze">Braze</SelectItem>
                    <SelectItem value="klaviyo">Klaviyo</SelectItem>
                    <SelectItem value="iterable">Iterable</SelectItem>
                    <SelectItem value="customerio">Customer.io</SelectItem>
                    <SelectItem value="hubspot">HubSpot</SelectItem>
                    <SelectItem value="none">Not yet decided</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {data.currentPlatform && data.currentPlatform !== 'none' && (
                <div className="space-y-2">
                  <Label>API Key (optional)</Label>
                  <Input type="password" value={data.platformApiKey} onChange={e => updateField('platformApiKey', e.target.value)} placeholder="Enter API key for auto-sync" />
                  <p className="text-xs text-muted-foreground">This can be configured later in Settings → Platforms</p>
                </div>
              )}
              <div className="p-4 rounded-lg bg-muted/50 border border-dashed">
                <p className="text-sm text-muted-foreground">
                  <strong>Don't have a platform yet?</strong> No problem — you can skip this step and set it up later. 
                  BRCG will work with placeholder data until your platform is connected.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(prev => prev - 1)}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        {currentStep < STEPS.length - 1 ? (
          <Button onClick={() => setCurrentStep(prev => prev + 1)} disabled={!canProceed()}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit}>
            <Check className="h-4 w-4 mr-1" />
            Complete Onboarding
          </Button>
        )}
      </div>
    </div>
  );
}
