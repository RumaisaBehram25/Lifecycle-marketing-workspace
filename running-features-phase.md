# Running Features & Architecture Notes

## Multi-Tenancy

**Status: Single-tenant (hardcoded to DoubleGood/BRCG)**

- `src/hooks/useDoubleGoodClient.tsx` hardcodes `slug = 'doublegood'` — every page uses this hook
- No `org_id` or `tenant_id` on any table
- RLS policies scope by user ID or admin flag, not by organization
- User roles are global (`admin`/`member`), not per-tenant
- All authenticated users can see all data (`USING(true)` policies)
- The `clients` table exists but it's for brand configuration, not tenant isolation

**To make it multi-tenant:**

1. An `organizations` table + `user_organizations` bridge table
2. `org_id` column on all data tables
3. Tenant-scoped RLS policies
4. Auth context that tracks the current org
5. Replace the hardcoded `useDoubleGoodClient` with a dynamic org-aware hook
6. Org switcher UI

---

## Braze Integration

**Status: Backend works for canvases AND campaigns; Campaigns page is live; Lifecycle and Analytics still mocked**

### What works (backend)

1. Enter Braze API key on the **Platforms** page (onboarding links there)
2. Key gets saved to `client_platforms` table
3. Manually click **"Sync Data"** in the Braze data viewer, or **"Sync from Braze"** on the Campaigns page
4. Calls `sync-braze` Supabase Edge Function (~926 lines) which hits the real Braze REST API:
   - **Canvases**: Fetches canvas lists with pagination, detailed configurations, activity metrics, email templates. Stores in `braze_canvases` table.
   - **Campaigns** (new): Fetches campaign lists via `/campaigns/list`, details via `/campaigns/details`, and analytics via `/campaigns/data_series` (last 60 days). Computes opens, clicks, deliveries, open_rate, click_rate, unsubs. Stores in `braze_campaigns` table.
   - Caches summary in `client_platforms.schema_cache` (includes `campaigns_count` and `campaigns_enabled_count`)
   - Audit trail in `braze_sync_runs` (tracks `campaigns_synced` count)

### What was done for Campaigns page (feat/braze-campaign branch)

**Database:**
- Created `braze_campaigns` table (`supabase/migrations/20260310180500_create_braze_campaigns.sql`) with fields: id, client_id, braze_campaign_id, name, channel, subject, preheader, status, sent_date, opens, clicks, deliveries, open_rate, click_rate, unsubs, segment, tags, creative_preview, raw_details (JSONB)
- RLS policies matching `braze_canvases` pattern (approved users can view, admins can manage)
- Indexes on client_id, status, sent_date
- UNIQUE constraint on (client_id, braze_campaign_id) for upserts
- `updated_at` trigger

**Backend (sync-braze edge function):**
- Added Phase 4 after existing canvas sync: fetches campaigns from Braze API with same patterns (pagination, batching 3 at a time, retry with exponential backoff, memory safeguards)
- Calls `/campaigns/list` (paginated), `/campaigns/details` (per campaign), `/campaigns/data_series` (60-day analytics)
- Determines channel from campaign details, status from sent/scheduled/draft logic
- Upserts to `braze_campaigns` table
- Existing canvas sync (Phases 1-3) is unchanged

**Frontend (Campaigns page):**
- Replaced hardcoded `PLACEHOLDER_CAMPAIGNS` with live `useQuery` fetching from `braze_campaigns` table
- Uses `useDoubleGoodClient()` for client context (same pattern as Lifecycle page)
- Maps DB fields to existing UI component shape (all grid/list/calendar views, filters, detail modal work with real data)
- Added **"Sync from Braze" button** in page header — calls sync-braze edge function, shows loading spinner, success/error toasts, auto-refetches data on completion, disabled when no Braze API key configured
- Added **sample data banner** — when no synced campaigns exist, shows `PLACEHOLDER_CAMPAIGNS` as preview with amber banner: "This is sample data. Connect your Braze account on the Platforms page to see real campaign data." with link to /platforms. Banner disappears when real data is synced.
- Page layout and visual design are completely unchanged

### What still doesn't work (frontend)

**Lifecycle and Analytics still ignore the database and render hardcoded mock arrays.** The Lifecycle page has partial wiring (queries `braze_canvases` but falls back to `MOCK_JOURNEYS`). Analytics is 100% mocked.

The Campaigns page mock data is retained in the file as the preview/demo state shown before Braze is connected.

### Known issues

- Sync is manual only — no auto-refresh or webhooks
- API keys stored in **plaintext** (column misleadingly named `api_key_encrypted`)
- REST endpoint defaults to `https://rest.iad-01.braze.com` (US region hardcoded)
- BrazeDataViewer only shows summary counts, not full data

