import { ReactNode, useState } from 'react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { FeedbackWidget } from './FeedbackWidget';

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored !== 'true';
  });

  const handleOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, (!open).toString());
  };

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleOpenChange}>
      <div className="flex min-h-screen w-full min-w-0">
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-col">
          {/* Top bar with trigger */}
          <header className="flex h-12 items-center gap-4 border-b border-border bg-card px-4">
            <SidebarTrigger className="-ml-1" />
          </header>

          {/* Page content — min-w-0 so nested flex pages (e.g. Resource Center) don’t force horizontal scroll */}
          <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </SidebarInset>
        
        <FeedbackWidget />
      </div>
    </SidebarProvider>
  );
}
