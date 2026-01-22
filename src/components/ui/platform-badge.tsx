import { cn } from '@/lib/utils';
import type { PlatformType } from '@/lib/types';
import { PLATFORM_INFO } from '@/lib/types';

interface PlatformBadgeProps {
  platform: PlatformType;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function PlatformBadge({ platform, size = 'md', showIcon = true, className }: PlatformBadgeProps) {
  const info = PLATFORM_INFO[platform];
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        `platform-${platform}`,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <span>{info.icon}</span>}
      {info.name}
    </span>
  );
}
