import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Sparkles, Send, Globe, Mail, Bot, User, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import { logger } from '@/lib/logger';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface BrandDiscoveryChatProps {
  client: {
    id: string;
    name: string;
    website_url?: string | null;
    brand_voice?: string | null;
    tagline?: string | null;
    industry?: string | null;
    value_propositions?: any;
    differentiators?: any;
    target_audience?: any;
    key_messaging_pillars?: any;
    do_rules?: any;
    dont_rules?: any;
  };
  onRefreshClient: () => void;
}

const QUICK_QUESTIONS = [
  "What's the brand voice?",
  "Summarize the value props",
  "Who's the target audience?",
  "What makes this brand unique?",
];

export function BrandDiscoveryChat({ client, onRefreshClient }: BrandDiscoveryChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [discoveringBrand, setDiscoveringBrand] = useState(false);
  const [discoveringEmails, setDiscoveringEmails] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleDiscoverBrand = async () => {
    if (!client.website_url) {
      toast({
        title: 'No website URL',
        description: 'Please add a website URL first.',
        variant: 'destructive',
      });
      return;
    }

    setDiscoveringBrand(true);
    try {
      await supabase.functions.invoke('discover-brand', {
        body: {
          clientId: client.id,
          websiteUrl: client.website_url,
          clientName: client.name,
        },
      });

      toast({
        title: 'Brand discovered!',
        description: 'Brand guidelines have been updated.',
      });
      
      onRefreshClient();
    } catch (error) {
      toast({
        title: 'Discovery failed',
        description: error instanceof Error ? error.message : 'Failed to discover brand',
        variant: 'destructive',
      });
    } finally {
      setDiscoveringBrand(false);
    }
  };

  const handleDiscoverEmails = async () => {
    setDiscoveringEmails(true);
    try {
      const { data } = await supabase.functions.invoke('discover-emails', {
        body: {
          clientId: client.id,
          clientName: client.name,
        },
      });

      toast({
        title: 'Emails discovered!',
        description: `Found ${data?.found || 0} email examples.`,
      });
    } catch (error) {
      toast({
        title: 'Discovery failed',
        description: error instanceof Error ? error.message : 'Failed to discover emails',
        variant: 'destructive',
      });
    } finally {
      setDiscoveringEmails(false);
    }
  };

  const handleSend = async (message: string = input) => {
    if (!message.trim() || isLoading) return;
    
    const userMessage = message.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Build context from client data
      const clientContext = `
Client: ${client.name}
${client.tagline ? `Tagline: ${client.tagline}` : ''}
${client.industry ? `Industry: ${client.industry}` : ''}
${client.brand_voice ? `Brand Voice: ${client.brand_voice}` : ''}
${client.value_propositions ? `Value Propositions: ${JSON.stringify(client.value_propositions)}` : ''}
${client.differentiators ? `Differentiators: ${JSON.stringify(client.differentiators)}` : ''}
${client.target_audience ? `Target Audience: ${JSON.stringify(client.target_audience)}` : ''}
${client.key_messaging_pillars ? `Key Messaging: ${JSON.stringify(client.key_messaging_pillars)}` : ''}
${client.do_rules ? `Do's: ${JSON.stringify(client.do_rules)}` : ''}
${client.dont_rules ? `Don'ts: ${JSON.stringify(client.dont_rules)}` : ''}
      `.trim();

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

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ops-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              ...messages.map(m => ({ role: m.role, content: m.content })),
              { role: 'user', content: userMessage }
            ],
            client: {
              id: client.id,
              name: client.name,
              brand_voice: client.brand_voice,
            },
            systemContext: `You are a helpful brand assistant for ${client.name}. Answer questions about the brand based on this context:\n\n${clientContext}\n\nBe concise and helpful. If information isn't available, say so clearly.`,
          }),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error('Failed to get response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
            }
          } catch { /* skip unparseable */ }
        }
      }
    } catch (error) {
      logger.error('Chat error:', error);
      toast({
        title: 'Chat error',
        description: 'Failed to get a response.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Brand Discovery
            </CardTitle>
            <CardDescription className="mt-1">
              Discover brand guidelines or ask questions about {client.name}
            </CardDescription>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setExpanded(!expanded)}
            className="h-8 w-8 p-0"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={handleDiscoverBrand} 
            disabled={discoveringBrand || !client.website_url}
            variant="outline"
            size="sm"
          >
            {discoveringBrand ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Analyzing...
              </>
            ) : (
              <>
                <Globe className="mr-2 h-4 w-4" />
                Fetch Brand Guidelines
              </>
            )}
          </Button>
          <Button 
            onClick={handleDiscoverEmails} 
            disabled={discoveringEmails}
            variant="outline"
            size="sm"
          >
            {discoveringEmails ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Searching...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Find Email Examples
              </>
            )}
          </Button>
        </div>

        {!client.website_url && (
          <p className="text-xs text-muted-foreground">
            Add a website URL to enable brand discovery.
          </p>
        )}

        {/* Chat Section */}
        {expanded && (
          <div className="border rounded-lg bg-background">
            {/* Messages */}
            <ScrollArea className="h-64" ref={scrollRef}>
              <div className="p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Ask anything about {client.name}
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center mt-4">
                      {QUICK_QUESTIONS.map((q, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleSend(q)}
                        >
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i} className="flex gap-3">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'user' ? 'bg-muted' : 'bg-primary'
                      }`}>
                        {msg.role === 'user' ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4 text-primary-foreground" />
                        )}
                      </div>
                      <div className="flex-1 text-sm prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  ))
                )}
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <div className="flex gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <LoadingSpinner size="sm" />
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="border-t p-3">
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Ask about ${client.name}...`}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
