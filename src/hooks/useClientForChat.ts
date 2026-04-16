import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Client, ClientPlatform } from '@/lib/types';
import { useResolvedClientId, queryStillResolving } from '@/hooks/useDoubleGoodClient';
import { useBrazeSegmentsDirectory } from '@/hooks/useBrazeSegmentsDirectory';
import { buildCrmPlatformContexts, type CrmChatPlatformContext } from '@/lib/crmChatContext';

/**
 * Active workspace `clients` row (admin = BRCG shared workspace or fallback; member = personal workspace)
 * plus connected platforms for Chat / Copilot UI.
 *
 * Used by AI Chat (`/chat`) and Resource Center (`/resources`). After saving brand or rules in Resource Center,
 * invalidate `['client-row-for-chat', clientId]` (see `ResourceCenter` `invalidateWorkspaceClient`) so this hook refetches.
 * Edge function `ops-chat` does **not** rely on this cache: it calls `buildUnifiedContext` and reads `clients` again per request.
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

  const { data: brazeSegmentDirectory = [] } = useBrazeSegmentsDirectory(clientId);

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

  const platformContexts: CrmChatPlatformContext[] = useMemo(() => {
    const base = buildCrmPlatformContexts((platformsQuery.data ?? []) as ClientPlatform[]);
    const names = brazeSegmentDirectory.map((s) => s.name).filter(Boolean);
    if (names.length === 0) return base;
    return base.map((ctx) =>
      ctx.platform === 'braze' ? { ...ctx, segments: names } : ctx,
    );
  }, [platformsQuery.data, brazeSegmentDirectory]);

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
