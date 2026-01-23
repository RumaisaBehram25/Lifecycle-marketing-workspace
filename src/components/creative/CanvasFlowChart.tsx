import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Mail, 
  Bell, 
  Smartphone, 
  MessageSquare,
  Timer,
  GitBranch,
  Shuffle,
  Filter,
  Zap,
  ArrowDown,
  ArrowRight,
  Eye,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import { getChannelColor } from '@/lib/campaign-taxonomy';

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

interface CanvasFlowChartProps {
  canvas: EnrichedCanvas;
  onViewStep?: (step: CanvasStep) => void;
}

// Get icon for step type
function getStepIcon(step: CanvasStep) {
  const type = step.type?.toLowerCase() || 'message';
  const channel = step.channel?.toLowerCase() || 'email';
  
  if (type === 'delay' || type === 'wait') {
    return <Timer className="h-4 w-4" />;
  }
  if (type === 'decision_split' || type === 'branch') {
    return <GitBranch className="h-4 w-4" />;
  }
  if (type === 'experiment_paths' || type === 'ab_test') {
    return <Shuffle className="h-4 w-4" />;
  }
  if (type === 'action_paths' || type === 'filter') {
    return <Filter className="h-4 w-4" />;
  }
  if (type === 'webhook' || type === 'action') {
    return <Zap className="h-4 w-4" />;
  }
  
  // Message types - use channel
  switch (channel) {
    case 'email':
      return <Mail className="h-4 w-4" />;
    case 'push':
    case 'ios_push':
    case 'android_push':
    case 'web_push':
      return <Bell className="h-4 w-4" />;
    case 'in_app_message':
    case 'in-app':
      return <Smartphone className="h-4 w-4" />;
    case 'sms':
      return <MessageSquare className="h-4 w-4" />;
    default:
      return <Mail className="h-4 w-4" />;
  }
}

