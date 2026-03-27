import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  /** Override default page title size (default: text-2xl). */
  titleClassName?: string;
}

export function PageHeader({ title, description, actions, className, titleClassName }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0 flex-1">
        <h1 className={cn('font-heading font-black tracking-tight truncate', titleClassName ?? 'text-2xl')}>{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1 truncate">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0">{actions}</div>}
    </div>
  );
}