import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.89.0";
import { logger } from './logger.ts';

export interface AuthResult {
  success: boolean;
  userId?: string;
  userClient?: SupabaseClient;
  error?: string;
  status?: number;
}

/**
 * Validates the JWT token from the Authorization header and returns user context.
 * Returns a user-scoped Supabase client that respects RLS policies.
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

  const token = authHeader.replace('Bearer ', '');
  
  // Create a user-scoped client with the JWT token
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { 
      global: { headers: { Authorization: authHeader } }
    }
  );

  // Verify the token and get claims
  const { data, error } = await userClient.auth.getClaims(token);
  
  if (error || !data?.claims) {
    logger.error('Auth validation failed:', error);
    return {
      success: false,
      error: 'Invalid or expired token',
      status: 401,
    };
  }

  const userId = data.claims.sub;
  if (!userId) {
    return {
      success: false,
      error: 'Invalid token: missing user ID',
      status: 401,
    };
  }

  return {
    success: true,
    userId,
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
