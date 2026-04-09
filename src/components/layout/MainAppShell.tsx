import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { LoadingRouteContent } from '@/components/ui/loading-spinner';

/**
 * Keeps sidebar + chrome mounted while lazy route chunks load.
 * Suspense must wrap only the page outlet — not the whole router — so navigation
 * does not replace the left sidebar with a full-screen spinner.
 */
export function MainAppShell() {
  return (
    <AppLayout>
      <Suspense fallback={<LoadingRouteContent />}>
        <Outlet />
      </Suspense>
    </AppLayout>
  );
}
