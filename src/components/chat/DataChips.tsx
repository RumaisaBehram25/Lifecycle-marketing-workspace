import { useState } from 'react';
import { ChevronDown, ChevronUp, Zap, Users, Mail, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface DataChipsProps {
  events?: string[];
  lists?: Array<{ name: string; count?: number }>;
  templates?: string[];
  profileProperties?: string[];
  onInsert: (text: string) => void;
}

interface ChipCategoryProps {
  icon: React.ReactNode;
  label: string;
  colorClass: string;
  items: Array<{ label: string; badge?: string }>;
  onInsert: (text: string) => void;
}

function ChipCategory({ icon, label, colorClass, items, onInsert }: ChipCategoryProps) {
  const [showAll, setShowAll] = useState(false);
  const maxVisible = 8;
  const visibleItems = showAll ? items : items.slice(0, maxVisible);
  const hiddenCount = items.length - maxVisible;

  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium px-1">
        {icon}
        <span>{label}</span>
        <span className="text-muted-foreground/60">({items.length})</span>
      </div>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-1.5 pb-2">
          {visibleItems.map((item, i) => (
            <button
              key={i}
              onClick={() => onInsert(item.label)}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full",
                "border border-transparent",
                "hover:border-primary/30 hover:scale-[1.02]",
                "transition-all duration-150 cursor-pointer",
                "max-w-[180px] truncate",
                colorClass
              )}
              title={item.label}
            >
              <span className="truncate">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] opacity-70 ml-0.5 shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
          {!showAll && hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="px-2.5 py-1 text-xs font-medium rounded-full bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
            >
              +{hiddenCount} more
            </button>
          )}
        </div>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
    </div>
  );
}

function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

export function DataChips({ events = [], lists = [], templates = [], profileProperties = [], onInsert }: DataChipsProps) {
  const [isOpen, setIsOpen] = useState(true);
  
  const totalCount = events.length + lists.length + templates.length + profileProperties.length;
  
  if (totalCount === 0) return null;

  const handleInsert = (text: string) => {
    onInsert(`"${text}"`);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/30">
        <span>Available Data ({totalCount})</span>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-3 pt-2 px-1">
        <ChipCategory
          icon={<Zap className="h-3 w-3" />}
          label="Events"
          colorClass="bg-primary/10 text-primary"
          items={events.map(e => ({ label: e }))}
          onInsert={handleInsert}
        />
        
        <ChipCategory
          icon={<Users className="h-3 w-3" />}
          label="Lists"
          colorClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          items={lists.map(l => ({ 
            label: l.name, 
            badge: l.count ? formatCount(l.count) : undefined 
          }))}
          onInsert={handleInsert}
        />
        
        <ChipCategory
          icon={<Mail className="h-3 w-3" />}
          label="Templates"
          colorClass="bg-purple-500/10 text-purple-600 dark:text-purple-400"
          items={templates.map(t => ({ label: t }))}
          onInsert={handleInsert}
        />
        
        <ChipCategory
          icon={<User className="h-3 w-3" />}
          label="Profile Properties"
          colorClass="bg-green-500/10 text-green-600 dark:text-green-400"
          items={profileProperties.map(p => ({ label: p }))}
          onInsert={handleInsert}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
