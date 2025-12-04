# Deploy Missing Schema Objects Migration

## Overview
This migration adds all the missing database tables, columns, and views that the TypeScript codebase expects but don't currently exist in production.

## What Gets Created

### 1. New Columns
- `profiles.is_staff` - Boolean flag for staff users
- `leads.contact_count` - Track number of contacts with lead
- `leads.email_opens` - Track email open count
- `leads.email_clicks` - Track email click count

### 2. New Tables
- `lead_auto_drivers` - Store driver information for auto insurance leads
- `lead_auto_vehicles` - Store vehicle information for auto insurance leads
- `knowledge_base_queries` - Track knowledge base search queries and feedback

### 3. New Views
- `knowledge_usage_stats` - KB article usage metrics
- `knowledge_search_trends` - Popular search queries over time
- `knowledge_gap_trends` - Unanswered queries (knowledge gaps)
- `knowledge_category_stats` - Category-level performance metrics

## Deployment Steps

### Option 1: Via Supabase CLI (Recommended)

```bash
# 1. Link to your project (if not already linked)
supabase link --project-ref lrqajzwcmdwahnjyidgv

# 2. Push the migration to production
supabase db push

# 3. Verify it applied successfully
supabase db diff

# 4. Regenerate TypeScript types
supabase gen types typescript --project-id lrqajzwcmdwahnjyidgv > src/integrations/supabase/types.ts
```

### Option 2: Via Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/lrqajzwcmdwahnjyidgv/sql/new
2. Copy the contents of: `supabase/migrations/20251204_add_missing_schema_objects.sql`
3. Paste into the SQL Editor
4. Click "Run" to execute
5. Verify no errors in the output
6. Regenerate types:
   ```bash
   supabase gen types typescript --project-id lrqajzwcmdwahnjyidgv > src/integrations/supabase/types.ts
   ```

### Option 3: Via Local Supabase Access Token

```bash
# Set your access token
export SUPABASE_ACCESS_TOKEN=sbp_709723b6d66f36e8f72cef7f825704f88965d11a

# Push migrations
supabase db push

# Regenerate types
supabase gen types typescript --project-id lrqajzwcmdwahnjyidgv > src/integrations/supabase/types.ts
```

## After Migration

### 1. Regenerate TypeScript Types
After running the migration, you MUST regenerate the Supabase types:

```bash
supabase gen types typescript --project-id lrqajzwcmdwahnjyidgv > src/integrations/supabase/types.ts
```

### 2. Commit the Updated Types
```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: regenerate Supabase types after schema migration"
git push
```

### 3. Try Lovable Build Again
Once the types are regenerated and pushed, try deploying in Lovable again. The TypeScript errors should now be resolved since:
- All referenced tables now exist
- All referenced columns now exist
- All referenced views now exist
- Types will match the actual database schema

## Verification

After deployment, verify the migration succeeded:

### Check Tables Exist
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('lead_auto_drivers', 'lead_auto_vehicles', 'knowledge_base_queries');
```

### Check Columns Exist
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'is_staff';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'leads'
  AND column_name IN ('contact_count', 'email_opens', 'email_clicks');
```

### Check Views Exist
```sql
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('knowledge_usage_stats', 'knowledge_search_trends', 'knowledge_gap_trends', 'knowledge_category_stats');
```

## Troubleshooting

### If migration fails due to existing objects:
The migration uses `IF NOT EXISTS` clauses, so it's safe to run multiple times. If you get errors about existing objects, they're likely harmless.

### If views fail to create:
The knowledge analytics views depend on `knowledge_base` and `knowledge_base_queries` tables. If `knowledge_base` doesn't exist, you'll need to create it first or comment out the view definitions.

### If RLS policies fail:
Check that the `account_memberships` table exists and has the expected structure. If not, you may need to adjust the RLS policies.

## Rollback

If you need to rollback this migration:

```sql
-- Drop views
DROP VIEW IF EXISTS knowledge_usage_stats CASCADE;
DROP VIEW IF EXISTS knowledge_search_trends CASCADE;
DROP VIEW IF EXISTS knowledge_gap_trends CASCADE;
DROP VIEW IF EXISTS knowledge_category_stats CASCADE;

-- Drop tables
DROP TABLE IF EXISTS lead_auto_drivers CASCADE;
DROP TABLE IF EXISTS lead_auto_vehicles CASCADE;
DROP TABLE IF EXISTS knowledge_base_queries CASCADE;

-- Remove columns
ALTER TABLE profiles DROP COLUMN IF EXISTS is_staff;
ALTER TABLE leads DROP COLUMN IF EXISTS contact_count;
ALTER TABLE leads DROP COLUMN IF EXISTS email_opens;
ALTER TABLE leads DROP COLUMN IF EXISTS email_clicks;
```

## Support

If you encounter any issues:
1. Check the Supabase logs for detailed error messages
2. Verify your database user has sufficient permissions
3. Ensure all dependent tables (leads, profiles, knowledge_base) exist
4. Check for naming conflicts with existing objects
