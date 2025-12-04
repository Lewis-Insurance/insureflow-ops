import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  variant: 'table' | 'card' | 'list' | 'kanban' | 'dashboard' | 'form';
  count?: number;
  className?: string;
}

export function LoadingSkeleton({ variant, count = 3, className }: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  switch (variant) {
    case 'table':
      return (
        <div className={cn("space-y-2", className)}>
          {/* Table header */}
          <div className="flex space-x-4 border-b pb-2">
            <Skeleton className="h-4 w-[100px]" />
            <Skeleton className="h-4 w-[150px]" />
            <Skeleton className="h-4 w-[120px]" />
            <Skeleton className="h-4 flex-1" />
          </div>
          {/* Table rows */}
          {items.map((i) => (
            <div key={i} className="flex space-x-4 py-2">
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-[150px]" />
              <Skeleton className="h-4 w-[120px]" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      );

    case 'card':
      return (
        <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-3", className)}>
          {items.map((i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-[140px]" />
                <Skeleton className="h-5 w-[60px]" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex space-x-2 pt-2">
                <Skeleton className="h-8 w-[80px]" />
                <Skeleton className="h-8 w-[80px]" />
              </div>
            </div>
          ))}
        </div>
      );

    case 'list':
      return (
        <div className={cn("space-y-2", className)}>
          {items.map((i) => (
            <div key={i} className="flex items-center space-x-4 rounded-lg border p-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-3 w-[150px]" />
              </div>
              <Skeleton className="h-8 w-[100px]" />
            </div>
          ))}
        </div>
      );

    case 'kanban':
      return (
        <div className={cn("flex gap-4 overflow-x-auto", className)}>
          {items.map((i) => (
            <div key={i} className="flex-shrink-0 w-[280px] space-y-3">
              <Skeleton className="h-8 w-full" />
              <div className="space-y-2">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      );

    case 'dashboard':
      return (
        <div className={cn("space-y-6", className)}>
          {/* Stats cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4 space-y-2">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-8 w-[80px]" />
                <Skeleton className="h-3 w-[120px]" />
              </div>
            ))}
          </div>
          {/* Chart */}
          <div className="rounded-lg border p-6">
            <Skeleton className="h-6 w-[200px] mb-4" />
            <Skeleton className="h-[300px] w-full" />
          </div>
          {/* Table */}
          <div className="rounded-lg border p-4">
            <Skeleton className="h-6 w-[150px] mb-4" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        </div>
      );

    case 'form':
      return (
        <div className={cn("space-y-4", className)}>
          {items.map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <div className="flex space-x-2 pt-4">
            <Skeleton className="h-10 w-[100px]" />
            <Skeleton className="h-10 w-[100px]" />
          </div>
        </div>
      );

    default:
      return (
        <div className={cn("space-y-4", className)}>
          {items.map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      );
  }
}
