# Issue #7: Performance Optimization & Memoization

## Status: 📋 PLANNED

## Description  
Implement performance optimizations including memoization, useEffect dependency fixes, code splitting, and React optimization patterns to ensure smooth user experience with large datasets (5-10k records).

## Performance Goals
- **Table scrolling**: Smooth performance with 10k+ records
- **Search/filtering**: Sub-200ms response time  
- **Initial load**: First contentful paint under 2 seconds
- **Bundle size**: Reduce JavaScript bundle size by 20%

## Tasks to Complete

### Phase 1: React Performance Optimization
- [ ] **Audit useEffect dependencies**: Fix missing/incorrect dependency arrays
- [ ] **Implement memoization**: Add `useMemo` and `useCallback` for expensive operations
- [ ] **Component memoization**: Use `React.memo` for heavy list components
- [ ] **Virtual scrolling**: Implement for large data tables (CRM lists)

### Phase 2: Code Splitting & Lazy Loading
- [ ] **Route-based splitting**: Split Dashboard and CRM pages with `React.lazy`
- [ ] **Component lazy loading**: Defer non-critical components
- [ ] **Dynamic imports**: Load heavy dependencies on-demand
- [ ] **Bundle analysis**: Identify and optimize large dependencies

### Phase 3: Data & Query Optimization
- [ ] **Pagination**: Implement server-side pagination for large lists
- [ ] **Query optimization**: Add indexes and optimize Supabase queries
- [ ] **Caching strategy**: Implement intelligent data caching
- [ ] **Background prefetching**: Preload likely-needed data

### Phase 4: UI Performance
- [ ] **Debounced search**: Prevent excessive API calls during typing
- [ ] **Optimistic updates**: Update UI before server confirmation
- [ ] **Image optimization**: Lazy load and optimize images
- [ ] **CSS optimization**: Remove unused styles and optimize animations

## Implementation Details

### 1. Memoization Strategy
```tsx
// Expensive computations
const filteredAccounts = useMemo(() => {
  return accounts.filter(account => 
    account.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
}, [accounts, searchTerm]);

// Event handlers  
const handleAccountSelect = useCallback((account: Account) => {
  setSelectedAccounts(prev => [...prev, account]);
}, []);

// Heavy components
const AccountList = memo(({ accounts, onSelect }: AccountListProps) => {
  // Component implementation
});
```

### 2. Virtual Scrolling Implementation
```tsx
import { FixedSizeList as List } from 'react-window';

const VirtualizedAccountList = ({ accounts }: { accounts: Account[] }) => (
  <List
    height={600}
    itemCount={accounts.length}
    itemSize={80}
    itemData={accounts}
  >
    {({ index, style, data }) => (
      <div style={style}>
        <AccountRow account={data[index]} />
      </div>
    )}
  </List>
);
```

### 3. Code Splitting Pattern  
```tsx
// Route-level splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CRM = lazy(() => import('./pages/CRM'));

// Component-level splitting
const CSVImport = lazy(() => import('./components/crm/CSVImport'));
const DuplicateDetection = lazy(() => import('./components/crm/DuplicateDetection'));

// Usage with Suspense
<Suspense fallback={<DashboardSkeleton />}>
  <Dashboard />
</Suspense>
```

### 4. Debounced Search
```tsx
import { useMemo, useState, useEffect } from 'react';

const useDebounced = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
};

// Usage in search component
const SearchInput = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounced(searchTerm, 300);
  
  useEffect(() => {
    if (debouncedSearchTerm) {
      performSearch(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm]);
};
```

## Target Performance Improvements

### Critical Optimizations (High Impact)
1. **CRM Account Lists**: Virtual scrolling for 10k+ records
2. **Search functionality**: Debounced search with 300ms delay
3. **Dashboard loading**: Code splitting to reduce initial bundle
4. **Form interactions**: Memoized form handlers and validation

### Important Optimizations (Medium Impact)  
1. **Table filtering**: Memoized filter calculations
2. **Component rendering**: React.memo for list items
3. **Data fetching**: Background prefetching for navigation
4. **Image loading**: Lazy loading for avatars and attachments

