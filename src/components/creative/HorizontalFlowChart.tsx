import { useEffect, useMemo, useState } from 'react';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
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
  Zap,
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
    case 'webhook':
      return <Zap className={className} />;
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
          <p className="text-xs text-muted-foreground truncate">From: BRCG</p>
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
              srcDoc={sanitizeHtml(message.html_content)}
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
        <div className="w-full bg-card border rounded-2xl p-3 shadow-xl">
          <div className="flex items-start gap-2">
            <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-primary-foreground">B</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-muted-foreground">BRCG • now</p>
              <p className="font-semibold text-xs mt-0.5">{message?.title || step.name}</p>
              {message?.body && (
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
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
              srcDoc={sanitizeHtml(bodyContent)}
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

  if (channel === 'webhook' || step.type?.toLowerCase().includes('webhook')) {
    return (
      <div className="w-full h-[520px] flex flex-col">
        <div className="bg-primary/10 px-2 py-1.5 flex-shrink-0 border-b border-primary/20">
          <p className="text-xs font-semibold text-primary truncate">{step.name}</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center bg-muted/10">
          <div className="h-14 w-14 rounded-full bg-violet-500/15 flex items-center justify-center">
            <Zap className="h-7 w-7 text-violet-600" />
          </div>
          <p className="text-sm font-semibold text-foreground">{step.name}</p>
          <p className="text-xs text-muted-foreground">Webhook / API call</p>
        </div>
      </div>
    );
  }

  if (channel === 'sms') {
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

  // Generic fallback for unrecognized channel types
  return (
    <div className="w-full h-[520px] flex flex-col items-center justify-center p-4 bg-muted/10">
      <div className="w-full bg-primary/10 px-3 py-1.5 rounded-t-lg mb-2 -mt-2">
        <p className="text-xs font-semibold text-primary truncate text-center">{step.name}</p>
      </div>
      <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground">
        <p className="text-sm font-medium">{step.name}</p>
        {channel && <p className="text-xs mt-1 opacity-60">{channel}</p>}
      </div>
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

// Delay/Filter/Split module BELOW step - Enhanced with more detail and better clickability
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
  
  // Determine split type label with path count and icon
  const getSplitInfo = (s: CanvasStep) => {
    const sType = s.type?.toLowerCase() || '';
    const pathCount = s.next_paths?.length || s.next_step_ids?.length || 2;
    if (sType === 'decision_split' || sType === 'branch') {
      return { label: 'Decision Split', pathCount, icon: 'branch' };
    }
    if (sType === 'audience_paths') {
      return { label: 'Audience Split', pathCount, icon: 'users' };
    }
    if (sType === 'action_paths') {
      return { label: 'Action Path', pathCount, icon: 'action' };
    }
    if (sType === 'experiment_paths') {
      return { label: 'A/B Test', pathCount, icon: 'experiment' };
    }
    if (sType === 'filter') {
      return { label: 'Filter', pathCount: 0, icon: 'filter' };
    }
    return { label: 'Split', pathCount, icon: 'branch' };
  };
  
  // Get path names for preview
  const getPathPreviews = (s: CanvasStep) => {
    if (!s.next_paths?.length) return [];
    return s.next_paths.slice(0, 3).map(p => ({
      name: p.name,
      percentage: p.percentage ? Math.round(p.percentage) : undefined,
    }));
  };
  
  const splitInfo = splitStep ? getSplitInfo(splitStep) : null;
  const pathPreviews = splitStep ? getPathPreviews(splitStep) : [];
  
  return (
    <div className="flex flex-col items-center gap-2 mt-3 w-full">
      {/* Delay Badge */}
      {delayLabel && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/40">
          <Timer className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            {delayLabel} delay
          </span>
        </div>
      )}
      
      {/* Split/Audience Path Card - Clickable with visual affordance */}
      {splitStep && splitInfo && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSplitClick?.(splitStep);
          }}
          className="group w-full max-w-[260px] bg-gradient-to-r from-violet-500/10 via-violet-500/5 to-transparent border-2 border-violet-500/30 rounded-lg p-3 hover:border-violet-500/60 hover:bg-violet-500/15 hover:shadow-md transition-all cursor-pointer"
        >
          {/* Header with icon and label */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-violet-500/20 flex items-center justify-center">
                <GitBranch className="h-3.5 w-3.5 text-violet-600" />
              </div>
              <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                {splitInfo.label}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 group-hover:translate-x-0.5 transition-transform">
              <span className="font-medium">{splitInfo.pathCount} paths</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </div>
          
          {/* Path previews */}
          {pathPreviews.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pathPreviews.map((preview, i) => (
                <Badge 
                  key={i} 
                  variant="outline" 
                  className="text-[10px] px-1.5 py-0.5 bg-background/50 border-violet-500/30 text-violet-700 dark:text-violet-300"
                >
                  {preview.name}
                  {preview.percentage !== undefined && (
                    <span className="ml-1 opacity-70">{preview.percentage}%</span>
                  )}
                </Badge>
              ))}
              {splitInfo.pathCount > 3 && (
                <Badge 
                  variant="outline" 
                  className="text-[10px] px-1.5 py-0.5 bg-background/50 border-violet-500/30 text-violet-600"
                >
                  +{splitInfo.pathCount - 3} more
                </Badge>
              )}
            </div>
          )}
          
        </button>
      )}
      
      {/* Standalone filter badge (not attached to a split) */}
      {isFilter && !splitStep && (
        <Badge variant="outline" className="bg-violet-500/10 border-violet-500/50 text-violet-700 dark:text-violet-400 text-xs gap-1.5 py-1.5 px-3">
          <Filter className="h-3.5 w-3.5" />
          Filter Applied
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
  // Skip delay/branch/non-messaging steps (shown as connectors / split module, not creative cards)
  if (isDelayOnlyStep(step) || isBranchOnlyStep(step) || isNonMessagingStep(step)) {
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

// Step types that are metadata/branching, not message content (Braze naming varies by workspace/version)
const BRANCHING_TYPES = [
  'delay',
  'wait',
  'decision_split',
  'branch',
  'filter',
  'audience_paths',
  'action_paths',
  'experiment_paths',
  'experiment_step',
  'split',
  'multi_criteria_split',
  'criteria_split',
  'routing_split',
];

function getOutgoingStepIds(step: CanvasStep): string[] {
  const out: string[] = [];
  if (Array.isArray(step.next_step_ids)) {
    for (const id of step.next_step_ids) {
      const s = String(id ?? '').trim();
      if (s) out.push(s);
    }
  }
  if (Array.isArray(step.next_paths)) {
    for (const p of step.next_paths) {
      const id = String(
        (p as { next_step_id?: string; nextStepId?: string; next_canvas_step_id?: string }).next_step_id ??
          (p as { nextStepId?: string }).nextStepId ??
          (p as { next_canvas_step_id?: string }).next_canvas_step_id ??
          '',
      ).trim();
      if (id) out.push(id);
    }
  }
  return out;
}

/**
 * Collects ALL reachable steps from the entry using BFS.
 * Visits every branch — not just path[0] — so all steps in a multi-branch canvas are shown.
 */
function buildAllReachableSteps(firstStepId: string | null, allSteps: Record<string, CanvasStep>): CanvasStep[] {
  if (!firstStepId || !allSteps[firstStepId]) return [];

  const result: CanvasStep[] = [];
  const visited = new Set<string>();
  const queue: string[] = [firstStepId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const step = allSteps[currentId];
    if (!step) continue;

    result.push(step);

    for (const nextId of getOutgoingStepIds(step)) {
      if (!visited.has(nextId) && allSteps[nextId]) {
        queue.push(nextId);
      }
    }
  }

  return result;
}

/** First step(s) have no incoming edge from any other step (canvas entry). */
function findEntryStepId(allSteps: Record<string, CanvasStep>): string | null {
  const ids = Object.keys(allSteps);
  if (ids.length === 0) return null;
  const hasIncoming = new Set<string>();
  for (const s of Object.values(allSteps)) {
    for (const t of getOutgoingStepIds(s)) {
      hasIncoming.add(t);
    }
  }
  const entries = ids.filter((id) => !hasIncoming.has(id));
  return entries.length > 0 ? entries[0] : ids[0];
}

function normalizeFlowStepType(step: CanvasStep): string {
  const raw = (step.type || 'message').toLowerCase();
  if (raw.includes('/')) {
    const head = raw.split('/')[0];
    if (head === 'delay' || head === 'wait') return head;
  }
  return raw;
}

function isDelayOnlyStep(step: CanvasStep): boolean {
  const t = normalizeFlowStepType(step);
  return t === 'delay' || t === 'wait';
}

function isBranchOnlyStep(step: CanvasStep): boolean {
  const t = normalizeFlowStepType(step);
  if (t === 'delay' || t === 'wait') return false;
  if (BRANCHING_TYPES.includes(t)) return true;
  if (t.includes('split') && !t.includes('email') && !t.includes('sms') && !t.includes('push')) return true;
  return false;
}

// Non-messaging channel/type values — steps with these are infra steps, not creative touchpoints
const NON_MESSAGING_STEP_CHANNELS = new Set([
  'user_update',
  'customer_update',
  'audience_sync',
  'feature_flag',
  'rate_limit',
  'abort',
  'control',
]);

// Steps with no channel + no messages, OR a known non-messaging channel, are not creative touchpoints
function isNonMessagingStep(step: CanvasStep): boolean {
  const ch = (step.channel || '').toLowerCase();
  if (ch && NON_MESSAGING_STEP_CHANNELS.has(ch)) return true;
  // Also match composite types like "full/webhook"
  const rawType = (step.type || '').toLowerCase();
  for (const key of NON_MESSAGING_STEP_CHANNELS) {
    if (rawType === key || rawType.endsWith('/' + key)) return true;
  }
  return !step.channel && (!step.messages || step.messages.length === 0);
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
  const path = useMemo(() => buildAllReachableSteps(variant.first_step_id, steps), [variant.first_step_id, steps]);
  
  // Process path to extract message steps with their preceding delays/splits
  const stepsWithMetadata = useMemo(() => {
    const result: { step: CanvasStep; delaySeconds?: number; splitStep?: CanvasStep }[] = [];
    let accumulatedDelaySeconds = 0;
    let pendingSplitStep: CanvasStep | undefined;
    
    for (const s of path) {
      if (isDelayOnlyStep(s)) {
        accumulatedDelaySeconds += s.delay_seconds || 0;
      } else if (isBranchOnlyStep(s)) {
        pendingSplitStep = s;
        accumulatedDelaySeconds = 0;
      } else if (isNonMessagingStep(s)) {
        // skip audience sync / webhook / update_user steps — not messaging touchpoints
      } else {
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
              <div className="flex items-start gap-0 p-6 min-w-max">
                {stepsWithMetadata.map(({ step, delaySeconds, splitStep }, idx) => (
                  <div key={step.id} className="flex items-start">
                    {/* Delay bar between steps */}
                    {idx > 0 && delaySeconds && delaySeconds > 0 && (
                      <div className="flex flex-col items-center justify-center self-stretch mx-3 min-h-[200px]">
                        <div className="flex-1 w-px bg-amber-500/40" />
                        <div className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 my-1">
                          <Timer className="h-3.5 w-3.5 text-amber-600" />
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                            {formatDelayCompact(delaySeconds)}
                          </span>
                        </div>
                        <div className="flex-1 w-px bg-amber-500/40" />
                      </div>
                    )}
                    {/* Connector arrow (no delay) */}
                    {idx > 0 && (!delaySeconds || delaySeconds <= 0) && (
                      <div className="flex items-center self-stretch mx-2">
                        <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                    )}
                    <StepCard 
                      step={step} 
                      delaySeconds={undefined}
                      splitStep={splitStep}
                      onClick={() => onViewStep?.(step)}
                      onSplitClick={onSplitClick}
                    />
                  </div>
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
  
  // If no variants but has steps, create a default path; if variants omit first_step_id, infer entry
  const effectiveVariants = useMemo(() => {
    const entryFallback = hasSteps ? findEntryStepId(canvas.steps) : null;

    if (hasVariants) {
      const filtered = canvas.variants.filter((v) => !v.name.toLowerCase().includes('control'));
      return filtered.map((v) => ({
        ...v,
        first_step_id:
          v.first_step_id ||
          (filtered.length === 1 ? entryFallback : null) ||
          null,
      }));
    }

    if (hasSteps && entryFallback) {
      return [
        {
          name: 'Main Path',
          percentage: 100,
          first_step_id: entryFallback,
        },
      ];
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
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-4 border-b bg-gradient-to-r from-violet-500/10 to-transparent">
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                <GitBranch className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold">{selectedSplit?.name || 'Audience Split'}</p>
                <p className="text-sm text-muted-foreground font-normal">
                  {selectedSplit?.next_paths?.length || 0} audience paths with unique creative
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-4">
              {selectedSplit?.next_paths?.map((path, idx) => {
                // Build the path content for this branch
                const pathSteps = buildAllReachableSteps(path.next_step_id, canvas.steps);
                const messageSteps = pathSteps.filter(
                  (s) => !isDelayOnlyStep(s) && !isBranchOnlyStep(s) && !isNonMessagingStep(s),
                );
                
                // Calculate delays between steps
                const stepsWithDelays = messageSteps.map((step, stepIdx) => {
                  let delayBefore = 0;
                  if (stepIdx > 0) {
                    // Find delay between previous step and this one
                    const prevStepIndex = pathSteps.findIndex(s => s.id === messageSteps[stepIdx - 1]?.id);
                    const currentIndex = pathSteps.findIndex(s => s.id === step.id);
                    for (let i = prevStepIndex + 1; i < currentIndex; i++) {
                      const s = pathSteps[i];
                      if (s?.type?.toLowerCase() === 'delay' || s?.type?.toLowerCase() === 'wait') {
                        delayBefore += s.delay_seconds || 0;
                      }
                    }
                  }
                  return { step, delayBefore };
                });
                
                return (
                  <div 
                    key={path.next_step_id || idx}
                    className="border-2 rounded-xl overflow-hidden bg-card"
                  >
                    {/* Path Header */}
                    <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-violet-500/15 via-violet-500/5 to-transparent border-b">
                      <div className="h-12 w-12 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 border-2 border-violet-500/30">
                        <span className="text-xl font-bold text-violet-700 dark:text-violet-300">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-lg">{path.name}</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                          {path.percentage !== undefined && (
                            <span className="font-medium text-violet-600 dark:text-violet-400">
                              {Math.round(path.percentage)}% of users
                            </span>
                          )}
                          <span>•</span>
                          <span>
                            {messageSteps.length} touchpoint{messageSteps.length !== 1 ? 's' : ''}
                          </span>
                          {messageSteps.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                {[...new Set(messageSteps.map(s => normalizeChannel(s.channel)))].map(ch => (
                                  <span key={ch} className="inline-flex items-center gap-0.5">
                                    {getChannelIcon(ch, "h-3.5 w-3.5")}
                                  </span>
                                ))}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Path Creative Cards */}
                    {stepsWithDelays.length > 0 ? (
                      <ScrollArea className="w-full">
                        <div className="flex items-stretch gap-4 p-5 min-w-max">
                          {stepsWithDelays.map(({ step, delayBefore }, stepIdx) => (
                            <div key={step.id} className="flex items-start gap-3">
                              {/* Delay indicator between steps */}
                              {stepIdx > 0 && delayBefore > 0 && (
                                <div className="flex flex-col items-center justify-center h-full min-h-[160px] px-2">
                                  <div className="h-full w-px bg-amber-500/40" />
                                  <div className="px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/40 my-2">
                                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                      {formatDelayCompact(delayBefore)}
                                    </span>
                                  </div>
                                  <div className="h-full w-px bg-amber-500/40" />
                                </div>
                              )}
                              
                              {/* Step Card */}
                              <div 
                                className="w-[220px] flex-shrink-0 cursor-pointer group"
                                onClick={() => {
                                  setSelectedSplit(null);
                                  setPreviewStep(step);
                                }}
                              >
                                <Card className="hover:shadow-lg transition-all border-2 overflow-hidden group-hover:border-primary/50 group-hover:scale-[1.02]">
                                  <CardContent className="p-0">
                                    {/* Step header with number and channel */}
                                    <div className="bg-primary/10 p-2.5 border-b flex items-center gap-2">
                                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                        <span className="text-xs font-bold text-primary">{stepIdx + 1}</span>
                                      </div>
                                      {getChannelIcon(step.channel, "h-4 w-4 text-muted-foreground")}
                                      <span className="text-xs font-medium truncate flex-1">{step.name}</span>
                                    </div>
                                    
                                    {/* Content preview */}
                                    <div className="p-3 h-28 overflow-hidden bg-background">
                                      {(() => {
                                        const msg = pickBestMessage(step);
                                        const channel = normalizeChannel(step.channel);
                                        
                                        if (channel === 'email' && msg?.subject) {
                                          return (
                                            <div className="text-xs space-y-1.5">
                                              <p className="font-semibold line-clamp-2">{msg.subject}</p>
                                              {msg.preheader && (
                                                <p className="text-muted-foreground line-clamp-2 text-[11px]">{msg.preheader}</p>
                                              )}
                                            </div>
                                          );
                                        }
                                        
                                        if ((channel === 'push' || channel.includes('push')) && (msg?.title || msg?.body)) {
                                          return (
                                            <div className="text-xs space-y-1.5">
                                              <p className="font-semibold line-clamp-2">{msg?.title || step.name}</p>
                                              {msg?.body && (
                                                <p className="text-muted-foreground line-clamp-2 text-[11px]">{msg.body}</p>
                                              )}
                                            </div>
                                          );
                                        }
                                        
                                        if (channel === 'in_app_message' && (msg?.title || msg?.body)) {
                                          return (
                                            <div className="text-xs space-y-1.5">
                                              <p className="font-semibold line-clamp-2">{msg?.title || step.name}</p>
                                              {msg?.body && !msg.body.startsWith('<') && (
                                                <p className="text-muted-foreground line-clamp-2 text-[11px]">{msg.body}</p>
                                              )}
                                            </div>
                                          );
                                        }
                                        
                                        return (
                                          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                                            {getChannelIcon(step.channel, "h-8 w-8 opacity-30")}
                                            <p className="text-[10px] mt-1">Click to view</p>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    
                                    {/* Click action hint */}
                                    <div className="p-2 bg-muted/30 border-t text-center">
                                      <p className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                                        View full creative →
                                      </p>
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>
                            </div>
                          ))}
                        </div>
                        <ScrollBar orientation="horizontal" className="h-2.5" />
                      </ScrollArea>
                    ) : (
                      <div className="p-8 text-center text-muted-foreground bg-muted/10">
                        <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-3">
                          <GitBranch className="h-6 w-6 opacity-50" />
                        </div>
                        <p className="text-sm font-medium">No message steps in this path</p>
                        <p className="text-xs mt-1">This may be a control group or logic-only path</p>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {(!selectedSplit?.next_paths || selectedSplit.next_paths.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  <GitBranch className="h-16 w-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">Path details not available</p>
                  <p className="text-sm mt-2">Try re-syncing Braze data to load split configurations</p>
                </div>
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
              sandbox=""
              srcDoc={sanitizeHtml(message.html_content)}
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
              sandbox=""
              srcDoc={sanitizeHtml(bodyContent)}
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

  if (channel === 'webhook' || step.type?.toLowerCase().includes('webhook')) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px] gap-4 text-center">
        <div className="h-16 w-16 rounded-full bg-violet-500/15 flex items-center justify-center">
          <Zap className="h-8 w-8 text-violet-600" />
        </div>
        <p className="font-semibold text-foreground">{step.name}</p>
        <p className="text-sm text-muted-foreground">Webhook / API call</p>
      </div>
    );
  }

  if (channel === 'sms') {
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

  // Generic fallback for unrecognized channel types
  return (
    <div className="flex flex-col items-center justify-center p-8 min-h-[400px] text-center text-muted-foreground">
      <p className="font-medium">{step.name}</p>
      {channel && <p className="text-xs mt-1 opacity-60">{channel}</p>}
    </div>
  );
}