### campaign page updates on this branch:
First-time setup (one-time)
                                                                                                                                                                                    
  1. Push the migration — supabase db push creates the braze_campaigns table in your database
  2. Deploy the edge function — supabase functions deploy sync-braze deploys the updated sync function                                                                                       
                  
  User flow

  1. Connect Braze — On the Platforms page, enter your Braze API key. It gets saved to client_platforms.
  2. Visit Campaigns page — If no data has been synced yet, you'll see the 8 sample campaigns with an amber banner at the top: "This is sample data. Connect your Braze account on the
  Platforms page to see real campaign data."
  3. Click "Sync from Braze" — The button in the page header triggers the sync-braze edge function. A spinner shows while it runs. The function:
    - Fetches all your campaigns from Braze (/campaigns/list with pagination)
    - Gets details for each campaign (channel, status, segments, tags)
    - Gets 60-day analytics (opens, clicks, deliveries, unsubs)
    - Computes open_rate and click_rate
    - Upserts everything into the braze_campaigns table in batches of 3
  4. Data appears — On success, a toast confirms it, the query auto-refetches, the amber banner disappears, and your real Braze campaigns replace the sample data. All existing views (grid,
  list, calendar), filters (search, channel, date range), and the detail modal work with the real data.
  5. Subsequent visits — The page queries braze_campaigns on load, so your synced data shows immediately. Hit "Sync from Braze" again anytime to pull the latest from Braze.

  What hasn't changed

  - The page layout, styling, and all UI components are identical
  - The sync is still manual (no automatic refresh)
  - Canvas sync backend — always worked
  - Lifecycle page — queries the DB but almost always falls back to mock data in practice
  - It was never fully "working" in the sense of reliably showing real data

---

## Page Data Sources

| Page | Data Source | Notes |
|------|-----------|-------|
| Dashboard | Supabase (with fallback) | `PLACEHOLDER_BRIEFS` used when no real briefs exist |
| Briefs | Supabase | Fully live |
| Campaigns | **Supabase (with fallback)** | Queries `braze_campaigns` table; shows sample data with banner when no Braze data synced |
| Lifecycle | **Hardcoded mock data** | `MOCK_JOURNEYS` array, ignores `braze_canvases` table |
| Analytics | **Hardcoded mock data** | All charts/metrics are static arrays |
| Resource Center | Mixed | Brand Voice is live; UserJourneys, Events/Attributes, Design are hardcoded |
| Chat | Supabase | Conversations persisted, uses real platform data |
| Settings | Supabase | Fully live |
| Onboarding | Form only | Collects input, no data fetching |

### Braze Integration Deep Dive

The Braze integration has a fully functional backend pipeline that never delivers data to the pages users actually look at.

**The backend pipeline:** When a user enters their Braze API key on the Platforms page, it gets saved to the `client_platforms` table (in plaintext, despite the column historically being named `api_key_encrypted`). When the user clicks "Sync Data" in the BrazeDataViewer component, it invokes the `sync-braze` Supabase Edge Function. This is a substantial function (~669 lines) that authenticates the request, retrieves the API key from the database, and makes real calls to the Braze REST API. It fetches canvas lists with pagination, detailed canvas configurations, activity metrics (entries and sends over the last 60 days), and email template lists with full template details. It scores canvases by lifecycle priority (welcome, retention, abandoned cart, etc.), processes the top 100 in batches of 3, and extracts steps, variants, trigger events, entry segments, and conversion events. Results are upserted into the `braze_canvases` table with full step/variant details stored as JSONB, a summary is cached in `client_platforms.schema_cache`, and an audit trail entry is created in `braze_sync_runs`.

**The frontend disconnect:** Despite all this real data being fetched and stored, the three pages that should display it don't query the database at all:

- **Campaigns** (`src/pages/Campaigns.tsx`) now queries the `braze_campaigns` table via `useQuery` and `useDoubleGoodClient()`. When real data exists it displays live campaign metrics. When no data has been synced, it shows `PLACEHOLDER_CAMPAIGNS` (8 sample campaigns) as a preview with an amber banner linking to the Platforms page. Includes a "Sync from Braze" button in the header to trigger syncs directly from the page.

- **Lifecycle** (`src/pages/Lifecycle.tsx`) contains a `MOCK_JOURNEYS` array with 4 complete fake lifecycle journey objects, each with deeply nested step/delay/message structures containing fictional copy. It imports the Supabase client but never uses it for display data. All journey names, descriptions, email subjects, and push notification titles are hardcoded strings.

- **Analytics** (`src/pages/Analytics.tsx`) is the most heavily mocked page. It contains `REVENUE_MONTHLY` (9 months of fake revenue), `FLOW_REVENUE_BY_FLOW` (6 fake flows with revenue figures), `FLOW_TOUCHPOINT_DATA` (nested mock touchpoint metrics), `ALL_CAMPAIGNS` (13 fake campaign records), `SUBSCRIBER_GROWTH` (12 months of fake growth by source), `CONVERSION_DEVICE` (fake device conversion rates), `CHANNEL_MIX` (fake channel percentages), and `AI_INSIGHTS` (4 hardcoded insight cards). Every chart, table, and metric on this page is entirely fabricated with no database queries.

