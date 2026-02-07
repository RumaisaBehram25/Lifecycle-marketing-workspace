
# Plan: Robust Lifecycle Flow Extraction from Braze

## Problem Summary
The Braze sync is failing intermittently due to:
1. **Timeout/memory issues**: The Edge Function is timing out during bundle generation or hitting memory limits when processing 200+ canvases
2. **Activity data missing**: `last_entry` and `first_entry` fields from `/canvas/list` and `/canvas/details` are unreliable for determining recent activity
3. **Filtering logic gaps**: The UI filters on `enabled === true` AND `last_entry` within 30/60 days, but many active canvases lack these fields

## Root Cause Analysis
Looking at the logs, the sync function:
- Successfully fetches 200 canvases and shows "enabled: 1" (only 1 marked enabled in list response)
- The Braze `/canvas/list` endpoint does NOT reliably return `enabled`, `first_entry`, or `last_entry`
- The `/canvas/details` endpoint returns these fields, but the sync only calls details for the first ~200 canvases
- The Braze `enabled` field in the details response IS reliable, but entry timestamps may still be missing

## Solution Architecture

### Phase 1: Fix Sync Reliability
**Goal**: Make the Edge Function deploy and run consistently without timeouts

Changes to `supabase/functions/sync-braze/index.ts`:
- Reduce parallel batch size from 5 to 3 for canvas details
- Add explicit timeout handling with AbortController
- Use streaming upserts instead of collecting all results in memory
- Limit canvas details fetch to 100 most recently updated (not 200)
- Add checkpointing: save partial results to `braze_canvases` after each batch so progress isn't lost on timeout

### Phase 2: Add Analytics-Based Activity Detection
**Goal**: Use Braze `/canvas/data_summary` to get real 30/60-day activity metrics

New logic in sync function:
```text
For each enabled canvas (up to 100):
  1. Fetch /canvas/details (structure, steps, messages)
  2. Fetch /canvas/data_summary?length=60 (entries, conversions, sends)
  3. Store activity_summary in braze_canvases table
```

New columns for `braze_canvases` table:
- `entries_last_30d` (integer)
- `entries_last_60d` (integer)
- `sends_last_30d` (integer) - sum across all steps
- `last_activity_at` (timestamp) - computed from analytics response

### Phase 3: Update Frontend Filtering Logic
**Goal**: Show all enabled canvases, sorted by recent activity

Changes to `src/pages/Lifecycle.tsx`:
- Remove requirement for `last_entry` timestamp
- Show all canvases where `enabled === true`
- Add activity badge: "Active (X entries last 30d)" or "No recent activity"
- Sort by `entries_last_60d` DESC, then `last_entry` DESC
- Allow 30/60d filter to highlight rather than hide canvases without analytics

### Phase 4: Add Sync Health Dashboard
**Goal**: Surface sync status and allow manual fixes

New component `src/components/platforms/BrazeSyncHealth.tsx`:
- Show last sync time, duration, counts from `braze_sync_runs` table
- Show success/failure status with error message if failed
- "Retry Sync" button
- List of canvases with warnings (missing analytics, no steps, etc.)

---

## Technical Details

### Database Migration
Add new columns to `braze_canvases`:
```sql
ALTER TABLE public.braze_canvases
ADD COLUMN IF NOT EXISTS entries_last_30d INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS entries_last_60d INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS sends_last_30d INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
```

### Edge Function Changes

**Batch processing with checkpointing:**
```text
1. Fetch all canvas IDs (paginated, up to 2000)
2. Filter to non-draft, non-archived
3. Group into batches of 10
4. For each batch:
   a. Fetch details for each canvas (parallel, max 3)
   b. Fetch analytics summary for each (parallel, max 3)
   c. Upsert batch to braze_canvases immediately
   d. Update sync_run progress
5. On completion/error, finalize sync_run record
```

**Analytics endpoint call:**
```text
GET /canvas/data_summary?canvas_id={id}&length=60&ending_at={now}

Response contains:
- total_stats.entries (60-day total)
- step_stats.{step_id}.messages.{channel}.sent (sends per step)
```

**Activity computation:**
```text
entries_last_60d = response.total_stats.entries
entries_last_30d = (fetch again with length=30) OR estimate as 60d / 2
sends_last_30d = sum of all step.messages.*.sent across all steps
last_activity_at = if entries > 0 then now() else null
```

### Frontend Query Changes

Update `useQuery` in Lifecycle.tsx:
```text
From:
  .eq('enabled', true)
  .order('last_entry', { ascending: false })

To:
  .eq('enabled', true)
  .eq('archived', false)
  .order('entries_last_60d', { ascending: false, nullsFirst: false })
  .order('synced_at', { ascending: false })
```

Update filtering memo:
```text
// Remove strict last_entry requirement
// Instead, show all enabled canvases
// Add visual indicator for inactive ones

const isActive = journey.entries_last_30d > 0 || 
                 journey.sends_last_30d > 0 ||
                 isRecentDate(journey.last_entry, 60);
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/sync-braze/index.ts` | Modify | Add analytics calls, batch checkpointing, reduce memory |
| `src/pages/Lifecycle.tsx` | Modify | Update filtering to use analytics columns, show all enabled |
| New migration SQL | Create | Add analytics columns to braze_canvases |
| `src/components/platforms/BrazeSyncHealth.tsx` | Create | Sync health dashboard component |
| `src/components/platforms/BrazeDataViewer.tsx` | Modify | Integrate sync health panel |

---

## Risk Mitigation

1. **API Rate Limits**: Braze allows 250k requests/hour; we'll stay well under with batched calls
2. **Analytics Permission**: User confirmed they can grant `canvas.data_series` / `canvas.data_summary` permissions
3. **Timeout Prevention**: Checkpoint after each batch means partial syncs are still useful
4. **Backward Compatibility**: Old `last_entry` logic remains as fallback if analytics columns are null

---

## Expected Outcome
- All ~36 active lifecycle canvases appear on the Lifecycle tab
- Canvases sorted by recent activity (entries/sends in last 60 days)
- Sync completes reliably without timeouts
- Users can see sync health status and retry failed syncs
- Manual overrides for trigger/audience persist across syncs (existing feature)
