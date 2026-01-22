import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="font-heading font-black text-2xl tracking-tight truncate">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1 truncate">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0">{actions}</div>}
    </div>
  );
}