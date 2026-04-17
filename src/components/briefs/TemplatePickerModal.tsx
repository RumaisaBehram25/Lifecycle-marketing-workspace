import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useActiveClientRow, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Mail, 
  Bell, 
  Smartphone, 
  Check, 
  Library,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TemplatePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  contentType: 'campaign' | 'lifecycle';
  channels: string[];
}

interface Template {
  id: string;
  name: string;
  description?: string;
  channel: string;
  category?: string;
  subject_line?: string;
  preview_text?: string;
  source: 'library' | 'braze';
}

export function TemplatePickerModal({
  open,
  onOpenChange,
  selectedIds,
  onSelect,
  contentType,
  channels,
}: TemplatePickerModalProps) {
  const { data: client } = useActiveClientRow();
  const { data: platforms } = useDoubleGoodPlatforms();
  const [search, setSearch] = useState('');
  const [localSelected, setLocalSelected] = useState<string[]>(selectedIds);

  // Fetch curated templates
  const { data: libraryTemplates } = useQuery({
    queryKey: ['template-library', client?.id, contentType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_library')
        .select('*')
        .or(`client_id.eq.${client?.id},is_global.eq.true`)
        .eq('content_type', contentType);
      
      if (error) throw error;
      return (data || []).map(t => ({
        id: `lib-${t.id}`,
        name: t.name,
        description: t.description,
        channel: t.channel,
        category: t.category,
        subject_line: t.subject_line,
        preview_text: t.preview_text,
        source: 'library' as const,
      }));
    },
    enabled: !!client?.id && open,
  });

  // Get Braze templates from cache
  const brazeTemplates = useMemo((): Template[] => {
    const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
    const schemaCache = brazePlatform?.schema_cache as any;
    
    if (!schemaCache?.templates) return [];
    
    return schemaCache.templates.map((t: any) => ({
      id: `braze-${t.email_template_id}`,
      name: t.template_name,
      description: t.description,
      channel: 'email',
      subject_line: t.subject,
      preview_text: t.preheader,
      source: 'braze' as const,
    }));
  }, [platforms]);

  // Combine and filter templates
  const allTemplates = useMemo(() => {
    const combined = [...(libraryTemplates || []), ...brazeTemplates];
    
    return combined.filter(t => {
      const matchesSearch = 
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description?.toLowerCase().includes(search.toLowerCase()) ||
        t.subject_line?.toLowerCase().includes(search.toLowerCase());
      
      const matchesChannel = channels.length === 0 || channels.some(ch => {
        const normalizedCh = ch.toLowerCase().replace(/[-_]/g, '');
        const normalizedTCh = t.channel.toLowerCase().replace(/[-_]/g, '');
        return normalizedCh.includes(normalizedTCh) || normalizedTCh.includes(normalizedCh);
      });
      
      return matchesSearch && matchesChannel;
    });
  }, [libraryTemplates, brazeTemplates, search, channels]);

  const toggleTemplate = (id: string) => {
    setLocalSelected(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id) 
        : [...prev, id]
    );
  };

  const handleConfirm = () => {
    onSelect(localSelected);
    onOpenChange(false);
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email': return <Mail className="h-4 w-4 text-blue-500" />;
      case 'push': return <Bell className="h-4 w-4 text-orange-500" />;
      case 'inapp': return <Smartphone className="h-4 w-4 text-purple-500" />;
      default: return <Mail className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Template Inspiration
          </DialogTitle>
          <DialogDescription>
            Select templates to use as inspiration for your brief
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All ({allTemplates.length})</TabsTrigger>
            <TabsTrigger value="library">
              <Library className="h-3 w-3 mr-1" />
              Library ({libraryTemplates?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="braze">
              <Sparkles className="h-3 w-3 mr-1" />
              Braze ({brazeTemplates.length})
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="all" className="mt-0 space-y-2">
              {allTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Library className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No templates found</p>
                  <p className="text-xs mt-1">Try adjusting your search or add templates to your library</p>
                </div>
              ) : (
                allTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    selected={localSelected.includes(template.id)}
                    onToggle={() => toggleTemplate(template.id)}
                    getChannelIcon={getChannelIcon}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="library" className="mt-0 space-y-2">
              {(libraryTemplates || []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Library className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No curated templates yet</p>
                  <p className="text-xs mt-1">Add templates in the Brand tab</p>
                </div>
              ) : (
                libraryTemplates?.filter(t => 
                  t.name.toLowerCase().includes(search.toLowerCase()) ||
                  t.description?.toLowerCase().includes(search.toLowerCase())
                ).map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    selected={localSelected.includes(template.id)}
                    onToggle={() => toggleTemplate(template.id)}
                    getChannelIcon={getChannelIcon}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="braze" className="mt-0 space-y-2">
              {brazeTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No Braze templates synced</p>
                  <p className="text-xs mt-1">Sync Braze to see your templates here</p>
                </div>
              ) : (
                brazeTemplates.filter(t => 
                  t.name.toLowerCase().includes(search.toLowerCase()) ||
                  t.description?.toLowerCase().includes(search.toLowerCase())
                ).map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    selected={localSelected.includes(template.id)}
                    onToggle={() => toggleTemplate(template.id)}
                    getChannelIcon={getChannelIcon}
                  />
                ))
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex items-center justify-between pt-4 border-t">
          <span className="text-sm text-muted-foreground">
            {localSelected.length} selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm}>
              Confirm Selection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  template,
  selected,
  onToggle,
  getChannelIcon,
}: {
  template: Template;
  selected: boolean;
  onToggle: () => void;
  getChannelIcon: (channel: string) => React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary/50",
        selected && "border-primary bg-primary/5"
      )}
      onClick={onToggle}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
            selected ? "bg-primary text-primary-foreground" : "bg-muted"
          )}>
            {selected ? <Check className="h-5 w-5" /> : getChannelIcon(template.channel)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium truncate">{template.name}</h4>
              <Badge variant="outline" className="text-xs capitalize flex-shrink-0">
                {template.source}
              </Badge>
            </div>
            {template.subject_line && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {template.subject_line}
              </p>
            )}
            {template.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                {template.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-xs capitalize">
                {template.channel}
              </Badge>
              {template.category && (
                <Badge variant="outline" className="text-xs">
                  {template.category}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
