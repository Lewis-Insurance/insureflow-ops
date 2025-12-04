#!/bin/bash

# =============================================================================
# Database Schema Verification Script
# =============================================================================
# This script helps verify that local migrations match the production database
# and identifies any schema drift or missing migrations.
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}InsureFlow Ops - Database Schema Verification${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI is not installed${NC}"
    echo -e "${YELLOW}Install it with: npm install -g supabase${NC}"
    echo -e "${YELLOW}Or: brew install supabase/tap/supabase${NC}"
    exit 1
fi

# Check if we're in the correct directory
if [ ! -d "supabase/migrations" ]; then
    echo -e "${RED}Error: supabase/migrations directory not found${NC}"
    echo -e "${YELLOW}Please run this script from the project root directory${NC}"
    exit 1
fi

# Count migration files
MIGRATION_COUNT=$(find supabase/migrations -name "*.sql" | wc -l)
echo -e "${GREEN}✓${NC} Found ${MIGRATION_COUNT} migration files in supabase/migrations/"
echo ""

# List recent migrations
echo -e "${BLUE}Recent migrations (last 10):${NC}"
find supabase/migrations -name "*.sql" | sort | tail -n 10 | while read file; do
    filename=$(basename "$file")
    echo -e "  ${GREEN}•${NC} $filename"
done
echo ""

# Check for Supabase connection
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo -e "${YELLOW}⚠ SUPABASE_ACCESS_TOKEN not set${NC}"
    echo -e "${YELLOW}To verify against production, set your access token:${NC}"
    echo -e "${YELLOW}  export SUPABASE_ACCESS_TOKEN='your-token-here'${NC}"
    echo ""
fi

# Check if connected to a project
PROJECT_ID=$(cat .env 2>/dev/null | grep VITE_SUPABASE_PROJECT_ID | cut -d '=' -f2 | tr -d '"')
if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}⚠ Project ID not found in .env${NC}"
else
    echo -e "${GREEN}✓${NC} Project ID: ${PROJECT_ID}"
    echo ""
fi

# Verify migration naming convention
echo -e "${BLUE}Verifying migration naming convention...${NC}"
INVALID_MIGRATIONS=0
find supabase/migrations -name "*.sql" | while read file; do
    filename=$(basename "$file")
    # Check if filename matches pattern: YYYYMMDDHHMMSS_description.sql
    if ! echo "$filename" | grep -qE '^[0-9]{14}_.*\.sql$'; then
        echo -e "${RED}  ✗ Invalid format: $filename${NC}"
        INVALID_MIGRATIONS=$((INVALID_MIGRATIONS + 1))
    fi
done

if [ $INVALID_MIGRATIONS -eq 0 ]; then
    echo -e "${GREEN}✓${NC} All migrations follow naming convention"
else
    echo -e "${YELLOW}⚠ Found $INVALID_MIGRATIONS migrations with invalid naming${NC}"
fi
echo ""

# Check for migration conflicts (same timestamp)
echo -e "${BLUE}Checking for timestamp conflicts...${NC}"
TIMESTAMPS=$(find supabase/migrations -name "*.sql" -exec basename {} \; | cut -d'_' -f1 | sort)
DUPLICATE_TIMESTAMPS=$(echo "$TIMESTAMPS" | uniq -d)

if [ -z "$DUPLICATE_TIMESTAMPS" ]; then
    echo -e "${GREEN}✓${NC} No timestamp conflicts found"
else
    echo -e "${RED}✗ Found duplicate timestamps:${NC}"
    echo "$DUPLICATE_TIMESTAMPS" | while read timestamp; do
        echo -e "${RED}  - $timestamp${NC}"
    done
fi
echo ""

# Check for syntax errors in migration files
echo -e "${BLUE}Checking for common SQL syntax errors...${NC}"
SYNTAX_ERRORS=0
find supabase/migrations -name "*.sql" | while read file; do
    filename=$(basename "$file")

    # Check for common issues
    if grep -q "CREATE TABLE.*IF NOT EXISTS.*(" "$file"; then
        # Good practice
        :
    elif grep -q "CREATE TABLE.*(" "$file"; then
        echo -e "${YELLOW}  ⚠ $filename: Consider using 'IF NOT EXISTS'${NC}"
    fi

    # Check for missing semicolons (very basic check)
    if ! tail -n 1 "$file" | grep -q ";"; then
        echo -e "${YELLOW}  ⚠ $filename: Last statement might be missing semicolon${NC}"
    fi
done

echo -e "${GREEN}✓${NC} Basic syntax check complete"
echo ""

# Summary
echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo -e "  Total migrations: ${MIGRATION_COUNT}"
echo -e "  Project ID: ${PROJECT_ID:-'Not set'}"
echo ""

# Next steps
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo -e "${YELLOW}1. Verify migrations are applied in production:${NC}"
echo -e "   ${GREEN}supabase db remote-changes --project-ref $PROJECT_ID${NC}"
echo ""
echo -e "${YELLOW}2. Apply pending migrations (if any):${NC}"
echo -e "   ${GREEN}supabase db push --project-ref $PROJECT_ID${NC}"
echo ""
echo -e "${YELLOW}3. Export production schema for comparison:${NC}"
echo -e "   ${GREEN}supabase db dump --project-ref $PROJECT_ID > production-schema.sql${NC}"
echo ""
echo -e "${YELLOW}4. Test migrations locally:${NC}"
echo -e "   ${GREEN}supabase start${NC}"
echo -e "   ${GREEN}supabase db reset${NC}"
echo ""

echo -e "${GREEN}✓ Schema verification complete!${NC}"
