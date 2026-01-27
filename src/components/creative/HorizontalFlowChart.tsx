import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  ArrowRight,
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
    case 'trigger_in_app_message':
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
    case 'trigger_in_app_message':
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
  // Handle all in-app variations: in_app_message, trigger_in_app_message, in-app, inapp
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
      <div className="w-full h-[520px] bg-card overflow-hidden flex flex-col">
        {/* Step name header */}
        <div className="bg-primary/10 px-2 py-1.5 flex-shrink-0 border-b border-primary/20">
          <p className="text-xs font-semibold text-primary truncate">{step.name}</p>
        </div>
        <div className="bg-muted/30 px-2 py-2 border-b flex-shrink-0">
          <p className="text-xs text-muted-foreground truncate">From: Linktree</p>
          <p className="text-sm font-medium truncate">{message?.subject || 'No subject'}</p>
          {message?.preheader && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{message.preheader}</p>
          )}
        </div>
        <div className="relative flex-1 overflow-hidden bg-background">
          {message?.html_content ? (
            <iframe
              title={message?.subject || step.name}
              className="absolute inset-0 border-0 origin-top-left scale-[0.35] w-[286%] h-[286%]"
              sandbox=""
              loading="lazy"
              srcDoc={message.html_content}
            />
          ) : message?.body ? (
            <div className="p-2 text-sm text-foreground leading-relaxed">
              <p>{message.body}</p>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
              <Mail className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">{step.name}</p>
              <p className="text-xs mt-1">Email content</p>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  if (channel === 'push' || channel.includes('push')) {
    return (
      <div className="w-full h-[520px] flex flex-col items-center justify-center p-4 bg-muted/20 rounded-t-lg">
        {/* Step name header */}
        <div className="w-full bg-primary/10 px-3 py-1.5 rounded-t-lg mb-2 -mt-2">
          <p className="text-xs font-semibold text-primary truncate text-center">{step.name}</p>
        </div>
        <div className="w-full bg-card border rounded-2xl p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <img 
              src="/logos/linktree-logo.png" 
              alt="Linktree" 
              className="h-10 w-10 rounded-lg object-contain flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground">Linktree • now</p>
              <p className="font-semibold text-sm mt-1 line-clamp-1">{message?.title || step.name}</p>
              {message?.body && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {message.body}
                </p>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4 font-medium">Push Notification</p>
      </div>
    );
  }
  
  if (channel === 'in_app_message' || channel === 'in-app' || channel === 'trigger_in_app_message') {
    // Check if body is HTML (Braze stores in-app HTML in body field)
    const bodyContent = message?.body || '';
    const isHtmlBody = bodyContent.trim().startsWith('<!doctype') || bodyContent.trim().startsWith('<html') || bodyContent.includes('<div');
    
    if (isHtmlBody) {
      // Render as sandboxed iframe like email
      return (
        <div className="w-full h-[520px] bg-card rounded-t-lg overflow-hidden flex flex-col">
          {/* Step name header */}
          <div className="bg-primary/10 px-3 py-1.5 flex-shrink-0 border-b border-primary/20">
            <p className="text-xs font-semibold text-primary truncate">{step.name}</p>
          </div>
          <div className="bg-muted/30 px-3 py-3 border-b flex-shrink-0 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">In-App Message</span>
          </div>
          <div className="relative flex-1 overflow-hidden bg-background">
            <iframe
              title={message?.title || step.name}
              className="absolute inset-0 border-0 origin-top-left scale-[0.45] w-[222%] h-[222%]"
              sandbox=""
              loading="lazy"
              srcDoc={bodyContent}
            />
          </div>
        </div>
      );
    }
    
    // Fallback to simple card rendering
    return (
      <div className="w-full h-[520px] flex flex-col items-center justify-center p-4 bg-muted/20 rounded-t-lg">
        {/* Step name header */}
        <div className="w-full bg-primary/10 px-3 py-1.5 rounded-t-lg mb-2 -mt-2">
          <p className="text-xs font-semibold text-primary truncate text-center">{step.name}</p>
        </div>
        <div className="w-full bg-gradient-to-br from-card to-primary/5 border-2 border-primary/30 rounded-2xl p-6 text-center shadow-lg">
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
    <div className="w-full h-[520px] flex flex-col items-center justify-center p-4 rounded-t-lg bg-muted/20">
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

// Format delay as compact time (e.g., "2H", "3D", "30M")
function formatDelayCompact(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(seconds / 3600);
  const days = Math.round(seconds / 86400);
  
  if (days >= 1) {
    return `${days}D`;
  } else if (hours >= 1) {
    return `${hours}H`;
  } else if (minutes >= 1) {
    return `${minutes}M`;
  }
  return null;
}

// Delay/Filter/Split module BELOW step - Enhanced with more detail
function StepMetaModule({ 
  step, 
  delaySeconds,
  splitStep,
  onSplitClick,
}: { 
  step: CanvasStep; 
  delaySeconds?: number;
  splitStep?: CanvasStep;
  onSplitClick?: (splitStep: CanvasStep) => void;
}) {
  const type = step.type?.toLowerCase() || 'message';
  const isFilter = type === 'decision_split' || type === 'branch' || type === 'filter';
  const isAudiencePath = type === 'audience_paths';
  const isActionPath = type === 'action_paths';
  const isExperiment = type === 'experiment_paths';
  const delayLabel = formatDelayCompact(delaySeconds);
  
  if (!delayLabel && !isFilter && !isAudiencePath && !isActionPath && !isExperiment && !splitStep) {
    return null;
  }
  
  // Determine split type label
  const getSplitLabel = (s: CanvasStep) => {
    const sType = s.type?.toLowerCase() || '';
    if (sType === 'decision_split' || sType === 'branch') return 'Decision Split';
    if (sType === 'audience_paths') return 'Audience Path';
    if (sType === 'action_paths') return 'Action Path';
    if (sType === 'experiment_paths') return 'A/B Test';
    if (sType === 'filter') return 'Filter';
    return `${s.next_paths?.length || 2} paths`;
  };
  
  return (
    <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
      {delayLabel && (
        <Badge variant="outline" className="bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-400 text-xs gap-1.5 py-1 font-semibold">
          <Timer className="h-3.5 w-3.5" />
          {delayLabel} delay
        </Badge>
      )}
      {splitStep && (
        <Badge 
          variant="outline" 
          className="bg-violet-500/10 border-violet-500/50 text-violet-700 dark:text-violet-400 text-xs gap-1.5 py-1 cursor-pointer hover:bg-violet-500/20 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onSplitClick?.(splitStep);
          }}
        >
          <GitBranch className="h-3.5 w-3.5" />
          {getSplitLabel(splitStep)}
        </Badge>
      )}
      {isFilter && !splitStep && (
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
  delaySeconds,
  splitStep,
  onClick,
  onSplitClick,
}: { 
  step: CanvasStep; 
  delaySeconds?: number;
  splitStep?: CanvasStep;
  onClick?: () => void;
  onSplitClick?: (splitStep: CanvasStep) => void;
}) {
  const colors = getChannelColors(step.channel);
  const type = step.type?.toLowerCase() || 'message';
  
  // Skip non-message steps (they're handled as metadata)
  if (['delay', 'wait', 'decision_split', 'branch', 'filter', 'audience_paths', 'action_paths', 'experiment_paths'].includes(type)) {
    return null;
  }
  
  return (
    <div className="flex flex-col w-[280px] flex-shrink-0">
      <Card 
        className={`cursor-pointer hover:shadow-xl transition-all border-2 ${colors.border} overflow-hidden hover:scale-[1.02]`}
        onClick={onClick}
      >
        <CardContent className="p-0">
          <CreativePreview step={step} />
        </CardContent>
      </Card>
      <StepMetaModule step={step} delaySeconds={delaySeconds} splitStep={splitStep} onSplitClick={onSplitClick} />
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
  onSplitClick,
  isOpen,
  onToggle,
}: { 
  variant: CanvasVariant; 
  steps: Record<string, CanvasStep>;
  onViewStep?: (step: CanvasStep) => void;
  onSplitClick?: (splitStep: CanvasStep) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const path = useMemo(() => buildLinearPath(variant.first_step_id, steps), [variant.first_step_id, steps]);
  
  // Process path to extract message steps with their preceding delays/splits
  const stepsWithMetadata = useMemo(() => {
    const result: { step: CanvasStep; delaySeconds?: number; splitStep?: CanvasStep }[] = [];
    let accumulatedDelaySeconds = 0;
    let pendingSplitStep: CanvasStep | undefined;
    
    for (const s of path) {
      const type = s.type?.toLowerCase() || 'message';
      
      if (type === 'delay' || type === 'wait') {
        // Accumulate delay seconds
        accumulatedDelaySeconds += s.delay_seconds || 0;
      } else if (BRANCHING_TYPES.includes(type)) {
        // Capture split step to show full path details
        pendingSplitStep = s;
      } else {
        // This is a message step - attach accumulated metadata
        result.push({ 
          step: s, 
          delaySeconds: accumulatedDelaySeconds > 0 ? accumulatedDelaySeconds : undefined,
          splitStep: pendingSplitStep,
        });
        accumulatedDelaySeconds = 0;
        pendingSplitStep = undefined;
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
              <div className="flex items-start gap-6 p-6 min-w-max">
                {stepsWithMetadata.map(({ step, delaySeconds, splitStep }) => (
                  <StepCard 
                    key={step.id}
                    step={step} 
                    delaySeconds={delaySeconds}
                    splitStep={splitStep}
                    onClick={() => onViewStep?.(step)}
                    onSplitClick={onSplitClick}
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
  
  // Split modal state
  const [selectedSplit, setSelectedSplit] = useState<CanvasStep | null>(null);
  
  // Step preview modal state
  const [previewStep, setPreviewStep] = useState<CanvasStep | null>(null);
  
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
    <>
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
              onViewStep={onViewStep || setPreviewStep}
              onSplitClick={setSelectedSplit}
              isOpen={openVariants.has(idx)}
              onToggle={() => toggleVariant(idx)}
            />
          ))}
        </div>
      </div>
      
      {/* Step Preview Modal - Larger view when clicking a card */}
      <Dialog open={!!previewStep} onOpenChange={(open) => !open && setPreviewStep(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2">
              {getChannelIcon(previewStep?.channel, "h-5 w-5")}
              {previewStep?.name}
            </DialogTitle>
          </DialogHeader>
          
          {previewStep && (
            <div className="flex-1 overflow-auto">
              <LargeCreativePreview step={previewStep} />
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Split/Audience Path Details Modal - Enhanced to show full path content */}
      <Dialog open={!!selectedSplit} onOpenChange={(open) => !open && setSelectedSplit(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-violet-600" />
              {selectedSplit?.name || 'Audience Split'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto space-y-4">
            <p className="text-sm text-muted-foreground">
              This step splits users into {selectedSplit?.next_paths?.length || 2} different paths based on audience criteria.
            </p>
            
            <div className="space-y-4">
              <p className="text-sm font-medium">Paths & Content:</p>
              {selectedSplit?.next_paths?.map((path, idx) => {
                // Build the path content for this branch
                const pathSteps = buildLinearPath(path.next_step_id, canvas.steps);
                const messageSteps = pathSteps.filter(s => {
                  const type = s.type?.toLowerCase() || 'message';
                  return !BRANCHING_TYPES.includes(type);
                });
                
                return (
                  <div 
                    key={path.next_step_id || idx}
                    className="border rounded-lg overflow-hidden"
                  >
                    <div className="flex items-center gap-3 p-3 bg-muted/30">
                      <div className="h-8 w-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-violet-700 dark:text-violet-300">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{path.name}</p>
                        {path.percentage !== undefined && (
                          <p className="text-xs text-muted-foreground">{Math.round(path.percentage)}% of users • {messageSteps.length} touchpoint{messageSteps.length !== 1 ? 's' : ''}</p>
                        )}
                      </div>
                    </div>
                    
                    {messageSteps.length > 0 ? (
                      <ScrollArea className="w-full">
                        <div className="flex items-start gap-4 p-4 min-w-max">
                          {messageSteps.map((step) => (
                            <div 
                              key={step.id} 
                              className="w-[200px] flex-shrink-0 cursor-pointer"
                              onClick={() => {
                                setSelectedSplit(null);
                                setPreviewStep(step);
                              }}
                            >
                              <Card className="hover:shadow-md transition-shadow border-2 overflow-hidden">
                                <CardContent className="p-0">
                                  <div className="bg-muted/30 p-2 border-b">
                                    <div className="flex items-center gap-2">
                                      {getChannelIcon(step.channel, "h-4 w-4")}
                                      <span className="text-xs font-medium truncate">{step.name}</span>
                                    </div>
                                  </div>
                                  <div className="p-2 h-24 overflow-hidden bg-background">
                                    {(() => {
                                      const msg = pickBestMessage(step);
                                      const channel = normalizeChannel(step.channel);
                                      if (channel === 'email' && msg?.subject) {
                                        return (
                                          <div className="text-xs">
                                            <p className="font-medium truncate">{msg.subject}</p>
                                            {msg.preheader && <p className="text-muted-foreground truncate mt-1">{msg.preheader}</p>}
                                          </div>
                                        );
                                      }
                                      if ((channel === 'push' || channel.includes('push')) && (msg?.title || msg?.body)) {
                                        return (
                                          <div className="text-xs">
                                            <p className="font-medium truncate">{msg?.title || step.name}</p>
                                            {msg?.body && <p className="text-muted-foreground line-clamp-2 mt-1">{msg.body}</p>}
                                          </div>
                                        );
                                      }
                                      return (
                                        <div className="h-full flex items-center justify-center text-muted-foreground">
                                          {getChannelIcon(step.channel, "h-6 w-6 opacity-30")}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </CardContent>
                              </Card>
                              {step.delay_formatted && step.delay_formatted !== '0h' && (
                                <Badge variant="outline" className="mt-2 text-xs bg-amber-500/10 border-amber-500/50 text-amber-700">
                                  +{step.delay_formatted}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>
                    ) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No message steps in this path
                      </div>
                    )}
                  </div>
                );
              })}
              
              {(!selectedSplit?.next_paths || selectedSplit.next_paths.length === 0) && (
                <p className="text-sm text-muted-foreground italic">Path details not available</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Large creative preview for modal - full size rendering
function LargeCreativePreview({ step }: { step: CanvasStep }) {
  const channel = normalizeChannel(step.channel);
  const message = pickBestMessage(step);
  
  if (channel === 'email') {
    return (
      <div className="flex flex-col h-full">
        {/* Step name header */}
        <div className="bg-primary/10 px-4 py-2 flex-shrink-0 border-b border-primary/20">
          <p className="text-sm font-semibold text-primary">{step.name}</p>
        </div>
        <div className="bg-muted/30 px-4 py-3 border-b flex-shrink-0">
          <p className="text-xs text-muted-foreground">From: Linktree</p>
          <p className="font-medium">{message?.subject || 'No subject'}</p>
          {message?.preheader && (
            <p className="text-sm text-muted-foreground mt-1">{message.preheader}</p>
          )}
        </div>
        <div className="flex-1 bg-white min-h-[500px]">
          {message?.html_content ? (
            <iframe
              title={message?.subject || step.name}
              className="w-full h-[500px] border-0"
              sandbox="allow-same-origin"
              srcDoc={message.html_content}
            />
          ) : message?.body ? (
            <div className="p-4 text-foreground leading-relaxed">
              <p>{message.body}</p>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-8">
              <Mail className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">{step.name}</p>
              <p className="text-sm mt-2">No email content available</p>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  if (channel === 'push' || channel.includes('push')) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
        <div className="w-full max-w-sm bg-card border rounded-2xl p-5 shadow-xl">
          <div className="flex items-start gap-3">
            <img 
              src="/logos/linktree-logo.png" 
              alt="Linktree" 
              className="h-12 w-12 rounded-xl object-contain flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Linktree • now</p>
              <p className="font-semibold text-base mt-1 line-clamp-2">{message?.title || step.name}</p>
              {message?.body && (
                <p className="text-sm text-muted-foreground mt-1.5 line-clamp-3">{message.body}</p>
              )}
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-6 font-medium">Push Notification</p>
      </div>
    );
  }
  
  if (channel === 'in_app_message' || channel === 'in-app' || channel === 'trigger_in_app_message') {
    const bodyContent = message?.body || '';
    const isHtmlBody = bodyContent.trim().startsWith('<!doctype') || bodyContent.trim().startsWith('<html') || bodyContent.includes('<div');
    
    if (isHtmlBody) {
      return (
        <div className="flex flex-col h-full">
          <div className="bg-muted/30 px-4 py-3 border-b flex-shrink-0 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <span className="font-medium">In-App Message</span>
          </div>
          <div className="flex-1 bg-white min-h-[500px]">
            <iframe
              title={message?.title || step.name}
              className="w-full h-[500px] border-0"
              sandbox="allow-same-origin"
              srcDoc={bodyContent}
            />
          </div>
        </div>
      );
    }
    
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
        <div className="w-full max-w-sm bg-gradient-to-br from-card to-primary/5 border-2 border-primary/30 rounded-2xl p-8 text-center shadow-lg">
          {message?.image_url ? (
            <img src={message.image_url} alt="" className="w-24 h-24 object-cover rounded-xl mx-auto mb-6" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6">
              <Smartphone className="h-10 w-10 text-primary" />
            </div>
          )}
          <h4 className="font-bold text-xl">{message?.title || step.name}</h4>
          <p className="text-muted-foreground mt-3">
            {message?.body || 'In-app message content'}
          </p>
          {message?.buttons?.[0] && (
            <Button className="mt-6">{message.buttons[0].text}</Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-6 font-medium">In-App Message</p>
      </div>
    );
  }
  
  // SMS fallback
  return (
    <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
      <div className="w-full max-w-sm bg-card border-2 rounded-2xl p-6 shadow-lg">
        <div className="flex items-start gap-3 mb-3">
          <MessageSquare className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="font-medium">SMS</p>
        </div>
        <p className="text-lg leading-relaxed">{message?.body || step.name}</p>
      </div>
      <p className="text-sm text-muted-foreground mt-6 font-medium">SMS Message</p>
    </div>
  );
}
