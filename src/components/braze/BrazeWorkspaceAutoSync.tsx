/**
 * DISABLED: “Old user” login no longer starts Braze full sync automatically.
 * Sync only when the user clicks “Sync All from Braze” on the Dashboard.
 *
 * Previous behavior (kept here for reference):
 *
 * import { useEffect } from 'react';
 * import { useQueryClient } from '@tanstack/react-query';
 * import { useAuth } from '@/hooks/useAuth';
 * import { useResolvedClientId, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
 * import {
 *   startDashboardBrazeFullSyncDetached,
 *   loginAutoSyncFlagKey,
 *   touchDashboardBrazeImplicitThrottle,
 * } from '@/lib/brazeDashboardBackgroundSync';
 * import { logger } from '@/lib/logger';
 *
 * After login, if a Braze platform row existed, we ran full dashboard sync once per sign-in session.
 * Used sessionStorage pending → 1 so React Strict Mode’s double effect did not skip the run.
 *
 * useEffect(() => {
 *   if (!user?.id || !clientId || isClientLoading || !platformsFetched) return;
 *   const braze = platforms?.find((p) => p.platform === 'braze');
 *   if (!braze?.id) return;
 *   const flagKey = loginAutoSyncFlagKey(user.id);
 *   try {
 *     const v = sessionStorage.getItem(flagKey);
 *     if (v === '1' || v === 'pending') return;
 *     sessionStorage.setItem(flagKey, 'pending');
 *   } catch {
 *     return;
 *   }
 *   touchDashboardBrazeImplicitThrottle();
 *   void startDashboardBrazeFullSyncDetached({ clientId, platformId: braze.id, queryClient })
 *     .then((result) => {
 *       if (result.cancelled) {
 *         try { sessionStorage.removeItem(flagKey); } catch { // ignore
 *         }
 *         return;
 *       }
 *       try { sessionStorage.setItem(flagKey, '1'); } catch { // ignore
 *       }
 *     })
 *     .catch((err: unknown) => {
 *       logger.error('[BrazeWorkspaceAutoSync] login-time sync failed', err);
 *       try { sessionStorage.removeItem(flagKey); } catch { // ignore
 *       }
 *     });
 * }, [user?.id, clientId, isClientLoading, platformsFetched, platforms, queryClient]);
 */
export function BrazeWorkspaceAutoSync() {
  return null;
}
