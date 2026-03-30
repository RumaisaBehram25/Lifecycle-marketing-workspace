import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  DASHBOARD_EMAIL_PROVIDER_IDS,
  type DashboardEmailProviderId,
} from '@/services/email-provider/types';
import { useResolvedClientId } from '@/hooks/useDoubleGoodClient';

type PlatformRow = {
  platform: string | null;
  last_sync_at: string | null;
};

/**
 * Chooses which ESP powers dashboard email analytics for the **resolved workspace**.
 * Uses `client_platforms.platform` (same source as onboarding / Platforms UI).
 *
 * Resolution: among rows where `platform` is `braze` or `klaviyo`, pick the one with the
 * latest `last_sync_at`. If none, defaults to **`braze`** so existing Braze-only workspaces
 * behave unchanged.
 */
export function usePrimaryEmailProvider() {
  const { clientId, isClientLoading } = useResolvedClientId();

  const q = useQuery({
    queryKey: ['primary-email-provider', clientId],
    queryFn: async (): Promise<{ primary: DashboardEmailProviderId }> => {
      if (!clientId) return { primary: 'braze' };

      const { data, error } = await supabase
        .from('client_platforms_public')
        .select('platform,last_sync_at')
        .eq('client_id', clientId);

      if (error) throw error;

      const rows = (data ?? []) as PlatformRow[];
      const espRows = rows.filter((r) =>
        DASHBOARD_EMAIL_PROVIDER_IDS.includes(r.platform as DashboardEmailProviderId),
      );

      if (espRows.length === 0) {
        return { primary: 'braze' };
      }

      const ranked = [...espRows].sort((a, b) => {
        const ta = a.last_sync_at ? Date.parse(a.last_sync_at) : 0;
        const tb = b.last_sync_at ? Date.parse(b.last_sync_at) : 0;
        return tb - ta;
      });

      const top = ranked[0]?.platform;
      if (top === 'klaviyo' || top === 'braze') {
        return { primary: top };
      }

      return { primary: 'braze' };
    },
    enabled: !!clientId && !isClientLoading,
    staleTime: 60_000,
  });

  return {
    primaryProvider: q.data?.primary ?? 'braze',
    isLoading: isClientLoading || q.isLoading,
    isFetching: q.isFetching,
    error: q.error,
  };
}
