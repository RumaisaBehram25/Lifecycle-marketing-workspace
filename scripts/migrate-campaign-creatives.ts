/**
 * Alias entrypoint for `scripts/backfill-campaign-creatives.ts`.
 *
 * Run (same env as backfill — `.env` + SUPABASE_SERVICE_ROLE_KEY):
 *   npm run migrate:campaign-creatives -- --dry-run
 *   npm run migrate:campaign-creatives
 *
 * Or: npx tsx --tsconfig scripts/tsconfig.json scripts/migrate-campaign-creatives.ts --dry-run
 *
 * "Live" upload + DB update = omit `--dry-run` (there is no separate `--live` flag).
 */
import './backfill-campaign-creatives.ts';
