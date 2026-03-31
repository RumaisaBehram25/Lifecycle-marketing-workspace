import { useState, useCallback } from 'react';
import { useActiveClientRow, useUpdateDoubleGoodClient } from '@/hooks/useDoubleGoodClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrandVoiceTab } from '@/components/brand/BrandVoiceTab';
import { DesignTab } from '@/components/brand/DesignTab';
import { RulesTab } from '@/components/brand/RulesTab';
import { 
  MessageSquare, 
  RefreshCw, 
  Volume2,
  Palette,
  Ruler,
  FileText
} from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ClientChat } from '@/components/chat/ClientChat';
import { useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function Brand() {
  const { data: client, isLoading: clientLoading, refetch: refetchClient } = useActiveClientRow();
  const updateClient = useUpdateDoubleGoodClient();
  const queryClient = useQueryClient();

  const [chatOpen, setChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('voice');

  const handleSaveAbout = useCallback(async (updates: any) => {
    await updateClient.mutateAsync(updates);
    refetchClient();
  }, [updateClient, refetchClient]);

  if (clientLoading) {
    return (
      <AppLayout>
        <LoadingPage />
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout>
        <div className="p-6 lg:p-8">
          <p>Failed to load brand. Please refresh.</p>
          <Button onClick={() => refetchClient()} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:flex w-52 flex-col border-r bg-muted/30">
          <div className="p-4 border-b">
            <h2 className="font-bold text-lg">CRM Brand Guide</h2>
            <p className="text-xs text-muted-foreground mt-1">Internal execution reference</p>
          </div>
          <ScrollArea className="flex-1">
            <nav className="p-3 space-y-1">
              <button
                onClick={() => setActiveTab('voice')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                  activeTab === 'voice'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Volume2 className="h-4 w-4" />
                Brand Voice
              </button>
              <button
                onClick={() => setActiveTab('design')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                  activeTab === 'design'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Palette className="h-4 w-4" />
                Design
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                  activeTab === 'rules'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Ruler className="h-4 w-4" />
                Rules
              </button>
            </nav>
          </ScrollArea>
          <div className="p-4 border-t">
            <Button 
              onClick={() => setChatOpen(true)} 
              className="w-full"
              variant="outline"
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Update with AI
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-6 lg:p-10">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
                  <span className="text-2xl">🍿</span>
                </div>
                <div>
                  <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Double Good</h1>
                  <p className="text-sm text-muted-foreground">CRM Brand Guidelines</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  Internal Use
                </Badge>
                <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setChatOpen(true)}>
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Mobile Tab Switcher */}
            <div className="lg:hidden mb-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="voice" className="flex-1">
                    <Volume2 className="h-4 w-4 mr-1" />
                    Voice
                  </TabsTrigger>
                  <TabsTrigger value="design" className="flex-1">
                    <Palette className="h-4 w-4 mr-1" />
                    Design
                  </TabsTrigger>
                  <TabsTrigger value="rules" className="flex-1">
                    <Ruler className="h-4 w-4 mr-1" />
                    Rules
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Tab Content */}
            {activeTab === 'voice' && (
              <BrandVoiceTab 
                client={{
                  brand_voice: client.brand_voice,
                  do_rules: Array.isArray(client.do_rules) ? client.do_rules as string[] : null,
                  dont_rules: Array.isArray(client.dont_rules) ? client.dont_rules as string[] : null,
                  value_propositions: Array.isArray((client as any).value_propositions) 
                    ? (client as any).value_propositions as string[] 
                    : null,
                  key_messaging_pillars: Array.isArray((client as any).key_messaging_pillars)
                    ? (client as any).key_messaging_pillars as string[]
                    : null,
                }}
              />
            )}

            {activeTab === 'design' && (
              <DesignTab clientId={client.id} />
            )}

            {activeTab === 'rules' && (
              <RulesTab clientId={client.id} />
            )}

            {/* Footer */}
            <div className="text-center py-8 border-t mt-12">
              <p className="text-sm text-muted-foreground">
                Last updated: {new Date().toLocaleDateString()}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setChatOpen(true)}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Update Guidelines with AI
              </Button>
            </div>
          </div>
        </main>
      </div>

      {/* Chat Drawer */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0">
          <ClientChat
            client={{
              id: client.id,
              name: client.name,
              brand_voice: client.brand_voice || undefined,
              do_rules: client.do_rules as string[] | undefined,
              dont_rules: client.dont_rules as string[] | undefined,
              tone_presets: client.tone_presets as string[] | undefined,
            }}
          />
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
