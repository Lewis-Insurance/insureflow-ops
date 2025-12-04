# Loading States Standardization Guide

## Overview
This document outlines the standardized approach for loading states across InsureFlow Ops to provide consistent, professional UX.

**Status**: Implemented
**Created**: 2025-12-03

## Core Principles

1. **Never show plain text "Loading..."**
2. **Use skeleton screens** that match the content structure
3. **Provide visual feedback** immediately on data load
4. **Maintain layout stability** (no content jumps)
5. **Match the final UI structure** for seamless transitions

## Available Components

### 1. Skeleton (Base Component)
**Location**: `/src/components/ui/skeleton.tsx`

Basic animated placeholder:
```tsx
import { Skeleton } from "@/components/ui/skeleton";

<Skeleton className="h-4 w-full" />
<Skeleton className="h-8 w-3/4" />
<Skeleton className="h-12 w-12 rounded-full" />
```

### 2. TableSkeleton
**Location**: `/src/components/ui/table-skeleton.tsx`

For data tables:
```tsx
import { TableSkeleton } from "@/components/ui/table-skeleton";

<TableBody>
  {isLoading && <TableSkeleton rows={8} columns={9} />}
</TableBody>
```

### 3. CardSkeleton
**Location**: `/src/components/ui/table-skeleton.tsx`

For card-based layouts:
```tsx
import { CardSkeleton } from "@/components/ui/table-skeleton";

{isLoading && <CardSkeleton count={6} />}
```

### 4. ListSkeleton
**Location**: `/src/components/ui/table-skeleton.tsx`

For list views:
```tsx
import { ListSkeleton } from "@/components/ui/table-skeleton";

{isLoading && <ListSkeleton count={10} />}
```

## Implemented Components

### ✅ TaskKanbanBoard
**File**: `/src/components/tasks/TaskKanbanBoard.tsx`
**Implementation**:
- Skeleton kanban columns with status headers
- 3 skeleton task cards per column
- Matches final card structure (title, description, metadata, badges)

**Before**:
```tsx
if (loading) {
  return <div className="text-center py-8">Loading tasks...</div>;
}
```

**After**:
```tsx
if (loading) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statusColumns.map(({ status, label, color }) => (
        <div key={status} className="flex flex-col gap-2">
          <Card className={color}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-8 rounded-full" />
              </div>
            </CardHeader>
          </Card>
          <div className="space-y-2 min-h-[200px]">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### ✅ LeadList (CRM)
**File**: `/src/components/crm/LeadList.tsx`
**Implementation**:
- TableSkeleton with 8 rows, 9 columns
- Replaces spinner with structured skeleton rows

**Before**:
```tsx
{isLoading && (
  <TableRow>
    <TableCell colSpan={9} className="text-center py-8">
      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
    </TableCell>
  </TableRow>
)}
```

**After**:
```tsx
{isLoading && <TableSkeleton rows={8} columns={9} />}
```

## Components with Good Existing Loading States

### ✅ KPICards (Analytics)
**File**: `/src/components/ao-renewals/analytics/KPICards.tsx`
**Status**: Already implements skeleton screens (lines 92-108)
```tsx
if (isLoading) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader className="pb-3">
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </CardHeader>
          <CardContent>
            <div className="h-8 bg-muted rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-muted rounded w-1/2"></div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

### ✅ AccountList (CRM)
**File**: `/src/components/crm/AccountList.tsx` (lines 47-65)
**Status**: Good skeleton implementation - used as reference pattern

## Components Needing Updates

### Priority List

1. **LeadAnalyticsDashboard** - `/src/components/crm/LeadAnalyticsDashboard.tsx`
   - Add skeleton for charts and metrics
   - Use CardSkeleton for dashboard cards

2. **RenewalsList** - `/src/components/renewals/RenewalsList.tsx`
   - Replace any spinners with TableSkeleton

3. **PolicyList** - Check for plain loading text
   - Implement TableSkeleton

4. **DocumentList** - Check document list loading
   - Use ListSkeleton or CardSkeleton

5. **ContactList** - Check contacts loading
   - Use TableSkeleton or ListSkeleton

## Implementation Patterns

