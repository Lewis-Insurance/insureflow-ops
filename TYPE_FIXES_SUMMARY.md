# TypeScript Type Fixes Required for Deployment

## Summary
The build is failing due to ~25+ TypeScript errors where code accesses properties on `Json` types (from Supabase) without proper type guards, or references properties that don't exist in the generated types.

## Root Cause
Supabase generates types where JSONB columns are typed as `Json` which is:
```typescript
type Json = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[]
```

TypeScript won't let you access `.property` on `Json` without type narrowing.

## Files Requiring Fixes

### 1. AIAssistantChat.tsx
**Issues:**
- Line 142-144: `convContext?.type` and `convContext?.id` - `context` is `Json | null`
- Line 169: `(msg.metadata)?.documents` - `metadata` is `Json | null`

**Fix:**
```typescript
// Add type guard helper at top of file
function isAIContextJson(value: unknown): value is { type: string; id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'id' in value &&
    typeof (value as any).type === 'string' &&
    typeof (value as any).id === 'string'
  );
}

function isMessageMetadata(value: unknown): value is { documents?: DocumentInfo[] } {
  return typeof value === 'object' && value !== null;
}

// Then use in code:
const matchingConversation = existingConversations?.find((conv) => {
  const convContext = conv.context;
  if (contextType && contextId && isAIContextJson(convContext)) {
    return convContext.type === contextType && convContext.id === contextId;
  }
  return !convContext;
});

// And:
const loadedMessages: Message[] = savedMessages.map((msg) => ({
  id: msg.id || crypto.randomUUID(),
  role: msg.role as 'user' | 'assistant',
  content: msg.content,
  timestamp: new Date(msg.created_at),
  documents: isMessageMetadata(msg.metadata) ? msg.metadata.documents : undefined,
}));
```

### 2. RuleBuilderModal.tsx
**Issue:** Missing required `account_id` property when creating automation rules

**Fix:**
```typescript
// Ensure account_id is included when inserting:
const { data, error } = await supabase
  .from('automation_rules')
  .insert([{
    ...ruleData,
    account_id: accountId || null, // Add this field
  }])
  .select()
  .single();
```

### 3. AdvancedImportSystem.tsx
**Issue:** `validation_errors` expects `any[]` but gets `Json`

**Fix:**
```typescript
// Add type guard
function isValidationErrorArray(value: unknown): value is any[] {
  return Array.isArray(value);
}

// Use when accessing:
const errors = isValidationErrorArray(record.validation_errors)
  ? record.validation_errors
  : [];
```

### 4. EnhancedAuditViewer.tsx
**Issues:**
- `ip_address` is `unknown` but interfaces expect `string`
- Missing `entity_type`, `occurred_at` properties

**Fix:**
```typescript
// Update interface to match database:
interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null; // Add this
  entity_id: string | null;
  ip_address: unknown; // Keep as unknown, then cast when needed
  user_agent: string | null;
  created_at: string;
  occurred_at?: string; // Add this if it exists in DB
  // ... other fields
}

// Cast when using:
<span>{typeof log.ip_address === 'string' ? log.ip_address : 'Unknown'}</span>
```

### 5. LeadDetailView.tsx
**Issues:**
- `address_line1`, `scoring_factors`, `scoring_recommendation`, `last_scored_at` don't exist on Lead type

**Fix:**
Either these fields need to be added to the Lead type, or the code needs to stop referencing them.

**Option A:** Add to Lead type (if they exist in database):
```typescript
export interface Lead {
  // ... existing fields
  address_line1?: string;
  scoring_factors?: Json;
  scoring_recommendation?: string;
  last_scored_at?: string;
}
```

**Option B:** Remove references if they don't exist:
- Search for `lead.address_line1` and replace with proper field
- Remove references to `scoring_factors`, `scoring_recommendation`, `last_scored_at`

### 6. LeadList.tsx
**Issues:**
- Lead type missing `contact_count`, `email_opens`, `email_clicks`

**Fix:**
Add these fields to Lead type if they exist in database:
```typescript
export interface Lead {
  // ... existing fields
  contact_count?: number;
  email_opens?: number;
  email_clicks?: number;
}
```

Or use type assertions where needed:
```typescript
const extendedLead = lead as Lead & {
  contact_count?: number;
  email_opens?: number;
  email_clicks?: number;
};
```

### 7. TCPACompliance.tsx
**Issue:** `ip_address` type mismatch (unknown vs string)

**Fix:**
```typescript
// Cast when needed:
const ipAddress = typeof consent.ip_address === 'string'
  ? consent.ip_address
  : 'Unknown';
```

## Recommended Approach

### Short-term (Quick Deploy Fix):
1. Add type guards/assertions for Json types
2. Add missing properties to interfaces with optional `?` marker
3. Cast unknown types where needed

### Long-term (Proper Solution):
1. Regenerate Supabase types: `npx supabase gen types typescript`
2. Update all interfaces to match generated types
3. Remove unnecessary type assertions
4. Add proper database columns for any missing fields

## Quick Fix Script

I can create a script that applies all these fixes automatically. Would you like me to:
1. Apply all fixes manually (file by file)?
2. Create a single commit with all fixes?
3. Prioritize just enough fixes to get the build passing?

## Impact
- **Blocker:** Yes - prevents deployment
- **Complexity:** Medium - mostly type guards and assertions
- **Time Estimate:** 1-2 hours to fix all files properly
- **Risk:** Low - these are type-only fixes, no runtime changes
