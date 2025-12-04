# Component Guide

Comprehensive guide to InsureFlow Ops component architecture, patterns, and best practices.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Component Patterns](#component-patterns)
- [UI Components](#ui-components)
- [Feature Components](#feature-components)
- [Hooks & Data Fetching](#hooks--data-fetching)
- [Design System](#design-system)
- [Performance Best Practices](#performance-best-practices)

---

## Architecture Overview

InsureFlow Ops follows a modular, feature-based architecture:

```
src/
├── components/
│   ├── ui/              # Reusable UI primitives (shadcn/ui)
│   ├── layout/          # Layout components (AppLayout, NavItem)
│   ├── crm/             # CRM-specific components
│   ├── ai/              # AI features (chat, assistant)
│   ├── tasks/           # Task management
│   ├── leads/           # Lead pipeline
│   └── [feature]/       # Feature-specific components
├── pages/               # Route components (lazy loaded)
├── hooks/               # Custom React hooks
├── lib/                 # Utilities and helpers
│   └── constants/       # Design system constants
└── integrations/        # Third-party integrations (Supabase)
```

---

## Component Patterns

### 1. Page Components

**Pattern**: Lazy loaded route components with AppLayout wrapper

**Example**:
```tsx
// src/pages/CustomerList.tsx
import { AppLayout } from '@/components/layout/AppLayout';
import { CustomerListTable } from '@/components/crm/CustomerListTable';

export default function CustomerList() {
  return (
    <AppLayout>
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Customers</h1>
        <CustomerListTable />
      </div>
    </AppLayout>
  );
}
```

**Key Points**:
- Always use `AppLayout` wrapper for sidebar/navigation
- Use semantic HTML (`<main>`, `<section>`, `<article>`)
- Container with padding: `container mx-auto py-8`
- Lazy load in App.tsx: `const CustomerList = React.lazy(() => import('./pages/CustomerList'))`

---

### 2. Feature Components

**Pattern**: Self-contained feature with data fetching via hooks

**Example**:
```tsx
// src/components/crm/CustomerListTable.tsx
import { useCustomers } from '@/hooks/useCustomers';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Users } from 'lucide-react';

export function CustomerListTable() {
  const { data: customers, isLoading, error } = useCustomers();

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState errorMessage={error.message} />;
  }

  if (!customers || customers.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No customers yet"
        description="Get started by adding your first customer"
        action={{
          label: "Add Customer",
          onClick: () => navigate('/customers/new')
        }}
      />
    );
  }

  return <DataTable columns={columns} data={customers} />;
}
```

**Key Points**:
- Always handle loading, error, and empty states
- Use custom hooks for data fetching (React Query)
- Use standardized empty state components
- Keep components focused on single responsibility

---

### 3. Form Components

**Pattern**: Controlled forms with React Hook Form + Zod validation

**Example**:
```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

export function CustomerForm({ onSubmit, initialData }: CustomerFormProps) {
  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: initialData,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* More fields... */}
        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
}
```

---

## UI Components

### Standardized Components

All UI primitives are from **shadcn/ui** with Tailwind styling.

#### Button
```tsx
import { Button } from '@/components/ui/button';

// Variants
<Button variant="default">Primary</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
<Button variant="destructive">Delete</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>
```

#### Badge
```tsx
import { Badge } from '@/components/ui/badge';
import { getStatusBadgeVariant } from '@/lib/constants/design-system';

<Badge variant="default">Active</Badge>
<Badge variant="secondary">Pending</Badge>
<Badge variant="outline">Draft</Badge>
<Badge variant="destructive">Error</Badge>

// With helper functions
<Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>
```

#### Card
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

#### Dialog
```tsx
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    {/* Content */}
  </DialogContent>
</Dialog>
```

#### Empty State
```tsx
import { EmptyState, EmptySearchState, ErrorState } from '@/components/ui/empty-state';
import { Users } from 'lucide-react';

// Custom empty state
<EmptyState
  icon={Users}
  title="No customers found"
  description="Add your first customer to get started"
  action={{
    label: "Add Customer",
    onClick: handleAdd
  }}
/>

// Specialized states
<EmptySearchState onAction={clearSearch} />
<ErrorState errorMessage={error.message} onAction={retry} />
```

---

## Feature Components

### CRM Components

#### AccountList
- **Location**: `src/components/crm/AccountList.tsx`
- **Purpose**: Displays paginated list of accounts
- **Hook**: `useAccounts()`
- **Features**: Search, filter, pagination, empty states

#### LeadList
- **Location**: `src/components/crm/LeadList.tsx`
- **Purpose**: Lead management with scoring
- **Hook**: `useLeads()`
- **Features**: Lead scoring, filtering, kanban view

#### GlobalSearch
- **Location**: `src/components/crm/GlobalSearch.tsx`
- **Purpose**: Omnisearch across accounts, policies, quotes
- **Hook**: `useGlobalSearch()`
- **Features**: Keyboard shortcuts (Cmd+K), recent searches

### AI Components

#### AIAssistantChat
- **Location**: `src/components/ai/AIAssistantChat.tsx`
- **Purpose**: AI-powered chat interface with knowledge base
- **Hook**: `useAIBrain()`
- **Features**: Streaming responses, KB integration, regeneration

#### AIAssistantModal
- **Location**: `src/components/ai/AIAssistantModal.tsx`
- **Purpose**: Modal wrapper for AI chat
- **Context**: `AIAssistantContext`

### Task Components

#### TaskKanbanBoard
- **Location**: `src/components/tasks/TaskKanbanBoard.tsx`
- **Purpose**: Drag-and-drop task management
- **Hook**: `useTasks()`
- **Features**: DnD, status updates, filtering

---

## Hooks & Data Fetching

### React Query Pattern

All data fetching uses **React Query** (TanStack Query) for caching, loading states, and mutations.

#### Query Hook Pattern
```tsx
// src/hooks/useCustomers.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCustomers(filters?: CustomerFilters) {
  return useQuery({
    queryKey: ['customers', filters],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}
```

#### Mutation Hook Pattern
```tsx
export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customer: CreateCustomerRequest) => {
      const { data, error } = await supabase
        .from('customers')
        .insert(customer)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer created');
    },
    onError: (error) => {
      toast.error('Failed to create customer');
    },
  });
}
```

### Custom Hook Best Practices

1. **Always handle loading/error states**
2. **Invalidate queries after mutations**
3. **Use toast notifications for feedback**
4. **Type all return values**
5. **Cache with appropriate keys**

---

## Design System

### Color System

Use the centralized design system constants:

```tsx
import {
  LEAD_SCORE_COLORS,
  STATUS_VARIANTS,
  PRIORITY_VARIANTS,
  getLeadScoreTier,
  getStatusBadgeVariant,
} from '@/lib/constants/design-system';

// Lead score
const tier = getLeadScoreTier(score);
<div className={tier.bg}>{tier.label}</div>
<Badge variant={tier.badge}>{score}</Badge>

// Status
<Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>

// Priority
const priority = PRIORITY_VARIANTS.HIGH;
<Badge variant={priority.badge}>{priority.icon} {priority.label}</Badge>
```

### Typography

```tsx
import { TYPOGRAPHY } from '@/lib/constants/design-system';

<h1 className={TYPOGRAPHY.H1}>Main Heading</h1>
<p className={TYPOGRAPHY.BODY}>Body text</p>
<span className={TYPOGRAPHY.CAPTION}>Caption text</span>
```

### Spacing

```tsx
import { SPACING } from '@/lib/constants/design-system';

<div style={{ padding: SPACING.LG }}>Content</div>
```

---

## Performance Best Practices

### 1. Lazy Loading
All page components are lazy loaded in `App.tsx`:

```tsx
const CustomerList = React.lazy(() => import('./pages/CustomerList'));
```

### 2. Memoization

Use `React.memo` for expensive components:

```tsx
export const CustomerCard = React.memo(({ customer }: Props) => {
  // Expensive render logic
});
```

Use `useMemo` for expensive calculations:

```tsx
const sortedCustomers = useMemo(() => {
  return customers.sort((a, b) => b.score - a.score);
}, [customers]);
```

Use `useCallback` for event handlers:

```tsx
const handleClick = useCallback(() => {
  console.log(customer.id);
}, [customer.id]);
```

### 3. Code Splitting

Vite automatically splits code by route. For manual splitting:

```tsx
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

<Suspense fallback={<LoadingState />}>
  <HeavyComponent />
</Suspense>
```

### 4. Query Optimization

```tsx
// Prefetch data on hover
const queryClient = useQueryClient();

const handleMouseEnter = () => {
  queryClient.prefetchQuery({
    queryKey: ['customer', customerId],
    queryFn: fetchCustomer,
  });
};
```

### 5. Virtualization

For large lists (100+ items), use virtualization:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
  count: customers.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 60,
});
```

---

## Testing

### Component Testing

```tsx
import { render, screen } from '@testing-library/react';
import { CustomerCard } from './CustomerCard';

test('renders customer name', () => {
  const customer = { id: '1', name: 'John Doe' };
  render(<CustomerCard customer={customer} />);
  expect(screen.getByText('John Doe')).toBeInTheDocument();
});
```

### Hook Testing

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCustomers } from './useCustomers';

test('fetches customers', async () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(() => useCustomers(), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(5);
});
```

---

## Accessibility

### Keyboard Navigation

All interactive components support keyboard:
- Tab/Shift+Tab: Navigate
- Enter/Space: Activate
- Escape: Close modals/dialogs
- Arrow keys: Navigate lists

### Screen Readers

Use ARIA attributes:

```tsx
<button
  aria-label="Delete customer"
  aria-describedby="delete-description"
>
  <Trash2 />
</button>
<span id="delete-description" className="sr-only">
  This will permanently delete the customer
</span>
```

### Focus Management

```tsx
import { useRef, useEffect } from 'react';

const inputRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  inputRef.current?.focus();
}, []);

<Input ref={inputRef} />
```

---

## Common Patterns

### Modal with Form

```tsx
function EditCustomerDialog({ customer, onClose }: Props) {
  const updateMutation = useUpdateCustomer();

  const handleSubmit = async (data: CustomerData) => {
    await updateMutation.mutateAsync({
      id: customer.id,
      updates: data,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>
        <CustomerForm
          initialData={customer}
          onSubmit={handleSubmit}
          isLoading={updateMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
```

### Paginated Table

```tsx
function CustomerTable() {
  const [page, setPage] = useState(0);
  const { data, isLoading } = useCustomers({ page, pageSize: 25 });

  return (
    <>
      <DataTable
        columns={columns}
        data={data?.customers || []}
        isLoading={isLoading}
      />
      <Pagination
        page={page}
        totalPages={data?.totalPages || 0}
        onPageChange={setPage}
      />
    </>
  );
}
```

### Conditional Rendering

```tsx
// Use early returns for cleaner code
if (isLoading) return <LoadingState />;
if (error) return <ErrorState error={error} />;
if (!data) return <EmptyState />;

// Render main content
return <DataView data={data} />;
```

---

## Resources

- **shadcn/ui**: https://ui.shadcn.com/
- **Tailwind CSS**: https://tailwindcss.com/
- **React Query**: https://tanstack.com/query/latest
- **Lucide Icons**: https://lucide.dev/
- **Supabase**: https://supabase.com/docs

---

**Last Updated**: December 3, 2024
**Version**: 1.0.0
