import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Client, ClientPlatform } from '@/lib/types';
import { useDoubleGoodClient, useResolvedClientId } from '@/hooks/useDoubleGoodClient';
import { buildCrmPlatformContexts, type CrmChatPlatformContext } from '@/lib/crmChatContext';

/**
 * Resolves the active CRM client (DoubleGood row or fallback) and platform schema
 * so Chat / Copilot work everywhere dashboards load.
 */
export function useClientForChat() {
  const dgQuery = useDoubleGoodClient();
  const { clientId, isClientLoading } = useResolvedClientId();

  const fallbackQuery = useQuery({
    queryKey: ['client-for-chat-fallback', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', clientId!).single();
      if (error) throw error;
      return data as Client;
    },
    enabled: !!clientId && !dgQuery.data,
    staleTime: 1000 * 60 * 5,
  });

  const client = (dgQuery.data ?? fallbackQuery.data ?? null) as Client | null;

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

  const isLoading =
    dgQuery.isLoading ||
    isClientLoading ||
    (!!clientId && !dgQuery.data && fallbackQuery.isLoading) ||
    (!!clientId && platformsQuery.isLoading);

  return {
    client,
    clientId,
    platformContexts,
    hasPlatformConnections,
    isLoading,
    refetch: () => {
      dgQuery.refetch();
      fallbackQuery.refetch();
      platformsQuery.refetch();
    },
  };
}
