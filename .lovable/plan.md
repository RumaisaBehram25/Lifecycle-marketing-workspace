
# Plan: Fix Lifecycle Flow Extraction from Braze

## Status: ✅ IMPLEMENTED

## Problem Summary

The Lifecycle tab showed no journeys because the Braze sync had critical failures:

1. **Active canvases missing entirely**: The 27 active flows were NOT in the database - the sync was fetching the wrong 200 canvases
2. **Memory exhaustion**: The sync hit "Memory limit exceeded" when processing 200 canvas details simultaneously
3. **Enabled detection failing**: Only 1 of 200 synced canvases was marked `enabled: true` due to unreliable `/canvas/list` data

## Solution Implemented

### Phase 1: Priority-Based Canvas Discovery ✅
- Fetch ALL canvas IDs from the list endpoint (paginate through all pages)
- Score canvases by name patterns to prioritize lifecycle journeys
- Priority 1 (score 100+): Names containing "Lifecycle", "Welcome", "Retention", "Abandoned", "Reactivation", "Pre-Churn"
- Priority 2 (score 50-90): 2025/2026 date patterns
- Priority 3 (score 0-10): Test, complete, or old (pre-2024) patterns

### Phase 2: Memory-Optimized Processing ✅
- Reduced batch size from 5 to 3 parallel requests
- Added AbortController with 25s timeout per request
- Checkpoint after each batch - save partial results immediately
- Limit total canvases processed to 100 with strict prioritization
- Skip storing full canvas data in schema_cache (use normalized table only)

### Phase 3: Activity-Based Filtering Using Analytics ✅
- Added database columns: `entries_last_30d`, `entries_last_60d`, `sends_last_30d`, `last_activity_at`
- Fetch `/canvas/data_series` for enabled canvases to get real activity metrics

### Phase 4: Updated Frontend Logic ✅
- Removed strict `last_entry` requirement from filter
- Show all enabled canvases, sorted by `entries_last_60d` DESC
- Added activity badges:
  - Green "Active (X entries)" for canvases with 30-day activity
  - Amber "Recent activity" for 60-day activity
  - Gray "Enabled" for enabled but dormant canvases

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/sync-braze/index.ts` | Complete rewrite with priority scoring, batch checkpointing, analytics fetching |
| `src/pages/Lifecycle.tsx` | Removed strict filtering, added activity badges, sorted by entries |
| Database migration | Added `entries_last_30d`, `entries_last_60d`, `sends_last_30d`, `last_activity_at` columns and index |

## Next Steps

1. **Trigger a new sync** on the Lifecycle page to fetch the prioritized canvas data
2. **Verify** all 27 active lifecycle flows now appear
3. **Test** the activity badges display correctly

