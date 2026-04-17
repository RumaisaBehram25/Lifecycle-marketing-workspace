/**
 * Braze REST: enable Track Stats on an existing segment, attempt to create two segments, then verify via segments/list.
 *
 * Credentials (same as sync-braze / braze-segment-mix-setup-and-sync):
 * - `client_platforms`: `api_key`, `additional_config.rest_endpoint`
 * - `BRAZE_REST_URL` optional override
 * - `SUPABASE_URL` | `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
 *
 * Usage:
 *   npx --yes tsx --tsconfig scripts/tsconfig.json scripts/braze-segment-track-stats-and-create.ts
 *   npx --yes tsx --tsconfig scripts/tsconfig.json scripts/braze-segment-track-stats-and-create.ts -- --dry-run
 *   npx --yes tsx --tsconfig scripts/tsconfig.json scripts/braze-segment-track-stats-and-create.ts -- --skip-create
 *
 * Targets (exact Braze segment titles): "all email subscriber"; "active subscriber"; "churned".
 * For each: POST /segments/update with analytics_tracking / analytics_tracking_enabled variants. If active/churned
 * are missing, attempts POST /segments/create first, then update.
 *
 * Note: Public Braze docs list GET `/segments/list` and GET `/segments/details`; POST `/segments/update` and
 * `/segments/create` are not documented in the same catalog. This script issues the requests you described and
 * logs HTTP status and bodies so you can confirm behavior with Braze for your workspace/API key permissions.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { BRAZE_SEGMENT_MIX_CORE_NAMES } from '../src/lib/brazeSegmentMixNames';

function loadEnvFiles() {
  const root = process.cwd();
  const parse = (absolutePath: string, overrideExisting: boolean) => {
    if (!existsSync(absolutePath)) return;
    const text = readFileSync(absolutePath, 'utf8');
    for (let line of text.split(/\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim().replace(/\r$/, '');
      let val = line.slice(eq + 1).trim().replace(/\r$/, '');
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!overrideExisting && process.env[key] !== undefined) continue;
      process.env[key] = val;
    }
  };
  parse(resolve(root, '.env'), false);
  parse(resolve(root, '.env.local'), true);
}

loadEnvFiles();

const DEFAULT_CLIENT_ID = 'e7aaaf66-b99c-422b-92fb-186a36c2a7c1';
const [ALL_EMAIL_SUBSCRIBER_NAME, ACTIVE_SUBSCRIBER_NAME, CHURNED_NAME] = BRAZE_SEGMENT_MIX_CORE_NAMES;

const FALLBACK_BRAZE_REST = 'https://rest.iad-06.braze.com';
const MAX_SEGMENT_PAGES = 40;

function normalizeRestEndpoint(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  return s.length > 0 ? s.replace(/\/$/, '') : FALLBACK_BRAZE_REST;
}

function finiteNonNegativeInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function extractSegmentCurrentSize(seg: Record<string, unknown>): number | null {
  const topKeys = [
    'size',
    'segment_size',
    'approximate_size',
    'estimated_size',
    'audience_size',
    'member_count',
    'members',
    'total_members',
  ];
  for (const k of topKeys) {
    const n = finiteNonNegativeInt(seg[k]);
    if (n != null) return n;
  }
  const nested = [seg.analytics, seg.analytics_stats, seg.segment_stats, seg.stats, seg.data, seg.raw];
  const nestedKeys = [
    'size',
    'segment_size',
    'approximate_size',
    'estimated_size',
    'audience_size',
    'member_count',
    'members',
    'total_members',
    'total',
  ];
  for (const src of nested) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    const obj = src as Record<string, unknown>;
    for (const k of nestedKeys) {
      const n = finiteNonNegativeInt(obj[k]);
      if (n != null) return n;
    }
  }
  return null;
}

function getBrazeListArray(raw: Record<string, unknown>, keys: string[]): unknown[] {
  for (const k of keys) {
    const v = raw[k];
    if (Array.isArray(v)) return v;
  }
  const nested = raw.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>;
    for (const k of keys) {
      const v = inner[k];
      if (Array.isArray(v)) return v;
    }
    if (Array.isArray(inner.data)) return inner.data;
    if (Array.isArray(inner.results)) return inner.results;
  }
  if (Array.isArray(nested)) return nested;
  return [];
}

async function brazeGetJson(url: string, apiKey: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Braze HTTP ${res.status} ${url}: ${text.slice(0, 800)}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Braze response not JSON from ${url}: ${text.slice(0, 200)}`);
  }
}

async function brazePostJson(url: string, apiKey: string, body: unknown): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function fetchAllSegmentRows(restEndpoint: string, apiKey: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let segPage = 0;
  while (segPage < MAX_SEGMENT_PAGES) {
    const json = await brazeGetJson(
      `${restEndpoint}/segments/list?page=${segPage}&sort_direction=desc&limit=100`,
      apiKey,
    );
    const segs = getBrazeListArray(json, ['segments', 'items', 'data']) as Array<Record<string, unknown>>;
    if (segPage === 0 && segs.length === 0) {
      segPage = 1;
      continue;
    }
    if (segs.length === 0) break;
    out.push(...segs);
    segPage++;
    await new Promise((r) => setTimeout(r, 100));
  }
  return out;
}

function segmentIdFromRow(s: Record<string, unknown>): string {
  return String(s.id ?? s.segment_id ?? s.api_id ?? s.segment_api_id ?? '').trim();
}

function segmentNameFromRow(s: Record<string, unknown>): string {
  return String(s.name ?? s.segment_name ?? s.title ?? '').trim();
}

function analyticsEnabledFromRow(s: Record<string, unknown>): boolean | null {
  const v =
    s.analytics_tracking_enabled ??
    s.has_analytics_tracking ??
    s.track_analytics ??
    s.analytics_enabled;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1) return true;
  if (v === 'false' || v === 0) return false;
  return null;
}

/**
 * Best-effort filter trees for POST /segments/create (not in public Braze docs).
 * Uses documented Connected Audience shapes for email subscription + time on a **custom attribute**
 * named `last_opened_email`. If your workspace does not define that attribute, these bodies will likely
 * 400 — build the segments in the Segment Builder UI (email engagement filters) instead.
 */
