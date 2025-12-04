#!/bin/bash

# Database Schema Verification Script for InsureFlow Ops
# This script checks migration file integrity and provides verification steps

set -e

echo "🔍 InsureFlow Ops - Database Schema Verification"
echo "================================================"
echo ""

# Change to project root
cd "$(dirname "$0")/.."

# Count migration files
MIGRATION_COUNT=$(ls -1 supabase/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')

echo "📊 Migration Statistics:"
echo "  - Total migration files: $MIGRATION_COUNT"
echo ""

# Check for duplicate migrations
echo "🔎 Checking for duplicate migration timestamps..."
DUPLICATES=$(ls supabase/migrations/*.sql | sed 's/.*\///' | cut -d'_' -f1 | sort | uniq -d)

if [ -z "$DUPLICATES" ]; then
  echo "  ✅ No duplicate timestamps found"
else
  echo "  ⚠️  Duplicate timestamps found:"
  echo "$DUPLICATES" | sed 's/^/    /'
fi
echo ""

# Get first and last migration
FIRST_MIGRATION=$(ls supabase/migrations/*.sql | head -1 | sed 's/.*\///')
LAST_MIGRATION=$(ls supabase/migrations/*.sql | tail -1 | sed 's/.*\///')

echo "📅 Migration Timeline:"
echo "  - First migration: $FIRST_MIGRATION"
echo "  - Last migration:  $LAST_MIGRATION"
echo ""

# Check if supabase CLI is installed
if command -v supabase &> /dev/null; then
  echo "✅ Supabase CLI is installed"
  SUPABASE_VERSION=$(supabase --version)
  echo "  Version: $SUPABASE_VERSION"
  echo ""

  echo "🔗 To verify against production database:"
  echo "  1. Link to production:"
  echo "     supabase link --project-ref lrqajzwcmdwahnjyidgv"
  echo ""
  echo "  2. Check for schema differences:"
  echo "     supabase db diff --linked"
  echo ""
  echo "  3. Pull current production schema (if needed):"
  echo "     supabase db pull"
  echo ""
else
  echo "⚠️  Supabase CLI is not installed"
  echo ""
  echo "Install with:"
  echo "  brew install supabase/tap/supabase"
  echo ""
fi

# Check database_rpcs.sql
if [ -f "database_rpcs.sql" ]; then
  echo "📄 Database RPCs file found:"
  RPC_COUNT=$(grep -c "CREATE OR REPLACE FUNCTION" database_rpcs.sql || echo "0")
  echo "  - Contains ~$RPC_COUNT RPC functions"
  echo ""
else
  echo "⚠️  database_rpcs.sql not found in root directory"
  echo ""
fi

# Check supabase config
if [ -f "supabase/config.toml" ]; then
  echo "⚙️  Supabase configuration found:"
  PROJECT_ID=$(grep "project_id" supabase/config.toml | cut -d'"' -f2)
  echo "  - Project ID: $PROJECT_ID"
  echo ""
else
  echo "⚠️  supabase/config.toml not found"
  echo ""
fi

echo "📋 Next Steps:"
echo "  1. Review the verification guide: scripts/verify-schema.md"
echo "  2. Run: supabase link --project-ref lrqajzwcmdwahnjyidgv"
echo "  3. Run: supabase db diff --linked"
echo ""

echo "🔗 Production Database:"
echo "  - Project: lrqajzwcmdwahnjyidgv"
echo "  - URL: https://lrqajzwcmdwahnjyidgv.supabase.co"
echo "  - Dashboard: https://supabase.com/dashboard/project/lrqajzwcmdwahnjyidgv"
echo ""

echo "✅ Local migration check complete!"
