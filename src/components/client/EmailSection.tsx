import { useState, useRef, useEffect } from 'react';
import { sanitizeBrazeEmailHtmlForIframe } from '@/lib/sanitizeBrazeEmailIframe';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Mail, 
  Plus, 
  Search, 
  ShoppingCart, 
  Heart, 
  UserPlus, 
  Package, 
  Clock, 
  Star,
  Eye,
  Folder,
  FolderOpen,
  ChevronRight,
  ArrowLeft,
  Megaphone,
  Send,
  Sparkles,
  Loader2,
  Copy,
  Check
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface Email {
  id: string;
  name: string;
  category: 'lifecycle' | 'campaign';
  flow?: string;
  month?: string;
  channel: 'email' | 'sms' | 'push';
  subject?: string;
  previewText?: string;
  thumbnailUrl?: string;
  htmlContent?: string;
  status: 'live' | 'draft' | 'archived';
  sentAt?: string;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  generatedEmail?: {
    subject_lines: string[];
    preheader: string;
    body: string;
    cta: string[];
  };
}

interface EmailSectionProps {
  clientId: string;
  clientName: string;
  client?: any;
}

const FLOW_TYPES = [
  { id: 'welcome', name: 'Welcome Series', icon: UserPlus, color: 'bg-green-500' },
  { id: 'abandoned_cart', name: 'Abandoned Cart', icon: ShoppingCart, color: 'bg-orange-500' },
  { id: 'browse_abandonment', name: 'Browse Abandonment', icon: Eye, color: 'bg-yellow-500' },
  { id: 'post_purchase', name: 'Post Purchase', icon: Package, color: 'bg-blue-500' },
  { id: 'winback', name: 'Win-Back', icon: Heart, color: 'bg-red-500' },
  { id: 'birthday', name: 'Birthday/Anniversary', icon: Star, color: 'bg-purple-500' },
  { id: 'replenishment', name: 'Replenishment', icon: Clock, color: 'bg-teal-500' },
];

const generateMonths = () => {
  const months: { id: string; name: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      id: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      name: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    });
  }
  return months;
};

const MONTHS = generateMonths();

const SAMPLE_EMAILS: Email[] = [];

