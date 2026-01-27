import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LoadingPage } from "@/components/ui/loading-spinner";
import Auth from "./pages/Auth";
import PendingApproval from "./pages/PendingApproval";
import Dashboard from "./pages/Dashboard";
import Brand from "./pages/Brand";
import Briefs from "./pages/Briefs";
import Audience from "./pages/Audience";
import Campaigns from "./pages/Campaigns";
import Lifecycle from "./pages/Lifecycle";
import Analytics from "./pages/Analytics";
import CodeGenerator from "./pages/CodeGenerator";
import KnowledgeBase from "./pages/KnowledgeBase";
import Settings from "./pages/Settings";
import Chat from "./pages/Chat";
import UserManagement from "./pages/UserManagement";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isApproved } = useAuth();
  if (isLoading) return <LoadingPage />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isApproved) return <Navigate to="/pending-approval" replace />;
  return <>{children}</>;
}

function ApprovalRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isApproved } = useAuth();
  if (isLoading) return <LoadingPage />;
  if (!user) return <Navigate to="/auth" replace />;
  if (isApproved) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/pending-approval" element={<ApprovalRoute><PendingApproval /></ApprovalRoute>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/brand" element={<ProtectedRoute><Brand /></ProtectedRoute>} />
      <Route path="/briefs" element={<ProtectedRoute><Briefs /></ProtectedRoute>} />
      <Route path="/audience" element={<ProtectedRoute><Audience /></ProtectedRoute>} />
      <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
      <Route path="/lifecycle" element={<ProtectedRoute><Lifecycle /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      <Route path="/generate/code" element={<ProtectedRoute><CodeGenerator /></ProtectedRoute>} />
      <Route path="/knowledge" element={<ProtectedRoute><KnowledgeBase /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
      {/* Redirect old routes */}
      <Route path="/clients" element={<Navigate to="/brand" replace />} />
      <Route path="/clients/:id" element={<Navigate to="/brand" replace />} />
      <Route path="/platforms" element={<Navigate to="/knowledge" replace />} />
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
