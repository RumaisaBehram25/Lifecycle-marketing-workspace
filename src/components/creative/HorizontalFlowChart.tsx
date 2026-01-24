import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { 
  Mail, 
  Bell, 
  Smartphone, 
  MessageSquare,
  Timer,
  GitBranch,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// Types matching the sync-braze output
interface CanvasStep {
  id: string;
  name: string;
  type: string;
  channel?: string;
  delay_seconds?: number;
  delay_formatted?: string;
  next_step_ids: string[];
  next_paths?: Array<{ name: string; next_step_id: string; percentage?: number }>;
  messages?: Array<{
    channel: string;
    subject?: string;
    preheader?: string;
    title?: string;
    body?: string;
    html_content?: string;
    image_url?: string;
    buttons?: Array<{ text: string; action?: string; url?: string }>;
  }>;
}

interface CanvasVariant {
  name: string;
  percentage: number;
  first_step_id: string | null;
}

interface EnrichedCanvas {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  draft?: boolean;
  variants: CanvasVariant[];
  steps: Record<string, CanvasStep>;
  tags?: string[];
  first_entry?: string;
  last_entry?: string;
}

interface HorizontalFlowChartProps {
  canvas: EnrichedCanvas;
  onViewStep?: (step: CanvasStep) => void;
}

// Get channel icon
function getChannelIcon(channel?: string, className = "h-5 w-5") {
  const ch = channel?.toLowerCase() || 'email';
  switch (ch) {
    case 'email':
      return <Mail className={className} />;
    case 'push':
    case 'ios_push':
    case 'android_push':
    case 'web_push':
      return <Bell className={className} />;
    case 'in_app_message':
    case 'in-app':
      return <Smartphone className={className} />;
    case 'sms':
      return <MessageSquare className={className} />;
    default:
      return <Mail className={className} />;
  }
}

// Get channel color classes
function getChannelColors(channel?: string): { bg: string; border: string; text: string } {
  const ch = channel?.toLowerCase() || 'email';
  switch (ch) {
    case 'email':
      return { bg: 'bg-muted/30', border: 'border-border', text: 'text-foreground' };
    case 'push':
    case 'ios_push':
    case 'android_push':
    case 'web_push':
      return { bg: 'bg-muted/30', border: 'border-border', text: 'text-foreground' };
    case 'in_app_message':
    case 'in-app':
      return { bg: 'bg-muted/30', border: 'border-border', text: 'text-foreground' };
    case 'sms':
      return { bg: 'bg-muted/30', border: 'border-border', text: 'text-foreground' };
    default:
      return { bg: 'bg-muted', border: 'border-border', text: 'text-muted-foreground' };
  }
}

function normalizeChannel(channel?: string) {
  const ch = (channel || '').toLowerCase();
  if (!ch) return 'email';
  if (ch === 'email') return 'email';
  if (ch.includes('push')) return 'push';
  if (ch.includes('in_app') || ch.includes('in-app') || ch.includes('inapp')) return 'in_app_message';
  if (ch === 'sms') return 'sms';
  if (ch === 'control') return 'control';
  return ch;
}

function pickBestMessage(step: CanvasStep) {
  const msgs = step.messages || [];
  if (!msgs.length) return undefined;

  const wanted = normalizeChannel(step.channel);

  // Prefer: non-control + channel match
  const match = msgs.find((m) => normalizeChannel(m.channel) === wanted && normalizeChannel(m.channel) !== 'control');
  if (match) return match;

  // Otherwise: first non-control with any content
  const withContent = msgs.find((m) =>
    normalizeChannel(m.channel) !== 'control' &&
    (m.html_content || m.subject || m.title || m.body)
  );
  if (withContent) return withContent;

  // Fallback: first message
  return msgs[0];
}

// Render creative preview based on channel - LARGE SIZE for visibility
function CreativePreview({ step }: { step: CanvasStep }) {
  const channel = normalizeChannel(step.channel);
  const message = pickBestMessage(step);
  const colors = getChannelColors(channel);
  
  if (channel === 'email') {
    return (
      <div className="w-full h-[420px] bg-card rounded-t-lg overflow-hidden flex flex-col">
        <div className="bg-muted/30 px-5 py-4 border-b flex-shrink-0">
          <p className="text-xs text-muted-foreground truncate">From: Linktree</p>
          <p className="text-base font-medium truncate">{message?.subject || step.name}</p>
          {message?.preheader && (
            <p className="text-sm text-muted-foreground truncate mt-1">{message.preheader}</p>
          )}
        </div>
        <div className="relative flex-1 overflow-hidden bg-background">
          {message?.html_content ? (
            <iframe
              title={message?.subject || step.name}
              className="absolute left-0 top-0 border-0 origin-top-left scale-[0.5] w-[800px] h-[900px]"
              sandbox=""
              loading="lazy"
              srcDoc={message.html_content}
            />
          ) : message?.body ? (
            <div className="p-5 text-sm text-foreground leading-relaxed">
              <p>{message.body}</p>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
              <Mail className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-base font-medium">{step.name}</p>
              <p className="text-sm mt-2">Email content</p>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  if (channel === 'push' || channel.includes('push')) {
    return (
      <div className="w-full h-[420px] flex flex-col items-center justify-center p-8 bg-muted/20 rounded-t-lg">
        <div className="w-full bg-card border rounded-2xl p-5 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-primary-foreground">L</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Linktree • now</p>
              <p className="font-semibold text-base mt-1.5 line-clamp-2">{message?.title || step.name}</p>
              <p className="text-sm text-muted-foreground line-clamp-4 mt-2">
                {message?.body || 'Push notification content will appear here'}
              </p>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-6 font-medium">Push Notification</p>
      </div>
    );
  }
  
  if (channel === 'in_app_message' || channel === 'in-app') {
    return (
      <div className="w-full h-[420px] flex flex-col items-center justify-center p-8 bg-muted/20 rounded-t-lg">
        <div className="w-full bg-gradient-to-br from-card to-primary/5 border-2 border-primary/30 rounded-2xl p-8 text-center shadow-lg">
          {message?.image_url ? (
            <img src={message.image_url} alt="" className="w-20 h-20 object-cover rounded-xl mx-auto mb-5" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-5">
              <Smartphone className="h-8 w-8 text-primary" />
            </div>
          )}
          <h4 className="font-bold text-lg line-clamp-2">{message?.title || step.name}</h4>
          <p className="text-sm text-muted-foreground mt-3 line-clamp-4">
            {message?.body || 'In-app message content will appear here'}
          </p>
          {message?.buttons?.[0] ? (
            <Button size="sm" className="mt-5">{message.buttons[0].text}</Button>
          ) : (
            <Button size="sm" className="mt-5">Take Action</Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-5 font-medium">In-App Message</p>
      </div>
    );
  }
  
  // SMS fallback
  return (
    <div className="w-full h-[420px] flex flex-col items-center justify-center p-8 rounded-t-lg bg-muted/20">
      <div className={`w-full bg-card border-2 ${colors.border} rounded-2xl p-6 shadow-lg`}>
        <div className="flex items-start gap-3 mb-3">
          <MessageSquare className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium">SMS</p>
        </div>
        <p className="text-base leading-relaxed">{message?.body || step.name}</p>
      </div>
      <p className="text-sm text-muted-foreground mt-5 font-medium">SMS Message</p>
    </div>
  );
}

// Delay/Filter/Split module BELOW step
function StepMetaModule({ step, delayBefore, splitInfo }: { step: CanvasStep; delayBefore?: string; splitInfo?: { name: string; paths: number } }) {
  const type = step.type?.toLowerCase() || 'message';
  const isFilter = type === 'decision_split' || type === 'branch' || type === 'action_paths' || type === 'filter';
  
  const delayToShow = delayBefore || (step.delay_formatted && step.delay_formatted !== '0h' ? step.delay_formatted : null);
  
  if (!delayToShow && !isFilter && !splitInfo) {
    return null;
  }
  
  return (
    <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
      {delayToShow && (
        <Badge variant="outline" className="bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-400 text-xs gap-1.5 py-1">
          <Timer className="h-3.5 w-3.5" />
          {delayToShow}
        </Badge>
      )}
      {splitInfo && (
        <Badge 
          variant="outline" 
          className="bg-violet-500/10 border-violet-500/50 text-violet-700 dark:text-violet-400 text-xs gap-1.5 py-1 cursor-pointer hover:bg-violet-500/20"
          title={`Decision: ${splitInfo.name}`}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Split: {splitInfo.paths} paths
        </Badge>
      )}
      {isFilter && !splitInfo && (
        <Badge variant="outline" className="bg-violet-500/10 border-violet-500/50 text-violet-700 dark:text-violet-400 text-xs gap-1.5 py-1">
          <Filter className="h-3.5 w-3.5" />
          Filter
        </Badge>
      )}
    </div>
  );
}

// Single step card with creative - LARGE SIZE
function StepCard({ 
  step, 
  delayBefore,
  splitInfo,
  onClick 
}: { 
  step: CanvasStep; 
  delayBefore?: string;
  splitInfo?: { name: string; paths: number };
  onClick?: () => void;
}) {
  const colors = getChannelColors(step.channel);
  const type = step.type?.toLowerCase() || 'message';
  
  // Skip non-message steps (they're handled as metadata)
  if (['delay', 'wait', 'decision_split', 'branch', 'filter', 'audience_paths', 'action_paths', 'experiment_paths'].includes(type)) {
    return null;
  }
  
  return (
    <div className="flex flex-col w-[380px] flex-shrink-0">
      <Card 
        className={`cursor-pointer hover:shadow-xl transition-all border-2 ${colors.border} overflow-hidden hover:scale-[1.02]`}
        onClick={onClick}
      >
        <CardContent className="p-0">
          <CreativePreview step={step} />
        </CardContent>
      </Card>
      <StepMetaModule step={step} delayBefore={delayBefore} splitInfo={splitInfo} />
    </div>
  );
}

// Step types that are metadata/branching, not message content
const BRANCHING_TYPES = ['delay', 'wait', 'decision_split', 'branch', 'filter', 'audience_paths', 'action_paths', 'experiment_paths'];

// Build linear path from variant, following the first branch through splits
function buildLinearPath(firstStepId: string | null, allSteps: Record<string, CanvasStep>): CanvasStep[] {
  if (!firstStepId) return [];
  
  const path: CanvasStep[] = [];
  const visited = new Set<string>();
  let currentId: string | null = firstStepId;
  
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const step = allSteps[currentId];
    if (!step) break;
    
    path.push(step);
    
    // Follow first available path
    currentId = step.next_step_ids?.[0] || null;
  }
  
  return path;
}

// Variant row with horizontal scroll - EXPANDED BY DEFAULT
function VariantRow({ 
  variant, 
  steps, 
  onViewStep,
  isOpen,
  onToggle,
}: { 
  variant: CanvasVariant; 
  steps: Record<string, CanvasStep>;
  onViewStep?: (step: CanvasStep) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const path = useMemo(() => buildLinearPath(variant.first_step_id, steps), [variant.first_step_id, steps]);
  
  // Process path to extract message steps with their preceding delays/splits
  const stepsWithMetadata = useMemo(() => {
    const result: { step: CanvasStep; delayBefore?: string; splitInfo?: { name: string; paths: number } }[] = [];
    let pendingDelay: string | undefined;
    let pendingSplit: { name: string; paths: number } | undefined;
    
    for (const s of path) {
      const type = s.type?.toLowerCase() || 'message';
      
      if (type === 'delay' || type === 'wait') {
        // Accumulate delay info
        pendingDelay = s.delay_formatted || pendingDelay;
      } else if (BRANCHING_TYPES.includes(type)) {
        // Capture split/branch info
        const pathCount = s.next_step_ids?.length || s.next_paths?.length || 2;
        pendingSplit = { name: s.name, paths: pathCount };
      } else {
        // This is a message step - attach accumulated metadata
        result.push({ 
          step: s, 
          delayBefore: pendingDelay,
          splitInfo: pendingSplit,
        });
        pendingDelay = undefined;
        pendingSplit = undefined;
      }
    }
    return result;
  }, [path]);
  
  const isControl = variant.name.toLowerCase().includes('control');
  
  const roundedPercentage = Math.round(variant.percentage);
  
  // Don't render control variants at all
  if (isControl) {
    return null;
  }
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="font-medium">{variant.name}</span>
          <Badge variant="outline">
            {roundedPercentage}%
          </Badge>
        </div>
        <span className="text-sm text-muted-foreground">
          {stepsWithMetadata.length} touchpoint{stepsWithMetadata.length !== 1 ? 's' : ''}
        </span>
      </button>
      
      {isOpen && (
        <div className="border-t bg-background">
          {variant.first_step_id && stepsWithMetadata.length > 0 ? (
            <ScrollArea className="w-full">
              <div className="flex items-start gap-8 p-8 min-w-max">
                {stepsWithMetadata.map(({ step, delayBefore, splitInfo }) => (
                  <StepCard 
                    key={step.id}
                    step={step} 
                    delayBefore={delayBefore}
                    splitInfo={splitInfo}
                    onClick={() => onViewStep?.(step)}
                  />
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="h-3" />
            </ScrollArea>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-sm">
                {isControl ? 'Control group - no messages sent' : 'No message steps found in this path'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function HorizontalFlowChart({ canvas, onViewStep }: HorizontalFlowChartProps) {
  const hasVariants = canvas.variants && canvas.variants.length > 0;
  const hasSteps = canvas.steps && Object.keys(canvas.steps).length > 0;
  
  // If no variants but has steps, create a default path
  const effectiveVariants = useMemo(() => {
    if (hasVariants) {
      // Filter out control variants
      return canvas.variants.filter(v => !v.name.toLowerCase().includes('control'));
    }
    
    if (hasSteps) {
      const allNextIds = new Set<string>();
      Object.values(canvas.steps).forEach(s => {
        s.next_step_ids?.forEach(id => allNextIds.add(id));
      });
      
      const entrySteps = Object.keys(canvas.steps).filter(id => !allNextIds.has(id));
      if (entrySteps.length > 0) {
        return [{
          name: 'Main Path',
          percentage: 100,
          first_step_id: entrySteps[0],
        }];
      }
    }
    
    return [];
  }, [canvas.variants, canvas.steps, hasVariants, hasSteps]);
  
  // Default all variants to open (and re-open when switching canvases / when variants arrive)
  const [openVariants, setOpenVariants] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setOpenVariants(new Set(effectiveVariants.map((_, i) => i)));
  }, [canvas.id, effectiveVariants.length]);
  
  const toggleVariant = (idx: number) => {
    const newOpen = new Set(openVariants);
    if (newOpen.has(idx)) {
      newOpen.delete(idx);
    } else {
      newOpen.add(idx);
    }
    setOpenVariants(newOpen);
  };
  
  const toggleAll = () => {
    if (openVariants.size === effectiveVariants.length) {
      setOpenVariants(new Set());
    } else {
      setOpenVariants(new Set(effectiveVariants.map((_, i) => i)));
    }
  };
  
  if (!hasSteps && effectiveVariants.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">
            <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No steps synced for this canvas</p>
            <p className="text-xs mt-1">Try syncing Braze data again</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Journey Flow
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {effectiveVariants.length} variant{effectiveVariants.length !== 1 ? 's' : ''}
          </span>
          {effectiveVariants.length > 1 && (
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {openVariants.size === effectiveVariants.length ? 'Collapse All' : 'Expand All'}
            </Button>
          )}
        </div>
      </div>
      
      <div className="space-y-3">
        {effectiveVariants.map((variant, idx) => (
          <VariantRow
            key={variant.name + idx}
            variant={variant}
            steps={canvas.steps}
            onViewStep={onViewStep}
            isOpen={openVariants.has(idx)}
            onToggle={() => toggleVariant(idx)}
          />
        ))}
      </div>
    </div>
  );
}
