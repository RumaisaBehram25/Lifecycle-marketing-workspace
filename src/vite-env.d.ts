/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PROJECT_ID?: string;
  /** Supabase anon (public) JWT — required for DB + Edge Functions */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Same as anon JWT; optional alias for VITE_SUPABASE_PUBLISHABLE_KEY */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Public Storage bucket id for campaign creatives (default: campaign-creatives) */
  readonly VITE_SUPABASE_CAMPAIGN_CREATIVES_BUCKET?: string;
  /** "true" | "false" — campaign bucket image preload; see .env.example */
  readonly VITE_PRELOAD_CAMPAIGN_BUCKET_IMAGES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
