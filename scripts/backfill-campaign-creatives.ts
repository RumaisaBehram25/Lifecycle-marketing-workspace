/**
 * One-time backfill: for each braze_campaigns row with a remote preview image in raw_details,
 * download the asset, upload to the public campaign-creatives bucket, and set image_url to the full getPublicUrl.
 *
 * Requires service role (bypasses RLS; Storage + UPDATE on braze_campaigns).
 *
 * Usage (from repo root):
 *   Loads `.env` then `.env.local` from the project root (same vars as Vite: VITE_SUPABASE_URL, etc.).
 *   Add once to `.env.local` (keep out of git): SUPABASE_SERVICE_ROLE_KEY=<service_role from Dashboard → API>
 *   Or export SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the shell.
 *
 *   Run with tsx + scripts/tsconfig.json so `@/lib/...` resolves (do not use plain `ts-node` — it will not resolve `@/`).
 *   npm run backfill:campaign-creatives -- --dry-run
 *   npm run backfill:campaign-creatives
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/backfill-campaign-creatives.ts -- --dry-run
 *
 *   (Alias: `npm run migrate:campaign-creatives` → same script via migrate-campaign-creatives.ts)
 *
 * Options:
 *   --dry-run          Log actions only; no download/upload/DB writes
 *   --limit=N          Process at most N rows (after filters)
 *   --client-id=UUID   Only campaigns for this client_id
 *   --propagate        After download pass: copy a Supabase image_url to sibling rows with the same
 *                      (client_id, braze_campaign_id) that are missing it (dedupe / duplicate DB rows).
 *   --propagate-only   Only run the propagate pass (no downloads).
 *
 * Why fewer updates than campaigns in the UI: only rows where extractPreviewImageUrl(raw_details)
 * returns an http(s) image are uploaded. Push/SMS-only campaigns, empty raw_details, or emails
 * with no scorable hero image are skipped. Admins may also see fewer *unique* campaigns than total
 * braze_campaigns rows (duplicates across clients).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { extractPreviewImageUrl } from '@/lib/campaignDisplay';
import { isSupabaseStoragePublicObjectUrl } from '@/lib/campaignCreativeImageUrl';

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

const BUCKET =
  process.env.SUPABASE_CAMPAIGN_CREATIVES_BUCKET?.trim() ||
  process.env.VITE_SUPABASE_CAMPAIGN_CREATIVES_BUCKET?.trim() ||
  'campaign-creatives';

const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const propagate = process.argv.includes('--propagate');
  const propagateOnly = process.argv.includes('--propagate-only');
  let limit: number | undefined;
  let clientId: string | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--limit=')) limit = Math.max(0, parseInt(a.slice('--limit='.length), 10) || 0);
    if (a.startsWith('--client-id=')) clientId = a.slice('--client-id='.length).trim() || undefined;
  }
  return { dryRun, limit, clientId, propagate: propagate || propagateOnly, propagateOnly };
}

type SkipStats = {
  already_storage_column: number;
  no_raw_details: number;
  no_preview_url: number;
  non_http: number;
};

async function propagateImageUrlToSiblings(
  supabase: SupabaseClient,
  opts: { dryRun: boolean; clientId?: string },
): Promise<{ keys: number; rowsUpdated: number }> {
  const pageSize = 500;
  const canonical = new Map<string, string>();

  let from = 0;
  for (;;) {
    let q = supabase
      .from('braze_campaigns')
      .select('client_id, braze_campaign_id, image_url')
      .not('image_url', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (opts.clientId) q = q.eq('client_id', opts.clientId);
    const { data: page, error } = await q;
    if (error) throw error;
    if (!page?.length) break;
    for (const row of page) {
      const u = typeof row.image_url === 'string' ? row.image_url.trim() : '';
      if (!u || !isSupabaseStoragePublicObjectUrl(u)) continue;
      const bid = row.braze_campaign_id != null ? String(row.braze_campaign_id) : '';
      const cid = row.client_id != null ? String(row.client_id) : '';
      if (!bid || !cid) continue;
      const key = `${cid}::${bid}`;
      if (!canonical.has(key)) canonical.set(key, u);
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }

  let rowsUpdated = 0;
  from = 0;
  for (;;) {
    let q = supabase
      .from('braze_campaigns')
      .select('id, client_id, braze_campaign_id, image_url')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (opts.clientId) q = q.eq('client_id', opts.clientId);
    const { data: page, error } = await q;
    if (error) throw error;
    if (!page?.length) break;

    for (const row of page) {
      const bid = row.braze_campaign_id != null ? String(row.braze_campaign_id) : '';
      const cid = row.client_id != null ? String(row.client_id) : '';
      if (!bid || !cid) continue;
      const key = `${cid}::${bid}`;
      const target = canonical.get(key);
      if (!target) continue;
      const current = typeof row.image_url === 'string' ? row.image_url.trim() : '';
      if (current === target) continue;
      if (opts.dryRun) {
        rowsUpdated++;
        continue;
      }
      const { error: upErr } = await supabase.from('braze_campaigns').update({ image_url: target }).eq('id', row.id);
      if (!upErr) rowsUpdated++;
    }

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return { keys: canonical.size, rowsUpdated };
}

function extFromContentType(ct: string | null): string {
  const c = (ct || '').split(';')[0].trim().toLowerCase();
  if (c === 'image/jpeg' || c === 'image/jpg') return 'jpg';
  if (c === 'image/png') return 'png';
  if (c === 'image/webp') return 'webp';
  if (c === 'image/gif') return 'gif';
  if (c === 'image/svg+xml') return 'svg';
  return 'bin';
}

function extFromUrl(url: string): string | null {
  try {
    const p = new URL(url).pathname.toLowerCase();
    const m = p.match(/\.(jpg|jpeg|png|webp|gif|svg)(?:$|[?#])/);
    if (!m) return null;
    return m[1] === 'jpeg' ? 'jpg' : m[1];
  } catch {
    return null;
  }
}

async function main() {
  const { dryRun, limit, clientId, propagate, propagateOnly } = parseArgs();

  if (!supabaseUrl || !serviceKey) {
    console.error(
      'Missing SUPABASE_URL (or VITE_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY.',
    );
    if (supabaseUrl && !serviceKey) {
      console.error(
        'You already have a project URL in `.env`, but the backfill script needs the **service_role** JWT (not VITE_SUPABASE_ANON_KEY).',
      );
      console.error(
        'In Supabase: Settings → API → **service_role** (secret). Add one line to `.env`:\n  SUPABASE_SERVICE_ROLE_KEY=eyJ...',
      );
      console.error(
        'Do not use a VITE_* name for that key (it would expose the secret to the browser).',
      );
    } else {
      console.error(
        'Tip: ensure `.env` is in the repo root (same folder as package.json) and contains VITE_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Bucket: ${BUCKET}`);
  console.log(`Dry run: ${dryRun}`);
  if (clientId) console.log(`Client filter: ${clientId}`);
  if (limit != null) console.log(`Limit: ${limit}`);
  if (propagate) console.log(`Propagate: ${propagateOnly ? 'only' : 'after download pass'}`);

  if (propagateOnly) {
    const { keys, rowsUpdated } = await propagateImageUrlToSiblings(supabase, { dryRun, clientId });
    console.log(
      `\nPropagate-only: ${keys} (client_id, braze_campaign_id) group(s) with a storage image_url; ${dryRun ? 'would touch' : 'updated'} ${rowsUpdated} row(s).`,
    );
    process.exit(0);
  }

  if (limit === 0) {
    console.log('limit=0 — nothing to do.');
    process.exit(0);
  }

  let processed = 0;
  let skipped = 0;
  let updated = 0;
  let failed = 0;
  const skip: SkipStats = {
    already_storage_column: 0,
    no_raw_details: 0,
    no_preview_url: 0,
    non_http: 0,
  };
  const pageSize = 200;
  let from = 0;

  for (;;) {
    let q = supabase
      .from('braze_campaigns')
      .select('id, client_id, braze_campaign_id, raw_details, image_url')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (clientId) q = q.eq('client_id', clientId);

    const { data: rows, error } = await q;
    if (error) {
      console.error('Query failed:', error.message);
      process.exit(1);
    }
    if (!rows?.length) break;

    for (const row of rows) {
      if (limit != null && limit > 0 && processed >= limit) {
        from = 1e9;
        break;
      }

      const imageUrlCol = typeof row.image_url === 'string' ? row.image_url.trim() : '';
      if (imageUrlCol && isSupabaseStoragePublicObjectUrl(imageUrlCol)) {
        skipped++;
        skip.already_storage_column++;
        continue;
      }

      const raw = row.raw_details;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        skipped++;
        skip.no_raw_details++;
        continue;
      }

      const sourceUrl = extractPreviewImageUrl(raw as Record<string, unknown>);
      const src = typeof sourceUrl === 'string' ? sourceUrl.trim() : '';
      if (!src || src.startsWith('data:')) {
        skipped++;
        skip.no_preview_url++;
        continue;
      }
      if (isSupabaseStoragePublicObjectUrl(src)) {
        if (!dryRun) {
          const { error: upErr } = await supabase
            .from('braze_campaigns')
            .update({ image_url: src })
            .eq('id', row.id);
          if (upErr) {
            console.warn(`[${row.id}] set image_url (already storage) failed:`, upErr.message);
            failed++;
          } else {
            updated++;
          }
        } else {
          console.log(`[dry-run] would set image_url from existing storage URL: ${row.braze_campaign_id}`);
        }
        processed++;
        continue;
      }

      if (!/^https?:\/\//i.test(src)) {
        skipped++;
        skip.non_http++;
        continue;
      }

      processed++;

      if (dryRun) {
        console.log(`[dry-run] ${row.braze_campaign_id}: ${src.slice(0, 120)}…`);
        continue;
      }

      try {
        const res = await fetch(src, {
          redirect: 'follow',
          headers: {
            'User-Agent': 'CampaignCreativeBackfill/1.0 (internal; +https://supabase.com)',
            Accept: 'image/*,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
          console.warn(`[${row.id}] fetch ${res.status} ${src.slice(0, 80)}`);
          failed++;
          continue;
        }

        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length < 256) {
          console.warn(`[${row.id}] too small (${buf.length} bytes), skip`);
          failed++;
          continue;
        }
        if (buf.length > 15 * 1024 * 1024) {
          console.warn(`[${row.id}] too large (${buf.length} bytes), skip`);
          failed++;
          continue;
        }

        const ext = extFromUrl(src) || extFromContentType(res.headers.get('content-type'));
        const safeId = String(row.braze_campaign_id || row.id).replace(/[^a-zA-Z0-9._-]+/g, '_');
        const objectPath = `${row.client_id}/${safeId}.${ext}`;

        const ct = res.headers.get('content-type')?.split(';')[0]?.trim() || `image/${ext === 'jpg' ? 'jpeg' : ext}`;

        const { error: upStorage } = await supabase.storage.from(BUCKET).upload(objectPath, buf, {
          upsert: true,
          contentType: ct,
        });
        if (upStorage) {
          console.warn(`[${row.id}] storage upload failed:`, upStorage.message);
          failed++;
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKET).getPublicUrl(objectPath, {
          transform: { width: 600, quality: 80, format: 'origin' as const },
        });

        const { error: upDb } = await supabase.from('braze_campaigns').update({ image_url: publicUrl }).eq('id', row.id);
        if (upDb) {
          console.warn(`[${row.id}] DB update failed:`, upDb.message);
          failed++;
          continue;
        }

        updated++;
        console.log(`OK ${row.braze_campaign_id} → ${publicUrl}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[${row.id}] error:`, msg);
        failed++;
      }

      await new Promise(r => setTimeout(r, 150));
    }

    if (limit != null && limit > 0 && processed >= limit) break;
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  console.log('\nDone (download pass).');
  console.log({ processed, skipped, updated, failed, dryRun });
  console.log('Skip reasons:', skip);

  if (propagate) {
    const { keys, rowsUpdated } = await propagateImageUrlToSiblings(supabase, { dryRun, clientId });
    console.log(
      `\nPropagate: ${keys} group(s) with storage image_url; ${dryRun ? 'would align' : 'aligned'} ${rowsUpdated} sibling row(s).`,
    );
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
