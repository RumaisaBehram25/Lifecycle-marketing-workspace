import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.89.0";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "https://esm.sh/jose@5.9.6";
import { logger } from './logger.ts';

export interface AuthResult {
  success: boolean;
  userId?: string;
  userClient?: SupabaseClient;
  error?: string;
  status?: number;
}

function jwksUrlFromIssuer(iss: string): string {
  const base = iss.replace(/\/$/, '');
  return `${base}/.well-known/jwks.json`;
}

function summarizeVerifyError(e: unknown): string {
  if (e instanceof Error && e.name) return e.name;
  return String(e).slice(0, 120);
}

/**
 * Validates the JWT from Authorization and returns a user-scoped Supabase client (RLS).
 *
 * Uses JWKS verification per Supabase docs. JWKS URL and issuer are taken from the token's
 * `iss` claim when present so we still verify correctly if Edge `SUPABASE_URL` differs from
 * the URL that issued the session (internal vs public URL, custom domains).
 *
 * @see https://supabase.com/docs/guides/auth/jwts
 */
export async function validateAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return {
      success: false,
      error: 'Missing or invalid Authorization header',
      status: 401,
    };
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return {
      success: false,
      error: 'Missing or invalid Authorization header',
      status: 401,
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const envBase = supabaseUrl.replace(/\/$/, '');
  const defaultIss = `${envBase}/auth/v1`;

  let unsafe: { role?: string; sub?: string; iss?: string };
  try {
    unsafe = decodeJwt(accessToken) as { role?: string; sub?: string; iss?: string };
  } catch {
    return {
      success: false,
      error: 'Invalid token format. Please sign in again.',
      status: 401,
    };
  }

  if (unsafe.role === 'anon') {
    return {
      success: false,
      error: 'Sign in to use this feature.',
      status: 401,
    };
  }

  const iss =
    typeof unsafe.iss === 'string' && unsafe.iss.startsWith('http')
      ? unsafe.iss.replace(/\/$/, '')
      : defaultIss;

  const jwks = createRemoteJWKSet(new URL(jwksUrlFromIssuer(iss)));

  const verifyOpts = {
    issuer: iss,
    clockTolerance: 60,
  };

  let sub: string | undefined;
  let role: string | undefined;

  try {
    const { payload } = await jwtVerify(accessToken, jwks, verifyOpts);
    sub = typeof payload.sub === 'string' ? payload.sub : undefined;
    role = typeof payload.role === 'string' ? payload.role : undefined;
  } catch (e1) {
    try {
      const { payload } = await jwtVerify(accessToken, jwks, { clockTolerance: 60 });
      sub = typeof payload.sub === 'string' ? payload.sub : undefined;
      role = typeof payload.role === 'string' ? payload.role : undefined;
    } catch (e2) {
      logger.error(
        'JWT JWKS verify failed (issuer=' + iss + '):',
        summarizeVerifyError(e1),
        summarizeVerifyError(e2),
      );
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error } = await userClient.auth.getUser(accessToken);
      if (error || !userData?.user) {
        logger.error('Auth getUser fallback failed:', error?.message ?? error);
        return {
          success: false,
          error: error?.message || 'Invalid or expired token',
          status: 401,
        };
      }
      return {
        success: true,
        userId: userData.user.id,
        userClient,
      };
    }
  }

  if (role === 'anon' || role === 'service_role') {
    return {
      success: false,
      error: 'Sign in to use this feature.',
      status: 401,
    };
  }

  if (!sub) {
    return {
      success: false,
      error: 'Invalid token',
      status: 401,
    };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  return {
    success: true,
    userId: sub,
    userClient,
  };
}

/**
 * Validates that the user has access to the specified client.
 * Uses the user's RLS-scoped client to check access.
 */
export async function validateClientAccess(
  userClient: SupabaseClient,
  clientId: string
): Promise<{ success: boolean; error?: string; status?: number }> {
  if (!clientId) {
    return {
      success: false,
      error: 'Client ID is required',
      status: 400,
    };
  }

  // Check if user can access this client via RLS
  const { data, error } = await userClient
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle();

  if (error) {
    logger.error('Client access check failed:', error);
    return {
      success: false,
      error: 'Failed to validate client access',
      status: 500,
    };
  }

  if (!data) {
    return {
      success: false,
      error: 'Access denied to this client',
      status: 403,
    };
  }

  return { success: true };
}

/**
 * Same intent as {@link validateClientAccess}, but uses the **service role** client so checks
 * are not blocked by RLS on `clients` (e.g. after workspace isolation: members only see their
 * row via RLS, yet the Edge Function must still authorize that user for the given `clientId`).
 */
export async function validateClientAccessForEdge(
  supabaseService: SupabaseClient,
  userId: string,
  clientId: string,
): Promise<{ success: boolean; error?: string; status?: number }> {
  if (!clientId) {
    return {
      success: false,
      error: 'Client ID is required',
      status: 400,
    };
  }

  const { data: adminRow, error: adminErr } = await supabaseService
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (adminErr) {
    logger.error("validateClientAccessForEdge admin check:", adminErr);
    return {
      success: false,
      error: "Failed to validate client access",
      status: 500,
    };
  }

  if (adminRow) {
    const { data: clientRow } = await supabaseService
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .maybeSingle();
    if (!clientRow) {
      return {
        success: false,
        error: "Client not found",
        status: 404,
      };
    }
    return { success: true };
  }

  const { data: mapping, error: mapErr } = await supabaseService
    .from("user_workspace_clients")
    .select("client_id")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (mapErr) {
    const msg = String(mapErr.message ?? "");
    const missingTable =
      msg.includes("user_workspace_clients") &&
      (msg.includes("does not exist") ||
        msg.includes("schema cache") ||
        (mapErr as { code?: string }).code === "42P01");
    if (missingTable) {
      const { data: clientRow } = await supabaseService
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .maybeSingle();
      if (!clientRow) {
        return {
          success: false,
          error: "Client not found",
          status: 404,
        };
      }
      return { success: true };
    }
    logger.error("validateClientAccessForEdge workspace check:", mapErr);
    return {
      success: false,
      error: "Failed to validate client access",
      status: 500,
    };
  }

  if (mapping) {
    return { success: true };
  }

  return {
    success: false,
    error: "Access denied to this client",
    status: 403,
  };
}

/**
 * Creates an error response with CORS headers
 */
export function authErrorResponse(
  message: string,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}
