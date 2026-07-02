import { cn } from '@/lib/utils';

/**
 * Content-shaped loading block (component-rules.md "Empty and loading states").
 * Never a bare centered spinner. Reduced-motion users get a static block
 * (the global prefers-reduced-motion rule cancels the pulse).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-cc-md bg-cc-skeleton-base', className)}
      aria-hidden="true"
    />
  );
}

/** A skeleton row shaped like the dense Customers table row. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-b border-cc-border-subtle px-4 py-3">
      <Skeleton className="h-5 w-5 rounded-pill" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-5 w-16 rounded-pill" />
      <Skeleton className="h-4 w-10" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}
