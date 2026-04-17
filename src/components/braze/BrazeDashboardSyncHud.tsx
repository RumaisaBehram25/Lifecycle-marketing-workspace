import { useSyncExternalStore } from 'react';
import { Loader2 } from 'lucide-react';
import {
  subscribeDashboardBrazeSyncHud,
  getDashboardBrazeSyncHudSnapshot,
  requestCancelDashboardBrazeFullSync,
} from '@/lib/brazeDashboardBackgroundSync';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function useDashboardBrazeSyncHud() {
  return useSyncExternalStore(
    subscribeDashboardBrazeSyncHud,
    getDashboardBrazeSyncHudSnapshot,
    getDashboardBrazeSyncHudSnapshot,
  );
}

/** Sticky banner + spinner while “Sync All from Braze” runs (including auto-sync after login / connect). */
export function BrazeDashboardSyncHud() {
  const { running, status } = useDashboardBrazeSyncHud();
  if (!running) return null;

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm text-foreground',
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Syncing from Braze…</p>
        {status ? (
          <p className="truncate text-xs text-muted-foreground" title={status}>
            {status}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 border-primary/30 bg-background/80"
        onClick={() => requestCancelDashboardBrazeFullSync()}
      >
        Stop
      </Button>
    </div>
  );
}
