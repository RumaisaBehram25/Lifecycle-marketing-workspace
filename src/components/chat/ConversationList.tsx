import { format } from 'date-fns';
import { MessageSquare, Plus, X, Loader2 } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full min-h-0 text-sidebar-foreground">
      <div className="p-4 pb-3 border-b border-sidebar-border/80 bg-sidebar/50">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary/90 to-violet-600/90 flex items-center justify-center shadow-sm shadow-primary/20">
            <MessageSquare className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-heading font-semibold tracking-tight">Chats</h2>
            <p className="text-[11px] text-sidebar-foreground/55 truncate">
              Saved to your account
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={onNewConversation}
          className="w-full mt-3 justify-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 pb-6">
          {isLoading ? (
            <div className="px-3 py-8 text-center text-sm text-sidebar-foreground/50">
              <Loader2 className="inline-block h-6 w-6 text-primary/70 animate-spin mb-2" />
              <p>Loading history…</p>
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-10 text-center rounded-xl border border-dashed border-sidebar-border/80 bg-sidebar-accent/20">
              <p className="text-sm text-sidebar-foreground/70 leading-relaxed">
                No chats yet.
                <br />
                <span className="text-xs text-sidebar-foreground/50">
                  Start one — your threads appear here.
                </span>
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conv) => {
                const isActive = selectedId === conv.id;
                return (
                  <li key={conv.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect(conv.id);
                        }
                      }}
                      className={cn(
                        'group relative flex items-start gap-2 pl-3 pr-1 py-2.5 rounded-xl cursor-pointer transition-all',
                        'border border-transparent',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-foreground shadow-sm border-sidebar-border/60'
                          : 'hover:bg-sidebar-accent/60 hover:border-sidebar-border/40 text-sidebar-foreground/85'
                      )}
                      onClick={() => onSelect(conv.id)}
                    >
                      <MessageSquare
                        className={cn(
                          'h-4 w-4 flex-shrink-0 mt-0.5',
                          isActive ? 'text-primary' : 'opacity-50 group-hover:opacity-80'
                        )}
                      />
                      <div className="flex-1 min-w-0 pr-1">
                        <p className="text-sm font-medium leading-snug line-clamp-2">
                          {conv.title || 'New conversation'}
                        </p>
                        <p className="text-[10px] text-sidebar-foreground/45 mt-1 tabular-nums">
                          {format(new Date(conv.updated_at), 'MMM d · h:mm a')}
                        </p>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'h-8 w-8 flex-shrink-0 rounded-lg',
                              'text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10',
                              'opacity-70 sm:opacity-0 sm:group-hover:opacity-100',
                              'focus-visible:opacity-100'
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(conv.id);
                            }}
                            aria-label="Delete chat"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Delete chat</TooltipContent>
                      </Tooltip>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ScrollArea>

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the conversation and all messages. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId) {
                  onDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