function filtersActive90d(): unknown {
  return {
    AND: [
      { email_subscription_status: { comparison: 'is', value: 'subscribed' } },
      {
        custom_attribute: {
          custom_attribute_name: 'last_opened_email',
          comparison: 'less_than_x_days_ago',
          value: 90,
        },
      },
    ],
  };
}

/** Subscribed users whose last email open (on that custom attribute) was more than 180 days ago. */
function filtersChurned180d(): unknown {
  return {
    AND: [
      { email_subscription_status: { comparison: 'is', value: 'subscribed' } },
      {
        custom_attribute: {
          custom_attribute_name: 'last_opened_email',
          comparison: 'greater_than_x_days_ago',
          value: 180,
        },
      },
    ],
  };
}

function segmentUpdateBodies(segmentId: string): { label: string; body: Record<string, unknown> }[] {
  return [
    { label: 'braze_segment_id + analytics_tracking', body: { braze_segment_id: segmentId, analytics_tracking: true } },
    { label: 'segment_id + analytics_tracking', body: { segment_id: segmentId, analytics_tracking: true } },
    { label: 'segment_id + analytics_tracking_enabled', body: { segment_id: segmentId, analytics_tracking_enabled: true } },
    { label: 'braze_segment_id + analytics_tracking_enabled', body: { braze_segment_id: segmentId, analytics_tracking_enabled: true } },
    { label: 'id + analytics_tracking', body: { id: segmentId, analytics_tracking: true } },
    { label: 'segment wrapper + analytics_tracking_enabled', body: { segment: { id: segmentId, analytics_tracking_enabled: true } } },
    { label: 'segment wrapper + segment_id + analytics_tracking', body: { segment: { segment_id: segmentId, analytics_tracking: true } } },
  ];
}

function segmentCreateBodies(name: string, filters: unknown): { label: string; body: Record<string, unknown> }[] {
  return [
    {
      label: 'top-level name + analytics_tracking + analytics_tracking_enabled',
      body: {
        name,
        analytics_tracking: true,
        analytics_tracking_enabled: true,
        filters,
      },
    },
    {
      label: 'segment wrapper (name, analytics_tracking_enabled, filters)',
      body: {
        segment: {
          name,
          analytics_tracking: true,
          analytics_tracking_enabled: true,
          filters,
        },
      },
    },
    {
      label: 'segment wrapper (filters array empty — probe endpoint)',
      body: {
        segment: {
          name,
          analytics_tracking_enabled: true,
          filters: [],
        },
      },
    },
  ];
}

const CREATE_PATHS = ['/segments/create', '/segment/create'];

async function postFirstSuccess(
  restEndpoint: string,
  apiKey: string,
  path: string,
  attempts: { label: string; body: Record<string, unknown> }[],
  logPrefix: string,
): Promise<{ ok: boolean; status: number; text: string; label?: string }> {
  const url = `${restEndpoint}${path}`;
  let last = { ok: false as boolean, status: 0, text: '' };
  for (const a of attempts) {
    const r = await brazePostJson(url, apiKey, a.body);
    last = { ok: r.ok, status: r.status, text: r.text };
    console.log(`${logPrefix} POST ${path} [${a.label}] → ${r.status} ${r.ok ? 'ok' : 'fail'}`);
    if (!r.ok) {
      console.log(`  response: ${r.text.slice(0, 600)}${r.text.length > 600 ? '…' : ''}`);
    }
    if (r.ok) return { ...r, label: a.label };
    await new Promise((x) => setTimeout(x, 150));
  }
  return { ...last, ok: false };
}

