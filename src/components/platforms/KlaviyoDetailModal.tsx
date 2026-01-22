import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, Mail, Activity, List, Calendar, Globe, Building, Tag, 
  Copy, Check, Code, Eye, Pencil, X, Phone, Hash, Clock
} from 'lucide-react';
import { toast } from 'sonner';

interface KlaviyoDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'profile' | 'template' | 'metric' | 'list';
  data: any;
  onRename?: (id: string, newName: string) => void;
}

export function KlaviyoDetailModal({ open, onOpenChange, type, data, onRename }: KlaviyoDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
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

  const handleStartEdit = () => {
    setEditName(data.name || '');
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (onRename && editName.trim()) {
      onRename(data.id, editName.trim());
    }
    setIsEditing(false);
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
            {value || 'N/A'}
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

  const renderProfile = () => (
    <ScrollArea className="h-[60vh]">
      <div className="space-y-6 pr-4">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-500/10 to-transparent rounded-xl">
          <div className="h-16 w-16 rounded-full bg-blue-500/20 flex items-center justify-center ring-2 ring-blue-500/30">
            <Users className="h-8 w-8 text-blue-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-xl">
              {data.first_name || ''} {data.last_name || ''}
              {!data.first_name && !data.last_name && 'Anonymous Profile'}
            </h3>
            <p className="text-muted-foreground">{data.email || 'No email'}</p>
            {data.title && <Badge variant="outline" className="mt-1">{data.title}</Badge>}
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-1 bg-card border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3">Contact Information</h4>
          <InfoRow icon={Mail} label="Email" value={data.email} copyable />
          <InfoRow icon={Phone} label="Phone" value={data.phone_number} copyable />
          <InfoRow icon={Hash} label="External ID" value={data.external_id} mono copyable />
        </div>

        {/* Organization */}
        {(data.organization || data.title) && (
          <div className="space-y-1 bg-card border rounded-xl p-4">
            <h4 className="font-medium text-sm mb-3">Organization</h4>
            <InfoRow icon={Building} label="Company" value={data.organization} />
            <InfoRow icon={Tag} label="Title" value={data.title} />
          </div>
        )}

        {/* Location */}
        {data.location && Object.keys(data.location).length > 0 && (
          <div className="space-y-1 bg-card border rounded-xl p-4">
            <h4 className="font-medium text-sm mb-3">Location</h4>
            <div className="grid grid-cols-2 gap-3">
              {data.location.city && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">City</p>
                  <p className="font-medium">{data.location.city}</p>
                </div>
              )}
              {data.location.region && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Region</p>
                  <p className="font-medium">{data.location.region}</p>
                </div>
              )}
              {data.location.country && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Country</p>
                  <p className="font-medium">{data.location.country}</p>
                </div>
              )}
              {data.location.timezone && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Timezone</p>
                  <p className="font-medium">{data.location.timezone}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="space-y-1 bg-card border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3">Timeline</h4>
          <InfoRow icon={Calendar} label="Created" value={formatDate(data.created)} />
          <InfoRow icon={Clock} label="Updated" value={formatDate(data.updated)} />
        </div>

        {/* Custom Properties */}
        {data.properties && Object.keys(data.properties).length > 0 && (
          <div className="space-y-1 bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-sm">Custom Properties</h4>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => copyToClipboard(JSON.stringify(data.properties, null, 2), 'Properties')}
              >
                <Copy className="h-3 w-3 mr-1" /> Copy
              </Button>
            </div>
            <div className="space-y-2">
              {Object.entries(data.properties).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-sm font-mono text-muted-foreground">{key}</span>
                  <span className="text-sm font-medium truncate max-w-[200px]">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );

  const renderTemplate = () => (
    <div className="flex flex-col h-[70vh]">
      {/* Header with edit */}
      <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-orange-500/10 to-transparent rounded-xl mb-4">
        <div className="h-14 w-14 rounded-full bg-orange-500/20 flex items-center justify-center ring-2 ring-orange-500/30">
          <Mail className="h-7 w-7 text-orange-500" />
        </div>
        <div className="flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8"
                autoFocus
              />
              <Button size="sm" onClick={handleSaveEdit}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{data.name}</h3>
              {onRename && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleStartEdit}>
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{data.editor_type || 'unknown'}</Badge>
            {data.html && (
              <Badge variant="secondary">{Math.round(data.html.length / 1024)}KB</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Template ID and dates */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Template ID</p>
          <div className="flex items-center gap-1">
            <p className="font-mono text-xs truncate">{data.id}</p>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(data.id, 'Template ID')}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="text-sm font-medium">{formatDate(data.created)}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Updated</p>
          <p className="text-sm font-medium">{formatDate(data.updated)}</p>
        </div>
      </div>

      {/* Template content tabs */}
      {data.html && (
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
                srcDoc={data.html} 
                className="w-full h-full"
                sandbox="allow-same-origin"
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
                {data.text && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(data.text, 'Text')}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy Text
                  </Button>
                )}
              </div>
              <ScrollArea className="flex-1">
                <pre className="text-sm p-4 whitespace-pre-wrap text-foreground">
                  {data.text || 'No plain text version available'}
                </pre>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );

  const renderMetric = () => (
    <ScrollArea className="h-[60vh]">
      <div className="space-y-6 pr-4">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-500/10 to-transparent rounded-xl">
          <div className="h-16 w-16 rounded-full bg-purple-500/20 flex items-center justify-center ring-2 ring-purple-500/30">
            <Activity className="h-8 w-8 text-purple-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-xl">{data.name}</h3>
            <Badge variant="outline">Event / Metric</Badge>
          </div>
        </div>

        {/* Metric Info */}
        <div className="space-y-1 bg-card border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3">Metric Details</h4>
          <InfoRow icon={Hash} label="Metric ID" value={data.id} mono copyable />
          <InfoRow icon={Calendar} label="Created" value={formatDate(data.created)} />
          <InfoRow icon={Clock} label="Updated" value={formatDate(data.updated)} />
        </div>

        {/* Integration Details */}
        {data.integration && Object.keys(data.integration).length > 0 && (
          <div className="space-y-1 bg-card border rounded-xl p-4">
            <h4 className="font-medium text-sm mb-3">Integration Source</h4>
            <div className="grid grid-cols-2 gap-3">
              {data.integration.name && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="font-medium">{data.integration.name}</p>
                </div>
              )}
              {data.integration.category && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium">{data.integration.category}</p>
                </div>
              )}
            </div>
            {data.integration.id && (
              <div className="mt-3">
                <InfoRow icon={Hash} label="Integration ID" value={data.integration.id} mono copyable />
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
          <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto font-mono">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    </ScrollArea>
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
            {data.profile_count !== undefined && (
              <Badge variant="secondary" className="mt-1">
                <Users className="h-3 w-3 mr-1" />
                {data.profile_count.toLocaleString()} profiles
              </Badge>
            )}
          </div>
        </div>

        {/* List Info */}
        <div className="space-y-1 bg-card border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3">List Details</h4>
          <InfoRow icon={Hash} label="List ID" value={data.id} mono copyable />
          <InfoRow icon={Tag} label="Opt-in Process" value={data.opt_in_process} />
          <InfoRow icon={Calendar} label="Created" value={formatDate(data.created)} />
          <InfoRow icon={Clock} label="Updated" value={formatDate(data.updated)} />
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
          <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto font-mono">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    </ScrollArea>
  );

  const getTitle = () => {
    switch (type) {
      case 'profile': return 'Profile Details';
      case 'template': return 'Template Details';
      case 'metric': return 'Event/Metric Details';
      case 'list': return 'List Details';
    }
  };

  const getDialogSize = () => {
    return type === 'template' ? 'max-w-5xl' : 'max-w-2xl';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${getDialogSize()} max-h-[90vh] overflow-hidden`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getTitle()}
          </DialogTitle>
        </DialogHeader>
        {type === 'profile' && renderProfile()}
        {type === 'template' && renderTemplate()}
        {type === 'metric' && renderMetric()}
        {type === 'list' && renderList()}
      </DialogContent>
    </Dialog>
  );
}
