import { cn } from '@/lib/utils';

/**
 * Neutral metadata chip (component-rules.md). Policy type, term, carrier name.
 * Carriers (Auto-Owners, Nationwide, Progressive) are ALWAYS name chips, never
 * colored. No semantic color here; that is what StatusPill is for.
 */
export function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill bg-cc-surface-overlay px-2.5 py-0.5 text-xs text-cc-text-secondary whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  );
}
