# Database Migration Instructions

## Summary

You have **7 total migrations** that need to be applied to your production Supabase database:

- **3 schema fix migrations** (apply these first)
- **4 feature migrations** (apply these second)

All migrations are now committed and pushed to GitHub.

---

## Step 1: Apply Schema Fix Migrations (REQUIRED FIRST)

These migrations fix schema mismatches where tables exist but are missing columns:

### 1. `20251205000001_fix_quote_coverages_schema.sql`
- Adds `is_critical` column to `quote_coverages` table
- Creates index on the column
- **Safe to re-run** (uses IF NOT EXISTS)

### 2. `20251205000002_comprehensive_quote_schema_fix.sql`
- Adds all 10 quote ranking columns to `quotes` table if missing
- Ensures `quote_coverages` has all columns
- Creates necessary indexes
- Includes validation checks
- **Safe to re-run** (uses IF NOT EXISTS)

### 3. `20251205000003_fix_all_schema_mismatches.sql`
- **Most comprehensive fix** - fixes ALL known schema issues
- Fixes `quotes`, `quote_coverages`, `retention_interventions`, `document_classifications`, `email_templates`, `communication_history`
- Adds all missing columns across all tables
- Adds constraints safely
- Creates all indexes
- **Safe to re-run** (idempotent)

---

## Step 2: Apply Feature Migrations (After fixes)

Once the schema fixes are applied, these feature migrations will succeed:

### 4. `20251204000001_add_quote_ranking_system.sql` (17KB)
**Features:**
- Multi-dimensional quote ranking (5 scoring dimensions)
- Quote coverages tracking
- Carrier ratings system
- Quote rankings materialized view
- Helper functions for ranking

**Tables Created:**
- Enhanced `quotes` table with scoring columns
- `quote_coverages` - detailed coverage breakdown
- `carrier_ratings` - carrier quality metrics
- `quote_rankings` (materialized view)

### 5. `20251204000002_add_predictive_analytics.sql` (17KB)
**Features:**
- Churn prediction models
- Renewal risk scoring
- Product recommendation engine
- Retention intervention tracking

**Tables Created:**
- `customer_risk_scores` - churn and renewal predictions
- `churn_predictions` (materialized view)
- `product_recommendations` - cross-sell opportunities
- `retention_interventions` - retention effort tracking

### 6. `20251204000003_add_document_classification.sql` (12KB)
**Features:**
- AI-powered document classification
- Auto-routing to queues
- Document urgency detection
- Action recommendations

**Tables Created:**
- `document_classifications` - classification results
- `document_queues` - routing queues
- Helper functions for classification

### 7. `20251204000004_add_ai_email_composer.sql` (18KB)
**Features:**
- Email template management
- Communication history tracking
- Performance metrics
- Engagement tracking (opens, clicks, replies)

**Tables Created:**
- `email_templates` - reusable templates
- `communication_history` - all customer communications
- Helper functions for email composition

---

## How to Apply Migrations

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/lrqajzwcmdwahnjyidgv
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**
4. **Apply in this exact order:**

   **First, apply fix migrations:**
   - Copy/paste `20251205000001_fix_quote_coverages_schema.sql` → Run
   - Copy/paste `20251205000002_comprehensive_quote_schema_fix.sql` → Run
   - Copy/paste `20251205000003_fix_all_schema_mismatches.sql` → Run

   **Then, apply feature migrations:**
   - Copy/paste `20251204000001_add_quote_ranking_system.sql` → Run
   - Copy/paste `20251204000002_add_predictive_analytics.sql` → Run
   - Copy/paste `20251204000003_add_document_classification.sql` → Run
   - Copy/paste `20251204000004_add_ai_email_composer.sql` → Run

5. Verify each migration succeeds before moving to the next

### Option 2: Via Supabase CLI

```bash
# Make sure you're in the project directory
cd /Users/brianlewis/Documents/insurance-function/insureflow-ops

# Link to your Supabase project (if not already linked)
supabase link --project-ref lrqajzwcmdwahnjyidgv

# Push all migrations
supabase db push

# This will apply all migrations in chronological order
```

### Option 3: Via psql Direct Connection

If you have PostgreSQL client installed:

```bash
# Apply each migration in order
psql "postgresql://postgres:[YOUR_PASSWORD]@db.lrqajzwcmdwahnjyidgv.supabase.co:5432/postgres" \
  -f supabase/migrations/20251205000001_fix_quote_coverages_schema.sql

psql "postgresql://postgres:[YOUR_PASSWORD]@db.lrqajzwcmdwahnjyidgv.supabase.co:5432/postgres" \
  -f supabase/migrations/20251205000002_comprehensive_quote_schema_fix.sql

# ... and so on for each migration
```