### Nice-to-have Optimizations (Low Impact)
1. **Animation performance**: GPU-accelerated animations
2. **Bundle optimization**: Tree shaking and dead code elimination  
3. **Network optimization**: Request batching and caching
4. **Memory optimization**: Cleanup and garbage collection

## Performance Monitoring

### Metrics to Track
```typescript
// Web Vitals monitoring
const reportWebVitals = (metric: Metric) => {
  switch (metric.name) {
    case 'CLS':
    case 'FID':  
    case 'FCP':
    case 'LCP':
    case 'TTFB':
      // Log to analytics service
      analytics.track('web_vital', {
        name: metric.name,
        value: metric.value,
        page: window.location.pathname
      });
      break;
  }
};
```

### Performance Budgets
- **JavaScript bundle**: <500KB gzipped
- **First Contentful Paint**: <2 seconds  
- **Largest Contentful Paint**: <2.5 seconds
- **Cumulative Layout Shift**: <0.1
- **First Input Delay**: <100ms

## Bundle Analysis & Optimization

### Analysis Tools
```bash
# Analyze bundle size
npm run build && npx vite-bundle-analyzer dist

# Check for duplicate dependencies
npx duplicate-package-checker-webpack-plugin

# Performance profiling
npm run build:profile
```

### Optimization Targets
1. **Large dependencies**: Chart libraries, UI frameworks
2. **Duplicate code**: Shared utilities and components
3. **Unused imports**: Dead code elimination
4. **Asset optimization**: Image compression and formats

## Database & Query Optimization

### Supabase Performance
```sql
-- Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_accounts_search 
ON accounts USING gin(to_tsvector('english', name || ' ' || email));

CREATE INDEX IF NOT EXISTS idx_contacts_account_id 
ON contacts(account_id) WHERE deleted_at IS NULL;

-- Optimize RPC functions
EXPLAIN ANALYZE SELECT * FROM scan_for_duplicates('accounts', 0.8);
```

### Client-side Caching
```typescript
// React Query for intelligent caching
const useAccounts = (filters: CRMFilters) => {
  return useQuery({
    queryKey: ['accounts', filters],
    queryFn: () => fetchAccounts(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
};
```

## Implementation Timeline

### Week 1: React Optimization
- Fix useEffect dependencies
- Add memoization to heavy components
- Implement virtual scrolling for tables

### Week 2: Code Splitting  
- Split routes with React.lazy
- Defer non-critical components
- Optimize bundle size

### Week 3: Data & Query Optimization
- Implement pagination
- Add database indexes
- Set up intelligent caching

### Week 4: Testing & Monitoring
- Performance testing with large datasets
- Web Vitals monitoring setup
- Final optimizations based on metrics

## Testing Strategy

### Performance Testing
- [ ] **Load testing**: Test with 10k+ records in tables
- [ ] **Network simulation**: Test with slow 3G connections
- [ ] **Device testing**: Test on low-end mobile devices  
- [ ] **Memory profiling**: Check for memory leaks in long sessions

### Validation Criteria
- [ ] CRM lists scroll smoothly with 10k records
- [ ] Search results appear within 200ms
- [ ] Initial page load under 2 seconds
- [ ] No memory leaks during extended usage
- [ ] Bundle size reduced by 20%

## Acceptance Criteria
- [ ] All useEffect dependencies correctly specified (ESLint rule)
- [ ] Heavy list components use virtual scrolling
- [ ] Search input debounced with 300ms delay
- [ ] Route-based code splitting implemented
- [ ] Core Web Vitals meet Google's "Good" thresholds
- [ ] Manual performance testing passes on low-end devices
- [ ] Bundle analysis shows 20% size reduction
- [ ] No performance regressions in existing functionality

## Dependencies
- React Query or SWR for caching
- react-window for virtual scrolling  
- Bundle analyzer tools
- Performance monitoring service (optional)

## Labels
- `priority: medium`
- `type: enhancement`
- `area: performance`  
- `area: user-experience`
- `status: planned`