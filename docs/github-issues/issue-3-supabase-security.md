# Issue #3: Fix Supabase Security Warnings

## Status: 🔄 PARTIALLY COMPLETED

## Description
Resolve all Supabase security linter warnings to ensure database security and compliance with best practices.

## Progress Summary
- ✅ **Completed**: Created secure replacement functions 
- 🔄 **In Progress**: Manual removal of problematic views
- 📋 **Pending**: Extension migration and auth settings

## Tasks Completed
- [x] Created `get_my_policies()` secure function
- [x] Created `get_my_claims()` secure function  
- [x] Created `get_policies_with_claims()` secure function
- [x] Added proper `SECURITY DEFINER` with explicit `search_path`
- [x] Set appropriate permissions (`REVOKE`/`GRANT`)

## Tasks Remaining

### Critical (Manual Intervention Required)
- [ ] **Remove original security definer views** (3 ERROR-level warnings)
  - Drop problematic views that bypass RLS
  - Update any code references to use new functions
  
- [ ] **Move `pg_trgm` extension to extensions schema**
  ```sql
  ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  ```

- [ ] **Enable leaked password protection**
  - Navigate to Supabase Auth settings
  - Enable "Leaked password protection" feature
  
- [ ] **Upgrade Postgres version**
  - Coordinate with ops team for database upgrade
  - Apply latest security patches

## Implementation Details

### Secure Functions Created
```sql
-- User-scoped policy access
CREATE OR REPLACE FUNCTION public.get_my_policies()
RETURNS SETOF policies
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT * FROM policies WHERE insured_user_id = auth.uid(); $$;

-- User-scoped claims access  
CREATE OR REPLACE FUNCTION public.get_my_claims()
RETURNS SETOF claims
LANGUAGE sql STABLE SECURITY DEFINER  
SET search_path = public
AS $$
  SELECT c.* FROM claims c
  JOIN policies p ON c.policy_id = p.id
  WHERE p.insured_user_id = auth.uid();
$$;

-- Combined policy-claims view with proper RLS
CREATE OR REPLACE FUNCTION public.get_policies_with_claims()
RETURNS TABLE (...)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*, c.* FROM policies p
  LEFT JOIN claims c ON c.policy_id = p.id
  WHERE (is_staff(auth.uid()) OR p.insured_user_id = auth.uid());
$$;
```

### Security Improvements
- Functions use `SECURITY DEFINER` with explicit `search_path = public`
- Proper RLS enforcement through `auth.uid()` checks
- Permissions restricted to `authenticated` role only
- No public access to sensitive functions

## Current Security Status
```
🚨 SECURITY LINTER RESULTS 🚨
ERROR 1-3: Security Definer View (3 instances) - NEEDS MANUAL REMOVAL
WARN 4: Function Search Path Mutable - RESOLVED  
WARN 5: Extension in Public - NEEDS SCHEMA MIGRATION
WARN 6: Leaked Password Protection Disabled - NEEDS AUTH CONFIG
WARN 7: Postgres Version Security Patches - NEEDS UPGRADE
```

## Manual Steps Required

### 1. Remove Security Definer Views
```sql
-- List existing views to identify which ones to drop
SELECT schemaname, viewname FROM pg_views 
WHERE schemaname = 'public' 
AND definition LIKE '%SECURITY DEFINER%';

-- Drop the problematic views (names TBD)
DROP VIEW IF EXISTS public.my_policies;
DROP VIEW IF EXISTS public.my_claims;  
DROP VIEW IF EXISTS public.policies_with_claims;
```

### 2. Extension Schema Migration
```sql
-- Create extensions schema if not exists
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move extension
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Update search_path in functions if needed
```

### 3. Auth Configuration
- Login to Supabase Dashboard → Authentication → Settings
- Enable "Leaked password protection" 
- Configure password strength requirements

## Acceptance Criteria
- [ ] Zero ERROR-level security warnings in Supabase linter
- [ ] All WARNING-level issues resolved or documented
- [ ] Security functions working correctly in production
- [ ] No regression in application functionality
- [ ] Documentation updated with security decisions

## Risk Assessment
**Low Risk**: Function replacements maintain same interface
**Medium Risk**: Extension migration may require function updates  
**High Risk**: View removal could break undocumented dependencies

## Labels
- `priority: high` 
- `type: security`
- `area: database`
- `status: in-progress`