---

## Verification

After applying all migrations, verify the schema:

### 1. Check that all tables exist:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'quote_coverages',
  'carrier_ratings',
  'customer_risk_scores',
  'product_recommendations',
  'retention_interventions',
  'document_classifications',
  'document_queues',
  'email_templates',
  'communication_history'
)
ORDER BY table_name;
```

Expected: 9 tables

### 2. Check quote_coverages has is_critical column:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'quote_coverages'
AND column_name = 'is_critical';
```

Expected: 1 row (is_critical, boolean)

### 3. Check quotes has all ranking columns:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'quotes'
AND column_name IN (
  'premium', 'quote_score', 'price_score',
  'coverage_completeness_score', 'carrier_rating_score',
  'deductible_score', 'value_score', 'ai_recommendation',
  'scoring_metadata', 'last_scored_at'
)
ORDER BY column_name;
```

Expected: 10 rows

### 4. Check materialized views:

```sql
SELECT matviewname
FROM pg_matviews
WHERE schemaname = 'public'
AND matviewname IN ('quote_rankings', 'churn_predictions')
ORDER BY matviewname;
```

Expected: 2 views

---

## Rollback Plan (if needed)

All migrations are **additive only** - they don't delete or modify existing data. However, if you need to rollback:

### For schema fix migrations:
These only ADD columns, so rollback would be:
```sql
-- Example: Remove added columns
ALTER TABLE public.quote_coverages DROP COLUMN IF EXISTS is_critical;
ALTER TABLE public.retention_interventions DROP COLUMN IF EXISTS customer_retained;
-- etc.
```

### For feature migrations:
```sql
-- Drop tables in reverse order
DROP MATERIALIZED VIEW IF EXISTS public.churn_predictions;
DROP MATERIALIZED VIEW IF EXISTS public.quote_rankings;

DROP TABLE IF EXISTS public.communication_history;
DROP TABLE IF EXISTS public.email_templates;
DROP TABLE IF EXISTS public.document_queues;
DROP TABLE IF EXISTS public.document_classifications;
DROP TABLE IF EXISTS public.retention_interventions;
DROP TABLE IF EXISTS public.product_recommendations;
DROP TABLE IF EXISTS public.customer_risk_scores;
DROP TABLE IF EXISTS public.carrier_ratings;
DROP TABLE IF EXISTS public.quote_coverages;
```

---

## Troubleshooting

### Error: "column already exists"
- **Safe to ignore** - the migration uses `IF NOT EXISTS` and is idempotent
- The migration will continue and complete successfully

### Error: "table already exists"
- **Safe to ignore** - means the table was created in a previous attempt
- The migration will skip table creation and continue

### Error: "relation does not exist"
- This means a table hasn't been created yet
- **Solution:** Run the schema fix migrations (20251205*) first
- Then run the feature migrations (20251204*)

### Error: "constraint already exists"
- **Safe to ignore** - constraints are wrapped in exception handlers
- The migration will continue

---

## Post-Migration Tasks

After successful migration:

1. **Refresh Types** (if using TypeScript)
   ```bash
   supabase gen types typescript --project-id lrqajzwcmdwahnjyidgv > src/integrations/supabase/types.ts
   ```

2. **Test Key Features**
   - Upload a quote and verify scoring works
   - Check that carrier ratings are populated (10 carriers should exist)
   - Test document upload and classification
   - Test email composer

3. **Monitor Performance**
   - Check that materialized views are populated:
     ```sql
     SELECT COUNT(*) FROM public.quote_rankings;
     SELECT COUNT(*) FROM public.churn_predictions;
     ```

---

## Migration Status

- ✅ All 7 migrations are in the repository
- ✅ All 7 migrations are committed to Git
- ✅ All 7 migrations are pushed to GitHub
- ⏳ **PENDING:** Apply to production Supabase database
- ⏳ **PENDING:** Refresh TypeScript types

---

## Support

If you encounter any issues:

1. Check the Supabase Dashboard → Database → Logs
2. Look for error messages in the SQL Editor
3. Verify migration order (schema fixes FIRST, then features)
4. Ensure you're connected to the correct project (lrqajzwcmdwahnjyidgv)

---

**Last Updated:** December 5, 2024
**Migration Count:** 7 total (3 fixes + 4 features)
**Status:** Ready to apply to production
