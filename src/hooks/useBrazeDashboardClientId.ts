import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResolvedClientId } from '@/hooks/useDoubleGoodClient';
import { useAuth } from '@/hooks/useAuth';

/**
 * `clients.id` used to **read** Braze-backed tables (KPI, canvases, segments sync, email
 * events, campaign directory, Analytics).
 *
 * - **Members:** always the personal workspace (`useResolvedClientId`), optionally
 *   confirmed via a Braze row on that client (same id).
 * - **Admins:** the resolved workspace (e.g. BRCG shared `slug = doublegood`) **if** it has a Braze platform
 *   row; otherwise the **globally most recently synced Braze** client. That matches where
 *   API/CSV sync typically lands when admins use the BRCG workspace for Drive but members (or a
 *   single shared sync) wrote Braze data under another `clients.id` — without this,
 *   Analytics “Performance Snapshot” and segment/campaign hygiene diverge from the member
 *   view despite identical credentials.
 *
 * **Drive, briefs, onboarding CSV storage** still use `useResolvedClientId()` only.
 */
export function useBrazeDashboardClientId() {
  const { isAdmin } = useAuth();
  const { clientId: resolvedId, isClientLoading: resolvedLoading } = useResolvedClientId();

  const resolvedPlatform = useQuery({
    queryKey: ['braze-platform-client-id-for-resolved', resolvedId],
    queryFn: async () => {
      if (!resolvedId) return null;
      const { data, error } = await supabase
        .from('client_platforms_public')
        .select('client_id')
        .eq('platform', 'braze')
        .eq('client_id', resolvedId)
        .order('last_sync_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as { client_id: string } | null)?.client_id ?? null;
    },
    enabled: !!resolvedId,
    staleTime: 60_000,
  });

  const latestBrazeClient = useQuery({
    queryKey: ['braze-latest-client'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_platforms_public')
        .select('client_id')
        .eq('platform', 'braze')
        .order('last_sync_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as { client_id: string } | null)?.client_id ?? null;
    },
    enabled:
      isAdmin &&
      !!resolvedId &&
      resolvedPlatform.isFetched &&
      !resolvedPlatform.isError &&
      resolvedPlatform.data == null,
    staleTime: 60_000,
  });

  const clientId = isAdmin
    ? (resolvedPlatform.data ?? latestBrazeClient.data ?? resolvedId ?? undefined)
    : (resolvedPlatform.data ?? resolvedId ?? undefined);

  const isLoading =
    resolvedLoading ||
    (resolvedId
      ? resolvedPlatform.isLoading ||
        (isAdmin && resolvedPlatform.data == null && latestBrazeClient.isLoading)
      : false);

  return {
    clientId,
    isLoading,
    platformClientId: resolvedPlatform.data ?? null,
    resolvedClientId: resolvedId,
  };
}
