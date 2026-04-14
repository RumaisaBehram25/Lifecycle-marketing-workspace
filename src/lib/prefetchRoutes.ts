/**
 * Warm Vite lazy chunks before navigation so sidebar clicks feel instant.
 * Matches `lazy(() => import(...))` paths in `App.tsx`.
 */
const loaders: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('@/views/Dashboard'),
  '/campaigns': () => import('@/views/Campaigns'),
  '/lifecycle': () => import('@/views/Lifecycle'),
  '/analytics': () => import('@/views/Analytics'),
  '/resources': () => import('@/views/ResourceCenter'),
  '/settings': () => import('@/views/Settings'),
  '/chat': () => import('@/views/Chat'),
  '/briefs': () => import('@/views/Briefs'),
};

export function prefetchPageChunk(pathname: string): void {
  const load = loaders[pathname];
  if (load) void load().catch(() => undefined);
}
