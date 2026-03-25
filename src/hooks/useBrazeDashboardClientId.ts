import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResolvedClientId } from '@/hooks/useDoubleGoodClient';

/**
 * Braze sync writes to `client_id` from the connected platform row.
 * `useResolvedClientId()` can differ (e.g. slug client vs oldest fallback), which makes
 * campaigns/KPI/broadcasts look empty while the API returns data. Prefer the client that
 * actually has a Braze row (most recently synced first).
 */
export function useBrazeDashboardClientId() {
  const { clientId: resolvedId, isClientLoading: resolvedLoading } = useResolvedClientId();

  // 1) Prefer the current resolved workspace client *if* it has a Braze platform row.
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

  // 2) If the resolved client has no Braze row, fall back to the most recently synced Braze client.
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
      !!resolvedId &&
      resolvedPlatform.isFetched &&
      !resolvedPlatform.isError &&
      resolvedPlatform.data == null,
    staleTime: 60_000,
  });

  const clientId =
    resolvedPlatform.data ?? latestBrazeClient.data ?? resolvedId ?? undefined;

  const isLoading =
    resolvedLoading ||
    (resolvedId
      ? resolvedPlatform.isLoading ||
        (resolvedPlatform.data == null && latestBrazeClient.isLoading)
      : false);

  return {
    clientId,
    isLoading,
    // Keep these names for debugging parity with previous callers
    platformClientId: resolvedPlatform.data ?? null,
    resolvedClientId: resolvedId,
  };
}
