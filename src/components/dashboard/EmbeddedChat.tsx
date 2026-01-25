import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Send, ArrowRight, Loader2 } from 'lucide-react';
import { useLinktreeClient, useLinktreePlatforms } from '@/hooks/useLinktreeClient';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function EmbeddedChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const { data: client } = useLinktreeClient();
  const { data: platforms } = useLinktreePlatforms();

  const connectedPlatforms = platforms?.filter(p => p.is_connected) || [];
  const platformContexts = connectedPlatforms
    .filter(cp => cp.schema_cache)
    .map(cp => ({
      platform: cp.platform,
      events: ((cp.schema_cache as any)?.metrics?.map((m: any) => m.name) || []),
      lists: ((cp.schema_cache as any)?.lists?.map((l: any) => ({ name: l.name, count: l.profile_count })) || []),
      templates: ((cp.schema_cache as any)?.templates?.map((t: any) => t.name) || []),
      profile_properties: extractProfileProperties((cp.schema_cache as any)?.sample_profiles || []),
      segments: ((cp.schema_cache as any)?.segments?.map((s: any) => s.name) || []),
      last_sync_at: cp.last_sync_at || undefined,
    }));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !client) return;

    const userMessage = input.trim();
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    let assistantContent = '';

    try {
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
          toast({ title: 'Rate limit exceeded', variant: 'destructive' });
          throw new Error('Rate limited');
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

      if (assistantContent) {
        setMessages([...newMessages, { role: 'assistant', content: assistantContent }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      if ((error as Error).message !== 'Rate limited') {
        toast({ title: 'Chat error', description: 'Please try again.', variant: 'destructive' });
      }
      setMessages(newMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPrompts = [
    "What campaigns went out this week?",
    "Draft a welcome email subject line",
    "Summarize our brand voice",
    "What segments should I target for re-engagement?",
  ];

  if (!client) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading AI Chat...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[320px]">
      <CardHeader className="py-2 px-4 flex flex-row items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="h-3 w-3 text-primary-foreground" />
          </div>
          <CardTitle className="text-sm font-semibold">AI Chat</CardTitle>
        </div>
        <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
          <Link to="/chat">
            Open Full
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="py-3 space-y-3">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                Ask about campaigns, segments, or get copy suggestions
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {quickPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      setInput(prompt);
                    }}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown>
                        {msg.content || '...'}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-2 border-t">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            className="min-h-[36px] max-h-[60px] resize-none text-sm"
            rows={1}
          />
          <Button 
            size="icon" 
            onClick={handleSend} 
            disabled={!input.trim() || isLoading}
            className="h-9 w-9 flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function extractProfileProperties(sampleProfiles: any[]): string[] {
  const properties = new Set<string>();
  sampleProfiles.forEach(profile => {
    const extractProps = (obj: any, prefix = '') => {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach(key => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        properties.add(fullKey);
        if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          extractProps(obj[key], fullKey);
        }
      });
    };
    extractProps(profile);
  });
  return Array.from(properties);
}
