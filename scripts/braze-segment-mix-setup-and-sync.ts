/**
 * Braze "segment mix" helper: list segments from Braze REST, optionally upsert Supabase mirrors.
 *
 * IMPORTANT — Step 1 (create segments via API):
 * Braze's **documented** REST API exposes listing/exporting segments (GET `segments/list`, export
 * segment list/details, etc.) but **not** creating or editing segment **definitions** (filters) via
 * public API. Community threads confirm UI-only creation for standard segments.
 *
 * This script therefore:
 * 1) Optionally tries an **unsupported** POST (disabled by default) — expect failure.
 * 2) Fetches `segments/list` (same as sync-braze), matches the three segment **names** (default: trim +
 *    case-insensitive; use `--strict-names` for exact Braze title only).
 * 3) If all three exist with a parseable **size**, upserts `braze_segments_sync` + `braze_segment_analytics`.
 * 4) If any are missing, prints **dashboard filter guidance** so you can create them manually and
 *    enable **analytics tracking** ("Track stats"), then re-run with `--sync-only`.
 *
 * Credentials (same sources as sync-braze):
 * - `client_platforms` row: `api_key` + `additional_config.rest_endpoint` (Braze REST base URL)
 * - Fallback: `BRAZE_REST_URL` env (e.g. https://rest.iad-06.braze.com)
 *
 * Supabase (service role bypasses RLS):
 * - `SUPABASE_URL` or `VITE_SUPABASE_URL`
 * - `SUPABASE_SERVICE_ROLE_KEY`
 *
 * Usage (repo root):
 *   npx --yes tsx --tsconfig scripts/tsconfig.json scripts/braze-segment-mix-setup-and-sync.ts
 *   npx --yes tsx --tsconfig scripts/tsconfig.json scripts/braze-segment-mix-setup-and-sync.ts -- --sync-only
 *   npx --yes tsx --tsconfig scripts/tsconfig.json scripts/braze-segment-mix-setup-and-sync.ts -- --client-id=<uuid> --date=2026-04-16
 *   npx --yes tsx --tsconfig scripts/tsconfig.json scripts/braze-segment-mix-setup-and-sync.ts -- --strict-names
 *
 * If Braze uses different segment titles, map canonical → Braze (first `=` splits target title):
 *   -- --alias="All Email Subscribers=All mailable users"
 * Or set JSON in .env: BRAZE_SEGMENT_MIX_ALIASES={"All Email Subscribers":"All mailable users"}
 *
 * Loads `.env` / `.env.local` like other scripts (see backfill-campaign-creatives.ts).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

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
const DEFAULT_SNAPSHOT_DATE = '2026-04-16';

const TARGET_SEGMENTS: { name: string; dashboardHint: string }[] = [
  {
    name: 'All Email Subscribers',
    dashboardHint:
      'Use Segments → filter: **Email marketing subscription** (or subscription group) = **Subscribed** / opted in for marketing email. Exclude unsubscribed as needed for your workspace policy.',
  },
  {
    name: 'Active Subscribers (opened in 90d)',
    dashboardHint:
      'Intersection: same email subscription = subscribed **AND** **Opened email** in the **last 90 days** (Braze: Email engagement → opened email, rolling 90 days).',
  },
  {
    name: 'Churned (no open in 180d)',
    dashboardHint:
      'Intersection: email subscription = subscribed **AND** **Has not opened email** in the **last 180 days** (or **Last opened email** more than 180 days ago — match your team’s definition). Ensure this does not overlap Active if you need a partition.',
  },
];

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

/** Mirrors sync-braze `extractSegmentCurrentSize`. */
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
    throw new Error(`Braze HTTP ${res.status} ${url}: ${text.slice(0, 500)}`);
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

/**
 * Undocumented / unsupported: Braze does not publish a create-segment REST contract.
 * We try a no-op probe so you can see the error in logs; do not rely on this.
 */
