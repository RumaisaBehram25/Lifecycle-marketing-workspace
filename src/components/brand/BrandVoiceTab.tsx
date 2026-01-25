import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  MessageSquare
} from 'lucide-react';

interface BrandVoiceTabProps {
  client: {
    brand_voice?: string | null;
    do_rules?: string[] | null;
    dont_rules?: string[] | null;
    value_propositions?: string[] | null;
    key_messaging_pillars?: string[] | null;
  };
}

export function BrandVoiceTab({ client }: BrandVoiceTabProps) {
  const valueProps = Array.isArray(client.value_propositions) ? client.value_propositions : null;
  const doRules = Array.isArray(client.do_rules) ? client.do_rules : null;
  const dontRules = Array.isArray(client.dont_rules) ? client.dont_rules : null;

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
          {/* Brand Voice */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Brand Voice</CardTitle>
              <CardDescription>
                {client.brand_voice || 'Our consistent personality across all touchpoints'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { trait: 'Encouraging', desc: 'We celebrate wins and motivate action' },
                  { trait: 'Clear', desc: 'No jargon. Get to the point.' },
                  { trait: 'Warm', desc: 'Friendly, never cold or corporate' },
                  { trait: 'Empowering', desc: "You're in control. We're here to help." },
                ].map((item) => (
                  <div key={item.trait} className="p-4 border rounded-lg text-center">
                    <p className="font-semibold">{item.trait}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Do's and Don'ts */}
          <div className="grid sm:grid-cols-2 gap-6">
            <Card className="border-emerald-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Do's
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(doRules || [
                    'Lead with the benefit, not the feature',
                    'Use "you" language—make it about them',
                    'Keep subject lines under 50 characters',
                    'Include one clear CTA per email',
                    'Use conversational, active voice',
                  ]).map((rule, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      {rule}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-red-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-red-600">
                  <XCircle className="h-4 w-4" />
                  Don'ts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(dontRules || [
                    "Don't use ALL CAPS or excessive punctuation!!!",
                    "Don't say 'click here'—be specific",
                    'Avoid corporate buzzwords and jargon',
                    "Don't guilt-trip or use fear tactics",
                    'Never send without proofreading',
                  ]).map((rule, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      {rule}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

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
