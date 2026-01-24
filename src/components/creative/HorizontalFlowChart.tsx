import { useState, useMemo } from 'react';
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
      return { bg: 'bg-blue-500/10', border: 'border-blue-500/50', text: 'text-blue-600' };
    case 'push':
    case 'ios_push':
    case 'android_push':
    case 'web_push':
      return { bg: 'bg-orange-500/10', border: 'border-orange-500/50', text: 'text-orange-600' };
    case 'in_app_message':
    case 'in-app':
      return { bg: 'bg-purple-500/10', border: 'border-purple-500/50', text: 'text-purple-600' };
    case 'sms':
      return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/50', text: 'text-emerald-600' };
    default:
      return { bg: 'bg-muted', border: 'border-border', text: 'text-muted-foreground' };
  }
}

// Render creative preview based on channel - LARGER SIZE
function CreativePreview({ step }: { step: CanvasStep }) {
  const channel = step.channel?.toLowerCase() || 'email';
  const message = step.messages?.[0];
  const colors = getChannelColors(channel);
  
  if (channel === 'email') {
    return (
      <div className="w-full h-[320px] bg-white rounded-t-lg overflow-hidden flex flex-col">
        <div className="bg-muted/50 px-4 py-3 border-b flex-shrink-0">
          <p className="text-xs text-muted-foreground truncate">From: Linktree</p>
          <p className="text-sm font-medium truncate">{message?.subject || step.name}</p>
          {message?.preheader && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{message.preheader}</p>
          )}
        </div>
        <div className="flex-1 p-4 overflow-hidden">
          {message?.html_content ? (
            <div 
              className="text-[10px] leading-tight scale-[0.5] origin-top-left w-[600px]"
              dangerouslySetInnerHTML={{ __html: message.html_content.substring(0, 3000) }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
              <Mail className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Email Preview</p>
              <p className="text-xs mt-1">Content synced from Braze</p>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  if (channel === 'push' || channel.includes('push')) {
    return (
      <div className="w-full h-[320px] flex flex-col items-center justify-center p-6 bg-gradient-to-b from-muted/20 to-muted/40 rounded-t-lg">
        <div className="w-full max-w-[280px] bg-card border rounded-2xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary-foreground">L</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Linktree • now</p>
              <p className="font-semibold text-sm mt-1 line-clamp-2">{message?.title || step.name}</p>
              <p className="text-sm text-muted-foreground line-clamp-3 mt-1">
                {message?.body || 'Push notification content'}
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4">Push Notification</p>
      </div>
    );
  }
  
  if (channel === 'in_app_message' || channel === 'in-app') {
    return (
      <div className="w-full h-[320px] flex flex-col items-center justify-center p-6 bg-gradient-to-b from-primary/5 to-primary/10 rounded-t-lg">
        <div className="w-full max-w-[280px] bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/30 rounded-2xl p-6 text-center">
          <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Smartphone className="h-7 w-7 text-primary" />
          </div>
          <h4 className="font-bold text-base line-clamp-2">{message?.title || step.name}</h4>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
            {message?.body || 'In-app message content'}
          </p>
          <Button size="sm" className="mt-4">Take Action</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-4">In-App Message</p>
      </div>
    );
  }
  
  // SMS fallback
  return (
    <div className="w-full h-[320px] flex flex-col items-center justify-center p-6 rounded-t-lg">
      <div className={`w-full max-w-[280px] ${colors.bg} border ${colors.border} rounded-2xl p-6`}>
        <p className="text-sm">{message?.body || 'SMS message content'}</p>
      </div>
      <p className="text-xs text-muted-foreground mt-4">SMS Message</p>
    </div>
  );
}

// Delay/Filter module BELOW step
function StepMetaModule({ step, delayBefore }: { step: CanvasStep; delayBefore?: string }) {
  const type = step.type?.toLowerCase() || 'message';
  const isFilter = type === 'decision_split' || type === 'branch' || type === 'action_paths' || type === 'filter';
  
  const delayToShow = delayBefore || (step.delay_formatted !== '0h' ? step.delay_formatted : null);
  
  if (!delayToShow && !isFilter) {
    return null;
  }
  
  return (
    <div className="flex items-center justify-center gap-2 mt-2">
      {delayToShow && (
        <Badge variant="outline" className="bg-amber-500/10 border-amber-500/50 text-amber-600 text-xs gap-1">
          <Timer className="h-3 w-3" />
          {delayToShow}
        </Badge>
      )}
      {isFilter && (
        <Badge variant="outline" className="bg-violet-500/10 border-violet-500/50 text-violet-600 text-xs gap-1">
          <Filter className="h-3 w-3" />
          Filter
        </Badge>
      )}
    </div>
  );
}

// Single step card with creative - LARGER
function StepCard({ 
  step, 
  delayBefore,
  onClick 
}: { 
  step: CanvasStep; 
  delayBefore?: string;
  onClick?: () => void;
}) {
  const colors = getChannelColors(step.channel);
  const type = step.type?.toLowerCase() || 'message';
  
  // Skip non-message steps
  if (['delay', 'wait', 'decision_split', 'branch', 'filter'].includes(type)) {
    return null;
  }
  
  return (
    <div className="flex flex-col w-[280px] flex-shrink-0">
      <Card 
        className={`cursor-pointer hover:shadow-lg transition-shadow border-2 ${colors.border} overflow-hidden`}
        onClick={onClick}
      >
        <CardContent className="p-0">
          <CreativePreview step={step} />
          <div className={`px-4 py-3 border-t ${colors.bg}`}>
            <div className="flex items-center gap-2">
              <div className={colors.text}>
                {getChannelIcon(step.channel, "h-4 w-4")}
              </div>
              <span className="text-sm font-medium truncate flex-1">{step.name}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      <StepMetaModule step={step} delayBefore={delayBefore} />
    </div>
  );
}

// Build linear path from variant
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
    
    // Follow first path only for linear display
    currentId = step.next_step_ids[0] || null;
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
  
  // Filter to only message steps for display, but track delays
  const stepsWithDelays = useMemo(() => {
    const result: { step: CanvasStep; delayBefore?: string }[] = [];
    let pendingDelay: string | undefined;
    
    for (const s of path) {
      const type = s.type?.toLowerCase() || 'message';
      if (type === 'delay' || type === 'wait') {
        pendingDelay = s.delay_formatted || pendingDelay;
      } else if (!['decision_split', 'branch', 'filter'].includes(type)) {
        result.push({ step: s, delayBefore: pendingDelay });
        pendingDelay = undefined;
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
          {stepsWithDelays.length} touchpoint{stepsWithDelays.length !== 1 ? 's' : ''}
        </span>
      </button>
      
      {isOpen && (
        <div className="border-t bg-background">
          {variant.first_step_id ? (
            <ScrollArea className="w-full">
              <div className="flex items-start gap-6 p-6 min-w-max">
                {stepsWithDelays.map(({ step, delayBefore }) => (
                  <StepCard 
                    key={step.id}
                    step={step} 
                    delayBefore={delayBefore}
                    onClick={() => onViewStep?.(step)}
                  />
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-sm">
                {isControl ? 'Control group - no messages sent' : 'No steps configured'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function HorizontalFlowChart({ canvas, onViewStep }: HorizontalFlowChartProps) {
  const [openVariants, setOpenVariants] = useState<Set<number>>(new Set([0]));
  
  const hasVariants = canvas.variants && canvas.variants.length > 0;
  const hasSteps = canvas.steps && Object.keys(canvas.steps).length > 0;
  
  // If no variants but has steps, create a default path
  const effectiveVariants = useMemo(() => {
    if (hasVariants) return canvas.variants;
    
    if (hasSteps) {
      const allNextIds = new Set<string>();
      Object.values(canvas.steps).forEach(s => {
        s.next_step_ids.forEach(id => allNextIds.add(id));
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