async function tryExperimentalSegmentCreate(restEndpoint: string, apiKey: string): Promise<void> {
  const url = `${restEndpoint}/segments/update`;
  const body = {
    segment: {
      name: '__crm_copilot_probe_delete_me__',
      filters: [],
    },
  };
  const r = await brazePostJson(url, apiKey, body);
  console.log(
    `[experimental] POST ${url} → ${r.status} ${r.ok ? 'ok' : 'failed'}\n${r.text.slice(0, 400)}`,
  );
}

async function fetchAllSegmentRows(restEndpoint: string, apiKey: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let segPage = 0;
  while (segPage < MAX_SEGMENT_PAGES) {
    const json = await brazeGetJson(
      `${restEndpoint}/segments/list?page=${segPage}&sort_direction=desc&limit=100`,
      apiKey,
    );
    let segs = getBrazeListArray(json, ['segments', 'items', 'data']) as Array<Record<string, unknown>>;
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

/** Collapses whitespace and lowercases so UI copy/paste variants still match. */
function normalizeSegmentMatchKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function buildSegmentNameIndexes(rows: Record<string, unknown>[]) {
  const byExact = new Map<string, Record<string, unknown>>();
  const byNormalized = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const rawName = segmentNameFromRow(r);
    if (!rawName) continue;
    byExact.set(rawName, r);
    const k = normalizeSegmentMatchKey(rawName);
    const arr = byNormalized.get(k) ?? [];
    arr.push(r);
    byNormalized.set(k, arr);
  }
  return { byExact, byNormalized };
}

/**
 * Resolves a target label to a Braze row: exact name first, then normalized (case/whitespace).
 * Returns how the row was matched for logging.
 */
function resolveSegmentRow(
  targetLabel: string,
  rows: Record<string, unknown>[],
  byExact: Map<string, Record<string, unknown>>,
  byNormalized: Map<string, Record<string, unknown>[]>,
): { row: Record<string, unknown>; match: 'exact' | 'normalized'; brazeName: string } | null {
  const direct = byExact.get(targetLabel);
  if (direct) {
    return { row: direct, match: 'exact', brazeName: segmentNameFromRow(direct) };
  }
  const nk = normalizeSegmentMatchKey(targetLabel);
  const group = byNormalized.get(nk);
  if (group && group.length === 1) {
    const row = group[0];
    return { row, match: 'normalized', brazeName: segmentNameFromRow(row) };
  }
  if (group && group.length > 1) {
    console.error(
      `Multiple Braze segments share the same normalized name "${targetLabel}". Rename one in Braze so names are unique:\n` +
        group.map((r) => `  - "${segmentNameFromRow(r)}" (id ${segmentIdFromRow(r)})`).join('\n'),
    );
    process.exit(2);
  }
  return null;
}

function printDidYouMeanSuggestions(targetLabel: string, rows: Record<string, unknown>[]) {
  const names = rows.map((r) => segmentNameFromRow(r)).filter(Boolean);
  const t = normalizeSegmentMatchKey(targetLabel);
  const scored = names
    .map((name) => ({
      name,
      d: levenshtein(normalizeSegmentMatchKey(name), t),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 12);
  const uniq: { name: string; d: number }[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    uniq.push(s);
    if (uniq.length >= 8) break;
  }
  if (uniq.length === 0) return;
  console.error('\nClosest segment names in this workspace (by edit distance):');
  for (const u of uniq) {
    console.error(`  • "${u.name}" (distance ${u.d})`);
  }
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

/** JSON object: canonical label → Braze segment title as shown in Segments. */
function loadAliasesFromEnv(): Map<string, string> {
  const raw = process.env.BRAZE_SEGMENT_MIX_ALIASES?.trim();
  if (!raw) return new Map();
  try {
    const j = JSON.parse(raw) as unknown;
    if (j && typeof j === 'object' && j !== null && !Array.isArray(j)) {
      const m = new Map<string, string>();
      for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
        const key = String(k).trim();
        if (!key || v == null) continue;
        m.set(key, String(v).trim());
      }
      return m;
    }
  } catch {
    /* ignore invalid JSON */
  }
  return new Map();
}

/** `--alias="Canonical name=Braze title"` — first `=` after `--alias=` separates keys; Braze title may contain `=`. */
function parseAliasesFromArgv(argv: string[]): Map<string, string> {
  const m = new Map<string, string>();
  const prefix = '--alias=';
  for (const a of argv) {
    if (!a.startsWith(prefix)) continue;
    const rest = a.slice(prefix.length);
    const eq = rest.indexOf('=');
    if (eq <= 0) continue;
    const canonical = rest.slice(0, eq).trim();
    const brazeTitle = rest.slice(eq + 1).trim();
    if (canonical && brazeTitle) m.set(canonical, brazeTitle);
  }
  return m;
}

function mergeAliases(a: Map<string, string>, b: Map<string, string>): Map<string, string> {
  const out = new Map(a);
  for (const [k, v] of b) out.set(k, v);
  return out;
}

function parseArgs() {
  let syncOnly = false;
  let experimentalCreate = false;
  let dryRun = false;
  let strictNames = false;
  let clientId = process.env.CLIENT_ID?.trim() || DEFAULT_CLIENT_ID;
  let snapshotDate = process.env.SNAPSHOT_DATE?.trim() || DEFAULT_SNAPSHOT_DATE;
  const argv = process.argv.slice(2);
  for (const a of argv) {
    if (a === '--sync-only') syncOnly = true;
    if (a === '--experimental-create') experimentalCreate = true;
    if (a === '--dry-run') dryRun = true;
    if (a === '--strict-names') strictNames = true;
    if (a.startsWith('--client-id=')) clientId = a.slice('--client-id='.length).trim();
    if (a.startsWith('--date=')) snapshotDate = a.slice('--date='.length).trim();
  }
  const aliases = mergeAliases(loadAliasesFromEnv(), parseAliasesFromArgv(argv));
  return { syncOnly, experimentalCreate, dryRun, strictNames, clientId, snapshotDate, aliases };
}

async function main() {
  const { syncOnly, experimentalCreate, dryRun, strictNames, clientId, snapshotDate, aliases } = parseArgs();

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
    console.error('No Braze api_key on client_platforms for this client_id. Connect Braze in Settings → Platforms.');
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
  console.log('snapshot date:', snapshotDate);
  if (aliases.size > 0) {
    console.log('segment title aliases:', [...aliases.entries()].map(([k, v]) => `"${k}" → "${v}"`).join('; '));
  }

  if (!syncOnly && experimentalCreate) {
    console.log('\n[Step 1] --experimental-create: probing unsupported POST (expected to fail)…');
    await tryExperimentalSegmentCreate(restEndpoint, apiKey);
  } else if (!syncOnly) {
    console.log(
      '\n[Step 1] Skipping API segment creation (not supported by Braze public REST). ' +
        'Create the three segments in Braze UI with analytics tracking ON, or use --sync-only after they exist.\n' +
        'Optional: --experimental-create to POST a probe to /segments/update (will likely error).\n',
    );
    for (const t of TARGET_SEGMENTS) {
      console.log(`  • ${t.name}\n    → ${t.dashboardHint}\n`);
    }
  }

  console.log('\n[Step 2] GET segments/list (paginated)…');
  let rows: Record<string, unknown>[];
  try {
    rows = await fetchAllSegmentRows(restEndpoint, apiKey);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
  console.log(`Fetched ${rows.length} segment row(s) from Braze.`);

  const { byExact, byNormalized } = buildSegmentNameIndexes(rows);

  const resolved: {
    name: string;
    segment_id: string;
    size: number | null;
    analytics: boolean | null;
    raw: Record<string, unknown>;
  }[] = [];

  for (const t of TARGET_SEGMENTS) {
    const lookupName = aliases.get(t.name) ?? t.name;
    if (lookupName !== t.name) {
      console.log(`Lookup for "${t.name}" using Braze title: "${lookupName}"`);
    }
    let row: Record<string, unknown> | undefined;
    let matchNote = '';
    if (strictNames) {
      row = byExact.get(lookupName);
    } else {
      const hit = resolveSegmentRow(lookupName, rows, byExact, byNormalized);
      if (hit) {
        row = hit.row;
        if (hit.match === 'normalized' && hit.brazeName !== lookupName) {
          matchNote = ` (Braze name: "${hit.brazeName}")`;
        }
      }
    }
    if (!row) {
      console.error(
        `\nMissing segment in Braze: "${t.name}"` +
          (lookupName !== t.name ? ` (lookup title: "${lookupName}")` : '') +
          (strictNames ? ' (--strict-names: exact string only)' : ''),
      );
      console.error(`Hint: ${t.dashboardHint}`);
      if (!strictNames) {
        console.error(
          'Tip: names are matched case-insensitively after trimming; use --strict-names to require an exact Braze title.',
        );
        console.error(
          'If the segment exists under another name, use --alias="Canonical=Braze title" or BRAZE_SEGMENT_MIX_ALIASES JSON in .env.',
        );
      }
      printDidYouMeanSuggestions(lookupName, rows);
      process.exit(2);
    }
    if (matchNote) {
      console.log(`Resolved "${t.name}"${matchNote}`);
    }
    const id = segmentIdFromRow(row);
    if (!id) {
      console.error(`No segment id in list payload for "${t.name}"`);
      process.exit(2);
    }
    const size = extractSegmentCurrentSize(row);
    const analytics = analyticsEnabledFromRow(row);
    resolved.push({
      name: t.name,
      segment_id: id,
      size,
      analytics,
      raw: row,
    });
    if (size == null) {
      console.warn(
        `Warning: no parseable size for "${t.name}". Enable segment analytics / "Track stats" in Braze so segments/list includes audience size (same requirement as sync-braze).`,
      );
    }
    if (analytics === false) {
      console.warn(`Warning: analytics tracking may be off for "${t.name}" (payload hint: false).`);
    }
  }

  console.log('\n[Step 2] Resolved segments:\n');
  for (const r of resolved) {
    console.log(
      `  name: ${r.name}\n  segment_id: ${r.segment_id}\n  size: ${r.size ?? '(null)'}\n  analytics_hint: ${r.analytics ?? 'unknown'}\n`,
    );
  }

  if (dryRun) {
    console.log('\n--dry-run: skipping Supabase writes.');
    process.exit(0);
  }

  const nowIso = new Date().toISOString();

  console.log('\n[Step 3] Upsert braze_segments_sync + braze_segment_analytics…');

  for (const r of resolved) {
    const syncRow = {
      client_id: clientId,
      braze_segment_id: r.segment_id,
      name: r.name,
      tags: [] as string[],
      raw: r.raw,
      synced_at: nowIso,
    };

    const { error: e1 } = await supabase.from('braze_segments_sync').upsert(syncRow, {
      onConflict: 'client_id,braze_segment_id',
    });
    if (e1) {
      console.error('braze_segments_sync upsert error:', e1.message);
      process.exit(1);
    }

    const analyticsRow = {
      client_id: clientId,
      date: snapshotDate,
      segment_id: r.segment_id,
      segment_name: r.name,
      size: r.size ?? 0,
    };

    const { error: e2 } = await supabase.from('braze_segment_analytics').upsert(analyticsRow, {
      onConflict: 'client_id,segment_id,date',
    });
    if (e2) {
      console.error('braze_segment_analytics upsert error:', e2.message);
      process.exit(1);
    }
  }

  console.log('\n[Step 4] Done. Summary:\n');
  for (const r of resolved) {
    console.log(`${r.name} | id=${r.segment_id} | size=${r.size ?? 0}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
