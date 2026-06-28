import { cn } from '@/lib/utils';

/**
 * Small uppercase tracked label in muted gray (visual-direction.md type rules).
 * Section/card headers. Values that sit under it are heavier and larger.
 */
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-label font-medium uppercase tracking-label text-cc-text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}
