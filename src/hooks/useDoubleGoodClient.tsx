import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Client, ClientPlatform, PlatformType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const DOUBLEGOOD_SLUG = 'doublegood';
const DOUBLEGOOD_NAME = 'BRCG';

// DoubleGood brand defaults based on website research
const DOUBLEGOOD_BRAND_DEFAULTS = {
  name: DOUBLEGOOD_NAME,
  slug: DOUBLEGOOD_SLUG,
  website_url: 'https://www.doublegood.com',
  industry: 'Fundraising / Food & Beverage',
  is_active: true,
  tagline: 'Fundraising has never been easier',
  primary_color: '#FFB800',
  secondary_color: '#1A1A1A',
  brand_voice: `Warm, encouraging, and community-focused. We make fundraising simple and fun for youth sports teams, schools, and nonprofits. Our tone celebrates team success, empowers organizers, and keeps the focus on the positive impact of every Pop-Up Store. We speak directly to coaches, parents, teachers, and anyone passionate about supporting their community.`,
  value_propositions: JSON.stringify([
    'Keep 50% of every sale — the highest fundraising profit share',
    'Virtual Pop-Up Stores make selling easy from anywhere',
    'Premium gourmet popcorn that people actually want to buy',
    'No upfront costs, no inventory to manage',
    'Four-day fundraisers that maximize urgency and results',
    'Free shipping directly to supporters',
  ]),
  differentiators: JSON.stringify([
    'Highest profit margin in fundraising (50% to your group)',
    'Virtual model eliminates door-to-door selling hassles',
    'Gourmet popcorn product loved by customers',
    'Simple app-based setup takes minutes',
    'Dedicated support for organizers',
  ]),
  target_audience: JSON.stringify([
    { segment: 'Youth Sports Teams', description: 'Baseball, softball, soccer, basketball teams raising funds for equipment and travel' },
    { segment: 'Schools & PTAs', description: 'Elementary, middle, and high schools funding programs and activities' },
    { segment: 'Nonprofits', description: 'Community organizations and charities looking for easy fundraising' },
    { segment: 'Dance & Cheer Teams', description: 'Competition teams funding uniforms, travel, and entry fees' },
    { segment: 'Scouts & Clubs', description: 'Boy Scouts, Girl Scouts, and other youth organizations' },
  ]),
  key_messaging_pillars: JSON.stringify([
    'Simplicity - Set up a fundraiser in minutes with our easy app',
    'Profit - Keep 50% of every sale for your group',
    'Quality - Gourmet popcorn people love to buy and eat',
    'Community - Celebrate every team success story',
    'Support - We\'re here to help you hit your goals',
  ]),
  do_rules: JSON.stringify([
    'Lead with the 50% profit message',
    'Celebrate team wins and success stories',
    'Keep language warm, friendly, and encouraging',
    'Emphasize simplicity and ease of use',
    'Use "your group" and "your team" language',
    'Highlight that there\'s no risk or upfront cost',
  ]),
  dont_rules: JSON.stringify([
    'Avoid pressure tactics or aggressive sales language',
    'Don\'t focus on the negatives of traditional fundraising',
    'Never make organizers feel overwhelmed',
    'Avoid corporate jargon — keep it friendly',
    'Don\'t understate the quality of the popcorn product',
  ]),
  tone_presets: JSON.stringify([
    'Warm & Encouraging',
    'Celebratory',
    'Supportive',
    'Community-focused',
    'Simple & Direct',
  ]),
};

/** True while a query has not settled (success/error) and is not paused — avoids infinite spin on `paused` fetches. */
export function queryStillResolving(q: {
  isSuccess: boolean;
  isError: boolean;
  isPaused: boolean;
  isPending: boolean;
  isFetching: boolean;
}): boolean {
  // `isPending` stays true when fetchStatus is `paused` (offline / networkMode) — that would spin forever.
  return (
    !q.isSuccess &&
    !q.isError &&
    !q.isPaused &&
    (q.isPending || q.isFetching)
  );
}

/**
 * Workspace `clients.id` for the current session.
 * - Admins: shared DoubleGood (`slug = doublegood`) + legacy fallback to oldest client.
 * - Members: personal workspace from `ensure_personal_workspace_client` (own Braze/CSV/Drive data).
 */
