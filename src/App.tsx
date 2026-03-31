import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LoadingPage } from "@/components/ui/loading-spinner";
import Auth from "./views/Auth";
import Dashboard from "./views/Dashboard";
import Briefs from "./views/Briefs";
import Campaigns from "./views/Campaigns";
import Lifecycle from "./views/Lifecycle";
import ResourceCenter from "./views/ResourceCenter";
import Onboarding from "./views/Onboarding";
import Settings from "./views/Settings";
import Chat from "./views/Chat";
import Analytics from "./views/Analytics";
import NotFound from "./views/NotFound";
import PendingApproval from "./views/PendingApproval";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Tab focus otherwise refetches every mounted query and can feel like a full reload.
      refetchOnWindowFocus: false,
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
      <Route path="/auth" element={<Auth />} />
      <Route path="/pending-approval" element={<ApprovalRoute />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/briefs" element={<ProtectedRoute><Briefs /></ProtectedRoute>} />
      <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
      <Route path="/lifecycle" element={<ProtectedRoute><Lifecycle /></ProtectedRoute>} />
      <Route path="/resources" element={<ProtectedRoute><ResourceCenter /></ProtectedRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      {/* Redirects for old routes */}
      <Route path="/brand" element={<Navigate to="/resources" replace />} />
      <Route path="/audience" element={<Navigate to="/resources" replace />} />
      <Route path="/knowledge" element={<Navigate to="/resources" replace />} />
      <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      <Route path="/analytical" element={<Navigate to="/analytics" replace />} />
      <Route path="/generate/code" element={<Navigate to="/resources" replace />} />
      <Route path="/users" element={<Navigate to="/settings" replace />} />
      <Route path="/clients" element={<Navigate to="/resources" replace />} />
      <Route path="/clients/:id" element={<Navigate to="/resources" replace />} />
      <Route path="/platforms" element={<Navigate to="/resources" replace />} />
      <Route path="/creative" element={<Navigate to="/lifecycle" replace />} />
      <Route path="*" element={<NotFound />} />
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
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
