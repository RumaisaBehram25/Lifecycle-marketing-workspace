import { useState, useRef, useEffect, useMemo } from 'react';
import { differenceInHours } from 'date-fns';
import { ChatMessage } from './ChatMessage';
import { ChatInput, PlatformData } from './ChatInput';
import { ConversationList } from './ConversationList';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { X, Maximize2, Minimize2, PanelLeftClose, PanelLeft, AlertTriangle, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useClientConversations,
  useConversationMessages,
  useCreateConversation,
  useDeleteConversation,
  useSaveMessage,
  useUpdateConversationTitle,
  generateConversationTitle,
} from '@/hooks/useChatHistory';

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
}

const QUICK_PROMPTS = [
  "Write an abandoned cart email",
  "How do I build a browse abandonment flow?",
  "Suggest entry criteria for a welcome series",
  "What events do we have for segmentation?"
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
}: ClientChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(!isDrawer);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
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

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ops-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
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
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          toast({
            title: 'Rate limit exceeded',
            description: 'Please wait a moment and try again.',
            variant: 'destructive',
          });
          throw new Error('Rate limited');
        }
        if (response.status === 402) {
          toast({
            title: 'Credits required',
            description: 'Please add credits to continue using AI features.',
            variant: 'destructive',
          });
          throw new Error('Payment required');
        }
        throw new Error('Failed to get response');
      }

      if (!response.body) throw new Error('No response body');

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
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
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
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
            }
          } catch { /* ignore */ }
        }
      }

      if (assistantContent) {
        setMessages([...newMessages, { role: 'assistant', content: assistantContent }]);
        
        await saveMessage.mutateAsync({
          conversationId: conversationId!,
          role: 'assistant',
          content: assistantContent,
        });
      }

    } catch (error) {
      console.error('Chat error:', error);
      if ((error as Error).message !== 'Rate limited' && (error as Error).message !== 'Payment required') {
        toast({
          title: 'Chat error',
          description: 'Failed to get a response. Please try again.',
          variant: 'destructive',
        });
      }
      setMessages(newMessages);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Conversation History Sidebar - Dark themed like ChatGPT */}
      {showHistory && showSidebar && (
        <div className="hidden sm:block w-64 flex-shrink-0 bg-sidebar">
          <ConversationList
            conversations={conversations || []}
            selectedId={selectedConversationId || undefined}
            onSelect={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onDelete={handleDeleteConversation}
            isLoading={conversationsLoading}
          />
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0 bg-background">
        {/* Minimal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-3">
            {showHistory && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowSidebar(!showSidebar)}
                className="h-8 w-8"
              >
                {showSidebar ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeft className="h-4 w-4" />
                )}
              </Button>
            )}
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <div>
                <span className="font-heading font-bold text-sm">BRCG Copilot</span>
                <span className="text-muted-foreground text-sm ml-2">· {client.name}</span>
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

        {/* Messages - Centered container like ChatGPT */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="max-w-3xl mx-auto px-4 py-6">
            {messages.length === 0 ? (
              <div className="text-center py-16">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl font-heading font-bold mb-2">
                  How can I help with {client.name}?
                </h2>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  I can help you generate marketing copy, build customer journeys, suggest segmentation criteria, and answer platform questions.
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

        {/* Input - Centered with max width */}
        <div className="border-t bg-background">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <ChatInput
              onSend={streamChat}
              isLoading={isLoading}
              placeholder={`Message BRCG Copilot...`}
              quickPrompts={messages.length === 0 ? QUICK_PROMPTS : undefined}
              platformData={platformData}
              hasPlatformConnections={hasPlatformConnections}
              onSyncPlatform={onSyncPlatform}
              isSyncing={isSyncing}
            />
            <p className="text-xs text-center text-muted-foreground mt-3">
              BRCG Copilot uses AI to help you create on-brand content.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
