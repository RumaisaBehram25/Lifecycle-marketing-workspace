import { ReactNode, useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { FeedbackWidget } from './FeedbackWidget';

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  // Read initial state from localStorage
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    // If stored as 'true', sidebar is collapsed, so open = false
    return stored !== 'true';
  });

  // Persist to localStorage when state changes
  const handleOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, (!open).toString());
  };

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleOpenChange}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          {/* Top bar with trigger */}
          <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="flex items-center gap-2 lg:hidden">
              <img 
                src="/logos/linktree-logo.png" 
                alt="Linktree" 
                className="h-8 w-8 rounded-lg object-contain"
              />
              <span className="font-bold text-lg">Linktree</span>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </SidebarInset>
        
        {/* Feedback Widget */}
        <FeedbackWidget />
      </div>
    </SidebarProvider>
  );
}
