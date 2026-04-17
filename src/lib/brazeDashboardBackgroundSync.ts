import type { QueryClient } from '@tanstack/react-query';
import { runDashboardBrazeFullSync, type RunDashboardBrazeFullSyncResult } from '@/lib/runDashboardBrazeFullSync';

const LOGIN_SYNC_FLAG_PREFIX = 'braze-dashboard-login-sync:v1:';

let activeKey: string | null = null;
let activePromise: Promise<RunDashboardBrazeFullSyncResult> | null = null;
/** Mutable flag for the in-flight detached sync (deduped callers share one run). */
let activeCancelToken: { cancelled: boolean } | null = null;

/** Throttle implicit “open Dashboard” auto-sync so revisiting the page can start another run. */
let lastImplicitDashboardBrazeSyncAt = 0;

/** After the user stops a sync, `tryStartImplicitDashboardBrazeSync` stays no-op until they use “Sync All from Braze”. */
const implicitSyncSuppressedKeys = new Set<string>();

export function clearImplicitDashboardBrazeSyncSuppress(clientId: string, platformId: string): void {
  implicitSyncSuppressedKeys.delete(syncKey(clientId, platformId));
}

/** Call when login/connect already started a full sync so Dashboard’s visit effect does not duplicate it. */
export function touchDashboardBrazeImplicitThrottle(): void {
  lastImplicitDashboardBrazeSyncAt = Date.now();
}

function syncKey(clientId: string, platformId: string) {
  return `${clientId}\0${platformId}`;
}

// —— Global HUD (survives route changes) ——
type HudSnapshot = { running: boolean; status: string };
const hudListeners = new Set<() => void>();
let hud: HudSnapshot = { running: false, status: '' };

function setHud(next: Partial<HudSnapshot>) {
  hud = { ...hud, ...next };
  for (const l of hudListeners) l();
}

export function subscribeDashboardBrazeSyncHud(onStoreChange: () => void) {
  hudListeners.add(onStoreChange);
  return () => {
    hudListeners.delete(onStoreChange);
  };
}

export function getDashboardBrazeSyncHudSnapshot(): HudSnapshot {
  return hud;
}

/**
 * Runs the same pipeline as Dashboard “Sync All”, but keeps the promise alive if the
 * Dashboard route unmounts (in-app navigation). Concurrent calls for the same
 * client + platform reuse one in-flight run. Updates global HUD for cross-page loading UI.
 */
export function startDashboardBrazeFullSyncDetached(options: {
  clientId: string;
  platformId: string;
  queryClient: QueryClient;
  onStatus?: (message: string) => void;
}): Promise<RunDashboardBrazeFullSyncResult> {
  const key = syncKey(options.clientId, options.platformId);
  if (activePromise && activeKey === key) {
    return activePromise;
  }

  const cancelToken = { cancelled: false };
  activeCancelToken = cancelToken;

  setHud({ running: true, status: 'Starting Braze sync…' });

  const p = runDashboardBrazeFullSync({
    clientId: options.clientId,
    platformId: options.platformId,
    queryClient: options.queryClient,
    shouldAbort: () => cancelToken.cancelled,
    onStatus: (msg) => {
      setHud({ status: msg });
      options.onStatus?.(msg);
    },
  })
    .then((result) => {
      if (result.cancelled) implicitSyncSuppressedKeys.add(key);
      return result;
    })
    .finally(() => {
      if (activePromise !== p) return;
      activeKey = null;
      activePromise = null;
      if (activeCancelToken === cancelToken) activeCancelToken = null;
      setHud({ running: false, status: '' });
    });

  activeKey = key;
  activePromise = p;
  return p;
}

/** Cooperatively stops the dashboard Braze sync between edge-function calls. */
export function requestCancelDashboardBrazeFullSync(): void {
  if (activeCancelToken) activeCancelToken.cancelled = true;
  setHud({ status: 'Stopping…' });
}

export function isDashboardBrazeFullSyncInFlight(): boolean {
  return activePromise != null;
}

/** Call from auth sign-out so the next login can run login-time auto sync again. */
export function clearBrazeLoginAutoSyncFlags(): void {
  lastImplicitDashboardBrazeSyncAt = 0;
  implicitSyncSuppressedKeys.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(LOGIN_SYNC_FLAG_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* private mode */
  }
}

/** Clear only this user’s login gate (OAuth / session restore without `signIn()`). */
export function clearBrazeLoginAutoSyncFlagForUser(userId: string): void {
  try {
    sessionStorage.removeItem(loginAutoSyncFlagKey(userId));
  } catch {
    /* private mode */
  }
}

export function loginAutoSyncFlagKey(userId: string): string {
  return `${LOGIN_SYNC_FLAG_PREFIX}${userId}`;
}

/**
 * When the user opens the Dashboard, optionally start sync again (throttled) if nothing is running.
 * Joins an in-flight run via `startDashboardBrazeFullSyncDetached` dedupe.
 */
export function tryStartImplicitDashboardBrazeSync(options: {
  clientId: string;
  platformId: string;
  queryClient: QueryClient;
  minIntervalMs?: number;
}): Promise<RunDashboardBrazeFullSyncResult> | null {
  const key = syncKey(options.clientId, options.platformId);
  if (implicitSyncSuppressedKeys.has(key)) {
    return null;
  }
  if (isDashboardBrazeFullSyncInFlight()) {
    return startDashboardBrazeFullSyncDetached({
      clientId: options.clientId,
      platformId: options.platformId,
      queryClient: options.queryClient,
    });
  }
  const min = options.minIntervalMs ?? 25_000;
  const now = Date.now();
  if (lastImplicitDashboardBrazeSyncAt > 0 && now - lastImplicitDashboardBrazeSyncAt < min) {
    return null;
  }
  lastImplicitDashboardBrazeSyncAt = now;
  return startDashboardBrazeFullSyncDetached({
    clientId: options.clientId,
    platformId: options.platformId,
    queryClient: options.queryClient,
  });
}
