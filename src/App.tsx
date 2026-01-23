import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LoadingPage } from "@/components/ui/loading-spinner";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Brand from "./pages/Brand";
import Creative from "./pages/Creative";
import CodeGenerator from "./pages/CodeGenerator";
import KnowledgeBase from "./pages/KnowledgeBase";
import Settings from "./pages/Settings";
import Chat from "./pages/Chat";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingPage />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/brand" element={<ProtectedRoute><Brand /></ProtectedRoute>} />
      <Route path="/creative" element={<ProtectedRoute><Creative /></ProtectedRoute>} />
      <Route path="/generate/code" element={<ProtectedRoute><CodeGenerator /></ProtectedRoute>} />
      <Route path="/knowledge" element={<ProtectedRoute><KnowledgeBase /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      {/* Redirect old routes */}
      <Route path="/clients" element={<Navigate to="/brand" replace />} />
      <Route path="/clients/:id" element={<Navigate to="/brand" replace />} />
      <Route path="/platforms" element={<Navigate to="/knowledge" replace />} />
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