async function tryCreateSegmentAcrossPaths(
  restEndpoint: string,
  apiKey: string,
  name: string,
  filters: unknown,
  logPrefix: string,
): Promise<boolean> {
  const attempts = segmentCreateBodies(name, filters);
  for (const path of CREATE_PATHS) {
    const r = await postFirstSuccess(restEndpoint, apiKey, path, attempts, logPrefix);
    if (r.ok) {
      console.log(`${logPrefix} Success on ${path} (${r.label ?? 'unknown body'})`);
      return true;
    }
  }
  console.error(`${logPrefix} All create attempts failed for "${name}" on paths: ${CREATE_PATHS.join(', ')}`);
  return false;
}

/** POST /segments/update until one body succeeds. Returns whether any attempt returned 2xx. */
async function trySegmentsUpdateAnalytics(
  restEndpoint: string,
  apiKey: string,
  segmentId: string,
  logPrefix: string,
): Promise<boolean> {
  const url = `${restEndpoint}/segments/update`;
  for (const u of segmentUpdateBodies(segmentId)) {
    const r = await brazePostJson(url, apiKey, u.body);
    console.log(`${logPrefix} POST /segments/update [${u.label}] → ${r.status} ${r.ok ? 'ok' : 'fail'}`);
    if (!r.ok) {
      console.log(`${logPrefix}   response: ${r.text.slice(0, 400)}${r.text.length > 400 ? '…' : ''}`);
    }
    if (r.ok) return true;
    await new Promise((x) => setTimeout(x, 150));
  }
  return false;
}

function parseArgs() {
  let dryRun = false;
  let skipCreate = false;
  let skipUpdate = false;
  let clientId = process.env.CLIENT_ID?.trim() || DEFAULT_CLIENT_ID;
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') dryRun = true;
    if (a === '--skip-create') skipCreate = true;
    if (a === '--skip-update') skipUpdate = true;
    if (a.startsWith('--client-id=')) clientId = a.slice('--client-id='.length).trim();
  }
  return { dryRun, skipCreate, skipUpdate, clientId };
}

