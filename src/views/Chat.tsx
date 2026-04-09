import { useSearchParams } from 'react-router-dom';
import { ClientChat } from '@/components/chat/ClientChat';
import { useClientForChat } from '@/hooks/useClientForChat';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Sparkles, AlertCircle } from 'lucide-react';
import { BRCGIcon } from '@/components/BRCGLogo';
import { getChatClientLoadHelp } from '@/lib/chatClientLoadError';

function ChatClientLoadAlert({
  loadError,
  onRetry,
}: {
  loadError: unknown;
  onRetry: () => void;
}) {
  const { detail, hints } = getChatClientLoadHelp(loadError);
  return (
    <Alert variant="destructive" className="text-left">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Could not load client</AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">{detail}</p>
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-2 text-left">
          {hints.map((hint, i) => (
            <li key={i}>{hint}</li>
          ))}
        </ul>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default function Chat() {
  const [searchParams] = useSearchParams();
  const initialConversationId = searchParams.get('conversation') || undefined;
  const {
    client,
    isLoading: clientLoading,
    platformContexts,
    hasPlatformConnections,
    loadError,
    refetch,
  } = useClientForChat();

  if (clientLoading) {
    return <LoadingPage />;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] lg:min-h-screen lg:h-screen bg-gradient-to-br from-sidebar via-background to-primary/[0.04]">
        <div className="flex-1 flex flex-col min-h-0 p-2 sm:p-3 md:p-4 overflow-hidden">
          {client ? (
            <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-border/70 bg-background/80 shadow-xl shadow-primary/[0.06] backdrop-blur-sm overflow-hidden">
            <ClientChat
              key={client.id}
              className="h-full min-h-0"
              client={{
                id: client.id,
                name: client.name,
                brand_voice: client.brand_voice || undefined,
                do_rules: client.do_rules as string[] | undefined,
                dont_rules: client.dont_rules as string[] | undefined,
                tone_presets: client.tone_presets as string[] | undefined,
                legal_requirements: client.legal_requirements || undefined,
              }}
              platformContext={platformContexts.length > 0 ? platformContexts : undefined}
              hasPlatformConnections={hasPlatformConnections}
              showHistory={true}
              initialConversationId={initialConversationId}
            />
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-dashed border-border/80 bg-card/40 backdrop-blur-sm">
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/60 bg-muted/20 rounded-t-2xl gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/25">
                    <Sparkles className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="text-left min-w-0">
                    <span className="font-heading font-bold text-base sm:text-lg truncate block">CRM Copilot</span>
                    <span className="text-xs text-muted-foreground">Select a client to start chatting</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
                <div className="max-w-lg w-full text-center space-y-8">
                  <div className="flex justify-center">
                    <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-primary/20 to-violet-500/20 flex items-center justify-center ring-1 ring-border/60 shadow-inner">
                      <BRCGIcon className="h-14 w-14 text-primary" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h1 className="text-4xl sm:text-5xl font-heading font-bold tracking-tight leading-snug pt-0.5 pb-0.5">
                      How can we help today?
                    </h1>
                    {loadError ? (
                      <ChatClientLoadAlert loadError={loadError} onRetry={() => refetch()} />
                    ) : (
                      <p className="text-muted-foreground leading-relaxed px-2">
                        Connect a client workspace to unlock CRM Copilot — on-brand copy, journeys, and lifecycle
                        answers grounded in your data.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
