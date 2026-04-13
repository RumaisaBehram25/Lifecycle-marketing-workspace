import type { LifecycleCanvasStep } from '@/lib/lifecycleCanvasSteps';
import { isMessagingTouchpointStep } from '@/lib/lifecycleCanvasSteps';
import { resolveLifecycleMessageCardImageUrl } from '@/lib/campaignDisplay';

export type LifecycleStepForImageCollect = {
  id?: string;
  channel?: string;
  type?: string;
  delay_seconds?: number;
  next_step_ids?: string[];
  next_paths?: Array<{ name?: string; next_step_id?: string; nextStepId?: string; next_canvas_step_id?: string }>;
  messages?: Array<{
    channel?: string;
    image_url?: string;
    html_content?: string;
    subject?: string;
    title?: string;
    body?: string;
  }>;
};

function normalizeChannel(channel?: string): string {
  const ch = (channel || '').toLowerCase();
  if (!ch) return 'email';
  if (ch === 'email') return 'email';
  if (ch.includes('push')) return 'push';
  if (ch.includes('in_app') || ch.includes('in-app') || ch.includes('inapp')) return 'in_app_message';
  if (ch === 'sms') return 'sms';
  if (ch === 'control') return 'control';
  return ch;
}

/** Mirrors HorizontalFlowChart `pickBestMessage` — one creative per touchpoint card. */
function pickBestMessageForImage(step: LifecycleStepForImageCollect) {
  const msgs = step.messages || [];
  if (!msgs.length) return undefined;

  const wanted = normalizeChannel(step.channel);

  const match = msgs.find(
    (m) => normalizeChannel(m.channel) === wanted && normalizeChannel(m.channel) !== 'control',
  );
  if (match) return match;

  const withContent = msgs.find(
    (m) =>
      normalizeChannel(m.channel) !== 'control' &&
      (m.html_content || m.subject || m.title || m.body),
  );
  if (withContent) return withContent;

  return msgs[0];
}

function getOutgoingStepIds(step: LifecycleCanvasStep): string[] {
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
        (p as { next_step_id?: string }).next_step_id ??
          (p as { nextStepId?: string }).nextStepId ??
          (p as { next_canvas_step_id?: string }).next_canvas_step_id ??
          '',
      ).trim();
      if (id) out.push(id);
    }
  }
  return out;
}

function buildAllReachableSteps(
  firstStepId: string | null,
  allSteps: Record<string, LifecycleCanvasStep>,
): LifecycleCanvasStep[] {
  if (!firstStepId || !allSteps[firstStepId]) return [];

  const result: LifecycleCanvasStep[] = [];
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

function findEntryStepId(allSteps: Record<string, LifecycleCanvasStep>): string | null {
  const ids = Object.keys(allSteps);
  if (ids.length === 0) return null;
  const hasIncoming = new Set<string>();
  for (const s of Object.values(allSteps)) {
    for (const t of getOutgoingStepIds(s)) {
      hasIncoming.add(t);
    }
  }
  const entries = ids.filter((id) => !hasIncoming.has(id));
  if (entries.length === 0) return ids[0];
  const withOutgoing = entries.filter((id) => getOutgoingStepIds(allSteps[id]).length > 0);
  return withOutgoing.length > 0 ? withOutgoing[0] : entries[0];
}

/**
 * First strong preview URL for a journey **grid** card — path order matches a **non-control**
 * variant’s BFS traversal when names are present (aligned with the flow chart), else the first variant.
 */
export function pickJourneyGridHeroPreviewUrl(
  steps: Record<string, LifecycleCanvasStep>,
  variants?: ReadonlyArray<{ first_step_id: string | null; name?: string }> | null,
): string | undefined {
  if (!steps || typeof steps !== 'object') return undefined;
  const chosen =
    variants?.find(
      (v) => typeof v.name === 'string' && v.name.trim() && !v.name.toLowerCase().includes('control'),
    ) ?? variants?.[0];
  const firstId =
    chosen?.first_step_id && steps[chosen.first_step_id]
      ? chosen.first_step_id
      : findEntryStepId(steps);
  const path = buildAllReachableSteps(firstId, steps);
  for (const step of path) {
    if (!isMessagingTouchpointStep(step)) continue;
    const m = pickBestMessageForImage(step);
    const u = m ? resolveLifecycleMessageCardImageUrl(m) : undefined;
    if (u) return u;
  }
  return undefined;
}

/**
 * Distinct resolved preview URLs from canvas `steps` (unordered; diagnostics / legacy prefetch).
 */
export function collectLifecycleStepImageUrls(
  steps: Record<string, { messages?: Array<{ image_url?: string; html_content?: string; body?: string }> }>,
): string[] {
  const seen = new Set<string>();
  for (const step of Object.values(steps)) {
    for (const m of step.messages ?? []) {
      const u = resolveLifecycleMessageCardImageUrl(m);
      if (u) seen.add(u);
    }
  }
  return Array.from(seen);
}

/**
 * Resolved preview URL for each messaging touchpoint in **journey order** (for prefetch + cache warm).
 */
export function collectOrderedTouchpointImageUrls(
  orderedSteps: ReadonlyArray<LifecycleStepForImageCollect>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const step of orderedSteps) {
    const m = pickBestMessageForImage(step);
    const u = m ? resolveLifecycleMessageCardImageUrl(m) : undefined;
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}