The synced Braze data only surfaces in three minor places: the BrazeDataViewer on the Platforms page (which shows summary counts like total canvases and templates after a sync), the Settings page (which lets you toggle visibility of synced items), and the Chat feature (which passes platform context to the AI for more informed responses).

**Additional Braze issues:** The REST endpoint is hardcoded to `https://rest.iad-01.braze.com`, which assumes a US-based Braze instance. It can be overridden via `additional_config.rest_endpoint` in the `client_platforms` table, but there's no UI for this. Sync is entirely manual with no background jobs, webhooks, or scheduled refreshes. There's no retry mechanism if a sync fails — the user gets a toast notification but must manually retry. The BrazeDataViewer component only displays summary counts from `schema_cache`, not the full canvas/template details that are stored in `braze_canvases`.

### Page-by-Page Data Source Details

**Dashboard** fetches real briefs from Supabase using `useQuery` and displays brief counts. It has a `PLACEHOLDER_BRIEFS` fallback array that renders when no real briefs exist yet. Some dashboard metrics like "Campaigns Sent" and "Lifecycle Flows Updated" are hardcoded display values (10, 4) rather than computed from actual data. The EmbeddedChat child component fetches briefs from Supabase to use as AI context.

**Briefs** is fully live. The BriefTab component fetches briefs from Supabase, queries visibility settings, and pulls segment data from the Braze schema cache. All CRUD operations (create, update, delete briefs) go through Supabase mutations. No mock data.

**Chat** is fully live. It fetches the client from `useDoubleGoodClient()` and platforms from `useDoubleGoodPlatforms()`, extracts profile properties from platform schema cache, and builds platform contexts from real synced data. The ClientChat component persists conversations and messages in Supabase. No hardcoded chat data or mock messages.

**Settings** is fully live. It fetches the `data_visibility` table from Supabase, retrieves Braze campaign/canvas/segment data from the platform schema cache, and uses Supabase mutations to toggle visibility. Feedback submissions are also stored in and fetched from Supabase.

**Resource Center** is mixed. The BrandVoiceTab pulls real client data (brand voice, do/don't rules, tone presets) from `useDoubleGoodClient()`. The AudienceTab fetches segments from Supabase and generates descriptions (using rule-based logic, not actual AI). However, the UserJourneysTab uses a `PLACEHOLDER_JOURNEYS` hardcoded array, the EventsAttributesTab uses `PLACEHOLDER_EVENTS` and `PLACEHOLDER_ATTRIBUTES` arrays, and the DesignTab has hardcoded template data.

**Onboarding** is a form-only page. It uses an `INITIAL_DATA` constant with empty form fields as defaults and collects input from the user. There are no Supabase queries and no mock data — it's just an input form.

## Braze csv data upload to analytics page:
What Braze gives you (raw CSVs)
Campaign Analytics — one row per day, per campaign variation, per channel. Fields are all raw counts: sent, delivered, opens, unique_opens, clicks, unique_clicks, unsubscribes, bounces, reported_spam, conversions, and revenue. No rates, no averages, no cross-campaign rollups.
Usage Analytics — one row per day, aggregated across all campaigns. Same raw count fields for email/push/in-app, plus sessions, DAU, MAU, and new_users. Useful for high-level trends but doesn't break down by campaign.
Segment Analytics — one row per day per segment, with a single size field. This is the only way to get "list size" or "active subscriber count" — you have to pre-build segments in Braze (e.g., "all email subscribed users," "opened email in last 90 days") and then export their sizes.
What you have to compute yourself
Rates — open rate (opens / delivered), click rate (clicks / delivered), click-to-open rate (clicks / opens), bounce rate (bounces / sent), unsubscribe rate (unsubscribes / delivered), spam rate (reported_spam / delivered), conversion rate (conversions / delivered).
Aggregation across campaigns — Braze only exports per-campaign or fully-global. If you want "average open rate across all campaigns this month," you need to pull each campaign's data, sum the counts, then divide. Averaging the rates directly would be misleading since campaigns have different send volumes — you'd want a weighted average (total opens across all campaigns / total delivered across all campaigns).
List health metrics — active subscriber count comes from segment size exports. List growth rate, churn rate, and the ratio of active-to-inactive subscribers all need to be derived by comparing segment sizes over time.
Joining the data — campaign analytics don't include segment/list size, and segment exports don't include engagement metrics. You'd need to join them by date to get things like "click rate relative to total list size" or "percentage of list that received a send."
In short: Braze is the raw event counter, and you're the analytics layer.

In braze-examples/: computed is what our output will need to look like to get across campaign data from the raw data from the other three files. 