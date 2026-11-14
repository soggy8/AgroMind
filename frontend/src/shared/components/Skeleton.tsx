/** Loading placeholder: glass-hi bars (DESIGN.md section 9). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-chip bg-glass-hi ${className}`} />;
}
