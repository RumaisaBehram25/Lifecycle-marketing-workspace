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
      {/* Abstract mark - interlocking shapes */}
      <path d="M4 6C4 4.89543 4.89543 4 6 4H11C12.1046 4 13 4.89543 13 6V11C13 12.1046 12.1046 13 11 13H6C4.89543 13 4 12.1046 4 11V6Z" fill="currentColor" opacity="0.9" />
      <path d="M11 11C11 9.89543 11.8954 9 13 9H18C19.1046 9 20 9.89543 20 11V18C20 19.1046 19.1046 20 18 20H13C11.8954 20 11 19.1046 11 18V11Z" fill="currentColor" opacity="0.6" />
      <path d="M11 4H13C14.1046 4 15 4.89543 15 6V8C15 8.55228 14.5523 9 14 9H11V4Z" fill="currentColor" opacity="0.75" />
    </svg>
  );
}
