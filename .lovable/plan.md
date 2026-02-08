
# Plan: Rebrand to DoubleGood with Customer.io Integration

## Overview

This plan transforms the CRM Copilot from Linktree/Braze to DoubleGood/Customer.io. DoubleGood is a fundraising platform that sells popcorn through Pop-Up Stores, keeping 50% for the fundraising group. Their brand is warm, encouraging, and focused on community success.

---

## DoubleGood Brand Profile

Based on website research:

| Attribute | Value |
|-----------|-------|
| **Name** | Double Good |
| **Website** | https://www.doublegood.com |
| **Industry** | Fundraising / Food & Beverage / EdTech |
| **Primary Color** | #FFB800 (golden yellow) |
| **Secondary Color** | #1A1A1A (black) |
| **Tagline** | "Fundraising has never been easier" |
| **Brand Voice** | Warm, encouraging, community-focused. Celebrates team success and makes fundraising feel simple and fun. |

**Target Audience:**
- Youth sports teams (softball, baseball, soccer)
- Schools and PTAs
- Nonprofit organizations
- Community groups and clubs

---

## Phase 1: Branding Overhaul

### Files to Modify

| File | Changes |
|------|---------|
| `index.html` | Update title, meta tags, description from "Linktree" to "DoubleGood" |
| `src/hooks/useLinktreeClient.tsx` → `src/hooks/useDoubleGoodClient.tsx` | Rename file and all exports; update brand defaults |
| `src/components/LinktreeLogo.tsx` → `src/components/DoubleGoodLogo.tsx` | Replace with DoubleGood logo SVG |
| `src/components/layout/AppSidebar.tsx` | Update logo path, company name, subtitle |
| `src/components/layout/AppLayout.tsx` | Update logo references |
| `src/pages/Dashboard.tsx` | Update logo, company name, welcome text |
| `src/pages/Chat.tsx` | Update "Linktree Copilot" to "DoubleGood Copilot" |
| `public/logos/` | Add DoubleGood logo assets |

### Search and Replace Pattern

All 30+ files with "Linktree" or "linktree" references will be updated:
- `useLinktreeClient` → `useDoubleGoodClient`
- `useLinktreePlatforms` → `useDoubleGoodPlatforms`
- `LINKTREE_SLUG` → `DOUBLEGOOD_SLUG`
- Text labels: "Linktree" → "Double Good"

---

## Phase 2: Customer.io Integration

### New Edge Function: `sync-customerio`

Customer.io uses the **App API** for retrieving campaigns, broadcasts, and workflows:
- Base URL: `https://api.customer.io/v1/`
- Authentication: Basic Auth with Site ID and API Key

```text
API Endpoints to Call:
┌─────────────────────────────────────────────────────────────┐
│ GET /campaigns         → List all campaigns (workflows)    │
│ GET /campaigns/{id}    → Campaign details + metrics        │
│ GET /broadcasts        → List all broadcasts (one-time)    │
│ GET /broadcasts/{id}   → Broadcast details                 │
│ GET /segments          → List segments (audience)          │
│ GET /messages          → List messages/templates           │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema Updates

Create Customer.io specific tables mirroring the Braze structure:

```sql
-- Campaigns (automated workflows)
CREATE TABLE public.customerio_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  cio_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT, -- 'triggered', 'segment', 'date'
  state TEXT, -- 'draft', 'active', 'paused', 'stopped'
  created_at_cio TIMESTAMPTZ,
  updated_at_cio TIMESTAMPTZ,
  actions JSONB DEFAULT '[]', -- workflow steps/messages
  metrics JSONB DEFAULT '{}', -- sent, opened, clicked, etc.
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, cio_campaign_id)
);

-- Broadcasts (one-time sends)
CREATE TABLE public.customerio_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  cio_broadcast_id TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT, -- 'draft', 'scheduled', 'sent', 'cancelled'
  send_to TEXT, -- segment ID or filter
  sent_at TIMESTAMPTZ,
  metrics JSONB DEFAULT '{}',
  actions JSONB DEFAULT '[]',
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, cio_broadcast_id)
);

-- Messages/Templates
CREATE TABLE public.customerio_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  cio_message_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT, -- 'email', 'push', 'sms', 'in_app', 'webhook'
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, cio_message_id)
);
```

### Edge Function Implementation

```text
supabase/functions/sync-customerio/index.ts

