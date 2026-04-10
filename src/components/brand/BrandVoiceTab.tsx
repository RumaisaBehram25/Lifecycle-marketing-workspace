import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Target, 
  Users, 
  Sparkles, 
  Volume2,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Heart,
  Zap,
  Clock,
  TrendingUp,
  Quote,
  MessageSquare,
  Plus,
  Trash2,
} from 'lucide-react';

interface BrandVoiceTabProps {
  clientId: string;
  client: {
    brand_voice?: string | null;
    do_rules?: string[] | null;
    dont_rules?: string[] | null;
    tone_presets?: string[] | null;
    value_propositions?: string[] | null;
    key_messaging_pillars?: string[] | null;
  };
  onSaved?: () => void;
}

function listEditorState(arr: string[] | null | undefined): string[] {
  if (Array.isArray(arr) && arr.length > 0) return [...arr];
  return [''];
}

export function BrandVoiceTab({ clientId, client, onSaved }: BrandVoiceTabProps) {
  const valueProps = Array.isArray(client.value_propositions) ? client.value_propositions : null;

  const [brandVoice, setBrandVoice] = useState(() => client.brand_voice ?? '');
  const [doList, setDoList] = useState(() => listEditorState(client.do_rules));
  const [dontList, setDontList] = useState(() => listEditorState(client.dont_rules));
  const [tonePresets, setTonePresets] = useState(() => listEditorState(client.tone_presets));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBrandVoice(client.brand_voice ?? '');
    setDoList(listEditorState(client.do_rules));
    setDontList(listEditorState(client.dont_rules));
    setTonePresets(listEditorState(client.tone_presets));
  }, [clientId, client.brand_voice, client.do_rules, client.dont_rules, client.tone_presets]);

  const saveGuidelines = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          brand_voice: brandVoice.trim() || null,
          do_rules: doList.map((s) => s.trim()).filter(Boolean),
          dont_rules: dontList.map((s) => s.trim()).filter(Boolean),
          tone_presets: tonePresets.map((s) => s.trim()).filter(Boolean),
          updated_at: new Date().toISOString(),
        })
        .eq('id', clientId);
      if (error) throw error;
      toast.success('Brand guidelines saved to workspace');
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Section 1: Brand Overview */}
      <section id="overview" className="scroll-mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Brand Overview</h2>
            <p className="text-sm text-muted-foreground">Mission, purpose, and CRM's role</p>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Mission */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Mission & Purpose
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">
                Linktree empowers creators, brands, and businesses to share everything they are with a single link. 
                We exist to simplify the way people connect their audiences to the content that matters most.
              </p>
              <Separator className="my-4" />
              <div className="text-sm">
                <p className="font-medium text-muted-foreground mb-2">Primary Problem We Solve</p>
                <p className="leading-relaxed">
                  Audiences are fragmented across platforms. Linktree provides one unified link 
                  that becomes the single source of truth for everything a creator shares.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* CRM's Role */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                CRM's Role in the Customer Journey
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="p-3 bg-background rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Educator</p>
                  <p className="text-sm">Show users how to maximize their Linktree</p>
                </div>
                <div className="p-3 bg-background rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Motivator</p>
                  <p className="text-sm">Inspire action with timely, relevant nudges</p>
                </div>
                <div className="p-3 bg-background rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Utility</p>
                  <p className="text-sm">Deliver critical updates and transactional info</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 2: Target Audience */}
      <section id="audience" className="scroll-mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Target Audience</h2>
            <p className="text-sm text-muted-foreground">Who we're talking to and how they feel</p>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Audience Segments */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Audience Segments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <Badge className="bg-emerald-500 text-white shrink-0">Primary</Badge>
                <div>
                  <p className="font-medium text-sm">Creators & Influencers</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Content creators, social media influencers, artists, musicians, and personal brands 
                    looking to centralize their online presence.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border">
                <Badge variant="secondary" className="shrink-0">Secondary</Badge>
                <div>
                  <p className="font-medium text-sm">Small & Medium Businesses</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Local businesses, e-commerce shops, and service providers using Linktree 
                    as a lightweight landing page alternative.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border">
                <Badge variant="outline" className="shrink-0">Aspirational</Badge>
                <div>
                  <p className="font-medium text-sm">Enterprise & Agencies</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Large organizations and marketing agencies managing multiple profiles 
                    with advanced analytics and team features.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lifecycle Stages */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Key Lifecycle Stages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { stage: 'New User', desc: 'Just signed up, exploring', color: 'bg-blue-500' },
                  { stage: 'Activated', desc: 'Published first link', color: 'bg-emerald-500' },
                  { stage: 'Power User', desc: 'Regular engagement, Pro features', color: 'bg-purple-500' },
                  { stage: 'Churn Risk', desc: 'Declining activity', color: 'bg-red-500' },
                ].map((item) => (
                  <div key={item.stage} className="text-center p-4 border rounded-lg">
                    <div className={`h-2 w-2 rounded-full ${item.color} mx-auto mb-2`} />
                    <p className="font-medium text-sm">{item.stage}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Emotional Context */}
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Heart className="h-4 w-4 text-amber-500" />
                Emotional Context When Receiving Messages
              </CardTitle>
              <CardDescription>
                How users feel when they open our emails matters more than demographics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {['Busy', 'Curious', 'Overwhelmed', 'Motivated', 'Skeptical', 'Excited', 'Distracted', 'Goal-oriented'].map((emotion) => (
                  <Badge key={emotion} variant="outline" className="bg-background">
                    {emotion}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                <strong>Implication:</strong> Keep messages scannable. Lead with value. 
                Respect their time—they're usually multitasking.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 3: Value Propositions */}
      <section id="value-props" className="scroll-mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Value Propositions</h2>
            <p className="text-sm text-muted-foreground">Modular messaging building blocks</p>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Core Value Props */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Core Value Propositions
              </CardTitle>
              <CardDescription>Always true. Use in any context.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {(valueProps || [
                  'One link for everything you create and share',
                  'Works everywhere—Instagram, TikTok, Twitter, and more',
                  'Set up in minutes, no coding required',
                  'Trusted by 70M+ creators worldwide',
                  'Real-time analytics to understand your audience',
                ]).map((prop, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="h-5 w-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-emerald-500">{i + 1}</span>
                    </div>
                    <span className="text-sm">{prop}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Secondary Value Props */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Secondary Value Propositions
              </CardTitle>
              <CardDescription>Context-dependent. Use when relevant.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { context: 'Pro Upgrade', value: 'Advanced customization & analytics' },
                  { context: 'New Feature', value: 'Stay ahead with the latest tools' },
                  { context: 'Re-engagement', value: 'Your audience is waiting' },
                  { context: 'Seasonal', value: 'Maximize holiday traffic' },
                ].map((item) => (
                  <div key={item.context} className="p-3 border rounded-lg">
                    <Badge variant="secondary" className="text-xs mb-2">{item.context}</Badge>
                    <p className="text-sm">{item.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Proof Points */}
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Quote className="h-4 w-4 text-blue-500" />
                Proof Points & Credibility Signals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-background rounded-lg">
                  <p className="text-2xl font-bold text-primary">70M+</p>
                  <p className="text-xs text-muted-foreground">Creators worldwide</p>
                </div>
                <div className="text-center p-4 bg-background rounded-lg">
                  <p className="text-2xl font-bold text-primary">1.2B+</p>
                  <p className="text-xs text-muted-foreground">Monthly link clicks</p>
                </div>
                <div className="text-center p-4 bg-background rounded-lg">
                  <p className="text-2xl font-bold text-primary">40+</p>
                  <p className="text-xs text-muted-foreground">Integrations available</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 4: Voice & Tone */}
      <section id="voice-tone" className="scroll-mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
            <Volume2 className="h-5 w-5 text-pink-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Voice & Tone</h2>
            <p className="text-sm text-muted-foreground">How we sound in CRM messages</p>
          </div>
        </div>

        <div className="grid gap-6">
          <Card className="border-primary/25">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Guidelines for CRM Copilot</CardTitle>
              <CardDescription>
                Edit and save — CRM Copilot loads these fields from your workspace (same data as Brand settings).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="brand-voice-editor">Brand voice</Label>
                <Textarea
                  id="brand-voice-editor"
                  rows={4}
                  value={brandVoice}
                  onChange={(e) => setBrandVoice(e.target.value)}
                  placeholder="Describe how you sound across CRM touchpoints."
                />
              </div>

              <div className="space-y-2">
                <Label>Tone presets</Label>
                <p className="text-xs text-muted-foreground">Short labels (for example Encouraging, Clear) used as tone anchors in CRM Copilot.</p>
                {tonePresets.map((tone, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={tone}
                      onChange={(e) => {
                        const next = [...tonePresets];
                        next[i] = e.target.value;
                        setTonePresets(next);
                      }}
                      placeholder="e.g. Encouraging"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setTonePresets(tonePresets.filter((_, j) => j !== i))}
                      disabled={tonePresets.length <= 1}
                      aria-label="Remove tone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setTonePresets([...tonePresets, ''])}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add tone preset
                </Button>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-emerald-600 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Do&apos;s
                  </Label>
                  {doList.map((rule, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={rule}
                        onChange={(e) => {
                          const next = [...doList];
                          next[i] = e.target.value;
                          setDoList(next);
                        }}
                        placeholder="What messaging should always do"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setDoList(doList.filter((_, j) => j !== i))}
                        disabled={doList.length <= 1}
                        aria-label="Remove rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setDoList([...doList, ''])}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add do
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-red-600 flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Don&apos;ts
                  </Label>
                  {dontList.map((rule, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={rule}
                        onChange={(e) => {
                          const next = [...dontList];
                          next[i] = e.target.value;
                          setDontList(next);
                        }}
                        placeholder="What messaging should avoid"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setDontList(dontList.filter((_, j) => j !== i))}
                        disabled={dontList.length <= 1}
                        aria-label="Remove rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setDontList([...dontList, ''])}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add don&apos;t
                  </Button>
                </div>
              </div>

              <Button type="button" onClick={() => void saveGuidelines()} disabled={saving}>
                {saving ? 'Saving…' : 'Save guidelines'}
              </Button>
            </CardContent>
          </Card>

          {/* Tone by Context */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Tone Adjustments by Context
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium">Message Type</th>
                      <th className="text-left py-2 pr-4 font-medium">Tone</th>
                      <th className="text-left py-2 font-medium">Example Opening</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="py-3 pr-4">Welcome</td>
                      <td className="py-3 pr-4 text-muted-foreground">Warm, excited</td>
                      <td className="py-3 italic text-muted-foreground">"Welcome to Linktree! Let's make your link unforgettable."</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">Feature Education</td>
                      <td className="py-3 pr-4 text-muted-foreground">Helpful, clear</td>
                      <td className="py-3 italic text-muted-foreground">"Did you know you can schedule links?"</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">Re-engagement</td>
                      <td className="py-3 pr-4 text-muted-foreground">Encouraging, curious</td>
                      <td className="py-3 italic text-muted-foreground">"It's been a while! Here's what's new."</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">Upgrade Nudge</td>
                      <td className="py-3 pr-4 text-muted-foreground">Confident, aspirational</td>
                      <td className="py-3 italic text-muted-foreground">"Ready to level up your Linktree?"</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">Transactional</td>
                      <td className="py-3 pr-4 text-muted-foreground">Clear, direct</td>
                      <td className="py-3 italic text-muted-foreground">"Your receipt for Linktree Pro"</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