// Get color classes for step type
function getStepColors(step: CanvasStep): { bg: string; border: string; text: string } {
  const type = step.type?.toLowerCase() || 'message';
  const channel = step.channel?.toLowerCase() || 'email';
  
  if (type === 'delay' || type === 'wait') {
    return { bg: 'bg-amber-500/10', border: 'border-amber-500/50', text: 'text-amber-600' };
  }
  if (type === 'decision_split' || type === 'branch' || type === 'experiment_paths' || type === 'action_paths') {
    return { bg: 'bg-violet-500/10', border: 'border-violet-500/50', text: 'text-violet-600' };
  }
  if (type === 'webhook' || type === 'action') {
    return { bg: 'bg-slate-500/10', border: 'border-slate-500/50', text: 'text-slate-600' };
  }
  
  // Message types
  switch (channel) {
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

// Render a single step node
function StepNode({ 
  step, 
  isLast,
  onView 
}: { 
  step: CanvasStep; 
  isLast: boolean;
  onView?: () => void;
}) {
  const colors = getStepColors(step);
  const hasBranches = step.next_step_ids.length > 1 || (step.next_paths && step.next_paths.length > 1);
  
  // Get step content summary
  const getContentSummary = () => {
    const type = step.type?.toLowerCase() || 'message';
    
    if (type === 'delay' || type === 'wait') {
      return step.delay_formatted && step.delay_formatted !== '0h' 
        ? `Wait ${step.delay_formatted}` 
        : 'Delay';
    }
    
    if (step.messages && step.messages.length > 0) {
      const msg = step.messages[0];
      if (msg.subject) return msg.subject;
      if (msg.title) return msg.title;
      if (msg.body) return msg.body.substring(0, 40) + (msg.body.length > 40 ? '...' : '');
    }
    
    return null;
  };
  
  const contentSummary = getContentSummary();
  const channelLabel = step.type === 'message' 
    ? step.channel?.replace('_', ' ').replace('in app message', 'In-App') 
    : step.type?.replace('_', ' ');
  
  return (
    <div className="flex flex-col items-center">
      <div 
        className={`relative flex items-center gap-3 px-4 py-3 rounded-lg border-2 ${colors.bg} ${colors.border} min-w-[180px] max-w-[280px] cursor-pointer hover:shadow-md transition-shadow`}
        onClick={onView}
      >
        <div className={`flex-shrink-0 ${colors.text}`}>
          {getStepIcon(step)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{step.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-xs ${colors.text} capitalize`}>
              {channelLabel}
            </span>
            {step.delay_formatted && step.delay_formatted !== '0h' && step.type !== 'delay' && step.type !== 'wait' && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                +{step.delay_formatted}
              </Badge>
            )}
          </div>
          {contentSummary && step.type !== 'delay' && step.type !== 'wait' && (
            <p className="text-xs text-muted-foreground mt-1 truncate max-w-[200px]" title={contentSummary}>
              {contentSummary}
            </p>
          )}
        </div>
        {hasBranches && (
          <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-violet-500 flex items-center justify-center">
            <GitBranch className="h-3 w-3 text-white" />
          </div>
        )}
      </div>
      
      {!isLast && (
        <div className="flex flex-col items-center py-2">
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

// Render a path (sequence of steps)
function PathRenderer({ 
  steps, 
  allSteps, 
  visitedIds,
  onViewStep 
}: { 
  steps: string[]; 
  allSteps: Record<string, CanvasStep>;
  visitedIds: Set<string>;
  onViewStep?: (step: CanvasStep) => void;
}) {
  const renderedSteps: CanvasStep[] = [];
  const queue = [...steps];
  
  while (queue.length > 0) {
    const stepId = queue.shift()!;
    if (visitedIds.has(stepId)) continue;
    visitedIds.add(stepId);
    
    const step = allSteps[stepId];
    if (!step) continue;
    
    renderedSteps.push(step);
    
    // If step has single next, continue in sequence
    if (step.next_step_ids.length === 1) {
      queue.unshift(step.next_step_ids[0]);
    }
    // If step has branches, we'll handle them separately
  }
  
  if (renderedSteps.length === 0) {
    return null;
  }
  
  return (
    <div className="flex flex-col items-center">
      {renderedSteps.map((step, idx) => {
        const isLast = idx === renderedSteps.length - 1 && step.next_step_ids.length === 0;
        const hasBranches = step.next_step_ids.length > 1;
        
        return (
          <div key={step.id} className="flex flex-col items-center">
            <StepNode 
              step={step} 
              isLast={isLast && !hasBranches}
              onView={() => onViewStep?.(step)}
            />
            
            {/* Render branches if any */}
            {hasBranches && (
              <div className="mt-2">
                <div className="flex items-start gap-4 pt-2">
                  {step.next_step_ids.map((nextId, branchIdx) => {
                    const pathInfo = step.next_paths?.find(p => p.next_step_id === nextId);
                    return (
                      <div key={nextId} className="flex flex-col items-center">
                        <Badge variant="outline" className="text-xs mb-2">
                          {pathInfo?.name || `Path ${branchIdx + 1}`}
                          {pathInfo?.percentage && ` (${pathInfo.percentage}%)`}
                        </Badge>
                        <PathRenderer 
                          steps={[nextId]} 
                          allSteps={allSteps}
                          visitedIds={visitedIds}
                          onViewStep={onViewStep}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Variant accordion item
function VariantSection({ 
  variant, 
  steps, 
  defaultOpen,
  onViewStep 
}: { 
  variant: CanvasVariant; 
  steps: Record<string, CanvasStep>;
  defaultOpen: boolean;
  onViewStep?: (step: CanvasStep) => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  // Count steps in this variant's path
  const countSteps = useMemo(() => {
    if (!variant.first_step_id) return 0;
    const visited = new Set<string>();
    const queue = [variant.first_step_id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const step = steps[id];
      if (step) {
        queue.push(...step.next_step_ids);
      }
    }
    return visited.size;
  }, [variant.first_step_id, steps]);
  
  const isControl = variant.name.toLowerCase().includes('control');
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          <span className="font-medium">{variant.name}</span>
          <Badge variant={isControl ? 'secondary' : 'outline'}>
            {variant.percentage}%
          </Badge>
        </div>
        <span className="text-sm text-muted-foreground">
          {countSteps} step{countSteps !== 1 ? 's' : ''}
        </span>
      </button>
      
      {isOpen && (
        <div className="p-6 bg-background overflow-x-auto">
          {variant.first_step_id ? (
            <PathRenderer 
              steps={[variant.first_step_id]} 
              allSteps={steps}
              visitedIds={new Set()}
              onViewStep={onViewStep}
            />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
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

export function CanvasFlowChart({ canvas, onViewStep }: CanvasFlowChartProps) {
  const hasVariants = canvas.variants && canvas.variants.length > 0;
  const hasSteps = canvas.steps && Object.keys(canvas.steps).length > 0;
  
  // If no variants but has steps, create a default "path" from all steps
  const effectiveVariants = useMemo(() => {
    if (hasVariants) return canvas.variants;
    
    // Find steps without incoming edges (entry points)
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
          Canvas Flow ({effectiveVariants.length} variant{effectiveVariants.length !== 1 ? 's' : ''})
        </h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{Object.keys(canvas.steps).length} total steps</span>
        </div>
      </div>
      
      <div className="space-y-3">
        {effectiveVariants.map((variant, idx) => (
          <VariantSection
            key={variant.name + idx}
            variant={variant}
            steps={canvas.steps}
            defaultOpen={idx === 0}
            onViewStep={onViewStep}
          />
        ))}
      </div>
    </div>
  );
}
