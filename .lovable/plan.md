
# Plan: Fix Lifecycle Flow Extraction from Braze

## Problem Summary

The Lifecycle tab shows no journeys because the Braze sync has two critical failures:

1. **Active canvases missing entirely**: The 27 active flows you listed are NOT in the database - the sync is fetching the wrong 200 canvases
2. **Memory exhaustion**: The sync hits "Memory limit exceeded" when processing 200 canvas details simultaneously
3. **Enabled detection failing**: Only 1 of 200 synced canvases is marked `enabled: true` due to unreliable `/canvas/list` data

## Root Cause

The Braze `/canvas/list` API returns canvases in default order (likely by created date), so the oldest canvases come first. The active lifecycle flows from 2025-2026 are buried beyond the first 200 results. Additionally, the `enabled` field isn't reliably returned from the list endpoint - it only comes from `/canvas/details`.

## Solution: Smarter Canvas Discovery

### Phase 1: Fetch All Canvas IDs First, Then Prioritize

Instead of fetching details for the first 200 canvases by creation order, we will:

1. Fetch ALL canvas IDs from the list endpoint (paginate through all pages)
2. Fetch `/canvas/details` only for canvases that match known lifecycle naming patterns OR have recent dates in name
3. Use the `enabled` field from details response (which is reliable) to determine active status
4. Add analytics-based activity detection using `/canvas/data_summary`

### Phase 2: Memory-Optimized Processing

1. Reduce batch size from 5 to 3 parallel requests
2. Skip HTML content storage entirely (store template IDs only, fetch on-demand)
3. Checkpoint after each batch - save partial results immediately
4. Limit total canvases processed to 100 with strict prioritization

### Phase 3: Activity-Based Filtering Using Analytics

Use Braze `/canvas/data_summary` endpoint to get real 30/60-day activity:

```
GET /canvas/data_summary?canvas_id={id}&length=60

Returns: total_stats.entries, step_stats.*.sent
```

Store in new database columns:
- `entries_last_30d`
- `entries_last_60d`  
- `sends_last_30d`
- `last_activity_at`

### Phase 4: Updated Frontend Logic

Show all enabled canvases from the database, with activity badges:
- Sort by entries_last_60d DESC (most active first)
- Show "Active" badge for canvases with recent activity
- Show "No recent activity" for enabled but dormant canvases

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/sync-braze/index.ts` | Rewrite canvas sync logic with name-pattern prioritization, analytics calls, memory optimization |
| `src/pages/Lifecycle.tsx` | Remove strict last_entry requirement, show all enabled canvases, add activity badges |
| Database migration | Add activity tracking columns to `braze_canvases` |

---

## Technical Implementation

### Canvas Prioritization Logic

```
Priority 1 (Always fetch details):
  - Name contains "Lifecycle" 
  - Name matches "YYYYMMDD | Marketing | Lifecycle | ..."
  - Name contains "Welcome", "Retention", "Abandoned", "Reactivation", "Pre-Churn"
  
Priority 2 (Fetch if room):
  - Name starts with 2025 or 2026 date pattern
  - Listed as enabled in list response
  
Priority 3 (Skip):
  - Name contains "TESTING", "COMPLETE", "[DO NOT EDIT]"
  - Name starts with pre-2024 dates
```

### Memory Optimization

```
1. Fetch canvas list (all pages) -> collect IDs + names only
2. Apply priority scoring to get top 100 candidates
3. For each batch of 3:
   a. Fetch /canvas/details
   b. Fetch /canvas/data_summary (if enabled)
   c. Upsert to braze_canvases immediately
   d. Release batch from memory
4. Skip HTML storage - store template_id only
```

### Database Schema Updates

```sql
ALTER TABLE public.braze_canvases
ADD COLUMN IF NOT EXISTS entries_last_30d INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS entries_last_60d INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS sends_last_30d INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

CREATE INDEX idx_braze_canvases_activity 
ON public.braze_canvases (client_id, enabled, entries_last_60d DESC NULLS LAST);
```

### Frontend Changes

```typescript
// Remove strict last_entry filter
const filteredJourneys = journeys.filter(journey => {
  // Must be enabled in Braze
  if (journey.enabled !== true) return false;
  
  // Don't require last_entry - show all enabled canvases
  // Use activity columns for sorting/badges instead
  return true;
});

// Sort by activity
filteredJourneys.sort((a, b) => 
  (b.entries_last_60d ?? 0) - (a.entries_last_60d ?? 0)
);

// Activity badge component
const ActivityBadge = ({ journey }) => {
  if (journey.entries_last_30d > 0) {
    return <Badge variant="success">Active ({journey.entries_last_30d} entries)</Badge>;
  }
  return <Badge variant="outline">Enabled</Badge>;
};
```

---

## Expected Outcome

After implementation:
- All 27 active lifecycle flows appear on the Lifecycle tab
- Journeys sorted by recent activity (entries in last 60 days)
- Sync completes reliably without memory errors
- Flow visualization shows full creative content for each path

## Next Step

I will begin implementing Phase 1 (canvas prioritization logic and database migration) once you approve this plan.
