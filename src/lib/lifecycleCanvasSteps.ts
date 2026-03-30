/**
 * Normalize Braze canvas steps for Lifecycle UI. Sync stores `raw_steps` as a JSON object
 * keyed by step id; some payloads may use arrays.
 */

export type LifecycleCanvasStep = {
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
};

/** Logic branches / delays — not message touchpoints. */
const NON_MESSAGE_STEP_TYPES = new Set([
  'delay',
  'wait',
  'decision_split',
  'branch',
  'filter',
  'audience_paths',
  'action_paths',
  'experiment_paths',
  'experiment_step',
  'webhook',
  'abort',
  'user_update',
  'customer_update',
  'canvas_entry',
  'rate_limit',
]);

function isMessagingChannel(raw: string): boolean {
  const c = raw.toLowerCase();
  if (!c) return false;
  if (c === 'email') return true;
  if (c.includes('push')) return true;
  if (c.includes('sms')) return true;
  if (c.includes('in_app') || c.includes('in-app')) return true;
  if (c === 'trigger_in_app_message') return true;
  return false;
}

/** Prefer step.channel, then first message channel. */
export function getLifecycleStepChannel(step: LifecycleCanvasStep): string {
  const direct = (step.channel || '').trim();
  if (direct) return direct;
  const fromMsg = step.messages?.map((m) => m.channel).find(Boolean);
  return (fromMsg || '').trim();
}

/**
 * Message touchpoints only: email, push, in-app, SMS — not delays, splits, filters, webhooks.
 */
export function isMessagingTouchpointStep(step: LifecycleCanvasStep): boolean {
  const type = (step.type || 'message').toLowerCase();
  if (NON_MESSAGE_STEP_TYPES.has(type)) return false;
  if (type === 'delay' || type === 'wait') return false;

  const ch = getLifecycleStepChannel(step);
  if (isMessagingChannel(ch)) return true;

  // Braze message step with nested messages but channel only on message payloads
  if (type === 'message' && (step.messages?.length ?? 0) > 0) {
    return step.messages!.some((m) => m.channel && isMessagingChannel(String(m.channel)));
  }

  return false;
}

export function normalizeRawSteps(raw: unknown): Record<string, LifecycleCanvasStep> {
  if (raw == null) return {};
  if (Array.isArray(raw)) {
    const out: Record<string, LifecycleCanvasStep> = {};
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const id = String((item as { id?: string }).id ?? '');
      if (!id) continue;
      out[id] = item as LifecycleCanvasStep;
    }
    return out;
  }
  if (typeof raw === 'object') {
    return raw as Record<string, LifecycleCanvasStep>;
  }
  return {};
}

export function countMessagingTouchpoints(steps: Record<string, LifecycleCanvasStep>): number {
  return Object.values(steps).filter(isMessagingTouchpointStep).length;
}
