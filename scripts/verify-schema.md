# Database Schema Verification Guide

## Overview
This guide helps verify that the local migration files match the production Supabase database schema.

## Current Status
- **Total Migration Files**: 234
- **Production Supabase Project**: lrqajzwcmdwahnjyidgv
- **Production URL**: https://lrqajzwcmdwahnjyidgv.supabase.co

## Verification Steps

### Option 1: Using Supabase CLI (Recommended)

1. **Install Supabase CLI** (if not already installed):
   ```bash
   brew install supabase/tap/supabase
   ```

2. **Link to your production project**:
   ```bash
   cd /Users/brianlewis/Documents/insurance-function/insureflow-ops
   supabase link --project-ref lrqajzwcmdwahnjyidgv
   ```

3. **Compare local and remote schemas**:
   ```bash
   supabase db diff --linked
   ```

   This will show any differences between your local migrations and production.

4. **Pull current production schema** (if needed):
   ```bash
   supabase db pull
   ```

### Option 2: Manual Verification via Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/lrqajzwcmdwahnjyidgv/editor

2. Run this query to check applied migrations:
   ```sql
   SELECT version, name
   FROM supabase_migrations.schema_migrations
   ORDER BY version DESC
   LIMIT 50;
   ```

3. Compare with local migration files in `supabase/migrations/`

### Option 3: Automated Script Verification

Run the verification script:
```bash
node scripts/verify-schema.js
```

## Key Tables to Verify

Based on the application analysis, these are the critical tables that should exist:

### Core Tables
- `profiles` - User profiles and authentication
- `workspaces` - Multi-tenant workspace management
- `workspace_members` - Workspace membership

### CRM Tables
- `accounts` - Customer accounts (businesses/individuals)
- `contacts` - Contact information
- `leads` - Lead management
- `lead_sources` - Lead source tracking
- `pipeline_stages` - Sales pipeline configuration

### Insurance Tables
- `policies` - Insurance policies
- `quotes` - Insurance quotes
- `renewals` - Policy renewals
- `claims` - Claims management

### Task & Automation Tables
- `tasks` - Task management
- `task_templates` - Reusable task templates
- `task_automations` - Automation rules
- `automation_rules` - Business automation rules

### Communication Tables
- `tickets` - Support tickets
- `ticket_messages` - Ticket conversations
- `email_logs` - Email tracking
- `sms_logs` - SMS tracking
- `call_logs` - Call recording logs

### Document Management Tables
- `documents` - Document storage metadata
- `document_analysis` - AI document analysis results
- `document_analysis_cache` - OCR cache (7-day TTL)

### AI & Knowledge Tables
- `knowledge_base` - Knowledge entries with embeddings
- `knowledge_gaps` - Unanswered questions tracking
- `ai_conversations` - Chat history
- `ai_messages` - Individual messages

### Analytics Tables
- `analytics_events` - Event tracking
- `agent_commissions` - Commission calculations

## Expected Database Functions (RPCs)

Check that these RPC functions exist:

### Knowledge Management
- `kb_resolve_answer` - RAG query with vector search
- `kb_search_knowledge` - Knowledge base search
- `log_knowledge_gap` - Log unanswered questions

### Lead Management
- `calculate_lead_score` - Lead scoring algorithm
- `search_leads` - Full-text lead search
- `search_customers` - Full-text customer search

### Renewal Management
- `calculate_renewal_risk` - Renewal risk assessment
- `get_renewal_analytics` - Renewal metrics

### Document Processing
- `get_document_analysis` - Retrieve analysis results
- `batch_process_documents` - Bulk processing

## Expected Database Views

- `account_activity_view` - Account activity timeline
- `lead_pipeline_view` - Pipeline metrics
- `renewal_pipeline_view` - Renewal metrics
- `task_analytics_view` - Task completion metrics

## Row Level Security (RLS) Verification

All tables should have RLS policies enabled. Check with:

```sql
SELECT schemaname, tablename,
       rowsecurity
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY tablename;
```

Expected result: All application tables should have `rowsecurity = true`

## Storage Buckets

Verify these storage buckets exist:
- `documents` - Document uploads (50MB limit)
- `images` - Image uploads
- `avatars` - User profile pictures

Check with:
```sql
SELECT * FROM storage.buckets;
```

## Migration Health Check

### 1. Check for Failed Migrations
```sql
SELECT * FROM supabase_migrations.schema_migrations
WHERE statements IS NULL OR statements = '';
```

Should return 0 rows.

### 2. Check Last Migration Date
```sql
SELECT MAX(version)::date as last_migration_date
FROM supabase_migrations.schema_migrations;
```

### 3. Count Applied Migrations
```sql
SELECT COUNT(*) as applied_migrations
FROM supabase_migrations.schema_migrations;
```

Expected: ~234 migrations

## Common Issues & Solutions

### Issue 1: Migration Mismatch
**Symptoms**: Local migrations don't match production
**Solution**:
```bash
supabase db pull  # Pull current schema
supabase db diff  # Check differences
```

### Issue 2: Missing Tables
**Symptoms**: Tables in code but not in database
**Solution**: Apply missing migrations
```bash
supabase db push
```

### Issue 3: RLS Errors
**Symptoms**: "permission denied" errors in production
**Solution**: Verify RLS policies are correctly applied

## Next Steps After Verification

1. ✅ If schemas match: Proceed to Phase 2 (UI fixes)
2. ⚠️  If minor differences: Create reconciliation migration
3. ❌ If major differences: Stop and investigate before proceeding

## Documentation

- Supabase CLI Docs: https://supabase.com/docs/guides/cli
- Migration Guide: https://supabase.com/docs/guides/cli/local-development
- RLS Guide: https://supabase.com/docs/guides/auth/row-level-security

---

**Last Updated**: 2025-12-03
**Project**: InsureFlow Ops
**Database**: lrqajzwcmdwahnjyidgv