Flow:
1. Authenticate with Site ID + API Key (Basic Auth)
2. Fetch /campaigns with pagination
3. For each campaign, fetch /campaigns/{id} for full details
4. Fetch /broadcasts for one-time sends
5. Extract message content (email HTML, push body, etc.)
6. Upsert to customerio_campaigns, customerio_broadcasts tables
7. Update schema_cache on client_platforms
```

---

## Phase 3: Update UI Components

### Lifecycle Page Adaptation

The Lifecycle page currently expects `braze_canvases`. We need to:

1. Create a platform-agnostic data layer that works with both Braze and Customer.io
2. Map Customer.io campaigns → same UI structure as Braze canvases
3. Display workflow steps/actions as the "flow visualization"

```text
Customer.io Structure → UI Mapping:
┌─────────────────────────────────────────────────────────────┐
│ Customer.io         │ UI Component                         │
├─────────────────────┼───────────────────────────────────────┤
│ Campaign            │ Journey card                         │
│ Campaign actions    │ Flow steps (like canvas steps)       │
│ Broadcast           │ One-time campaign card               │
│ Message content     │ Creative preview                     │
└─────────────────────┴───────────────────────────────────────┘
```

### Campaigns Page Adaptation

Update to read from `customerio_broadcasts` for one-time campaigns, sorted by `sent_at` (most recent first).

### Platform Type Updates

```typescript
// src/lib/types.ts
// customerio is already in PlatformType, just need to prioritize it

export const PLATFORM_INFO: Record<PlatformType, { ... }> = {
  customerio: { name: 'Customer.io', color: 'customerio', icon: '👤' },
  // ... other platforms demoted
};
```

---

## Phase 4: Secrets & Configuration

### Required Secrets

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `CUSTOMERIO_SITE_ID` | `1c44cf43ce7418fa5a41` | Identify the Customer.io workspace |
| `CUSTOMERIO_API_KEY` | `dd7c505e2ec6ad81252d` | Authenticate App API calls |

### Platform Connection

The Settings → Platforms page will need updates to:
1. Show Customer.io as the primary/connected platform
2. Remove or hide Braze-specific configuration
3. Add Customer.io REST endpoint configuration

---

## Phase 5: Cleanup

### Files to Remove or Deprecate

| File | Action |
|------|--------|
| `supabase/functions/sync-braze/` | Keep but disable (may need for other clients) |
| `src/components/LinktreeLogo.tsx` | Delete |
| `public/logos/linktree-logo.png` | Delete |
| All Braze-specific database tables | Keep structure, just unused for DoubleGood |

### Database Client Record

Create new `doublegood` client record with appropriate brand defaults:

```typescript
const DOUBLEGOOD_BRAND_DEFAULTS = {
  name: 'Double Good',
  slug: 'doublegood',
  website_url: 'https://www.doublegood.com',
  industry: 'Fundraising / Food & Beverage',
  tagline: 'Fundraising has never been easier',
  primary_color: '#FFB800',
  secondary_color: '#1A1A1A',
  brand_voice: 'Warm, encouraging, and community-focused...',
  // ... full brand guidelines
};
```

---

## Implementation Order

1. **Database Migration** - Add Customer.io tables
2. **Secrets Setup** - Store Customer.io API credentials  
3. **Branding Files** - Rename hooks, update logos, change text
4. **Edge Function** - Create `sync-customerio`
5. **Frontend Updates** - Lifecycle and Campaigns pages to use Customer.io data
6. **Testing** - Verify sync works, campaigns display correctly

---

## Technical Notes

### Customer.io API Authentication

```typescript
// Basic Auth with Site ID:API Key
const credentials = btoa(`${siteId}:${apiKey}`);
fetch('https://api.customer.io/v1/campaigns', {
  headers: {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json'
  }
});
```

### Workflow Visualization

Customer.io campaigns have "actions" (workflow steps) that can be mapped to the existing flow visualization:
- Email action → Email step
- Wait action → Delay step  
- Split action → A/B test or branch
- Webhook action → API step

---

## Expected Outcome

After implementation:
- App branded as "DoubleGood CRM Copilot"
- Golden yellow (#FFB800) accent color throughout
- Customer.io platform connected and syncing
- Campaigns and Lifecycle pages showing DoubleGood's actual workflows
- Brand voice and guidelines pre-populated for DoubleGood
- All Linktree references removed
