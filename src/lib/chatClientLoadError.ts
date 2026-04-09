/**
 * User-facing copy when CRM Copilot cannot resolve a `clients` row (Chat empty state).
 * Maps common Supabase PostgREST / network failures to actionable hints.
 */

function pickMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  return '';
}

function pickCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const c = (error as { code: unknown }).code;
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return undefined;
}

function isNetworkLike(text: string): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|net::err|fetch.*aborted/i.test(
    text
  );
}

function isRlsOrPermissionLike(text: string, code?: string): boolean {
  if (code === '42501' || code === 'PGRST301') return true;
  return /row-level security|violates row-level|permission denied|not authorized|policy .*for table|\brls\b/i.test(
    text
  );
}

export interface ChatClientLoadHelp {
  /** Shown first — server message when present, otherwise a short default */
  detail: string;
  /** Tailored bullets (RLS, network, public view, etc.) */
  hints: string[];
}

const RLS_INSERT_HINT =
  'RLS: only admins can insert into clients (migration policy "Admins can insert clients"). If you are not an admin and no client rows exist yet, the app cannot auto-create the BRCG shared workspace client — ask an admin to add a client or adjust policies.';

const NETWORK_HINT =
  'Supabase / network: confirm the request reaches your project (VITE_SUPABASE_URL, anon key), check the browser Network tab for failed REST calls to clients or client_platforms_public, and rule out VPN or firewall blocks.';

const PLATFORMS_PUBLIC_HINT =
  'client_platforms_public: a read failed on that view/table. RLS or a missing migration can block it; you still need at least one clients row the app can load for Chat to open.';

export function getChatClientLoadHelp(error: unknown): ChatClientLoadHelp {
  const raw = pickMessage(error);
  const code = pickCode(error);

  const detail =
    raw ||
    'Could not load a workspace client. Check your connection and that Supabase can read the clients table.';

  const hints: string[] = [];

  if (isNetworkLike(raw)) {
    hints.push(NETWORK_HINT);
  }

  if (isRlsOrPermissionLike(raw, code)) {
    hints.push(RLS_INSERT_HINT);
  }

  if (/client_platforms_public/i.test(raw)) {
    hints.push(PLATFORMS_PUBLIC_HINT);
  }

  if (hints.length === 0) {
    hints.push(RLS_INSERT_HINT);
    hints.push(NETWORK_HINT);
  } else if (!hints.includes(NETWORK_HINT) && !isNetworkLike(raw)) {
    hints.push(
      'If the error above is not about permissions, treat it as a Supabase or network issue and retry after checking connectivity.'
    );
  }

  return { detail, hints };
}
