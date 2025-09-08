# Issue #5: Replace Remaining 'any' Types with Proper Typing

## Status: 📋 PLANNED

## Description
Systematically replace all remaining `any` type usage (~40 occurrences) with proper TypeScript types to improve type safety and developer experience.

## Background
With strict TypeScript mode enabled, we need to eliminate remaining `any` usage that bypasses type checking and creates potential runtime errors.

## Tasks to Complete

### Phase 1: Generate and Use Supabase Types
- [ ] Generate Supabase types: `supabase gen types typescript > src/types/database.ts`
- [ ] Import and use Database types throughout codebase
- [ ] Replace manual type definitions with generated types

### Phase 2: Component Props and State
- [ ] **React Components**: Replace `any` in component props and state
- [ ] **Event Handlers**: Type event parameters properly
- [ ] **Refs**: Use proper ref types instead of `any`
- [ ] **Context**: Type React context values

### Phase 3: API and Data Layer
- [ ] **Supabase Queries**: Use generated types for query results
- [ ] **RPC Calls**: Type RPC function parameters and return values  
- [ ] **Error Handling**: Replace `any` in catch blocks with `unknown`
- [ ] **JSON Data**: Type JSON payloads and responses

### Phase 4: Utility Functions
- [ ] **Form Data**: Type form validation and submission
- [ ] **Transformers**: Type data transformation functions
- [ ] **Helpers**: Add proper types to utility functions

## Implementation Strategy

### 1. Database Types
```typescript
// Generate types
import { Database } from '@/types/database';

// Use throughout codebase  
type Profile = Database['public']['Tables']['profiles']['Row'];
type Account = Database['public']['Tables']['accounts']['Row'];
type Contact = Database['public']['Tables']['contacts']['Row'];
```

### 2. Error Handling Pattern
```typescript
// Replace this
catch (err: any) {
  console.log(err.message);
}

// With this  
catch (err: unknown) {
  toast({
    variant: 'destructive', 
    title: 'Error',
    description: asMessage(err)
  });
}
```

### 3. Event Handlers
```typescript
// Replace this
const handleSubmit = (e: any) => { ... }

// With this
const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => { ... }
```

### 4. Component Props
```typescript
// Replace this
interface ComponentProps {
  data: any;
  onChange: (value: any) => void;
}

// With this
interface ComponentProps {
  data: Account[];
  onChange: (value: Account) => void;
}
```

## Target Areas for Cleanup

### High Priority (Core Data Flow)
1. **Supabase query results** - Use generated Database types
2. **RPC function calls** - Type parameters and returns  
3. **Form submissions** - Type form data and validation
4. **Error boundaries** - Type error objects properly

### Medium Priority (Developer Experience)
1. **Component interfaces** - Type all props and state
2. **Event handlers** - Type DOM events correctly
3. **Utility functions** - Add input/output types
4. **Context providers** - Type context values

### Low Priority (Edge Cases)
1. **Third-party integrations** - Type external library interfaces
2. **Legacy code** - Gradual migration of older components
3. **Configuration objects** - Type config and settings

## Success Metrics
- **Target**: Reduce `any` usage from ~40 to ≤5 occurrences
- **Safe boundaries**: Remaining `any` only in typed interop layers
- **CI enforcement**: TypeScript strict mode catches new `any` usage
- **Developer experience**: Better IDE autocompletion and error detection

## Quality Assurance

### Validation Steps
- [ ] Run `grep -r "any" src/` to track progress
- [ ] Ensure CI passes with strict TypeScript
- [ ] Test all modified components for regressions
- [ ] Verify IDE autocompletion works correctly

### Testing Strategy
- Manual testing of type-safe refactored components
- Verify error handling improvements  
- Check that strict mode catches new issues
- Validate Supabase query type safety

## Risk Assessment
**Low Risk**: Incremental changes with type safety verification
**Medium Risk**: Large interface changes may require broader updates
**Mitigation**: Phase implementation and test each area thoroughly

## Dependencies
- Issue #1 (TypeScript Strict Mode) - ✅ Completed
- Generated Supabase types
- Updated ESLint rules for `any` detection

## Estimated Timeline
- **Phase 1**: 1-2 days (Database types)
- **Phase 2**: 2-3 days (Components) 
- **Phase 3**: 2-3 days (API layer)
- **Phase 4**: 1-2 days (Utilities)
- **Total**: 1-2 weeks

## Acceptance Criteria
- [ ] `grep -r "\\bany\\b" src/` shows ≤5 occurrences
- [ ] All remaining `any` usage is documented and justified
- [ ] TypeScript strict mode passes in CI
- [ ] No functionality regressions in manual testing
- [ ] IDE provides better autocompletion and error detection

## Labels
- `priority: medium`
- `type: enhancement` 
- `area: type-safety`
- `area: developer-experience`
- `status: planned`