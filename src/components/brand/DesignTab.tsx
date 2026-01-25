import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Upload, 
  Image as ImageIcon, 
  Mail, 
  Plus,
  ExternalLink,
  Eye,
  Trash2,
  Sparkles,
  Building2
} from 'lucide-react';
import { toast } from 'sonner';

interface Template {
  id: string;
  name: string;
  category: string;
  imageUrl?: string;
  htmlContent?: string;
  source: 'braze' | 'upload';
}

interface CompetitorInspiration {
  id: string;
  name: string;
  imageUrl: string;
  notes?: string;
}

interface DesignTabProps {
  clientId: string;
}

export function DesignTab({ clientId }: DesignTabProps) {
  const [templates, setTemplates] = useState<Template[]>([
    { id: '1', name: 'Welcome Series - Hero', category: 'Welcome', source: 'braze' },
    { id: '2', name: 'Pro Upgrade Nudge', category: 'Conversion', source: 'braze' },
    { id: '3', name: 'Feature Announcement', category: 'Education', source: 'braze' },
  ]);
  
  const [inspirations, setInspirations] = useState<CompetitorInspiration[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedInspiration, setSelectedInspiration] = useState<CompetitorInspiration | null>(null);
  
  const templateInputRef = useRef<HTMLInputElement>(null);
  const inspirationInputRef = useRef<HTMLInputElement>(null);

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const newTemplate: Template = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^/.]+$/, ''),
          category: 'Uploaded',
          imageUrl: event.target?.result as string,
          source: 'upload',
        };
        setTemplates((prev) => [...prev, newTemplate]);
        toast.success(`Template "${newTemplate.name}" uploaded`);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleInspirationUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const newInspiration: CompetitorInspiration = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^/.]+$/, ''),
          imageUrl: event.target?.result as string,
        };
        setInspirations((prev) => [...prev, newInspiration]);
        toast.success(`Inspiration "${newInspiration.name}" added`);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const deleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success('Template removed');
  };

  const deleteInspiration = (id: string) => {
    setInspirations((prev) => prev.filter((i) => i.id !== id));
    toast.success('Inspiration removed');
  };

  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <div className="space-y-8">
      {/* Templates Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Email Templates</h2>
              <p className="text-sm text-muted-foreground">Brand-approved designs for CRM campaigns</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="file"
              ref={templateInputRef}
              onChange={handleTemplateUpload}
              accept="image/*"
              multiple
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => templateInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Template
            </Button>
          </div>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All</TabsTrigger>
            {categories.map((cat) => (
              <TabsTrigger key={cat} value={cat}>{cat}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onView={() => setSelectedTemplate(template)}
                  onDelete={() => deleteTemplate(template.id)}
                />
              ))}
              {templates.length === 0 && (
                <Card className="col-span-full border-dashed">
                  <CardContent className="py-12 text-center">
                    <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-sm text-muted-foreground">
                      No templates yet. Upload images or sync from Braze.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {categories.map((cat) => (
            <TabsContent key={cat} value={cat}>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.filter((t) => t.category === cat).map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onView={() => setSelectedTemplate(template)}
                    onDelete={() => deleteTemplate(template.id)}
                  />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      {/* Competitor Inspiration Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Competitor Inspiration</h2>
              <p className="text-sm text-muted-foreground">Email designs from competitors for reference</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="file"
              ref={inspirationInputRef}
              onChange={handleInspirationUpload}
              accept="image/*"
              multiple
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => inspirationInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Add Inspiration
            </Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {inspirations.map((insp) => (
            <Card key={insp.id} className="group overflow-hidden">
              <div className="relative aspect-[3/4] bg-muted">
                <img 
                  src={insp.imageUrl} 
                  alt={insp.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setSelectedInspiration(insp)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteInspiration(insp.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-3">
                <p className="font-medium text-sm truncate">{insp.name}</p>
                {insp.notes && (
                  <p className="text-xs text-muted-foreground truncate mt-1">{insp.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
          
          {inspirations.length === 0 && (
            <Card className="col-span-full border-dashed">
              <CardContent className="py-12 text-center">
                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Upload screenshots of competitor emails for design inspiration.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Template Preview Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTemplate?.name}
              <Badge variant="secondary">{selectedTemplate?.category}</Badge>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            {selectedTemplate?.imageUrl ? (
              <img 
                src={selectedTemplate.imageUrl} 
                alt={selectedTemplate.name}
                className="w-full rounded-lg"
              />
            ) : (
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <Mail className="h-16 w-16 text-muted-foreground/50" />
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Inspiration Preview Dialog */}
      <Dialog open={!!selectedInspiration} onOpenChange={() => setSelectedInspiration(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedInspiration?.name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            {selectedInspiration?.imageUrl && (
              <img 
                src={selectedInspiration.imageUrl} 
                alt={selectedInspiration.name}
                className="w-full rounded-lg"
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateCard({ 
  template, 
  onView, 
  onDelete 
}: { 
  template: Template; 
  onView: () => void; 
  onDelete: () => void;
}) {
  return (
    <Card className="group overflow-hidden">
      <div className="relative aspect-video bg-muted">
        {template.imageUrl ? (
          <img 
            src={template.imageUrl} 
            alt={template.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Mail className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button size="sm" variant="secondary" onClick={onView}>
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
          {template.source === 'upload' && (
            <Button size="sm" variant="destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm truncate">{template.name}</p>
          <Badge variant="outline" className="text-xs shrink-0">
            {template.source === 'braze' ? 'Braze' : 'Upload'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{template.category}</p>
      </CardContent>
    </Card>
  );
}
