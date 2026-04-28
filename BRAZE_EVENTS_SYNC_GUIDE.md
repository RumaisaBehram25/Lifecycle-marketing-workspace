# Braze Custom Events Sync - Implementation Guide

## Overview
This implementation adds automatic syncing of Braze custom events from the `/events/list` endpoint to your workspace database. Custom events are now stored, validated, and available for use in campaign/canvas logic.

## What Was Added

### 1. Database Migration
**File:** `supabase/migrations/20260427120000_braze_custom_events_sync.sql`

New table: `braze_custom_events`
- Stores: Event ID, name, description, type, category, platform, and properties
- Synced automatically when you run "Sync All from Braze" on the Dashboard
- Indexed by: `client_id`, `event_name`, `synced_at` for fast lookups

### 2. Edge Function Enhancement
**File:** `supabase/functions/sync-braze/index.ts`

Added event syncing logic that:
- Fetches from `/events/list` endpoint (up to 2000 events by default, configurable via `BRAZE_SYNC_MAX_EVENTS_PAGES`)
- Runs early in the sync process (before canvas/campaign phases)
- Stores event metadata in `braze_custom_events` table
- Handles pagination, rate limiting, and error recovery

### 3. React Utilities
**File:** `src/hooks/useBrazeCustomEvents.ts`
- `useBrazeCustomEvents()` - React Query hook to fetch synced events
- `parseEventProperties()` - Parse event properties from JSON
- `fetchBrazeEventByName()` - Get a single event by name
- `hasBrazeCustomEventsSynced()` - Check if events have been synced

**File:** `src/lib/brazeEventsSync.ts`
- `checkBrazeEventsSyncStatus()` - Check sync status and get guidance
- `getBrazeEventNames()` - Get list of all available event names
- `triggerBrazeEventSync()` - Manually trigger a sync
- `validateCustomEventExists()` - Validate an event before using it

## How to Use

### Step 1: Deploy the Migration
```bash
supabase migration up
# or through the Supabase Dashboard → Migrations tab
```

### Step 2: Sync Custom Events
Run "Sync All from Braze" on the Dashboard (or via API):
```typescript
import { triggerBrazeEventSync } from '@/lib/brazeEventsSync';

const result = await triggerBrazeEventSync(clientId, platformId);
console.log(result.message);
// Output: "Successfully synced 47 custom event(s) from Braze"
```

### Step 3: Check Sync Status
```typescript
import { checkBrazeEventsSyncStatus } from '@/lib/brazeEventsSync';

const status = await checkBrazeEventsSyncStatus(clientId);
if (!status.hasSynced) {
  console.log(status.message);
  // "Custom events have not been synced yet. Run 'Sync All from Braze'..."
} else {
  console.log(`${status.eventCount} events available`);
}
```

### Step 4: Fetch Events in Components
```typescript
import { useBrazeCustomEvents, parseEventProperties } from '@/hooks/useBrazeCustomEvents';

export function MyComponent({ clientId }: { clientId: string }) {
  const { data: events, isLoading } = useBrazeCustomEvents({ clientId });

  if (isLoading) return <div>Loading events...</div>;

  return (
    <div>
      {events.map((event) => (
        <div key={event.id}>
          <h3>{event.event_name}</h3>
          <p>{event.event_description}</p>
          <p>Properties: {event.properties_count ?? 0}</p>
          {event.properties && (
            <details>
              <summary>Show Properties</summary>
              <pre>{JSON.stringify(parseEventProperties(event.properties), null, 2)}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Step 5: Validate Events Before Using Them
```typescript
import { validateCustomEventExists } from '@/lib/brazeEventsSync';

async function createCampaignWithTrigger(clientId: string, eventName: string) {
  const { exists, eventId } = await validateCustomEventExists(clientId, eventName);
  
  if (!exists) {
    throw new Error(`Custom event "${eventName}" not found. Run sync first.`);
  }
  
  // Safe to use event in campaign logic
  console.log(`Using event ${eventId}: ${eventName}`);
}
```

## Configuration

Environment variables (optional):
```bash
# Max pages to fetch from /events/list (default: 20)
BRAZE_SYNC_MAX_EVENTS_PAGES=50
```

## Troubleshooting

### Events Not Showing Up
1. Check: Has "Sync All from Braze" been run?
   ```typescript
   const status = await checkBrazeEventsSyncStatus(clientId);
   console.log(status.message);
   ```

2. Verify Braze connection is active (check `client_platforms` table)

3. Check sync logs in Supabase Edge Function logs

### Events Are Stale
Events are considered stale if older than 7 days. Run sync again:
```typescript
await triggerBrazeEventSync(clientId, platformId);
```

### Permission Issues
Ensure RLS policies allow authenticated users:
```sql
SELECT * FROM braze_custom_events WHERE client_id = $1;
```
Uses workspace isolation via `client_user_workspaces` table.

## How It Works

1. **During Sync**: When you trigger "Sync All from Braze", the edge function:
   - Calls Braze `/events/list` endpoint (paginated, max 2000 events)
   - Extracts event metadata (name, description, properties, etc.)
   - Stores in `braze_custom_events` table with deduplication (on conflict: update)
   - Logs count of synced events

2. **In Components**: 
   - Use `useBrazeCustomEvents()` to fetch available events
   - Events are cached for 30 minutes via React Query
   - Properties stored as JSON, parsed on demand

3. **Validation**:
   - Before using an event in campaign logic, call `validateCustomEventExists()`
   - Ensures event exists in workspace before referencing it

## Performance Notes

- Events synced early in process (before heavy canvas/campaign phases)
- Pagination: 100 events per page, up to 2000 total (default, configurable)
- Indexes optimized for: client lookup, name search, recent syncs
- Database queries cached for 30 minutes (React Query)

## Next Steps

1. **Dashboard Integration**: Show sync status in Braze connection card
2. **Campaign Editor**: Add event picker/autocomplete when creating canvas triggers
3. **Validation**: Show warning if campaign references event that doesn't exist
4. **Analytics**: Track which custom events are used most in campaigns

---

**Status**: ✅ Ready to use. Run "Sync All from Braze" on Dashboard to populate events.
