import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Client, ClientPlatform } from '@/lib/types';
import {
  useDoubleGoodClient,
  useResolvedClientId,
  queryStillResolving,
} from '@/hooks/useDoubleGoodClient';
import { buildCrmPlatformContexts, type CrmChatPlatformContext } from '@/lib/crmChatContext';

/**
 * Resolves the active CRM client (DoubleGood row or fallback) and platform schema
 * so Chat / Copilot work everywhere dashboards load.
 */
export function useClientForChat() {
  const dgQuery = useDoubleGoodClient();
  const { clientId, isClientLoading, resolveError } = useResolvedClientId();

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

  /** Once we can render a row from `fallbackQuery`, do not block the whole page on DoubleGood still fetching. */
  const hasRenderableClient = client != null;

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

  // Do not block the Chat UI on `client_platforms_public` — that adds a full extra round-trip
  // and platform chips/context populate when the query resolves (same as dashboards).
  const fullRowResolving =
    !!clientId &&
    !dgQuery.data &&
    !fallbackQuery.isSuccess &&
    queryStillResolving(fallbackQuery);

  const isLoading =
    !hasRenderableClient &&
    (queryStillResolving(dgQuery) || isClientLoading || fullRowResolving);

  const loadError =
    !client && !isLoading
      ? (resolveError ??
          (clientId && !dgQuery.data && fallbackQuery.isError ? fallbackQuery.error : null) ??
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
      dgQuery.refetch();
      fallbackQuery.refetch();
      platformsQuery.refetch();
    },
  };
}
