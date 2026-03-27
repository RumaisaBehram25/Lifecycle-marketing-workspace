import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Client, ClientPlatform } from '@/lib/types';
import { useResolvedClientId, queryStillResolving } from '@/hooks/useDoubleGoodClient';
import { buildCrmPlatformContexts, type CrmChatPlatformContext } from '@/lib/crmChatContext';

/**
 * Active workspace `clients` row (admin = DoubleGood or fallback; member = personal workspace)
 * and platform schema for Chat / Copilot.
 */
export function useClientForChat() {
  const { clientId, isClientLoading, resolveError } = useResolvedClientId();

  const clientQuery = useQuery({
    queryKey: ['client-row-for-chat', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', clientId!).single();
      if (error) throw error;
      return data as Client;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  const client = clientQuery.data ?? null;

  const platformsQuery = useQuery({
    queryKey: ['client-platforms-public', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_platforms_public')
        .select('*')
        .eq('client_id', clientId!);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 2,
  });

  const platformContexts: CrmChatPlatformContext[] = buildCrmPlatformContexts(
    (platformsQuery.data ?? []) as ClientPlatform[]
  );

  const hasPlatformConnections = (platformsQuery.data || []).some(
    (p: { is_connected?: boolean }) => p.is_connected
  );

  const rowStillResolving =
    !!clientId &&
    queryStillResolving({
      isSuccess: clientQuery.isSuccess,
      isError: clientQuery.isError,
      isPaused: clientQuery.isPaused,
      isPending: clientQuery.isPending,
      isFetching: clientQuery.isFetching,
    });

  const isLoading = isClientLoading || rowStillResolving;

  const loadError =
    !client && !isLoading
      ? (resolveError ??
          (clientId && clientQuery.isError ? clientQuery.error : null) ??
          (clientId && platformsQuery.isError ? platformsQuery.error : null) ??
          null)
      : null;

  return {
    client,
    clientId,
    platformContexts,
    hasPlatformConnections,
    isLoading,
    loadError,
    refetch: () => {
      void clientQuery.refetch();
      void platformsQuery.refetch();
    },
  };
}
