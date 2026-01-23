// Linktree brand component - renders the official Linktree logo
export function LinktreeLogo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 200 40" 
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Linktree wordmark */}
      <text x="0" y="30" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fontSize="28">
        Linktree
      </text>
      {/* Tree icon */}
      <g transform="translate(160, 8)">
        <path d="M10 0L5 5h3v4H5L10 14l5-5h-3V5h3L10 0z" />
        <rect x="8" y="14" width="4" height="6" />
      </g>
    </svg>
  );
}

// Simple Linktree icon
export function LinktreeIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Linktree 3-bar icon */}
      <rect x="6" y="3" width="12" height="4" rx="1" />
      <rect x="6" y="10" width="12" height="4" rx="1" />
      <rect x="6" y="17" width="12" height="4" rx="1" />
    </svg>
  );
}
