import { useState } from 'react';
import { sanitizeBrazeEmailHtmlForIframe } from '@/lib/sanitizeBrazeEmailIframe';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  ExternalLink,
  MoreHorizontal,
  Eye
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface Campaign {
  id: string;
  name: string;
  flow: string;
  channel: 'email' | 'sms' | 'push';
  subject?: string;
  previewText?: string;
  thumbnailUrl?: string;
  htmlContent?: string;
  status: 'live' | 'draft' | 'archived';
  createdAt: string;
}

interface CampaignsSectionProps {
  clientId: string;
  clientName: string;
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

// Sample campaigns for demonstration
const SAMPLE_CAMPAIGNS: Campaign[] = [];

export function CampaignsSection({ clientId, clientName }: CampaignsSectionProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(SAMPLE_CAMPAIGNS);
  const [search, setSearch] = useState('');
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  
  // New campaign form
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    flow: '',
    channel: 'email' as const,
    subject: '',
    previewText: '',
    htmlContent: '',
  });

  const filteredCampaigns = campaigns.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
                          c.subject?.toLowerCase().includes(search.toLowerCase());
    const matchesFlow = !selectedFlow || c.flow === selectedFlow;
    return matchesSearch && matchesFlow;
  });

  const groupedByFlow = FLOW_TYPES.reduce((acc, flow) => {
    acc[flow.id] = filteredCampaigns.filter(c => c.flow === flow.id);
    return acc;
  }, {} as Record<string, Campaign[]>);

  const handleAddCampaign = () => {
    if (!newCampaign.name || !newCampaign.flow) return;
    
    const campaign: Campaign = {
      id: crypto.randomUUID(),
      name: newCampaign.name,
      flow: newCampaign.flow,
      channel: newCampaign.channel,
      subject: newCampaign.subject,
      previewText: newCampaign.previewText,
      htmlContent: newCampaign.htmlContent,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    
    setCampaigns(prev => [...prev, campaign]);
    setNewCampaign({ name: '', flow: '', channel: 'email', subject: '', previewText: '', htmlContent: '' });
    setAddDialogOpen(false);
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
                Lifecycle Campaigns
              </CardTitle>
              <CardDescription>
                Browse and manage email campaigns organized by customer journey flow.
              </CardDescription>
            </div>
            <Button onClick={() => setAddDialogOpen(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Add Campaign
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedFlow || 'all'} onValueChange={(v) => setSelectedFlow(v === 'all' ? null : v)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All flows" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Flows</SelectItem>
                {FLOW_TYPES.map(flow => (
                  <SelectItem key={flow.id} value={flow.id}>
                    {flow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Campaign Grid by Flow */}
      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Mail}
              title="No campaigns yet"
              description="Add your first lifecycle email campaign to start building your collection. You can organize emails by flow type like Welcome Series, Abandoned Cart, and more."
              action={
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Campaign
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="grid" className="space-y-4">
          <TabsList>
            <TabsTrigger value="grid">By Flow</TabsTrigger>
            <TabsTrigger value="list">All Emails</TabsTrigger>
          </TabsList>

          <TabsContent value="grid" className="space-y-6">
            {FLOW_TYPES.map(flow => {
              const flowCampaigns = groupedByFlow[flow.id] || [];
              if (flowCampaigns.length === 0 && selectedFlow) return null;
              
              const FlowIcon = flow.icon;
              
              return (
                <div key={flow.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-lg ${flow.color} flex items-center justify-center`}>
                      <FlowIcon className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="font-heading font-bold">{flow.name}</h3>
                    <Badge variant="secondary" className="ml-auto">
                      {flowCampaigns.length} emails
                    </Badge>
                  </div>
                  
                  {flowCampaigns.length > 0 ? (
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {flowCampaigns.map(campaign => (
                        <CampaignCard 
                          key={campaign.id} 
                          campaign={campaign} 
                          onPreview={() => setPreviewCampaign(campaign)}
                        />
                      ))}
                    </div>
                  ) : (
                    <Card className="border-dashed">
                      <CardContent className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">
                          No {flow.name.toLowerCase()} emails yet
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => {
                            setNewCampaign(prev => ({ ...prev, flow: flow.id }));
                            setAddDialogOpen(true);
                          }}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="list">
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {filteredCampaigns.map(campaign => (
                    <div 
                      key={campaign.id} 
                      className="flex items-center gap-4 p-4 hover:bg-muted/50 cursor-pointer"
                      onClick={() => setPreviewCampaign(campaign)}
                    >
                      {/* Thumbnail */}
                      <div className="h-16 w-24 rounded border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {campaign.thumbnailUrl ? (
                          <img src={campaign.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Mail className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{campaign.name}</p>
                        {campaign.subject && (
                          <p className="text-sm text-muted-foreground truncate">{campaign.subject}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {FLOW_TYPES.find(f => f.id === campaign.flow)?.name || campaign.flow}
                          </Badge>
                          <Badge variant={campaign.status === 'live' ? 'default' : 'secondary'} className="text-xs">
                            {campaign.status}
                          </Badge>
                        </div>
                      </div>
                      
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Add Campaign Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Campaign</DialogTitle>
            <DialogDescription>
              Add an existing lifecycle email to your collection for {clientName}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign Name *</Label>
                <Input
                  id="campaign-name"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Welcome Email 1"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="flow-type">Flow Type *</Label>
                <Select 
                  value={newCampaign.flow} 
                  onValueChange={(v) => setNewCampaign(prev => ({ ...prev, flow: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select flow" />
                  </SelectTrigger>
                  <SelectContent>
                    {FLOW_TYPES.map(flow => (
                      <SelectItem key={flow.id} value={flow.id}>
                        {flow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                value={newCampaign.subject}
                onChange={(e) => setNewCampaign(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="e.g., Welcome to the family!"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="preview-text">Preview Text</Label>
              <Input
                id="preview-text"
                value={newCampaign.previewText}
                onChange={(e) => setNewCampaign(prev => ({ ...prev, previewText: e.target.value }))}
                placeholder="e.g., Here's what you can expect..."
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="html-content">Email HTML (optional)</Label>
              <Textarea
                id="html-content"
                value={newCampaign.htmlContent}
                onChange={(e) => setNewCampaign(prev => ({ ...prev, htmlContent: e.target.value }))}
                placeholder="Paste your email HTML here to enable preview..."
                rows={6}
                className="font-mono text-xs"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCampaign} disabled={!newCampaign.name || !newCampaign.flow}>
              Add Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewCampaign} onOpenChange={() => setPreviewCampaign(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewCampaign?.name}</DialogTitle>
            <DialogDescription>
              {previewCampaign?.subject && (
                <span className="block">Subject: {previewCampaign.subject}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto border rounded-lg bg-white min-h-[400px]">
            {previewCampaign?.htmlContent ? (
              <iframe
                srcDoc={sanitizeBrazeEmailHtmlForIframe(previewCampaign.htmlContent)}
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

function CampaignCard({ campaign, onPreview }: { campaign: Campaign; onPreview: () => void }) {
  return (
    <Card 
      className="group cursor-pointer hover:border-primary/50 hover:shadow-md transition-all overflow-hidden"
      onClick={onPreview}
    >
      {/* Email Preview Thumbnail */}
      <div className="aspect-[4/3] bg-muted border-b relative overflow-hidden">
        {campaign.thumbnailUrl ? (
          <img 
            src={campaign.thumbnailUrl} 
            alt={campaign.name}
            className="w-full h-full object-cover object-top"
          />
        ) : campaign.htmlContent ? (
          <iframe
            srcDoc={sanitizeBrazeEmailHtmlForIframe(campaign.htmlContent)}
            className="w-full h-full pointer-events-none scale-50 origin-top-left"
            style={{ width: '200%', height: '200%' }}
            title="Preview"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Mail className="h-8 w-8 text-muted-foreground/50" />
          </div>
        )}
        
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Button variant="secondary" size="sm">
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
        </div>
      </div>
      
      {/* Card Content */}
      <CardContent className="p-3">
        <p className="font-medium text-sm truncate">{campaign.name}</p>
        {campaign.subject && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{campaign.subject}</p>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <Badge 
            variant={campaign.status === 'live' ? 'default' : 'secondary'} 
            className="text-[10px] px-1.5 py-0"
          >
            {campaign.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
