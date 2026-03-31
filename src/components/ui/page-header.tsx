import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  /** Override default page title size (default: matches Analytics — text-4xl sm:text-5xl). */
  titleClassName?: string;
}

export function PageHeader({ title, description, actions, className, titleClassName }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0 flex-1">
        {/* No overflow:hidden on h1 — Tailwind `truncate` clips ascenders on large display type */}
        <h1
          className={cn(
            'font-heading font-black tracking-tight leading-snug text-balance break-words',
            'pt-0.5 pb-0.5',
            titleClassName ?? 'text-4xl sm:text-5xl',
          )}
        >
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1 truncate">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0">{actions}</div>}
    </div>
  );
}