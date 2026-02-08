// DoubleGood brand component - renders the DoubleGood logo
export function DoubleGoodLogo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 240 40" 
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* DoubleGood wordmark */}
      <text x="0" y="30" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fontSize="26" fill="currentColor">
        Double Good
      </text>
    </svg>
  );
}

// DoubleGood icon - popcorn bucket style
export function DoubleGoodIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Popcorn bucket icon */}
      <path d="M5 8h14l-2 12H7L5 8z" opacity="0.9" />
      <circle cx="8" cy="5" r="2.5" />
      <circle cx="12" cy="4" r="2.5" />
      <circle cx="16" cy="5" r="2.5" />
      <circle cx="10" cy="6" r="2" />
      <circle cx="14" cy="6" r="2" />
    </svg>
  );
}
