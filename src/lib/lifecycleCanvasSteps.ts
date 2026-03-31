/**
 * Normalize Braze canvas steps for Lifecycle UI. Sync stores `raw_steps` as a JSON object
 * keyed by step id; some payloads may use arrays or id-keyed objects without `id` on each value.
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
    channel?: string;
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
  'audience_split',
  'feature_flag',
]);

function isMessagingChannel(raw: string): boolean {
  const c = raw.toLowerCase().trim();
  if (!c) return false;
  if (c === 'email') return true;
  if (c.includes('push')) return true;
  if (c.includes('sms')) return true;
  if (c.includes('in_app') || c.includes('in-app')) return true;
  if (c === 'trigger_in_app_message') return true;
  if (c.includes('content_card')) return true;
  if (c === 'iam' || c.startsWith('iam_')) return true;
  return false;
}

function messageHasCreativePayload(m: NonNullable<LifecycleCanvasStep['messages']>[number]): boolean {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim().length > 0 : false);
  return (
    s(m.subject) ||
    s(m.title) ||
    s(m.body) ||
    s(m.html_content) ||
    s(m.preheader)
  );
}

/** Prefer step.channel, then first message channel. */
export function getLifecycleStepChannel(step: LifecycleCanvasStep): string {
  const direct = (step.channel || '').trim();
  if (direct) return direct;
  const fromMsg = step.messages?.map((m) => m.channel).find(Boolean);
  return (fromMsg || '').trim();
}

/**
 * Braze `type` strings for send steps (not exhaustive; combined with channel / messages).
 */
function looksLikeBrazeSendStepType(type: string): boolean {
  if (!type || NON_MESSAGE_STEP_TYPES.has(type)) return false;
  const t = type.toLowerCase();
  // Braze composite types: "full/email", "full/android_push", etc. (not full/webhook for touchpoint count)
  if (t.includes('/')) {
    if (t.includes('webhook') || t.includes('audience_paths') || t.includes('action_paths')) return false;
    if (
      t.includes('email') ||
      t.includes('sms') ||
      t.includes('push') ||
      t.includes('in_app') ||
      t.includes('in-app') ||
      t.includes('content_card')
    ) {
      return true;
    }
  }
  if (type === 'message' || t === 'full') return true;
  if (/^(email|sms|push|iam|in_app|in-app|android_push|ios_push|web_push)/i.test(type)) return true;
  if (type.includes('in_app_message') || type.includes('in-app')) return true;
  return false;
}

/**
 * Message touchpoints only: email, push, in-app, SMS, content cards — not delays, splits, filters, webhooks.
 */
export function isMessagingTouchpointStep(step: LifecycleCanvasStep): boolean {
  const type = (step.type || '').toLowerCase();
  if (NON_MESSAGE_STEP_TYPES.has(type)) return false;
  if (type === 'delay' || type === 'wait') return false;

  // Large canvases: Braze often attaches message slots even when `type` is nonstandard — count as touchpoint.
  if ((step.messages?.length ?? 0) > 0) {
    return true;
  }

  // Braze composite send types: full/email, full/android_push, etc. (not full/webhook)
  if (type.includes('/') && !type.includes('webhook')) {
    if (
      type.includes('email') ||
      type.includes('sms') ||
      type.includes('push') ||
      type.includes('in_app') ||
      type.includes('in-app') ||
      type.includes('content_card')
    ) {
      return true;
    }
  }

  const ch = getLifecycleStepChannel(step);
  if (isMessagingChannel(ch)) return true;

  if (looksLikeBrazeSendStepType(type)) {
    return true;
  }

  return false;
}

function coerceStep(row: LifecycleCanvasStep): LifecycleCanvasStep {
  const next = Array.isArray(row.next_step_ids) ? row.next_step_ids : [];
  return {
    ...row,
    id: String(row.id),
    next_step_ids: next,
  };
}

export function normalizeRawSteps(raw: unknown): Record<string, LifecycleCanvasStep> {
  if (raw == null) return {};
  if (Array.isArray(raw)) {
    const out: Record<string, LifecycleCanvasStep> = {};
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const id = String((item as { id?: string }).id ?? '').trim();
      if (!id) continue;
      out[id] = coerceStep(item as LifecycleCanvasStep);
    }
    return out;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, LifecycleCanvasStep> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v == null || typeof v !== 'object' || Array.isArray(v)) continue;
      const item = v as LifecycleCanvasStep;
      const id = String(item.id ?? k ?? '').trim();
      if (!id) continue;
      out[id] = coerceStep({ ...item, id } as LifecycleCanvasStep);
    }
    return out;
  }
  return {};
}

export function countMessagingTouchpoints(steps: Record<string, LifecycleCanvasStep>): number {
  return Object.values(steps).filter(isMessagingTouchpointStep).length;
}

/** All step objects in `raw_steps` (includes delays/splits — not only messaging). */
export function countAllSyncedSteps(steps: Record<string, LifecycleCanvasStep>): number {
  return Object.keys(steps).length;
}

/**
 * Single number for cards and totals: messaging touchpoints → else all synced step keys → else DB `total_steps`
 * (Braze-reported step count when Phase 3 has not filled `raw_steps` yet — avoids “0” on large journeys).
 */
export function computeLifecycleDisplayTouchpoints(
  steps: Record<string, LifecycleCanvasStep>,
  dbTotalSteps?: number | null,
): number {
  const messaging = countMessagingTouchpoints(steps);
  if (messaging > 0) return messaging;
  const all = countAllSyncedSteps(steps);
  if (all > 0) return all;
  const db =
    typeof dbTotalSteps === 'number' && !Number.isNaN(dbTotalSteps) ? dbTotalSteps : 0;
  return db > 0 ? db : 0;
}

/**
 * Card / list label: prefer messaging touchpoints; if none counted (types mismatch) use all synced steps;
 * if `raw_steps` is empty but DB still has `total_steps`, show that as a hint until the next sync fills JSON.
 */
export function formatLifecycleStepBadge(
  steps: Record<string, LifecycleCanvasStep>,
  dbTotalSteps?: number | null,
): { line: string; variant: 'messaging' | 'all' | 'db_only' } {
  const messaging = countMessagingTouchpoints(steps);
  const all = countAllSyncedSteps(steps);
  if (messaging > 0) {
    return {
      line: `${messaging} touchpoint${messaging !== 1 ? 's' : ''}`,
      variant: 'messaging',
    };
  }
  if (all > 0) {
    return {
      line: `${all} step${all !== 1 ? 's' : ''}`,
      variant: 'all',
    };
  }
  const db = typeof dbTotalSteps === 'number' && !Number.isNaN(dbTotalSteps) ? dbTotalSteps : 0;
  if (db > 0) {
    return {
      line: `${db} steps · run Sync from Braze`,
      variant: 'db_only',
    };
  }
  return { line: '0 touchpoints', variant: 'messaging' };
}
