export function BRCGLogo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 160 40" 
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <text x="0" y="30" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="28" fill="currentColor" letterSpacing="-0.5">
        BRCG
      </text>
    </svg>
  );
}

export function BRCGIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" opacity="0.9" />
      <text x="12" y="16.5" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="10" fill="white">
        B
      </text>
    </svg>
  );
}