export function EmailSection({ clientId, clientName, client }: EmailSectionProps) {
  const [emails, setEmails] = useState<Email[]>(SAMPLE_EMAILS);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<'lifecycle' | 'campaign'>('lifecycle');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [previewEmail, setPreviewEmail] = useState<Email | null>(null);
  const { toast } = useToast();

  // Chat state for email creation
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const filteredEmails = emails.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
                          e.subject?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = e.category === activeCategory;
    const matchesFolder = !selectedFolder || 
      (activeCategory === 'lifecycle' ? e.flow === selectedFolder : e.month === selectedFolder);
    return matchesSearch && matchesCategory && matchesFolder;
  });

  const getGroupedEmails = () => {
    if (activeCategory === 'lifecycle') {
      return FLOW_TYPES.reduce((acc, flow) => {
        acc[flow.id] = emails.filter(e => e.category === 'lifecycle' && e.flow === flow.id);
        return acc;
      }, {} as Record<string, Email[]>);
    } else {
      return MONTHS.reduce((acc, month) => {
        acc[month.id] = emails.filter(e => e.category === 'campaign' && e.month === month.id);
        return acc;
      }, {} as Record<string, Email[]>);
    }
  };

  const groupedEmails = getGroupedEmails();

  const handleOpenCreateDialog = () => {
    setChatMessages([{
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Hi! I'm here to help you create email copy for ${clientName}. Tell me what kind of email you'd like to create.\n\nFor example:\n• "Create a welcome email for new subscribers"\n• "Write an abandoned cart reminder"\n• "Draft a win-back email for lapsed customers"`,
    }]);
    setCreateDialogOpen(true);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isGenerating) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: chatInput.trim(),
    };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-copy', {
        body: {
          input: {
            channel: 'email',
            platform: 'klaviyo',
            audience_stage: 'active',
            goal: chatInput.trim(),
            tone: 'brand',
            cta_type: 'action',
            additional_context: `User request: ${chatInput.trim()}`,
          },
          client: client || { id: clientId, name: clientName },
        },
      });

      if (error) throw error;

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "Here's the email copy I've generated based on your request:",
        generatedEmail: {
          subject_lines: data.subject_lines || [],
          preheader: data.preheader || '',
          body: data.body || '',
          cta: data.cta || [],
        },
      };
      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      logger.error('Generation error:', error);
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "I encountered an error generating the email. Please try again or rephrase your request.",
      };
      setChatMessages(prev => [...prev, errorMessage]);
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: 'Copied to clipboard' });
  };

  const handleSaveEmail = (generatedEmail: ChatMessage['generatedEmail']) => {
    if (!generatedEmail) return;
    
    const email: Email = {
      id: crypto.randomUUID(),
      name: generatedEmail.subject_lines[0] || 'New Email',
      category: activeCategory,
      flow: activeCategory === 'lifecycle' ? selectedFolder || 'welcome' : undefined,
      month: activeCategory === 'campaign' ? selectedFolder || MONTHS[0]?.id : undefined,
      channel: 'email',
      subject: generatedEmail.subject_lines[0],
      previewText: generatedEmail.preheader,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    
    setEmails(prev => [...prev, email]);
    setCreateDialogOpen(false);
    setChatMessages([]);
    toast({ title: 'Email saved to library' });
  };

  const handleBackToFolders = () => {
    setSelectedFolder(null);
  };

  const renderFolderView = () => {
    if (activeCategory === 'lifecycle') {
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FLOW_TYPES.map(folder => {
            const count = groupedEmails[folder.id]?.length || 0;
            
            return (
              <Card 
                key={folder.id}
                className="group cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
                onClick={() => setSelectedFolder(folder.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-12 w-12 rounded-xl ${folder.color} flex items-center justify-center`}>
                      {count > 0 ? (
                        <FolderOpen className="h-6 w-6 text-white" />
                      ) : (
                        <Folder className="h-6 w-6 text-white/70" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{folder.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {count} {count === 1 ? 'email' : 'emails'}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      );
    }
    
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MONTHS.map(month => {
          const count = groupedEmails[month.id]?.length || 0;
          
          return (
            <Card 
              key={month.id}
              className="group cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
              onClick={() => setSelectedFolder(month.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
                    {count > 0 ? (
                      <FolderOpen className="h-6 w-6 text-white" />
                    ) : (
                      <Folder className="h-6 w-6 text-white/70" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{month.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {count} {count === 1 ? 'email' : 'emails'}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderEmailGrid = () => {
    const lifecycleInfo = FLOW_TYPES.find(f => f.id === selectedFolder);
    const monthInfo = MONTHS.find(m => m.id === selectedFolder);
    const folderName = activeCategory === 'lifecycle' ? lifecycleInfo?.name : monthInfo?.name;
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackToFolders}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            {activeCategory === 'lifecycle' && lifecycleInfo && (
              <div className={`h-8 w-8 rounded-lg ${lifecycleInfo.color} flex items-center justify-center`}>
                <lifecycleInfo.icon className="h-4 w-4 text-white" />
              </div>
            )}
            <h3 className="font-heading font-bold">{folderName}</h3>
            <Badge variant="secondary">{filteredEmails.length} emails</Badge>
          </div>
        </div>

        {filteredEmails.length > 0 ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredEmails.map(email => (
              <EmailCard 
                key={email.id} 
                email={email} 
                onPreview={() => setPreviewEmail(email)}
              />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12">
              <EmptyState
                icon={Mail}
                title="No emails in this folder"
                description={`Add your first ${activeCategory === 'lifecycle' ? 'lifecycle email' : 'campaign'} to this folder.`}
                action={
                  <Button onClick={handleOpenCreateDialog}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Create with AI
                  </Button>
                }
              />
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Email Library
              </CardTitle>
              <CardDescription>
                Browse lifecycle flows and campaign emails organized by folder.
              </CardDescription>
            </div>
            <Button onClick={handleOpenCreateDialog} className="w-full sm:w-auto">
              <Sparkles className="mr-2 h-4 w-4" />
              Create Email
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={(v) => { setActiveCategory(v as 'lifecycle' | 'campaign'); setSelectedFolder(null); }}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="lifecycle" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Lifecycle
          </TabsTrigger>
          <TabsTrigger value="campaign" className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Campaigns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lifecycle" className="mt-6">
          {selectedFolder ? renderEmailGrid() : renderFolderView()}
        </TabsContent>

        <TabsContent value="campaign" className="mt-6">
          {selectedFolder ? renderEmailGrid() : renderFolderView()}
        </TabsContent>
      </Tabs>

      {/* Create Email Chat Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Create Email with AI
            </DialogTitle>
            <DialogDescription>
              Chat to generate email copy for {clientName}
            </DialogDescription>
          </DialogHeader>
          
          {/* Chat Messages */}
          <ScrollArea className="flex-1 px-6">
            <div className="space-y-4 py-4">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'} rounded-xl p-4`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    
                    {/* Generated Email Display */}
                    {msg.generatedEmail && (
                      <div className="mt-4 space-y-3 bg-background rounded-lg p-4 border">
                        {/* Subject Lines */}
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Subject Lines</span>
                          </div>
                          {msg.generatedEmail.subject_lines.map((subj, i) => (
                            <div key={i} className="flex items-center justify-between mt-1 group">
                              <p className="text-sm font-medium">{subj}</p>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                onClick={() => handleCopy(subj, `subject-${i}`)}
                              >
                                {copiedField === `subject-${i}` ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                        
                        {/* Preheader */}
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Preheader</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleCopy(msg.generatedEmail!.preheader, 'preheader')}
                            >
                              {copiedField === 'preheader' ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                          <p className="text-sm mt-1">{msg.generatedEmail.preheader}</p>
                        </div>
                        
                        {/* Body */}
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Body</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleCopy(msg.generatedEmail!.body, 'body')}
                            >
                              {copiedField === 'body' ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                          <p className="text-sm mt-1 whitespace-pre-wrap">{msg.generatedEmail.body}</p>
                        </div>
                        
                        {/* CTAs */}
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">CTAs</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {msg.generatedEmail.cta.map((cta, i) => (
                              <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => handleCopy(cta, `cta-${i}`)}>
                                {cta}
                                {copiedField === `cta-${i}` && <Check className="h-3 w-3 ml-1" />}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        {/* Save Button */}
                        <Button 
                          size="sm" 
                          className="w-full mt-2"
                          onClick={() => handleSaveEmail(msg.generatedEmail)}
                        >
                          Save to Library
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isGenerating && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-xl p-4 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Generating email copy...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
          
          {/* Chat Input */}
          <div className="p-4 border-t">
            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Describe the email you want to create..."
                disabled={isGenerating}
                className="flex-1"
              />
              <Button type="submit" disabled={!chatInput.trim() || isGenerating}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewEmail} onOpenChange={() => setPreviewEmail(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewEmail?.name}</DialogTitle>
            <DialogDescription>
              {previewEmail?.subject && (
                <span className="block">Subject: {previewEmail.subject}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto border rounded-lg bg-white min-h-[400px]">
            {previewEmail?.htmlContent ? (
              <iframe
                srcDoc={sanitizeBrazeEmailHtmlForIframe(previewEmail.htmlContent)}
                className="w-full h-full min-h-[500px]"
                title="Email Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No preview available</p>
                  <p className="text-sm">Add HTML content to enable preview</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmailCard({ email, onPreview }: { email: Email; onPreview: () => void }) {
  return (
    <Card 
      className="group cursor-pointer hover:border-primary/50 hover:shadow-md transition-all overflow-hidden"
      onClick={onPreview}
    >
      <div className="aspect-[4/3] bg-muted border-b relative overflow-hidden">
        {email.thumbnailUrl ? (
          <img 
            src={email.thumbnailUrl} 
            alt={email.name}
            className="w-full h-full object-cover object-top"
          />
        ) : email.htmlContent ? (
          <iframe
            srcDoc={sanitizeBrazeEmailHtmlForIframe(email.htmlContent)}
            className="w-full h-full pointer-events-none scale-50 origin-top-left"
            style={{ width: '200%', height: '200%' }}
            title="Preview"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Mail className="h-8 w-8 text-muted-foreground/50" />
          </div>
        )}
        
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Button variant="secondary" size="sm">
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
        </div>
      </div>
      
      <CardContent className="p-3">
        <p className="font-medium text-sm truncate">{email.name}</p>
        {email.subject && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{email.subject}</p>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <Badge 
            variant={email.status === 'live' ? 'default' : 'secondary'} 
            className="text-xs"
          >
            {email.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
