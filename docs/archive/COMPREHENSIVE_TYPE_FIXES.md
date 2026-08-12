# Comprehensive TypeScript Error Fixes

## Build Failure #8 - Root Cause Analysis

**Problem:** TypeScript errors keep recurring because we're fixing symptoms, not root causes.

**Root Causes:**
1. Edge functions import npm packages incompatible with Deno
2. Local type interfaces don't match Supabase-generated schema
3. Json types need type guards but we've only fixed some
4. Properties exist in DB but aren't accessible in code

## ALL Errors to Fix (Systematic)

### Category 1: Edge Function Import Errors
- `send-coi-email/index.ts` - imports `npm:resend@2.0.0`
- Solution: Comment out temporarily OR use Deno-compatible alternative

### Category 2: Json Type Mismatches
These properties are `Json` in Supabase but code expects specific types:

1. **AdvancedImportSystem.tsx** - `validation_errors` (Json → any[])
   - Already has type guard but may need refinement

2. **EnhancedAuditViewer.tsx** - `actions_taken` (Json → any[])
   - Needs type guard

### Category 3: Missing Property Access
Properties exist in DB but TypeScript doesn't see them:

1. **useAIBrain.ts** - `sources` property
   - RPC result needs proper typing

2. **useAuth.ts:127** - Destructuring issue
   - Need to check actual error

3. **useAssignmentRules.ts** - `account_id` insertion
   - Need to verify schema

### Category 4: String Literal Type Mismatches
DB returns string but code expects union:

1. **TCPACompliance.tsx** - `channel` (string → "sms" | "voice")
2. **LeadDetailView.tsx** - `status` type
3. **AddQuoteModal.tsx** - Already fixed
4. **EditQuoteModal.tsx** - Status type

## Execution Plan

1. ✅ Comment out all problematic edge function imports
2. ✅ Add type guards for ALL Json → array conversions
3. ✅ Cast ALL string literals to union types
4. ✅ Fix destructuring and hook issues
5. ✅ Single commit with ALL fixes
