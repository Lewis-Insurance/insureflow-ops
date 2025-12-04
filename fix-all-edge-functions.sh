#!/bin/bash

# Script to fix all TypeScript errors in Supabase Edge Functions
# This addresses strict TypeScript checking in Deno runtime

echo "Fixing all edge function TypeScript errors..."

# Find all edge function index.ts files
EDGE_FUNCTIONS=$(find supabase/functions -name "index.ts" -type f)

for func in $EDGE_FUNCTIONS; do
  echo "Processing: $func"

  # Fix 1: Replace catch (error) with catch (error: unknown)
  # and add proper error handling
  sed -i.bak 's/catch (error)/catch (error: unknown)/g' "$func"

  # Fix 2: Replace error.message with safe access
  # This is a complex replacement - we'll need to do it manually for some

  # Note: sed can't do complex AST transformations
  # We need a different approach
done

echo "Basic fixes applied. Manual review needed for complex cases."
