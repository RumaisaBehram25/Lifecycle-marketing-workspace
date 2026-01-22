import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowUp, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataChips } from './DataChips';

export interface PlatformData {
  events?: string[];
  lists?: Array<{ name: string; count?: number }>;
  templates?: string[];
  profileProperties?: string[];
}

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  quickPrompts?: string[];
  platformData?: PlatformData;
  hasPlatformConnections?: boolean;
  onSyncPlatform?: () => void;
  isSyncing?: boolean;
}

export function ChatInput({ onSend, isLoading, placeholder, quickPrompts, platformData, hasPlatformConnections, onSyncPlatform, isSyncing }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    onSend(prompt);
  };

  const handleChipInsert = (text: string) => {
    setInput(prev => prev ? `${prev} ${text}` : text);
    textareaRef.current?.focus();
  };

  const hasPlatformData = platformData && (
    (platformData.events?.length ?? 0) > 0 ||
    (platformData.lists?.length ?? 0) > 0 ||
    (platformData.templates?.length ?? 0) > 0 ||
    (platformData.profileProperties?.length ?? 0) > 0
  );

  // Show sync prompt if there are platform connections but no data
  const showSyncPrompt = hasPlatformConnections && !hasPlatformData && onSyncPlatform;

  return (
    <div className="space-y-3">
      {/* Sync needed prompt */}
      {showSyncPrompt && (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-xs font-medium">Platform data not synced yet</span>
          </div>
          <Button
            onClick={onSyncPlatform}
            disabled={isSyncing}
            variant="outline"
            size="sm"
            className="h-7 text-xs border-amber-500/30 hover:bg-amber-500/10"
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 mr-1.5" />
                Sync Now
              </>
            )}
          </Button>
        </div>
      )}

      {/* Data chips */}
      {hasPlatformData && (
        <DataChips
          events={platformData.events}
          lists={platformData.lists}
          templates={platformData.templates}
          profileProperties={platformData.profileProperties}
          onInsert={handleChipInsert}
        />
      )}

      {/* Quick prompts - pill style */}
      {quickPrompts && quickPrompts.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {quickPrompts.map((prompt, i) => (
            <button
              key={i}
              className={cn(
                "px-3.5 py-2 text-xs font-medium rounded-full",
                "border border-border bg-background",
                "hover:bg-accent hover:border-primary/30 hover:text-accent-foreground",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              onClick={() => handleQuickPrompt(prompt)}
              disabled={isLoading}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
      
      {/* Input container - ChatGPT style */}
      <div className="relative flex items-end gap-2 p-1.5 rounded-2xl border border-border bg-muted/30 focus-within:border-primary/50 focus-within:bg-background transition-colors">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Message..."}
          className={cn(
            "flex-1 min-h-[44px] max-h-[200px] resize-none",
            "border-0 bg-transparent shadow-none",
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            "placeholder:text-muted-foreground/60",
            "py-3 px-3"
          )}
          disabled={isLoading}
          rows={1}
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          size="icon"
          className={cn(
            "h-9 w-9 shrink-0 rounded-xl",
            "bg-primary hover:bg-primary/90",
            "disabled:bg-muted disabled:text-muted-foreground"
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
