import { format } from 'date-fns';
import { MessageSquare, Plus, Trash2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onNewConversation,
  onDelete,
  isLoading,
}: ConversationListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full text-sidebar-foreground">
      {/* Header with New Chat button */}
      <div className="p-3">
        <Button 
          onClick={onNewConversation} 
          variant="outline"
          className="w-full justify-start gap-2 bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>
      
      {/* Conversation list */}
      <ScrollArea className="flex-1 px-2">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-sidebar-foreground/60">
            Loading...
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-sidebar-foreground/60">
            No conversations yet
          </div>
        ) : (
          <div className="space-y-0.5 pb-4">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                  selectedId === conv.id 
                    ? "bg-sidebar-accent text-sidebar-foreground" 
                    : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80"
                )}
                onClick={() => onSelect(conv.id)}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0 opacity-60" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {conv.title || 'New conversation'}
                  </p>
                </div>
                
                {/* Actions dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <AlertDialog open={deleteId === conv.id} onOpenChange={(open) => !open && setDeleteId(null)}>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive cursor-pointer"
                          onSelect={(e) => {
                            e.preventDefault();
                            setDeleteId(conv.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this conversation and all its messages.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setDeleteId(null)}>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => {
                              onDelete(conv.id);
                              setDeleteId(null);
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
