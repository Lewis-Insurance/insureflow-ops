#!/usr/bin/env tsx
/**
 * Pre-Flight Schema Validation Script
 * 
 * Validates database schema before code generation to ensure:
 * - Tables exist
 * - Columns match expectations
 * - Enum types are correct
 * - RLS policies are in place
 * - Foreign keys are correct
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ValidationResult {
  table: string;
  exists: boolean;
  columns?: ColumnInfo[];
  enums?: EnumInfo[];
  rlsPolicies?: RLSPolicy[];
  foreignKeys?: ForeignKey[];
  errors: string[];
  warnings: string[];
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
}

interface EnumInfo {
  name: string;
  values: string[];
}

interface RLSPolicy {
  name: string;
  command: string;
  definition: string;
}

interface ForeignKey {
  name: string;
  column: string;
  referencesTable: string;
  referencesColumn: string;
  deleteRule: string;
}

interface SchemaSpec {
  table: string;
  columns?: {
    name: string;
    type: string;
    nullable?: boolean;
  }[];
  enums?: {
    name: string;
    values: string[];
  }[];
  requiresRLS?: boolean;
  foreignKeys?: {
    column: string;
    referencesTable: string;
    referencesColumn: string;
  }[];
}

/**
 * Validate a single table against specification
 */
async function validateTable(spec: SchemaSpec): Promise<ValidationResult> {
  const result: ValidationResult = {
    table: spec.table,
    exists: false,
    errors: [],
    warnings: [],
  };

  // 1. Check if table exists
  const { data: tableExists, error: tableError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      ) as exists;
    `,
    params: [spec.table],
  });

  if (tableError) {
    result.errors.push(`Failed to check table existence: ${tableError.message}`);
    return result;
  }

  result.exists = tableExists?.[0]?.exists || false;

  if (!result.exists) {
    result.errors.push(`Table '${spec.table}' does not exist`);
    return result;
  }

  // 2. Validate columns
  if (spec.columns) {
    const { data: columns, error: colError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          column_name, 
          data_type, 
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = $1
        ORDER BY ordinal_position;
      `,
      params: [spec.table],
    });

    if (colError) {
      result.errors.push(`Failed to fetch columns: ${colError.message}`);
    } else {
      result.columns = columns || [];
      
      // Check each expected column
      for (const expectedCol of spec.columns) {
        const actualCol = result.columns.find(c => c.column_name === expectedCol.name);
        
        if (!actualCol) {
          result.errors.push(`Missing column: ${expectedCol.name}`);
        } else {
          // Type checking (simplified - may need more sophisticated matching)
          if (expectedCol.type && !actualCol.data_type.includes(expectedCol.type.toLowerCase())) {
            result.warnings.push(
              `Column '${expectedCol.name}' type mismatch: expected ${expectedCol.type}, got ${actualCol.data_type}`
            );
          }
          
          // Nullability checking
          if (expectedCol.nullable === false && actualCol.is_nullable === 'YES') {
            result.warnings.push(`Column '${expectedCol.name}' should be NOT NULL`);
          }
        }
      }
    }
  }

  // 3. Validate enum types
  if (spec.enums) {
    for (const enumSpec of spec.enums) {
      const { data: enumValues, error: enumError } = await supabase.rpc('exec_sql', {
        sql: `
          SELECT 
            t.typname as enum_name,
            e.enumlabel as enum_value
          FROM pg_type t 
          JOIN pg_enum e ON t.oid = e.enumtypid  
          WHERE t.typname = $1
          ORDER BY e.enumsortorder;
        `,
        params: [enumSpec.name],
      });

      if (enumError) {
        result.errors.push(`Failed to fetch enum values: ${enumError.message}`);
      } else {
        const actualValues = (enumValues || []).map((e: any) => e.enum_value);
        result.enums = [{ name: enumSpec.name, values: actualValues }];
        
        // Check enum values match
        const missingValues = enumSpec.values.filter(v => !actualValues.includes(v));
        const extraValues = actualValues.filter((v: string) => !enumSpec.values.includes(v));
        
        if (missingValues.length > 0) {
          result.errors.push(
            `Enum '${enumSpec.name}' missing values: ${missingValues.join(', ')}`
          );
        }
        if (extraValues.length > 0) {
          result.warnings.push(
            `Enum '${enumSpec.name}' has extra values: ${extraValues.join(', ')}`
          );
        }
      }
    }
  }

  // 4. Validate RLS policies
  if (spec.requiresRLS !== false) {
    const { data: policies, error: policyError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          policyname,
          cmd,
          qual
        FROM pg_policies
        WHERE schemaname = 'public' 
          AND tablename = $1;
      `,
      params: [spec.table],
    });

    if (policyError) {
      result.errors.push(`Failed to fetch RLS policies: ${policyError.message}`);
    } else {
      result.rlsPolicies = (policies || []).map((p: any) => ({
        name: p.policyname,
        command: p.cmd,
        definition: p.qual,
      }));
      
      if (result.rlsPolicies.length === 0) {
        result.errors.push(`Table '${spec.table}' has no RLS policies`);
      } else {
        // Check for multi-tenant isolation pattern
        const hasTenantIsolation = result.rlsPolicies.some(p =>
          p.definition?.includes('account_memberships') || 
          p.definition?.includes('auth.uid()')
        );
        
        if (!hasTenantIsolation) {
          result.warnings.push(
            `Table '${spec.table}' RLS policies may not enforce multi-tenant isolation`
          );
        }
      }
    }
  }

  // 5. Validate foreign keys
  if (spec.foreignKeys) {
    const { data: fks, error: fkError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1;
      `,
      params: [spec.table],
    });

    if (fkError) {
      result.errors.push(`Failed to fetch foreign keys: ${fkError.message}`);
    } else {
      result.foreignKeys = (fks || []).map((fk: any) => ({
        name: fk.constraint_name,
        column: fk.column_name,
        referencesTable: fk.foreign_table_name,
        referencesColumn: fk.foreign_column_name,
        deleteRule: fk.delete_rule,
      }));
      
      // Check each expected foreign key
      for (const expectedFK of spec.foreignKeys) {
        const actualFK = result.foreignKeys.find(
          fk => fk.column === expectedFK.column &&
                fk.referencesTable === expectedFK.referencesTable &&
                fk.referencesColumn === expectedFK.referencesColumn
        );
        
        if (!actualFK) {
          result.errors.push(
            `Missing foreign key: ${expectedFK.column} -> ${expectedFK.referencesTable}.${expectedFK.referencesColumn}`
          );
        }
      }
    }
  }

  return result;
}

