/**
 * For braze_campaigns rows with empty raw_details and no image_url, call the
 * `braze-campaign-creative` edge function (same as opening a campaign in the UI) to fetch
 * Braze `/campaigns/details` and persist into raw_details when possible.
 *
 * Env (from `.env` / `.env.local`):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  — DB reads/writes (RLS bypass)
 *   VITE_SUPABASE_ANON_KEY     — **Must be the anon JWT** (`eyJ…`) for `apikey` + Auth. `sb_publishable_…` alone will not work.
 *   Live auth (pick one):
 *     - SYNC_USER_JWT — paste `access_token` from browser session (Application → Local Storage → sb-*-auth-token), or
 *     - SYNC_SCRIPT_EMAIL + SYNC_SCRIPT_PASSWORD — script calls signInWithPassword (use an admin-capable account).
 *   The edge function rejects `service_role` in Authorization; service role is only for DB queries in this script.
 *
 * Usage:
 *   npm run sync:missing-raw-details -- --dry-run
 *   npm run sync:missing-raw-details -- --limit=10
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function loadEnvFiles() {
  const root = process.cwd();
  const parse = (absolutePath: string, overrideExisting: boolean) => {
    if (!existsSync(absolutePath)) return;
    const text = readFileSync(absolutePath, 'utf8');
    for (let line of text.split('\n')) {
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

type CampaignRow = {
  id: string;
  client_id: string;
  braze_campaign_id: string;
};

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  let limit: number | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10);
      if (Number.isFinite(n) && n >= 0) limit = n;
    }
  }
  return { dryRun, limit };
}

function rawDetailsPopulated(rd: unknown): boolean {
  if (rd == null) return false;
  if (typeof rd !== 'object' || Array.isArray(rd)) return false;
  return Object.keys(rd as Record<string, unknown>).length > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Supabase Functions + Auth expect the anon **JWT** (`eyJ…`), not `sb_publishable_…`. */
function resolveAnonJwt(): string | undefined {
  const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  const pub = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (anon?.startsWith('eyJ')) return anon;
  if (pub?.startsWith('eyJ')) return pub;
  return undefined;
}

async function resolveUserAccessToken(
  supabaseUrl: string,
  anonJwt: string,
): Promise<{ token: string; via: string } | { error: string }> {
  const direct = process.env.SYNC_USER_JWT?.trim();
  if (direct) return { token: direct, via: 'SYNC_USER_JWT' };

  const email =
    process.env.SYNC_SCRIPT_EMAIL?.trim() ||
    process.env.SUPABASE_SYNC_EMAIL?.trim();
  const password =
    process.env.SYNC_SCRIPT_PASSWORD?.trim() ||
    process.env.SUPABASE_SYNC_PASSWORD?.trim();

  if (!email || !password) {
    return {
      error:
        'No user session for Edge Functions. Set SYNC_USER_JWT, or SYNC_SCRIPT_EMAIL + SYNC_SCRIPT_PASSWORD (or SUPABASE_SYNC_*), in `.env.local`.',
    };
  }

  const authClient = createClient(supabaseUrl, anonJwt, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    return { error: error?.message ?? 'signInWithPassword returned no session' };
  }
  return { token: data.session.access_token, via: 'signInWithPassword' };
}

