#!/bin/bash

# =============================================================================
# List and Verify Migrations
# =============================================================================
# Simple script to list all migrations and check for basic issues
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}InsureFlow Ops - Migration List${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""

# Check directory
if [ ! -d "supabase/migrations" ]; then
    echo "Error: Run from project root directory"
    exit 1
fi

# Count and list migrations
MIGRATION_COUNT=$(find supabase/migrations -name "*.sql" | wc -l | tr -d ' ')
echo -e "${GREEN}Total migrations: $MIGRATION_COUNT${NC}"
echo ""

echo -e "${BLUE}All migrations (chronological order):${NC}"
echo ""

counter=1
find supabase/migrations -name "*.sql" | sort | while read file; do
    filename=$(basename "$file")
    timestamp=$(echo "$filename" | cut -d'_' -f1)
    description=$(echo "$filename" | cut -d'_' -f2- | sed 's/.sql$//' | tr '_' ' ')

    # Get file size
    size=$(du -h "$file" | cut -f1)

    printf "%3d. [%s] %s (%s)\n" "$counter" "$timestamp" "$description" "$size"
    counter=$((counter + 1))
done

echo ""
echo -e "${GREEN}✓ Migration list complete${NC}"