/**
 * Main validation function
 */
async function main() {
  const args = process.argv.slice(2);
  const tableName = args[0];

  if (!tableName) {
    console.error('Usage: tsx scripts/validate-schema.ts <table_name>');
    console.error('Example: tsx scripts/validate-schema.ts policies');
    process.exit(1);
  }

  // Basic schema spec (can be expanded)
  const spec: SchemaSpec = {
    table: tableName,
    requiresRLS: true,
  };

  console.log(`\n🔍 Validating schema for table: ${tableName}\n`);

  const result = await validateTable(spec);

  // Print results
  if (result.exists) {
    console.log(`✅ Table exists: ${result.table}`);
  } else {
    console.log(`❌ Table does not exist: ${result.table}`);
  }

  if (result.columns && result.columns.length > 0) {
    console.log(`\n📊 Columns (${result.columns.length}):`);
    result.columns.forEach(col => {
      console.log(`   - ${col.name}: ${col.type} ${col.nullable === 'YES' ? '(nullable)' : '(NOT NULL)'}`);
    });
  }

  if (result.rlsPolicies && result.rlsPolicies.length > 0) {
    console.log(`\n🔒 RLS Policies (${result.rlsPolicies.length}):`);
    result.rlsPolicies.forEach(policy => {
      console.log(`   - ${policy.name} (${policy.command})`);
    });
  }

  if (result.errors.length > 0) {
    console.log(`\n❌ Errors (${result.errors.length}):`);
    result.errors.forEach(error => console.log(`   - ${error}`));
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
    result.warnings.forEach(warning => console.log(`   - ${warning}`));
  }

  if (result.errors.length === 0 && result.warnings.length === 0) {
    console.log(`\n✅ Validation passed!\n`);
    process.exit(0);
  } else {
    console.log(`\n❌ Validation failed with ${result.errors.length} error(s) and ${result.warnings.length} warning(s)\n`);
    process.exit(result.errors.length > 0 ? 1 : 0);
  }
}

main().catch(console.error);

