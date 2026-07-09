# BRCG — Lifecycle Marketing Workspace

Client-facing lifecycle marketing dashboard for CRM-connected workspaces: Braze journeys, campaigns, analytics, AI copilot, briefs, and brand resources.

Project files live at the **repository root** (`src/`, `supabase/`, `package.json`, etc.) — no nested wrapper folder.

---

## Features

### Dashboard (`/dashboard`)
- Workspace overview with Braze KPI metrics (deliveries, opens, clicks, revenue)
- **Sync All from Braze** — full background sync (segments, custom events, KPI, canvases, campaigns) with progress HUD
- Starred segments and custom events panels
- Google Drive briefs panel (when Drive is connected)
- Quick links to briefs, campaigns, lifecycle, and chat

### Action Center — Briefs (`/briefs`)
- Create and manage campaign / lifecycle briefs with progress tracking
- AI-assisted brief copy via `generate-brief-copy`
- Brief detail modals with status workflow

### Campaigns (`/campaigns`)
- Live data from `braze_campaigns` (synced via Braze REST API)
- Grid, list, and calendar views with search and channel filters
- Campaign detail modal with metrics, creative preview, and hygiene flags
- **Sync from Braze** from the page header
- Sample preview data with banner when Braze is not yet connected

### Lifecycle (`/lifecycle`)
- Journey view built from synced `braze_canvases` (steps, delays, messages)
- Email / push / in-app message previews with sanitized HTML
- Journey visuals and touchpoint navigation
- Lifecycle touchpoint sync (Braze + optional Next.js SSE route)

### Analytics (`/analytics`)
- **Lifecycle Flow Performance** — canvas revenue and engagement from synced data
- **Core Benchmark** — campaign vs canvas benchmarks
- **Segment Size Over Time** — segment analytics from Braze sync
- **Daily Email Engagement** — email event trends
- **Campaign Comparison** — side-by-side campaign metrics
- **Bounce Health** — bounce domain and deliverability signals
- **AI Insights** — short insight cards via `generate-analytics-insights`
- **AI Report Builder** — full markdown reports via `ai-analytics-report` (saved to `dashboard_ai_reports`)
- Braze CSV analytics upload and computed rollups

### Resource Center (`/resources`)
Tabs: `?tab=voice|design|rules|audience|events`

| Tab | Purpose |
|-----|---------|
| **Brand Voice** | Client brand voice, tone presets, do/don't rules |
| **Design** | Brand design tokens and templates |
| **Rules** | Copy rules used by AI generators and copilot |
| **Audience** | Braze segments directory with enrichment |
| **Events & Attributes** | Custom events and user attributes from Braze sync |

Brand discovery chat (`discover-brand`, `discover-emails`) helps populate brand profile from a website.

### CRM Copilot — Chat (`/chat`)
- Anthropic-powered ops chat (`ops-chat`) with workspace context
- Pulls brand rules, platform schema cache, analytics snapshot, and knowledge docs
- Persisted conversations and message history

### Settings (`/settings`)
| Tab | Purpose |
|-----|---------|
| **Profile** | User profile |
| **Users** | Admin user management and approval |
| **Data Visibility** | Toggle which Braze campaigns, canvases, and segments appear in the UI |
| **Integrations** | Google Drive folder settings for briefs |
| **Onboarding** | Multi-step workspace setup (brand, audience, Braze API key, initial sync) |
| **Feedback** | In-app feedback submissions |

### Auth & access
- Supabase email auth with optional email confirmation
- New signups land on **Pending Approval** until an admin sets `profiles.is_approved = true`
- Role-based access: `admin` and `member`

---

## Platform integrations

| Platform | Sync / proxy function | UI |
|----------|----------------------|-----|
| **Braze** | `sync-braze` (primary) | Dashboard, Campaigns, Lifecycle, Analytics, Settings |
| **Klaviyo** | `sync-klaviyo` | Platform data viewer (Resource Center / legacy Platforms) |
| **Iterable** | `sync-iterable` | Platform data viewer |
| **Customer.io** | `customerio-proxy` | Platform data viewer |
| **HubSpot** | — | Listed in platform types; connect UI present |

### What `sync-braze` syncs
- Canvases (list, detail, steps, variants, raw_steps)
- Campaigns (list, details, analytics / data_series)
- Segments (list, details, data_series sizes)
- Custom events (`/events/list`)
- KPI series (DAU, MAU, new users)
- Email events, campaign creatives (optional S3 migration)
- Prunes old sync runs / email events per env config

See [BRAZE_EVENTS_SYNC_GUIDE.md](./BRAZE_EVENTS_SYNC_GUIDE.md) for custom events detail.

---

## AI & content generation

| Function | Used for |
|----------|----------|
| `ops-chat` | CRM Copilot chat (Anthropic; `ANTHROPIC_MODEL` optional) |
| `ai-analytics-report` | Full analytics markdown reports |
| `generate-analytics-insights` | Short insight cards on Analytics page |
| `generate-copy` | On-brand email/push/SMS copy |
| `generate-brief-copy` | Brief copy drafts |
| `generate-code` | Liquid / platform code snippets |
| `discover-brand` | Brand profile extraction from website |
| `discover-emails` | Email copy discovery from site |
| `ingest-knowledge` | Scrape docs (Firecrawl) or summarize URLs (Perplexity) into knowledge base |
| `search-knowledge` | Semantic search over knowledge documents |
| `refresh-vendor-docs` | Bulk vendor documentation ingestion |
| `discover-platform-docs` | Platform-specific doc topic discovery |