### Pattern 1: Simple Table
```tsx
import { TableSkeleton } from "@/components/ui/table-skeleton";

<TableBody>
  {isLoading && <TableSkeleton rows={10} columns={6} />}
  {!isLoading && data.map(item => <TableRow>...</TableRow>)}
</TableBody>
```

### Pattern 2: Card Grid
```tsx
import { CardSkeleton } from "@/components/ui/table-skeleton";

{isLoading ? (
  <div className="grid grid-cols-3 gap-4">
    <CardSkeleton count={6} />
  </div>
) : (
  <div className="grid grid-cols-3 gap-4">
    {items.map(item => <Card>...</Card>)}
  </div>
)}
```

### Pattern 3: Custom Skeleton (Complex Layouts)
```tsx
import { Skeleton } from "@/components/ui/skeleton";

{isLoading && (
  <div className="space-y-4">
    <div className="flex items-center gap-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-4 w-1/3 mb-2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
    {/* Repeat pattern */}
  </div>
)}
```

### Pattern 4: Kanban/Column Layout
```tsx
{isLoading && (
  <div className="grid grid-cols-4 gap-4">
    {columns.map(col => (
      <div key={col.id}>
        <Skeleton className="h-10 w-full mb-4" />
        {[1,2,3].map(i => (
          <Card key={i} className="mb-2">
            <Skeleton className="h-20" />
          </Card>
        ))}
      </div>
    ))}
  </div>
)}
```

## Best Practices

### DO:
- ✅ Match skeleton structure to final UI
- ✅ Use consistent animation (animate-pulse from Skeleton component)
- ✅ Show skeletons immediately on load start
- ✅ Include appropriate counts (e.g., 8 rows for tables, 6 cards for grids)
- ✅ Maintain responsive grid layouts
- ✅ Use semantic HTML structure

### DON'T:
- ❌ Show plain "Loading..." text
- ❌ Use only spinners for list/table data
- ❌ Create layout shifts when data loads
- ❌ Over-complicate skeleton (simple is better)
- ❌ Forget to handle empty states separately
- ❌ Leave loading state visible after data loads

## Error States

Always pair loading states with proper error states:

```tsx
{isLoading && <TableSkeleton />}

{error && (
  <TableRow>
    <TableCell colSpan={columns} className="text-center py-8 text-destructive">
      Error: {error.message}
    </TableCell>
  </TableRow>
)}

{!isLoading && !error && data.length === 0 && (
  <EmptyState />
)}

{!isLoading && !error && data.length > 0 && (
  // Render data
)}
```

## Testing Checklist

When implementing skeleton screens:
- [ ] Skeleton appears immediately on load
- [ ] Skeleton matches final layout structure
- [ ] No layout shift when data loads
- [ ] Responsive on mobile, tablet, desktop
- [ ] Animation is smooth (60fps)
- [ ] Proper cleanup (no memory leaks)
- [ ] Error states don't show skeleton
- [ ] Empty states don't show skeleton

## Future Enhancements

### Shimmer Effect (Optional)
Add gradient shimmer animation:
```tsx
className="animate-pulse bg-gradient-to-r from-muted via-muted-foreground/10 to-muted"
```

### Progressive Loading
Show skeleton → partial data → full data:
```tsx
{isLoading && !hasPartialData && <Skeleton />}
{hasPartialData && <PartialView data={partialData} />}
{!isLoading && <FullView data={fullData} />}
```

### Staggered Animation
Delay each skeleton slightly for visual effect:
```tsx
{items.map((_, i) => (
  <Skeleton
    key={i}
    style={{ animationDelay: `${i * 50}ms` }}
  />
))}
```

## Accessibility

- Skeleton components should have `aria-busy="true"`
- Add `role="status"` to loading containers
- Consider `aria-live="polite"` for dynamic content
- Ensure keyboard navigation works during loading

## Performance

- Use CSS animations (not JS) for pulse effect
- Avoid excessive skeleton elements (max ~50 per view)
- Consider virtualization for very long lists
- Memoize skeleton components to prevent re-renders

---

**Last Updated**: 2025-12-03
**Completion**: 2 components standardized, reusable components created
**Next Steps**: Update remaining 5+ components needing skeleton improvements
