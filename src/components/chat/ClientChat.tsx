import { useState, useRef, useEffect, useMemo } from 'react';
import { differenceInHours } from 'date-fns';
import { ChatMessage } from './ChatMessage';
import { ChatInput, PlatformData } from './ChatInput';
import { ConversationList } from './ConversationList';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { X, Maximize2, Minimize2, PanelLeftClose, PanelLeft, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  useClientConversations,
  useConversationMessages,
  useCreateConversation,
  useDeleteConversation,
  useSaveMessage,
  useUpdateConversationTitle,
  generateConversationTitle,
} from '@/hooks/useChatHistory';

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  try {
    return JSON.stringify(error).slice(0, 280);
  } catch {
    return 'Something went wrong';
  }
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ClientContext {
  id: string;
  name: string;
  brand_voice?: string;
  do_rules?: string[];
  dont_rules?: string[];
  tone_presets?: string[];
  legal_requirements?: string;
}

interface PlatformContext {
  platform: string;
  events: string[];
  lists: Array<{ name: string; count?: number }>;
  templates: string[];
  profile_properties: string[];
  segments: string[];
  last_sync_at?: string;
}

interface ClientChatProps {
  client: ClientContext;
  platformContext?: PlatformContext | PlatformContext[];
  onClose?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  showHistory?: boolean;
  isDrawer?: boolean;
  hasPlatformConnections?: boolean;
  onSyncPlatform?: () => void;
  isSyncing?: boolean;
  initialConversationId?: string;
  /** Compact dashboard card — gradient header, tighter chrome */
  variant?: 'default' | 'embedded';
  quickPrompts?: string[];
  className?: string;
}

const QUICK_PROMPTS = [
  "Write an abandoned cart email",
  "How do I build a browse abandonment flow?",
  "Suggest entry criteria for a welcome series",
  "What events do we have for segmentation?"
];

const EMBEDDED_QUICK_PROMPTS = [
  'Give me a CRM workspace health check',
  'What should I tighten up in Resource Center?',
  'Draft a catchy re-engagement email hook',
  'Prioritize my briefs for this week',
];

