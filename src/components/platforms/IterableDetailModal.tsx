import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  List, Mail, Megaphone, Radio, Calendar, Hash, Clock,
  Copy, Check, Code, Eye, Users
} from 'lucide-react';
import { toast } from 'sonner';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

interface IterableDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'list' | 'channel' | 'campaign' | 'template';
  data: any;
}

export function IterableDetailModal({ open, onOpenChange, type, data }: IterableDetailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  const formatDate = (date?: string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopied(false), 2000);
  };

  const InfoRow = ({ icon: Icon, label, value, mono = false, copyable = false }: {
    icon: any;
    label: string;
    value: string | number | undefined;
    mono?: boolean;
    copyable?: boolean;
  }) => (
    <div className="flex items-start gap-3 py-2">
      <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-2">
          <p className={`font-medium truncate ${mono ? 'font-mono text-xs' : ''}`}>
            {value ?? 'N/A'}
          </p>
          {copyable && value && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={() => copyToClipboard(String(value), label)}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const renderList = () => (
    <ScrollArea className="h-[60vh]">
      <div className="space-y-6 pr-4">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-green-500/10 to-transparent rounded-xl">
          <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center ring-2 ring-green-500/30">
            <List className="h-8 w-8 text-green-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-xl">{data.name}</h3>
            {data.subscriberCount !== undefined && (
              <Badge variant="secondary" className="mt-1">
                <Users className="h-3 w-3 mr-1" />
                {data.subscriberCount?.toLocaleString()} subscribers
              </Badge>
            )}
          </div>
        </div>

        {/* List Info */}
        <div className="space-y-1 bg-card border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3">List Details</h4>
          <InfoRow icon={Hash} label="List ID" value={data.id} mono copyable />
          <InfoRow icon={List} label="List Type" value={data.listType} />
          <InfoRow icon={Calendar} label="Created" value={formatDate(data.createdAt)} />
        </div>

        {/* Description */}
        {data.description && (
          <div className="space-y-1 bg-card border rounded-xl p-4">
            <h4 className="font-medium text-sm mb-3">Description</h4>
            <p className="text-sm text-muted-foreground">{data.description}</p>
          </div>
        )}

        {/* Raw Data */}
        <div className="space-y-1 bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">Raw Metadata</h4>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => copyToClipboard(JSON.stringify(data, null, 2), 'Metadata')}
            >
              <Copy className="h-3 w-3 mr-1" /> Copy JSON
            </Button>
          </div>
          <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto font-mono break-all whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    </ScrollArea>
  );

  const renderChannel = () => (
    <ScrollArea className="h-[60vh]">
      <div className="space-y-6 pr-4">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-500/10 to-transparent rounded-xl">
          <div className="h-16 w-16 rounded-full bg-blue-500/20 flex items-center justify-center ring-2 ring-blue-500/30">
            <Radio className="h-8 w-8 text-blue-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-xl">{data.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{data.channelType || 'Channel'}</Badge>
              {data.messageMedium && (
                <Badge variant="secondary">{data.messageMedium}</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Channel Info */}
        <div className="space-y-1 bg-card border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3">Channel Details</h4>
          <InfoRow icon={Hash} label="Channel ID" value={data.id} mono copyable />
          <InfoRow icon={Radio} label="Channel Type" value={data.channelType} />
          <InfoRow icon={Mail} label="Message Medium" value={data.messageMedium} />
        </div>

        {/* Raw Data */}
        <div className="space-y-1 bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">Raw Metadata</h4>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => copyToClipboard(JSON.stringify(data, null, 2), 'Metadata')}
            >
              <Copy className="h-3 w-3 mr-1" /> Copy JSON
            </Button>
          </div>
          <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto font-mono break-all whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    </ScrollArea>
  );

  const renderCampaign = () => (
    <ScrollArea className="h-[60vh]">
      <div className="space-y-6 pr-4">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-500/10 to-transparent rounded-xl">
          <div className="h-16 w-16 rounded-full bg-purple-500/20 flex items-center justify-center ring-2 ring-purple-500/30">
            <Megaphone className="h-8 w-8 text-purple-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-xl">{data.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{data.type || 'Campaign'}</Badge>
              {data.campaignState && (
                <Badge 
                  variant={data.campaignState === 'Running' ? 'default' : 'secondary'}
                  className={data.campaignState === 'Running' ? 'bg-green-500' : ''}
                >
                  {data.campaignState}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Campaign Info */}
        <div className="space-y-1 bg-card border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3">Campaign Details</h4>
          <InfoRow icon={Hash} label="Campaign ID" value={data.id} mono copyable />
          <InfoRow icon={Megaphone} label="Campaign Type" value={data.type} />
          <InfoRow icon={Mail} label="Message Medium" value={data.messageMedium} />
          <InfoRow icon={Calendar} label="Created" value={formatDate(data.createdAt)} />
          <InfoRow icon={Clock} label="Updated" value={formatDate(data.updatedAt)} />
        </div>

        {/* Campaign Stats */}
        {(data.sendSize !== undefined || data.labels) && (
          <div className="space-y-1 bg-card border rounded-xl p-4">
            <h4 className="font-medium text-sm mb-3">Stats & Labels</h4>
            {data.sendSize !== undefined && (
              <InfoRow icon={Users} label="Send Size" value={data.sendSize?.toLocaleString()} />
            )}
            {data.labels && data.labels.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {data.labels.map((label: string, i: number) => (
                  <Badge key={i} variant="outline">{label}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Raw Data */}
        <div className="space-y-1 bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">Raw Metadata</h4>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => copyToClipboard(JSON.stringify(data, null, 2), 'Metadata')}
            >
              <Copy className="h-3 w-3 mr-1" /> Copy JSON
            </Button>
          </div>
          <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto font-mono break-all whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    </ScrollArea>
  );

  const renderTemplate = () => (
    <div className="flex flex-col h-[70vh]">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-orange-500/10 to-transparent rounded-xl mb-4">
        <div className="h-14 w-14 rounded-full bg-orange-500/20 flex items-center justify-center ring-2 ring-orange-500/30">
          <Mail className="h-7 w-7 text-orange-500" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{data.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{data.templateType || 'Template'}</Badge>
            <Badge variant="secondary">{data.messageMedium || 'Email'}</Badge>
          </div>
        </div>
      </div>

      {/* Template ID and dates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Template ID</p>
          <div className="flex items-center gap-1">
            <p className="font-mono text-xs truncate">{data.templateId}</p>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(String(data.templateId), 'Template ID')}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="text-sm font-medium">{formatDate(data.createdAt)}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Updated</p>
          <p className="text-sm font-medium">{formatDate(data.updatedAt)}</p>
        </div>
      </div>

      {/* Template content tabs */}
      {data.html ? (
        <Tabs defaultValue="preview" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="preview" className="gap-2">
              <Eye className="h-4 w-4" /> Preview
            </TabsTrigger>
            <TabsTrigger value="html" className="gap-2">
              <Code className="h-4 w-4" /> HTML Code
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-2">
              <Mail className="h-4 w-4" /> Plain Text
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="preview" className="flex-1 mt-4 min-h-0">
            <div className="h-full border rounded-lg overflow-hidden bg-white">
              <iframe 
                srcDoc={sanitizeHtml(data.html)} 
                className="w-full h-full"
                sandbox=""
                title="Template Preview"
              />
            </div>
          </TabsContent>
          
          <TabsContent value="html" className="flex-1 mt-4 min-h-0">
            <div className="h-full flex flex-col border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted border-b">
                <span className="text-xs font-mono text-muted-foreground">HTML Source</span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => copyToClipboard(data.html, 'HTML')}
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy HTML
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <pre className="text-xs p-4 font-mono leading-relaxed text-foreground">
                  {data.html}
                </pre>
              </ScrollArea>
            </div>
          </TabsContent>
          
          <TabsContent value="text" className="flex-1 mt-4 min-h-0">
            <div className="h-full flex flex-col border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted border-b">
                <span className="text-xs font-mono text-muted-foreground">Plain Text Version</span>
                {data.plainTextContent && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(data.plainTextContent, 'Text')}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy Text
                  </Button>
                )}
              </div>
              <ScrollArea className="flex-1">
                <pre className="text-sm p-4 whitespace-pre-wrap text-foreground">
                  {data.plainTextContent || 'No plain text version available'}
                </pre>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex-1 bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">Template Data</h4>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => copyToClipboard(JSON.stringify(data, null, 2), 'Template Data')}
            >
              <Copy className="h-3 w-3 mr-1" /> Copy JSON
            </Button>
          </div>
          <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto font-mono max-h-[300px] overflow-y-auto break-all whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );

  const getTitle = () => {
    switch (type) {
      case 'list': return 'List Details';
      case 'channel': return 'Channel Details';
      case 'campaign': return 'Campaign Details';
      case 'template': return 'Template Details';
      default: return 'Details';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>
        {type === 'list' && renderList()}
        {type === 'channel' && renderChannel()}
        {type === 'campaign' && renderCampaign()}
        {type === 'template' && renderTemplate()}
      </DialogContent>
    </Dialog>
  );
}