**AI providers (Supabase Edge Function secrets, not Vite):**
- `ANTHROPIC_API_KEY` — required for chat and AI reports
- `ANTHROPIC_MODEL` — optional; defaults differ per function (use a current model ID from Anthropic docs)
- `PERPLEXITY_API_KEY` — optional; `ingest-knowledge` with `use_perplexity`
- `FIRECRAWL_API_KEY` — optional; default URL scraping in `ingest-knowledge`

---

## Stack

- **Frontend:** Vite, React 18, TypeScript, React Router, TanStack Query, shadcn-ui, Tailwind CSS, Recharts
- **Optional app server:** Next.js 14 (`app/`) — lifecycle touchpoint sync API with SSE streaming
- **Backend:** Supabase (Postgres + RLS, Auth, Storage, Edge Functions on Deno)
- **Integrations:** Braze REST API, Anthropic, optional AWS S3 for campaign creatives, optional Google Drive for briefs

---

## Local development

```sh
npm install
cp .env.example .env
```

Edit `.env` with Supabase credentials (Dashboard → Settings → API):

| Variable | Notes |
|----------|-------|
| `VITE_SUPABASE_PROJECT_ID` | Project ref |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **Anon/public JWT** (`eyJ…`) — not `sb_publishable_…` |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |

```sh
# Vite dev server (primary UI) — http://localhost:5173
npm run dev

# Optional: Vite + Next.js together (touchpoint sync API on :3000)
npm run dev:all
```

Braze, Anthropic, AWS, Perplexity, and Firecrawl keys belong in **Supabase Edge Function secrets**. See comments in `.env.example`.

---

## Supabase

```sh
# Apply migrations
supabase db push

# Deploy functions (examples)
supabase functions deploy sync-braze
supabase functions deploy ops-chat
supabase functions deploy ai-analytics-report
```

**Common secrets:**
```sh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ANTHROPIC_MODEL=claude-haiku-4-5-20251001
supabase secrets set BRAZE_REST_URL=https://rest.iad-06.braze.com
```

New users: enable email confirmation in Supabase Auth if desired; first user is auto-approved admin; subsequent signups need `profiles.is_approved = true`.

---

## Edge Functions

| Function | Purpose |
|----------|---------|
| `sync-braze` | Full Braze workspace sync |
| `sync-klaviyo` | Klaviyo data sync |
| `sync-iterable` | Iterable data sync |
| `sync-customerio` | Customer.io sync |
| `customerio-proxy` | Customer.io API proxy for UI |
| `braze-webhook` | Ingest Braze webhook events (optional secret) |
| `braze-campaign-creative` | Fetch / migrate campaign creative previews |
| `ops-chat` | CRM Copilot |
| `ai-analytics-report` | AI analytics reports |
| `generate-analytics-insights` | Analytics insight cards |
| `generate-copy` | Marketing copy generation |
| `generate-brief-copy` | Brief copy generation |
| `generate-code` | Code / Liquid generation |
| `discover-brand` | Website brand analysis |
| `discover-emails` | Website email discovery |
| `discover-platform-docs` | Platform documentation topics |
| `ingest-knowledge` | URL → knowledge document |
| `search-knowledge` | Knowledge base search |
| `refresh-vendor-docs` | Bulk vendor doc refresh |
| `save-google-drive-settings` | Store Google Drive briefs folder config |

---

## NPM scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run dev:next` | Next.js dev server (port 3000) |
| `npm run dev:all` | Both Vite and Next.js |
| `npm run build` | Vite production build |
| `npm run build:all` | Vite + Next.js build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm run sync:lifecycle-touchpoints` | Lifecycle touchpoint sync (PowerShell script) |
| `npm run braze:segment-mix-sync` | Braze segment mix setup and sync |
| `npm run braze:segment-track-create` | Segment track stats and create |
| `npm run backfill:campaign-creatives` | Backfill campaign creative storage |
| `npm run migrate:campaign-creatives` | Migrate campaign creatives |
| `npm run sync:missing-raw-details` | Sync missing Braze raw details |
| `npm run migrate:campaign-images-s3` | Migrate campaign images to S3 |
| `npm run migrate:lifecycle-images-s3` | Migrate lifecycle canvas images to S3 |

---

## Additional documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) — Docker and production deployment
- [BRAZE_EVENTS_SYNC_GUIDE.md](./BRAZE_EVENTS_SYNC_GUIDE.md) — Braze custom events sync
- [.env.example](./.env.example) — Environment variables and Supabase secret notes

---

## Repository layout

```
src/           React app (views, components, hooks, lib)
supabase/      Migrations, Edge Functions, SQL scripts
app/           Next.js API routes (optional touchpoint sync)
scripts/       Maintenance and Braze sync utilities
public/        Static assets (BRCG.png, favicon)
```
