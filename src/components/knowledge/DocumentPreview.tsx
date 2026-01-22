import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { ExternalLink, Calendar, FileText } from 'lucide-react';
import type { KnowledgeDocument } from '@/lib/types';

interface DocumentPreviewProps {
  document: KnowledgeDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentPreview({ document, open, onOpenChange }: DocumentPreviewProps) {
  if (!document) return null;

  const wordCount = document.content.split(/\s+/).length;
  const charCount = document.content.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2 pr-8 font-heading">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <span className="truncate">{document.title || 'Untitled Document'}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 py-2 border-b">
          {document.platform && <PlatformBadge platform={document.platform} size="sm" />}
          {document.is_vendor_doc && (
            <Badge variant="secondary">Vendor Doc</Badge>
          )}
          {document.category && (
            <Badge variant="outline">{document.category}</Badge>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
            <Calendar className="h-3 w-3" />
            Updated {new Date(document.updated_at).toLocaleDateString()}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground py-2">
          <a
            href={document.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-primary transition-colors"
          >
            {document.source_url}
            <ExternalLink className="h-3 w-3" />
          </a>
          <div className="flex gap-3">
            <span>{wordCount.toLocaleString()} words</span>
            <span>{charCount.toLocaleString()} chars</span>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 border rounded-lg bg-muted/30">
          <div className="p-4">
            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
              {document.content}
            </pre>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
