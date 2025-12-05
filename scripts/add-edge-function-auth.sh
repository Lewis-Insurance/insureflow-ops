#!/bin/bash

# Script to help add authentication to Supabase Edge Functions
# Usage: ./scripts/add-edge-function-auth.sh <function-name>

set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/add-edge-function-auth.sh <function-name>"
  echo ""
  echo "Example: ./scripts/add-edge-function-auth.sh analyze-coverage-gaps"
  echo ""
  echo "This script will:"
  echo "  1. Check if the function already has auth"
  echo "  2. Add the auth import"
  echo "  3. Add the requireAuth call"
  echo "  4. Show you the changes for review"
  exit 1
fi

FUNCTION_NAME="$1"
FUNCTION_PATH="supabase/functions/${FUNCTION_NAME}/index.ts"

if [ ! -f "$FUNCTION_PATH" ]; then
  echo "Error: Function not found at $FUNCTION_PATH"
  exit 1
fi

# Check if already has auth
if grep -q "requireAuth\|verifyAuth" "$FUNCTION_PATH"; then
  echo "✅ Function already has authentication!"
  grep -n "requireAuth\|verifyAuth" "$FUNCTION_PATH" | head -5
  exit 0
fi

echo "🔍 Analyzing $FUNCTION_NAME..."
echo ""

# Show current imports
echo "Current imports:"
head -10 "$FUNCTION_PATH" | grep "^import"
echo ""

# Show serve function start
echo "Serve function:"
grep -n "serve(async (req)" "$FUNCTION_PATH"
echo ""

# Create backup
cp "$FUNCTION_PATH" "${FUNCTION_PATH}.backup"
echo "✅ Created backup at ${FUNCTION_PATH}.backup"
echo ""

echo "📝 Manual steps required:"
echo ""
echo "1. Add this import after other imports:"
echo "   import { requireAuth } from \"../_shared/auth.ts\";"
echo ""
echo "2. Add this after creating supabase client:"
echo "   // SECURITY: Require authentication"
echo "   const authResult = await requireAuth(req, supabaseClient, corsHeaders);"
echo "   if (authResult instanceof Response) {"
echo "     return authResult; // Return 401 if auth failed"
echo "   }"
echo ""
echo "3. Optional - if function accesses specific resources, add:"
echo "   const authenticatedUser = authResult;"
echo "   const hasAccess = await verifyResourceAccess("
echo "     supabaseClient,"
echo "     authenticatedUser.id,"
echo "     'lead', // or 'policy', 'account', 'quote'"
echo "     resourceId"
echo "   );"
echo ""
echo "4. Test the function still works with auth enabled"
echo ""
echo "Backup created. Ready to edit: $FUNCTION_PATH"