export function useResolvedClientId() {
  const { isAdmin, isApproved, isLoading: authLoading } = useAuth();
  const clientQuery = useDoubleGoodClient();
  const personalWorkspace = useQuery({
    queryKey: ['personal-workspace-client-id'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ensure_personal_workspace_client');
      if (error) throw error;
      return data as string;
    },
    enabled: !authLoading && !isAdmin && isApproved,
    staleTime: 5 * 60 * 1000,
  });
  const onboardingFallback = useQuery({
    queryKey: ['onboarding-fallback-client'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string } | null;
    },
    enabled: !authLoading && isAdmin && !clientQuery.data?.id,
    staleTime: 1000 * 60 * 5,
  });

  const fallbackClient = onboardingFallback.data;

  const clientId = isAdmin
    ? (clientQuery.data?.id ?? fallbackClient?.id ?? undefined)
    : (personalWorkspace.data ?? undefined);

  const isClientLoading =
    authLoading ||
    (isAdmin
      ? !clientId &&
        (queryStillResolving(clientQuery) ||
          (!clientQuery.data?.id &&
            fallbackClient == null &&
            !onboardingFallback.isSuccess &&
            queryStillResolving(onboardingFallback)))
      : isApproved &&
        !clientId &&
        (personalWorkspace.isLoading || personalWorkspace.isFetching));

  const resolveError =
    !clientId &&
    !isClientLoading &&
    (isAdmin ? clientQuery.isError || onboardingFallback.isError : personalWorkspace.isError)
      ? isAdmin
        ? (clientQuery.error ?? onboardingFallback.error)
        : personalWorkspace.error
      : null;

  return {
    ...clientQuery,
    clientId,
    isClientLoading,
    resolveError,
  };
}

/**
 * Full `clients` row for the active workspace (same `client_id` as CSV / Braze / Drive).
 * Prefer this over `useDoubleGoodClient()` in UI — members see their personal workspace, not the shared BRCG row.
 */
export function useActiveClientRow() {
  const { clientId, isClientLoading, resolveError } = useResolvedClientId();
  const q = useQuery({
    queryKey: ['active-client-row', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', clientId!).single();
      if (error) throw error;
      return data as Client;
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
  return {
    data: q.data ?? null,
    isLoading: isClientLoading || (!!clientId && queryStillResolving(q)),
    error: resolveError ?? q.error,
    refetch: q.refetch,
  };
}

// Hook to get or create the single DoubleGood client (admin shared workspace; also used internally by useResolvedClientId for admins)
export function useDoubleGoodClient() {
  return useQuery({
    queryKey: ['doublegood-client'],
    queryFn: async () => {
      // Try to get existing DoubleGood client
      const { data: existing, error: fetchError } = await supabase
        .from('clients')
        .select('*')
        .eq('slug', DOUBLEGOOD_SLUG)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      
      if (existing) {
        // Update with brand defaults if brand voice is missing
        if (!existing.value_propositions || !existing.target_audience) {
          const { data: updated } = await supabase
            .from('clients')
            .update(DOUBLEGOOD_BRAND_DEFAULTS)
            .eq('id', existing.id)
            .select()
            .single();
          return (updated || existing) as Client;
        }
        return existing as Client;
      }
      
      // Create DoubleGood client if it doesn't exist
      const { data: created, error: createError } = await supabase
        .from('clients')
        .insert(DOUBLEGOOD_BRAND_DEFAULTS)
        .select()
        .single();
      
      if (createError) throw createError;
      return created as Client;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useDoubleGoodPlatforms() {
  const { clientId } = useResolvedClientId();

  return useQuery({
    queryKey: ['doublegood-platforms', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('client_platforms_public')
        .select('*')
        .eq('client_id', clientId);
      if (error) throw error;
      return data as ClientPlatform[];
    },
    enabled: !!clientId,
  });
}

export function useUpdateDoubleGoodClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { clientId } = useResolvedClientId();

  return useMutation({
    mutationFn: async (updates: Partial<Client>) => {
      if (!clientId) throw new Error('Client not found');
      const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', clientId)
        .select()
        .single();
      if (error) throw error;
      return data as Client;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doublegood-client'] });
      queryClient.invalidateQueries({ queryKey: ['personal-workspace-client-id'] });
      toast({ title: 'Brand updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useConnectPlatform() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { clientId } = useResolvedClientId();

  return useMutation({
    mutationFn: async ({ platform, apiKey, apiSecret, additionalConfig }: { platform: PlatformType; apiKey: string; apiSecret?: string; additionalConfig?: Record<string, unknown> }) => {
      if (!clientId) throw new Error('Client not found');
      const row: Record<string, unknown> = {
        client_id: clientId,
        platform,
        api_key: apiKey,
        api_secret: apiSecret || null,
        is_connected: true,
      };
      if (additionalConfig && Object.keys(additionalConfig).length > 0) {
        row.additional_config = additionalConfig;
      }
      const { data, error } = await supabase
        .from('client_platforms')
        .upsert(row, { onConflict: 'client_id,platform' })
        .select()
        .single();
      if (error) throw error;
      return data as ClientPlatform;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doublegood-platforms'] });
      queryClient.invalidateQueries({ queryKey: ['braze-platform-client-id-for-resolved'] });
      queryClient.invalidateQueries({ queryKey: ['braze_campaigns'] });
      toast({ title: 'Platform connected' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDisconnectPlatform() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { clientId } = useResolvedClientId();

  return useMutation({
    mutationFn: async (platform: PlatformType) => {
      if (!clientId) throw new Error('Client not found');
      const { error } = await supabase
        .from('client_platforms')
        .delete()
        .eq('client_id', clientId)
        .eq('platform', platform);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doublegood-platforms'] });
      queryClient.invalidateQueries({ queryKey: ['braze-platform-client-id-for-resolved'] });
      toast({ title: 'Platform disconnected' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}