export function ClientChat({ 
  client, 
  platformContext, 
  onClose, 
  isExpanded,
  onToggleExpand,
  showHistory = true,
  isDrawer = false,
  hasPlatformConnections = false,
  onSyncPlatform,
  isSyncing = false,
  initialConversationId,
  variant = 'default',
  quickPrompts: quickPromptsProp,
  className,
}: ClientChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialConversationId || null);
  const [showSidebar, setShowSidebar] = useState(!isDrawer);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => setIsNarrowViewport(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Hooks for persistence
  const { data: conversations, isLoading: conversationsLoading } = useClientConversations(client.id);
  const { data: savedMessages } = useConversationMessages(selectedConversationId || undefined);
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const saveMessage = useSaveMessage();
  const updateTitle = useUpdateConversationTitle();

  // Check for stale platform data
  const platformContexts = platformContext 
    ? (Array.isArray(platformContext) ? platformContext : [platformContext])
    : [];
  
  const stalePlatforms = platformContexts.filter(pc => {
    if (!pc.last_sync_at) return false;
    return differenceInHours(new Date(), new Date(pc.last_sync_at)) > 24;
  });

  // Aggregate platform data for chips
  const platformData: PlatformData = useMemo(() => {
    const events = new Set<string>();
    const listsMap = new Map<string, number>();
    const templates = new Set<string>();
    const profileProperties = new Set<string>();

    platformContexts.forEach(pc => {
      pc.events?.forEach(e => events.add(e));
      pc.lists?.forEach(l => {
        const existing = listsMap.get(l.name) || 0;
        listsMap.set(l.name, existing + (l.count || 0));
      });
      pc.templates?.forEach(t => templates.add(t));
      pc.profile_properties?.forEach(p => profileProperties.add(p));
    });

    return {
      events: Array.from(events),
      lists: Array.from(listsMap.entries()).map(([name, count]) => ({ name, count })),
      templates: Array.from(templates),
      profileProperties: Array.from(profileProperties),
    };
  }, [platformContexts]);

  // Sync with initialConversationId prop changes
  useEffect(() => {
    if (initialConversationId && initialConversationId !== selectedConversationId) {
      setSelectedConversationId(initialConversationId);
    }
  }, [initialConversationId]);

  // Load saved messages when conversation is selected
  useEffect(() => {
    if (savedMessages && savedMessages.length > 0) {
      setMessages(savedMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
    } else if (selectedConversationId) {
      setMessages([]);
    }
  }, [savedMessages, selectedConversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleNewConversation = () => {
    setSelectedConversationId(null);
    setMessages([]);
    setMobileHistoryOpen(false);
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setMobileHistoryOpen(false);
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation.mutateAsync({ conversationId: id, clientId: client.id });
      if (selectedConversationId === id) {
        setSelectedConversationId(null);
        setMessages([]);
      }
      toast({ title: 'Conversation deleted' });
    } catch (error) {
      toast({ title: 'Failed to delete conversation', variant: 'destructive' });
    }
  };

  const streamChat = async (userMessage: string) => {
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    let conversationId = selectedConversationId;
    let assistantContent = '';

    try {
      // Create new conversation if needed
      if (!conversationId) {
        const conv = await createConversation.mutateAsync({ 
          clientId: client.id,
          title: generateConversationTitle(userMessage),
        });
        conversationId = conv.id;
        setSelectedConversationId(conv.id);
      } else if (messages.length === 0) {
        await updateTitle.mutateAsync({
          conversationId,
          title: generateConversationTitle(userMessage),
        });
      }

      // Save user message
      await saveMessage.mutateAsync({
        conversationId,
        role: 'user',
        content: userMessage,
      });

      // Get the current session token for authenticated edge function calls
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: 'Authentication required',
          description: 'Please log in to use the chat feature.',
          variant: 'destructive',
        });
        throw new Error('Not authenticated');
      }

      // Force this request's Bearer to the user access_token. The SDK otherwise falls back to the
      // publishable key when the session isn't ready yet, which makes ops-chat see a non-user JWT.
      const { data: streamData, error: invokeError } = await supabase.functions.invoke('ops-chat', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          client: {
            id: client.id,
            name: client.name,
            brand_voice: client.brand_voice,
            do_rules: client.do_rules,
            dont_rules: client.dont_rules,
            tone_presets: client.tone_presets,
            legal_requirements: client.legal_requirements,
          },
          platformContext: platformContexts,
        },
      });

      if (invokeError) {
        let detail = invokeError.message || 'Request failed';
        if (invokeError instanceof FunctionsHttpError && invokeError.context) {
          try {
            const t = await invokeError.context.text();
            try {
              const j = JSON.parse(t) as { error?: string | { message?: string }; message?: string };
              const e = j.error;
              detail =
                typeof e === 'string'
                  ? e
                  : typeof e === 'object' && e?.message
                    ? e.message
                    : j.message || t.slice(0, 400);
            } catch {
              if (t) detail = t.slice(0, 400);
            }
          } catch { /* ignore */ }
          const status = invokeError.context.status;
          if (status === 429) {
            toast({
              title: 'Rate limit exceeded',
              description: 'Please wait a moment and try again.',
              variant: 'destructive',
            });
            throw new Error('Rate limited');
          }
          if (status === 402) {
            toast({
              title: 'Credits required',
              description: 'Please add credits to continue using AI features.',
              variant: 'destructive',
            });
            throw new Error('Payment required');
          }
        } else if (invokeError instanceof FunctionsFetchError) {
          detail =
            'Could not reach the ops-chat Edge Function. Common causes: (1) ops-chat is not deployed to this Supabase project — run `supabase functions deploy ops-chat` (browsers often show this as a network error when the function is missing); (2) wrong VITE_SUPABASE_URL vs project; (3) VPN/firewall blocking *.supabase.co.';
        } else if (invokeError instanceof FunctionsRelayError) {
          detail =
            'Supabase could not reach the Edge Function (relay error). Try again, or redeploy ops-chat from the dashboard / CLI.';
        } else {
          detail = formatUnknownError(invokeError);
        }
        toast({
          title: 'Chat error',
          description: detail,
          variant: 'destructive',
        });
        throw new Error('__CHAT_HTTP_SHOWN__');
      }

      const response = streamData instanceof Response ? streamData : null;
      if (!response?.body) {
        toast({
          title: 'Chat error',
          description: 'Unexpected response from ops-chat (expected a streamed reply).',
          variant: 'destructive',
        });
        throw new Error('__CHAT_HTTP_SHOWN__');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      setMessages([...newMessages, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;
            let chunk = '';
            if (typeof delta?.content === 'string') chunk = delta.content;
            else if (Array.isArray(delta?.content)) {
              chunk = delta.content.map((p: { text?: string }) => p?.text || '').join('');
            }
            if (chunk) {
              assistantContent += chunk;
              setMessages([...newMessages, { role: 'assistant', content: assistantContent }]);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;
            let chunk = '';
            if (typeof delta?.content === 'string') chunk = delta.content;
            else if (Array.isArray(delta?.content)) {
              chunk = delta.content.map((p: { text?: string }) => p?.text || '').join('');
            }
            if (chunk) assistantContent += chunk;
          } catch { /* ignore */ }
        }
      }

      if (assistantContent.trim()) {
        setMessages([...newMessages, { role: 'assistant', content: assistantContent }]);
        
        await saveMessage.mutateAsync({
          conversationId: conversationId!,
          role: 'assistant',
          content: assistantContent,
        });
      } else {
        toast({
          title: 'No reply text',
          description: 'The model streamed an empty message. Check Edge Function secrets (XAI_API_KEY) and redeploy ops-chat.',
          variant: 'destructive',
        });
        setMessages(newMessages);
      }

    } catch (error) {
      logger.error('Chat error:', error);
      const msg = formatUnknownError(error);
      if (msg === '__CHAT_HTTP_SHOWN__') {
        setMessages(newMessages);
        return;
      }
      if (msg !== 'Rate limited' && msg !== 'Payment required') {
        toast({
          title: 'Chat error',
          description: msg.length > 220 ? `${msg.slice(0, 220)}…` : msg,
          variant: 'destructive',
        });
      }
      setMessages(newMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const effectiveQuickPrompts = quickPromptsProp ?? (variant === 'embedded' ? EMBEDDED_QUICK_PROMPTS : QUICK_PROMPTS);

  const historySidebar = showHistory && showSidebar && (
    <div className="hidden sm:flex w-[min(100%,18rem)] flex-shrink-0 flex-col min-h-0 border-r border-border/70 bg-sidebar/95 backdrop-blur-md shadow-[inset_-1px_0_0_0_hsl(var(--border)/0.5)] h-full">
      <ConversationList
        conversations={conversations || []}
        selectedId={selectedConversationId || undefined}
        onSelect={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDelete={handleDeleteConversation}
        isLoading={conversationsLoading}
      />
    </div>
  );

  return (
    <div className={cn('flex h-full min-h-0', className)}>
      {historySidebar}

      {showHistory && isNarrowViewport && (
        <Sheet open={mobileHistoryOpen} onOpenChange={setMobileHistoryOpen}>
          <SheetContent
            side="left"
            className="w-[min(100vw,20rem)] p-0 gap-0 border-sidebar-border bg-sidebar h-full flex flex-col"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Chat history</SheetTitle>
            </SheetHeader>
            <ConversationList
              conversations={conversations || []}
              selectedId={selectedConversationId || undefined}
              onSelect={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onDelete={handleDeleteConversation}
              isLoading={conversationsLoading}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Main Chat Area */}
      <div
        className={cn(
          'flex flex-col flex-1 min-w-0',
          variant === 'default' && 'bg-gradient-to-b from-background via-background to-muted/[0.35]'
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between px-4 py-3.5 border-b shrink-0',
            variant === 'embedded'
              ? 'border-primary/15 bg-gradient-to-r from-primary/[0.07] via-background to-violet-500/[0.06]'
              : 'border-border/80 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70'
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            {showHistory && variant !== 'embedded' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  isNarrowViewport ? setMobileHistoryOpen(true) : setShowSidebar(!showSidebar)
                }
                className="h-9 w-9 rounded-xl shrink-0"
                aria-label={isNarrowViewport ? 'Open chat history' : showSidebar ? 'Hide sidebar' : 'Show sidebar'}
              >
                {isNarrowViewport ? (
                  <PanelLeft className="h-4 w-4" />
                ) : showSidebar ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeft className="h-4 w-4" />
                )}
              </Button>
            )}
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={cn(
                  'h-7 w-7 rounded-lg flex items-center justify-center shrink-0',
                  variant === 'embedded'
                    ? 'bg-gradient-to-br from-primary to-violet-600 text-primary-foreground shadow-md shadow-primary/25'
                    : 'bg-primary text-primary-foreground'
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <span
                  className={cn(
                    'font-heading font-bold text-sm',
                    variant === 'embedded' && 'bg-gradient-to-r from-primary to-violet-600 bg-clip-text text-transparent'
                  )}
                >
                  CRM Copilot
                </span>
                <span className="text-muted-foreground text-sm ml-2 truncate">· {client.name}</span>
                {variant === 'default' && (
                  <p className="text-[11px] text-muted-foreground/90 font-normal mt-0.5 truncate">
                    {isNarrowViewport
                      ? 'AI workspace assistant · tap the menu for chat history'
                      : 'AI workspace assistant · conversations saved to your account'}
                  </p>
                )}
                {variant === 'embedded' && (
                  <p className="text-[11px] text-muted-foreground font-normal mt-0.5 truncate">
                    AI-powered · Chats saved to your account
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            {onToggleExpand && (
              <Button variant="ghost" size="icon" onClick={onToggleExpand} className="h-8 w-8">
                {isExpanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Stale Data Warning */}
        {stalePlatforms.length > 0 && (
          <div className="mx-4 mt-3 p-2.5 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
            <p className="text-xs text-warning">
              Platform data for {stalePlatforms.map(p => p.platform).join(', ')} is over 24 hours old.
            </p>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            {messages.length === 0 ? (
              <div className={cn('text-center', variant === 'embedded' ? 'py-8' : 'py-12 sm:py-20')}>
                <div
                  className={cn(
                    'rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg',
                    variant === 'embedded'
                      ? 'h-11 w-11 bg-gradient-to-br from-primary/20 to-violet-500/20 ring-1 ring-primary/20'
                      : 'h-16 w-16 bg-gradient-to-br from-primary/15 via-violet-500/10 to-background ring-1 ring-border/60'
                  )}
                >
                  <Sparkles className={cn('text-primary', variant === 'embedded' ? 'h-5 w-5' : 'h-8 w-8')} />
                </div>
                <h2 className="text-xl sm:text-2xl font-heading font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
                  {variant === 'embedded'
                    ? `Hey — let’s sharpen ${client.name}’s CRM`
                    : `How can I help with ${client.name}?`}
                </h2>
                <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto leading-relaxed">
                  {variant === 'embedded'
                    ? 'I read your briefs, Drive sync, brand voice, and connected platforms (when synced). Ask for analysis, copy, or priorities.'
                    : 'Generate on-brand copy, plan journeys, segmentation, and platform answers — grounded in your workspace when data is synced.'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg, i) => (
                  <ChatMessage
                    key={i}
                    role={msg.role}
                    content={msg.content}
                    isStreaming={isLoading && i === messages.length - 1 && msg.role === 'assistant'}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border/80 bg-muted/20 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
            <ChatInput
              onSend={streamChat}
              isLoading={isLoading}
              placeholder={variant === 'embedded' ? 'Ask anything about your CRM…' : 'Message CRM Copilot...'}
              quickPrompts={messages.length === 0 ? effectiveQuickPrompts : undefined}
              platformData={platformData}
              hasPlatformConnections={hasPlatformConnections}
              onSyncPlatform={onSyncPlatform}
              isSyncing={isSyncing}
            />
            <p className="text-xs text-center text-muted-foreground mt-3">
              {variant === 'embedded'
                ? 'Replies use live workspace data when available. Conversations are stored securely.'
                : 'CRM Copilot uses AI to help you create on-brand lifecycle marketing.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