async function fetchMissingRows(supabase: SupabaseClient): Promise<CampaignRow[]> {
  const pageSize = 500;
  const out: CampaignRow[] = [];
  let from = 0;
  for (;;) {
    const { data: page, error } = await supabase
      .from('braze_campaigns')
      .select('id, client_id, braze_campaign_id')
      .is('image_url', null)
      .or('raw_details.is.null,raw_details.eq.{}')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!page?.length) break;
    for (const r of page) {
      if (r.id && r.client_id && r.braze_campaign_id != null) {
        out.push({
          id: String(r.id),
          client_id: String(r.client_id),
          braze_campaign_id: String(r.braze_campaign_id),
        });
      }
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function buildBrazePlatformIdByClient(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('client_platforms')
    .select('id, client_id')
    .eq('platform', 'braze')
    .eq('is_connected', true);

  if (error) throw error;
  const m = new Map<string, string>();
  for (const p of data ?? []) {
    if (p.client_id && p.id) m.set(String(p.client_id), String(p.id));
  }
  return m;
}

async function main() {
  const { dryRun, limit } = parseArgs();

  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonJwt = resolveAnonJwt();

  /** Set for live path only; edge invoke uses user JWT + anon JWT. */
  let userJwtForEdge!: string;
  let anonJwtForEdge!: string;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing VITE_SUPABASE_URL (or SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  if (!dryRun) {
    if (!anonJwt) {
      console.error(
        'Live run needs VITE_SUPABASE_ANON_KEY as the anon **JWT** (starts with eyJ).',
      );
      console.error(
        'If you only have sb_publishable_… in VITE_SUPABASE_PUBLISHABLE_KEY, copy the anon JWT from Supabase Dashboard → Settings → API → anon public.',
      );
      process.exit(1);
    }
    const auth = await resolveUserAccessToken(supabaseUrl, anonJwt);
    if ('error' in auth) {
      console.error(auth.error);
      console.error(
        'The braze-campaign-creative function requires a **user** Bearer token; SUPABASE_SERVICE_ROLE_KEY is only used for DB access here.',
      );
      process.exit(1);
    }
    userJwtForEdge = auth.token;
    anonJwtForEdge = anonJwt;
    console.log(`User session: ${auth.via}`);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Dry run: ${dryRun}`);
  if (limit != null && limit > 0) console.log(`Limit: ${limit} row(s)`);

  const rows = await fetchMissingRows(supabase);
  const toProcess = limit != null && limit > 0 ? rows.slice(0, limit) : rows;

  console.log(`Found ${rows.length} row(s) matching: image_url IS NULL and (raw_details IS NULL OR raw_details = {}).`);
  console.log(`Will ${dryRun ? 'simulate' : 'process'} ${toProcess.length} row(s).`);

  if (dryRun) {
    for (const r of toProcess.slice(0, 20)) {
      console.log(`  [dry-run] id=${r.id} client_id=${r.client_id} braze_campaign_id=${r.braze_campaign_id}`);
    }
    if (toProcess.length > 20) console.log(`  ... and ${toProcess.length - 20} more`);
    process.exit(0);
  }

  const platformByClient = await buildBrazePlatformIdByClient(supabase);

  let ok = 0;
  let fail = 0;
  let populated = 0;

  for (const row of toProcess) {
    const platformId = platformByClient.get(row.client_id);
    if (!platformId) {
      console.log(
        `[fail] braze_campaign_id=${row.braze_campaign_id} id=${row.id} — no connected Braze client_platforms row for client_id=${row.client_id}`,
      );
      fail++;
      continue;
    }

    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/braze-campaign-creative`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userJwtForEdge}`,
        apikey: anonJwtForEdge,
      },
      body: JSON.stringify({
        clientId: row.client_id,
        platformId,
        brazeCampaignId: row.braze_campaign_id,
        persist: true,
      }),
    });

    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      /* ignore */
    }

    const invokeHttpOk = res.ok;
    if (invokeHttpOk) ok++;
    else fail++;

    const delayMs = 1000 + Math.floor(Math.random() * 1000);
    await sleep(delayMs);

    const { data: after, error: selErr } = await supabase
      .from('braze_campaigns')
      .select('raw_details')
      .eq('id', row.id)
      .maybeSingle();

    let filled = false;
    if (!selErr) {
      filled = rawDetailsPopulated(after?.raw_details);
      if (filled) populated++;
    }

    const errSnippet = !invokeHttpOk
      ? String(body.error ?? text).slice(0, 160)
      : body.error
        ? String(body.error).slice(0, 160)
        : '';

    const outcome =
      !invokeHttpOk ? 'invoke_fail' : filled ? 'success' : selErr ? 'recheck_error' : 'invoke_ok_empty_raw';

    console.log(
      `[${outcome}] id=${row.id} braze_campaign_id=${row.braze_campaign_id} http=${res.status} raw_details_populated=${filled}${errSnippet ? ` err=${JSON.stringify(errSnippet)}` : ''}`,
    );
  }

  console.log('\nSummary:', {
    candidates: rows.length,
    processed: toProcess.length,
    invoke_http_ok: ok,
    invoke_http_fail: fail,
    rows_with_populated_raw_details_after_wait: populated,
  });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
