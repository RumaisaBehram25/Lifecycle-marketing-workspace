# BRCG — Lifecycle Marketing Workspace

Client-facing lifecycle marketing dashboard for Braze-connected workspaces: journeys, campaigns, analytics, AI copilot, and onboarding.

## Stack

- **Frontend:** Vite, React, TypeScript, shadcn-ui, Tailwind CSS
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions)
- **Integrations:** Braze REST API, Anthropic (ops chat & AI reports), optional AWS S3 for campaign creatives

## Local development

```sh
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
```

Edit `.env` with your Supabase project credentials (Settings → API):

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY` — use the **anon/public JWT** (`eyJ…`), not a `sb_publishable_…` key
- `VITE_SUPABASE_URL`

```sh
# 3. Start the dev server
npm run dev
```

App runs at [http://localhost:5173](http://localhost:5173).

See `.env.example` for Braze sync, Anthropic, and optional AWS S3 secrets — those belong in **Supabase Edge Function secrets**, not in Vite env vars.

## Supabase

- Apply migrations: `supabase db push` (or run SQL from `supabase/migrations/`)
- Deploy Edge Functions as needed, e.g. `supabase functions deploy sync-braze`
- New signups may require admin approval (`profiles.is_approved`); see `.env.example` notes

## Scripts

Common npm scripts:

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run sync:lifecycle-touchpoints` | Sync lifecycle touchpoints |
| `npm run braze:segment-mix-sync` | Braze segment mix setup & sync |

See `package.json` for the full list.

## Deployment

Docker and production notes are in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Repository layout

Project files live at the **repository root** (`src/`, `supabase/`, `package.json`, etc.) — no nested wrapper folder.
