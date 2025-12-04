# UI Patterns and Standards

## Loading States

### DO Use Skeleton Screens

✅ **Good** - Use skeleton components for better UX:

```tsx
import { AccountListSkeleton } from '@/components/ui/skeleton-components';

if (isLoading) {
  return <AccountListSkeleton count={6} />;
}
```

❌ **Bad** - Plain text loading:

```tsx
if (isLoading) {
  return <div>Loading...</div>;
}
```

### Available Skeleton Components

Located in `src/components/ui/skeleton-components.tsx`:

- `DashboardSkeleton` - For dashboard pages
- `CRMPageSkeleton` - For CRM-style pages
- `AccountListSkeleton` - For account/card grids
- `TableSkeleton` - For data tables
- `FormSkeleton` - For forms

### Creating Custom Skeletons

```tsx
import { Skeleton } from '@/components/ui/skeleton';

<Card>
  <CardHeader>
    <Skeleton className="h-6 w-40" />
    <Skeleton className="h-4 w-64" />
  </CardHeader>
  <CardContent>
    <Skeleton className="h-10 w-full" />
  </CardContent>
</Card>
```

## Error States

### DO Use Alert Components

✅ **Good** - User-friendly error messages:

```tsx
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

if (error) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error Loading Data</AlertTitle>
      <AlertDescription>
        {error.message}
      </AlertDescription>
    </Alert>
  );
}
```

❌ **Bad** - Console-only or toast-only errors:

```tsx
if (error) {
  console.error(error);
  return null; // User sees nothing!
}
```

### Error Variants

```tsx
// Destructive (red) - for errors
<Alert variant="destructive">

// Default (blue) - for info
<Alert>

// Warning (yellow) - for warnings
<Alert className="border-yellow-500 bg-yellow-50">
```

### Empty States

✅ **Good** - Helpful empty states:

```tsx
if (!data || data.length === 0) {
  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>No Data Found</AlertTitle>
      <AlertDescription>
        Get started by clicking the "Add New" button above.
      </AlertDescription>
    </Alert>
  );
}
```

## Complete Pattern Example

```tsx
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AccountListSkeleton } from '@/components/ui/skeleton-components';
import { AlertCircle } from 'lucide-react';

export function AccountList() {
  const { data, isLoading, error } = useAccounts();

  // Loading State
  if (isLoading) {
    return <AccountListSkeleton count={6} />;
  }

  // Error State
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to Load Accounts</AlertTitle>
        <AlertDescription>
          {error.message || 'An unexpected error occurred. Please try again.'}
        </AlertDescription>
      </Alert>
    );
  }

  // Empty State
  if (!data || data.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Accounts Yet</AlertTitle>
        <AlertDescription>
          Create your first account to get started.
        </AlertDescription>
      </Alert>
    );
  }

  // Success State
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {data.map((account) => (
        <AccountCard key={account.id} account={account} />
      ))}
    </div>
  );
}
```

## Form Loading States

### Disable Buttons While Loading

```tsx
<Button
  disabled={isSubmitting || isPending}
  onClick={handleSubmit}
>
  {isSubmitting ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Saving...
    </>
  ) : (
    'Save'
  )}
</Button>
```

## Query Loading with React Query

```tsx
const {
  data,
  isLoading,     // Initial load
  isFetching,    // Background refetch
  isError,
  error
} = useQuery({ ... });

// Show skeleton only on initial load
if (isLoading) {
  return <Skeleton />;
}

// Show subtle indicator on background refresh
if (isFetching && data) {
  return (
    <div className="relative">
      {data && renderData(data)}
      <div className="absolute top-2 right-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
```

## Progressive Enhancement

### Show partial data while loading more

```tsx
return (
  <>
    {data && <DataDisplay data={data} />}
    {isFetchingNextPage && (
      <div className="flex justify-center py-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )}
  </>
);
```

## Anti-Patterns to Avoid

❌ No visual feedback:
```tsx
if (isLoading) return null;
```

❌ Console-only errors:
```tsx
if (error) console.error(error);
```

❌ Generic error messages:
```tsx
<div>Something went wrong</div>
```

❌ Blocking the entire page:
```tsx
// Don't wrap everything in isLoading
```

❌ Using spinners for everything:
```tsx
// Spinners are distracting, use skeletons
<Loader2 className="animate-spin" />
```

## Checklist

When creating a new component with async data:

- [ ] Add skeleton loading state
- [ ] Add error alert with specific message
- [ ] Add empty state with helpful text
- [ ] Disable actions while pending
- [ ] Show progress indicators on buttons
- [ ] Handle network errors gracefully
- [ ] Add retry capability for errors
- [ ] Test all three states (loading, error, success)

## References

- Skeleton Components: `src/components/ui/skeleton-components.tsx`
- Alert Component: `src/components/ui/alert.tsx`
- Button Component: `src/components/ui/button.tsx`
- React Query Docs: https://tanstack.com/query/latest/docs/react/overview