async function main() {
  const { dryRun, skipCreate, skipUpdate, clientId } = parseArgs();

  const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: platform, error: pErr } = await supabase
    .from('client_platforms')
    .select('id, api_key, additional_config')
    .eq('client_id', clientId)
    .eq('platform', 'braze')
    .order('is_connected', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pErr) {
    console.error('client_platforms query:', pErr.message);
    process.exit(1);
  }
  if (!platform?.api_key) {
    console.error('No Braze api_key on client_platforms for this client_id.');
    process.exit(1);
  }

  const apiKey = String(platform.api_key);
  const addCfg = (platform.additional_config as Record<string, unknown> | null) ?? {};
  const restEndpoint = normalizeRestEndpoint(
    String(process.env.BRAZE_REST_URL ?? '').trim() ||
      (typeof addCfg.rest_endpoint === 'string' ? addCfg.rest_endpoint : '') ||
      FALLBACK_BRAZE_REST,
  );

  console.log('Using Braze REST:', restEndpoint);
  console.log('client_id:', clientId);
  if (dryRun) console.log('--dry-run: no POST /segments/update or /segments/create');

  const targets: { name: string; allowCreate: boolean; filters?: () => unknown }[] = [
    { name: ALL_EMAIL_SUBSCRIBER_NAME, allowCreate: false },
    { name: ACTIVE_SUBSCRIBER_NAME, allowCreate: true, filters: filtersActive90d },
    { name: CHURNED_NAME, allowCreate: true, filters: filtersChurned180d },
  ];

  console.log('\n[Step 0] GET /segments/list…');
  let rows = await fetchAllSegmentRows(restEndpoint, apiKey);
  console.log(`Fetched ${rows.length} segment row(s).`);

  function findByExactName(name: string) {
    return rows.find((r) => segmentNameFromRow(r) === name);
  }

  type SegResult = { name: string; updateOk: boolean; createOk?: boolean; note?: string };
  const segResults: SegResult[] = [];

  if (!skipUpdate && !dryRun) {
    console.log('\n[Steps 1–2] Per-segment: create if allowed+missing, then POST /segments/update (analytics_tracking)…');

    for (const t of targets) {
      const prefix = `[${t.name}]`;
      let row = findByExactName(t.name);
      let createOk: boolean | undefined;

      if (!row && t.allowCreate && t.filters && !skipCreate) {
        console.log(`\n${prefix} Not in segments/list — attempting POST /segments/create…`);
        createOk = await tryCreateSegmentAcrossPaths(restEndpoint, apiKey, t.name, t.filters(), prefix);
        rows = await fetchAllSegmentRows(restEndpoint, apiKey);
        row = findByExactName(t.name);
        if (!row) {
          console.error(`${prefix} FAILURE: segment still missing after create. Skipping /segments/update.`);
          segResults.push({ name: t.name, updateOk: false, createOk, note: 'missing after create' });
          continue;
        }
      }

      if (!row) {
        if (!t.allowCreate) {
          console.error(`${prefix} FAILURE: required segment not found in Braze (name must match exactly).`);
          segResults.push({ name: t.name, updateOk: false, note: 'not found' });
        } else if (skipCreate) {
          console.error(`${prefix} FAILURE: not found and --skip-create was set.`);
          segResults.push({ name: t.name, updateOk: false, note: 'not found, skip-create' });
        } else {
          console.error(`${prefix} FAILURE: not found.`);
          segResults.push({ name: t.name, updateOk: false, note: 'not found' });
        }
        continue;
      }

      const id = segmentIdFromRow(row);
      if (!id) {
        console.error(`${prefix} FAILURE: could not read segment id from list payload.`);
        segResults.push({ name: t.name, updateOk: false, createOk, note: 'no id' });
        continue;
      }

      console.log(
        `\n${prefix} id=${id}, analytics_tracking_enabled(before)=${String(analyticsEnabledFromRow(row))}`,
      );
      const ok = await trySegmentsUpdateAnalytics(restEndpoint, apiKey, id, prefix);
      if (ok) {
        console.log(`${prefix} SUCCESS: /segments/update accepted (analytics_tracking / analytics_tracking_enabled).`);
        segResults.push({
          name: t.name,
          updateOk: true,
          ...(t.allowCreate ? { createOk } : {}),
        });
      } else {
        console.error(`${prefix} FAILURE: no /segments/update body returned success.`);
        segResults.push({
          name: t.name,
          updateOk: false,
          ...(t.allowCreate ? { createOk } : {}),
          note: 'update failed',
        });
      }
    }

    console.log('\n--- Summary (per segment) ---');
    for (const t of targets) {
      const r = segResults.find((x) => x.name === t.name);
      if (!r) {
        console.log(`${t.name}: (not summarized — check logs above)`);
        continue;
      }
      const parts = [`update=${r.updateOk ? 'SUCCESS' : 'FAILURE'}`];
      if (r.createOk !== undefined) parts.push(`create=${r.createOk ? 'SUCCESS' : 'FAILURE'}`);
      if (r.note) parts.push(`note=${r.note}`);
      console.log(`${t.name}: ${parts.join(', ')}`);
    }
  } else if (skipUpdate) {
    console.log('\n[Steps 1–2] Skipped (--skip-update).');
  } else {
    console.log('\n[Steps 1–2] Skipped (--dry-run).');
  }

  if (!skipCreate && !dryRun && skipUpdate) {
    console.log('\n[Create-only] Skipped because --skip-update implies no segment pipeline; use without --skip-update for create+update.');
  }

  console.log('\n[Step 3] GET /segments/list — verify three segments + sizes…');
  rows = await fetchAllSegmentRows(restEndpoint, apiKey);
  const want = new Set<string>([ALL_EMAIL_SUBSCRIBER_NAME, ACTIVE_SUBSCRIBER_NAME, CHURNED_NAME]);
  const byName = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const n = segmentNameFromRow(r);
    if (n && want.has(n)) byName.set(n, r);
  }

  let allOk = true;
  for (const name of [ALL_EMAIL_SUBSCRIBER_NAME, ACTIVE_SUBSCRIBER_NAME, CHURNED_NAME]) {
    const row = byName.get(name);
    if (!row) {
      console.log(`\n  name: ${name}\n  id: (missing)\n  size: (missing)\n  analytics_tracking_enabled: n/a`);
      allOk = false;
      continue;
    }
    const id = segmentIdFromRow(row);
    const size = extractSegmentCurrentSize(row);
    const at = analyticsEnabledFromRow(row);
    console.log(
      `\n  name: ${name}\n  id: ${id}\n  size: ${size === null ? '(null)' : size}\n  analytics_tracking_enabled: ${at === null ? 'unknown' : String(at)}`,
    );
    if (size === null) {
      console.log('  (size null — Braze may omit audience size until analytics refresh or Track Stats is enabled.)');
      allOk = false;
    }
  }

  if (!allOk) {
    console.error(
      '\nVerification incomplete: missing segment(s) and/or null size. Create filters in Braze UI if POST /segments/create is not supported.',
    );
    if (!dryRun) process.exit(3);
    else console.log('\n(--dry-run: exiting 0 despite incomplete verification.)');
  } else {
    console.log('\nDone.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
