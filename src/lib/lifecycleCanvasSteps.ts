import { parseCampaignTaxonomy } from '@/lib/campaign-taxonomy';

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

/** Exported alias for filtering channel strings to messaging-only (email, push, sms, in-app, content card). */
export function isLifecycleMessagingChannel(raw: string): boolean {
  return isMessagingChannel(raw);
}

function isMessagingChannel(raw: string): boolean {
  const c = raw.toLowerCase().trim();
  if (!c) return false;
  if (c === 'email') return true;
  if (c.includes('push')) return true;
  if (c.includes('sms')) return true;
  if (c.includes('whatsapp')) return true;
  if (c.includes('in_app') || c.includes('in-app')) return true;
  if (c === 'trigger_in_app_message') return true;
  if (c.includes('content_card')) return true;
  if (c === 'iam' || c.startsWith('iam_')) return true;
  return false;
}

/** When `step.channel` is empty, infer from Braze composite step types (e.g. full/sms, full/android_push). */
function channelFromStepType(type: string): string | null {
  const t = type.toLowerCase();
  if (!t) return null;
  if (t.includes('whatsapp')) return 'whatsapp';
  if (t.includes('sms') || t.includes('mms')) return 'sms';
  if (t.includes('email')) return 'email';
  if (t.includes('in_app') || t.includes('in-app')) return 'in_app_message';
  if (t.includes('content_card')) return 'content_card';
  if (t.includes('push') && !t.includes('in_app') && !t.includes('in-app')) return 'push';
  return null;
}

/**
 * Infer canvas-level channel pills / filters from `raw_steps` + canvas name.
 * List queries often omit `raw_steps`; call again after loading full canvas rows.
 * Never defaults to email — that mislabeled SMS/Push journeys when steps were not yet loaded.
 */
export function inferLifecycleCanvasChannels(rawSteps: unknown, canvasName: string): string[] {
  const taxonomy = parseCampaignTaxonomy(canvasName);
  const stepsRecord = normalizeRawSteps(rawSteps);
  const stepsList = Object.values(stepsRecord) as LifecycleCanvasStep[];

  const collected = new Set<string>();
  for (const s of stepsList) {
    const direct = getLifecycleStepChannel(s);
    if (direct && isMessagingChannel(direct)) {
      collected.add(direct);
      continue;
    }
    const fromType = channelFromStepType(s.type || '');
    if (fromType) {
      collected.add(fromType);
      continue;
    }
    const fromMsg = s.messages?.map((m) => m.channel).find(Boolean);
    if (fromMsg && isMessagingChannel(String(fromMsg))) {
      collected.add(String(fromMsg).trim());
    }
  }

  if (collected.size > 0) {
    return [...collected];
  }

  const nameLower = canvasName.toLowerCase();
  const inferred: string[] = [];
  if (nameLower.includes('email') || taxonomy.channel === 'email') inferred.push('email');
  if (nameLower.includes('push')) inferred.push('push');
  if (nameLower.includes('sms') || nameLower.includes('mms')) inferred.push('sms');
  if (nameLower.includes('whatsapp')) inferred.push('whatsapp');
  if (nameLower.includes('in-app') || nameLower.includes('in_app')) inferred.push('in_app_message');
  return inferred;
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

  // Exclude non-messaging channels even when type is generic (e.g. type="message" channel="webhook")
  const directChannel = (step.channel || '').toLowerCase();
  if (directChannel && NON_MESSAGE_STEP_TYPES.has(directChannel)) return false;

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

const MAX_JSON_STRING_UNWRAP = 12;

/**
 * `raw_steps` is jsonb in Postgres; some pipelines or exports store it double-encoded as a JSON string.
 * Unwrap string layers (bounded) then normalize the resulting object/array.
 */
export function normalizeRawSteps(raw: unknown, jsonUnwrapDepth = 0): Record<string, LifecycleCanvasStep> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    if (jsonUnwrapDepth > MAX_JSON_STRING_UNWRAP) return {};
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      return normalizeRawSteps(JSON.parse(trimmed) as unknown, jsonUnwrapDepth + 1);
    } catch {
      return {};
    }
  }
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
