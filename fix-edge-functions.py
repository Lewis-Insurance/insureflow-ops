#!/usr/bin/env python3
"""
Fix TypeScript strict mode errors in Supabase Edge Functions
Applies systematic fixes to all edge function index.ts files
"""

import os
import re
from pathlib import Path

def fix_error_handling(content):
    """Fix error handling in catch blocks"""
    # Pattern 1: catch (error) with error.message
    content = re.sub(
        r'catch \(error\)(\s*{[^}]*error\.message)',
        r'catch (error: unknown)\1',
        content,
        flags=re.DOTALL
    )

    # Pattern 2: Replace error.message with safe access
    content = re.sub(
        r'error\.message',
        r'(error instanceof Error ? error.message : String(error))',
        content
    )

    # Pattern 3: Replace error.stack with safe access
    content = re.sub(
        r'error\.stack',
        r'(error instanceof Error ? error.stack : undefined)',
        content
    )

    return content

def fix_implicit_any(content):
    """Fix implicit any types in callbacks"""
    # Common patterns like .map(doc => ...) need to be .map((doc: any) => ...)
    patterns = [
        (r'\.map\((\w+)\s*=>', r'.map((\1: any) =>'),
        (r'\.filter\((\w+)\s*=>', r'.filter((\1: any) =>'),
        (r'\.forEach\((\w+)\s*=>', r'.forEach((\1: any) =>'),
        (r'\.find\((\w+)\s*=>', r'.find((\1: any) =>'),
    ]

    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement, content)

    return content

def add_null_checks(content):
    """Add basic null checks"""
    # This is complex and context-dependent, skip for now
    return content

def fix_edge_function(file_path):
    """Fix a single edge function file"""
    print(f"Fixing: {file_path}")

    with open(file_path, 'r') as f:
        content = f.read()

    original = content

    # Apply fixes
    content = fix_error_handling(content)
    content = fix_implicit_any(content)

    # Only write if changed
    if content != original:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"  ✓ Fixed")
        return True
    else:
        print(f"  - No changes")
        return False

def main():
    """Fix all edge functions"""
    functions_dir = Path('supabase/functions')

    if not functions_dir.exists():
        print("Error: supabase/functions directory not found")
        return

    index_files = list(functions_dir.glob('*/index.ts'))
    print(f"Found {len(index_files)} edge functions\n")

    fixed_count = 0
    for file_path in index_files:
        if fix_edge_function(file_path):
            fixed_count += 1

    print(f"\n✓ Fixed {fixed_count} / {len(index_files)} files")

if __name__ == '__main__':
    main()
