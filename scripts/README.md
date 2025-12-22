# Validation Scripts

This directory contains validation and auditing scripts for the InsureFlow codebase.

## Scripts

### 1. `validate-schema.ts`
Pre-flight schema validation before code generation.

**Usage:**
```bash
tsx scripts/validate-schema.ts <table_name>
```

**Example:**
```bash
tsx scripts/validate-schema.ts policies
```

**What it checks:**
- Table existence
- Column definitions and types
- Enum type values
- RLS policy presence
- Foreign key relationships

### 2. `audit-rls-policies.ts`
Audits Row-Level Security (RLS) policies across all tables.

**Usage:**
```bash
# Audit all tables
tsx scripts/audit-rls-policies.ts

# Audit specific table
tsx scripts/audit-rls-policies.ts <table_name>
```

**Example:**
```bash
tsx scripts/audit-rls-policies.ts policies
```

**What it checks:**
- RLS enabled status
- Multi-tenant isolation patterns
- Policy coverage (SELECT, INSERT, UPDATE, DELETE)
- Account membership checks
- Staff access patterns

### 3. `check-type-consistency.ts`
Compares TypeScript types with database schemas.

**Usage:**
```bash
tsx scripts/check-type-consistency.ts <table_name>
```

**Example:**
```bash
tsx scripts/check-type-consistency.ts policies
```

**What it checks:**
- Enum values match between DB and TS
- Column types match type definitions
- Required fields are properly typed
- Nullability consistency

## Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Set environment variables:
```bash
VITE_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Or create a `.env` file:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Notes

- These scripts require a Supabase connection with service role key
- They use `exec_sql` RPC function (you may need to create this function in your database)
- For production use, consider adding these to CI/CD pipeline

## Creating exec_sql RPC Function

If the `exec_sql` function doesn't exist, create it:

```sql
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT, params TEXT[] DEFAULT ARRAY[]::TEXT[])
RETURNS TABLE(result JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  -- This is a simplified version - you may need to adapt based on your needs
  RETURN QUERY EXECUTE format('SELECT to_jsonb(t.*) FROM (%s) t', sql) USING params;
END;
$$;
```

**Warning:** The `exec_sql` function with dynamic SQL can be a security risk. Consider:
- Restricting to specific schemas
- Adding input validation
- Using parameterized queries only
- Limiting access to service role

