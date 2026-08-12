# Performance Optimization Plan

## Executive Summary
Analysis completed on December 5, 2024. This document outlines performance optimization opportunities for InsureFlow Ops.

---

## ✅ Current Performance Status

### Good Practices Already in Place:
- ✅ **AI Cache**: KB cache set to 24 hours (excellent)
- ✅ **Code Splitting**: Automatic Vite chunking enabled
- ✅ **Lazy Loading**: React.lazy() used for all pages (74 lazy-loaded components)
- ✅ **Memoization**: 233 instances of useMemo/useCallback
- ✅ **Query Caching**: React Query with 5-min staleTime
- ✅ **Bundle Optimization**: Terser minification, drop console in production

---

## 🎯 High-Impact Optimizations (Do First)

### 1. Type Safety Improvements (51 instances of `as any`)
**Impact**: Prevents runtime errors, improves developer experience
**Effort**: Medium
**Priority**: HIGH

**Files with Most Issues:**
- `src/hooks/useAutoDrivers.ts` (8x) - Table doesn't exist, feature disabled
- `src/hooks/useKnowledgeEditor.ts` (2x) - Supabase join typing issues
- `src/hooks/useRenewalCampaigns.ts` (3x) - JSONB field typing
- `src/hooks/useRecurringTasks.ts` (2x) - Insert/update typing

**Recommendation**:
- **Disabled features** (useAutoDrivers): Leave as-is, add comment explaining why
- **Supabase joins**: Create proper TypeScript interfaces for joined data
- **JSONB fields**: Use zod schemas for runtime validation + type inference

### 2. Add Pagination to Large Data Lists
**Impact**: 50-80% faster page loads for CRM/Leads pages
**Effort**: Medium
**Priority**: HIGH

**Files Needing Pagination:**
- `src/components/crm/LeadList.tsx` - No pagination, loads all leads
- `src/components/crm/AccountList.tsx` - No pagination
- `src/components/renewals/RenewalsList.tsx` - No pagination
- `src/components/ao-renewals/AOImportWizard.tsx` - Loads large datasets

**Recommendation**: Add Supabase `.range()` pagination with page size selector (25/50/100)

### 3. Optimize Largest Components
**Impact**: Faster re-renders, better code maintainability
**Effort**: High
**Priority**: MEDIUM-HIGH

**Largest Files (>800 lines):**
1. `src/pages/ExplorePolicy.tsx` (1001 lines) - Split into smaller components
2. `src/components/ai/AIAssistantChat.tsx` (861 lines) - Extract message list, input form
3. `src/pages/CommandCenterPage.tsx` (851 lines) - Split dashboard sections
4. `src/components/crm/LeadDetailView.tsx` (849 lines) - Extract tabs into separate components

**Recommendation**:
- Extract reusable sub-components
- Add React.memo() to prevent unnecessary re-renders
- Move complex logic to custom hooks

---

## 🔧 Medium-Impact Optimizations

### 4. Database Query Optimization
**Current State**: Only 20 queries use `.limit()` or `.range()`
**Impact**: Reduce data transfer, faster queries
**Effort**: Low
**Priority**: MEDIUM

**Action Items:**
- Add `.limit(100)` to all list queries by default
- Implement cursor-based pagination for infinite scroll
- Use `.select('id,name,email')` instead of `.select('*')` where possible

### 5. Image & Asset Optimization
**Impact**: 20-30% faster page loads
**Effort**: Low
**Priority**: MEDIUM

**Current Issues:**
- No image optimization configured
- Assets not using WebP format
- No lazy loading for images

**Recommendation:**
- Add vite-plugin-imagemin to vite.config.ts
- Convert PNGs to WebP
- Use `loading="lazy"` on all `<img>` tags

### 6. React Query Optimization
**Current Settings:**
```typescript
staleTime: 5 * 60 * 1000,  // 5 minutes
gcTime: 10 * 60 * 1000,     // 10 minutes
retry: 2
```

**Optimization Opportunities:**
- Increase staleTime for static data (carriers, users) to 30 minutes
- Add `keepPreviousData: true` for pagination
- Use `placeholderData` for instant perceived performance

---

## 🚀 Advanced Optimizations (Nice-to-Have)

### 7. Implement Virtual Scrolling
**Impact**: Handle 10,000+ rows without performance degradation
**Effort**: Medium
**Priority**: LOW (only if you have very large datasets)

**Libraries**: @tanstack/react-virtual

**Use Cases:**
- Knowledge base list (if >1000 entries)
- Document library
- Large CRM lists

### 8. Service Worker / Offline Support
**Impact**: App works offline, instant loads on repeat visits
**Effort**: High
**Priority**: LOW

**Tools**: Workbox, vite-plugin-pwa

### 9. Prefetching Critical Data
**Impact**: Instant navigation
**Effort**: Medium
**Priority**: LOW

**Strategy:**
- Prefetch top 10 accounts on dashboard load
- Prefetch user's recent items
- Preload next page of paginated data

---

## 📊 Performance Metrics to Track

**Current Metrics** (need to measure):
- [ ] Largest Contentful Paint (LCP) - Target: <2.5s
- [ ] First Input Delay (FID) - Target: <100ms
- [ ] Cumulative Layout Shift (CLS) - Target: <0.1
- [ ] Time to Interactive (TTI) - Target: <3.5s
- [ ] Bundle size - Current: ~3.7 MB uncompressed

**Tools to Use:**
- Lighthouse (built into Chrome DevTools)
- Web Vitals library (already added in performanceMonitor.ts)
- Netlify Analytics

---

## 🏁 Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)
1. ✅ Remove console.logs from production (already configured)
2. Add pagination to top 3 list components
3. Add React.memo to top 5 largest components
4. Fix 10 most critical `as any` casts

### Phase 2: Medium Effort (1 week)
1. Split ExplorePolicy.tsx into smaller components
2. Add database query limits to all queries
3. Implement proper TypeScript types for Supabase joins
4. Optimize images and add lazy loading

### Phase 3: Advanced (2+ weeks)
1. Add virtual scrolling to large lists
2. Implement prefetching strategy
3. Add offline support with service workers
4. Performance monitoring dashboard

---

## 🎯 Success Criteria

**Performance Targets:**
- [ ] LCP < 2.5 seconds
- [ ] Bundle size < 2 MB (gzipped)
- [ ] Zero TypeScript errors
- [ ] <10 instances of `as any` (only for disabled features)
- [ ] All large lists paginated (>100 items)
- [ ] 90+ Lighthouse score

**Code Quality Targets:**
- [ ] No files >600 lines
- [ ] All components memoized where appropriate
- [ ] All queries have explicit limits
- [ ] Proper error boundaries on all pages

---

## 📝 Notes

- **Don't over-optimize**: Focus on user-facing performance first
- **Measure first**: Use Lighthouse before and after changes
- **Test on slow connections**: Use Chrome DevTools network throttling
- **Monitor production**: Set up real user monitoring (RUM)

---

**Last Updated**: December 5, 2024
**Status**: Plan created, ready for implementation
