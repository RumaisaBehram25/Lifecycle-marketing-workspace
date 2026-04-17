import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LoadingPage } from "@/components/ui/loading-spinner";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { MainAppShell } from "@/components/layout/MainAppShell";

/** Route-level lazy imports — only the active page’s JS loads on first paint / navigation (smaller dev graph, faster prod TTI). */
const Auth = lazy(() => import("./views/Auth"));
const Dashboard = lazy(() => import("./views/Dashboard"));
const Briefs = lazy(() => import("./views/Briefs"));
const Campaigns = lazy(() => import("./views/Campaigns"));
const Lifecycle = lazy(() => import("./views/Lifecycle"));
const ResourceCenter = lazy(() => import("./views/ResourceCenter"));
const Settings = lazy(() => import("./views/Settings"));
const Chat = lazy(() => import("./views/Chat"));
const Analytics = lazy(() => import("./views/Analytics"));
const NotFound = lazy(() => import("./views/NotFound"));
const PendingApproval = lazy(() => import("./views/PendingApproval"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Tab focus otherwise refetches every mounted query and can feel like a full reload.
      refetchOnWindowFocus: false,
      /** Reuse server data when switching Dashboard ↔ Campaigns ↔ Analytics within this window — avoids a full network refetch on every navigation. Per-query `staleTime` still overrides. */
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      /** Keep background refetches/resolution running when the browser tab is inactive (TanStack default can pause). */
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isApproved } = useAuth();
  if (isLoading) return <LoadingPage />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isApproved) return <Navigate to="/pending-approval" replace />;
  return <>{children}</>;
}

function ApprovalRoute() {
  const { user, isLoading, isApproved } = useAuth();
  if (isLoading) return <LoadingPage />;
  if (!user) return <Navigate to="/auth" replace />;
  if (isApproved) return <Navigate to="/dashboard" replace />;
  return <PendingApproval />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Suspense fallback={<LoadingPage />}><Auth /></Suspense>} />
      <Route path="/pending-approval" element={<Suspense fallback={<LoadingPage />}><ApprovalRoute /></Suspense>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<ProtectedRoute><MainAppShell /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/briefs" element={<Briefs />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/lifecycle" element={<Lifecycle />} />
        <Route path="/resources" element={<ResourceCenter />} />
        {/* Onboarding UI: Settings → Onboarding tab (after Data Visibility for admins) */}
        <Route path="/onboarding" element={<Navigate to="/settings?tab=onboarding" replace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/analytics" element={<Analytics />} />
      </Route>
      {/* Redirects for old routes */}
      <Route path="/brand" element={<Navigate to="/resources" replace />} />
      <Route path="/audience" element={<Navigate to="/resources" replace />} />
      <Route path="/knowledge" element={<Navigate to="/resources" replace />} />
      <Route path="/analytical" element={<Navigate to="/analytics" replace />} />
      <Route path="/generate/code" element={<Navigate to="/resources" replace />} />
      <Route path="/users" element={<Navigate to="/settings" replace />} />
      <Route path="/clients" element={<Navigate to="/resources" replace />} />
      <Route path="/clients/:id" element={<Navigate to="/resources" replace />} />
      <Route path="/platforms" element={<Navigate to="/resources" replace />} />
      <Route path="/creative" element={<Navigate to="/lifecycle" replace />} />
      <Route path="*" element={<Suspense fallback={<LoadingPage />}><NotFound /></Suspense>} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <RouteErrorBoundary>
            <AppRoutes />
          </RouteErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
