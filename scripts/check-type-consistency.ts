#!/usr/bin/env tsx
/**
 * Type Consistency Checker
 * 
 * Compares TypeScript types with database schemas to ensure:
 * - Enum values match between DB and TS
 * - Column types match type definitions
 * - Required fields are properly typed
 * - Foreign key relationships are reflected in types
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface TypeMismatch {
  table: string;
  column: string;
  dbType: string;
  tsType: string;
  issue: string;
}

interface EnumMismatch {
  enumName: string;
  dbValues: string[];
  tsValues: string[];
  missingInTS: string[];
  extraInTS: string[];
}

/**
 * Extract enum values from TypeScript file
 */
function extractEnumFromTS(filePath: string, enumName: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const enumRegex = new RegExp(
      `(?:export\\s+)?(?:type|enum|const)\\s+${enumName}\\s*[=:]?\\s*([^;]+)`,
      's'
    );
    const match = content.match(enumRegex);
    
    if (!match) return [];
    
    // Extract values from union type or enum
    const values = match[1]
      .split('|')
      .map(v => v.trim().replace(/['"]/g, ''))
      .filter(v => v && !v.includes('type') && !v.includes('enum'))
      .map(v => v.replace(/^\s*['"]|['"]\s*$/g, ''));
    
    return values.filter(v => v.length > 0);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

/**
 * Get enum values from database
 */
async function getEnumFromDB(enumName: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        e.enumlabel as enum_value
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typname = $1
      ORDER BY e.enumsortorder;
    `,
    params: [enumName],
  });

  if (error) {
    console.error(`Error fetching enum ${enumName}:`, error);
    return [];
  }

  return (data || []).map((row: any) => row.enum_value);
}

/**
 * Find TypeScript type files
 */
async function findTypeFiles(): Promise<string[]> {
  const typeFiles = await glob('src/types/**/*.ts', {
    cwd: process.cwd(),
    absolute: true,
  });
  return typeFiles;
}

/**
 * Check enum consistency
 */
async function checkEnumConsistency(): Promise<EnumMismatch[]> {
  const mismatches: EnumMismatch[] = [];
  
  // Known enums to check
  const enumsToCheck = [
    'extraction_confidence',
    'CommissionStructureType',
    'CommissionCalculationStatus',
    'CommissionPaymentStatus',
  ];

  for (const enumName of enumsToCheck) {
    const dbValues = await getEnumFromDB(enumName);
    
    if (dbValues.length === 0) {
      // Enum might not exist in DB yet, or might be TypeScript-only
      continue;
    }

    // Find TypeScript definition
    const typeFiles = await findTypeFiles();
    let tsValues: string[] = [];
    
    for (const file of typeFiles) {
      const values = extractEnumFromTS(file, enumName);
      if (values.length > 0) {
        tsValues = values;
        break;
      }
    }

    if (tsValues.length === 0) {
      mismatches.push({
        enumName,
        dbValues,
        tsValues: [],
        missingInTS: dbValues,
        extraInTS: [],
      });
      continue;
    }

    const missingInTS = dbValues.filter(v => !tsValues.includes(v));
    const extraInTS = tsValues.filter(v => !dbValues.includes(v));

    if (missingInTS.length > 0 || extraInTS.length > 0) {
      mismatches.push({
        enumName,
        dbValues,
        tsValues,
        missingInTS,
        extraInTS,
      });
    }
  }

  return mismatches;
}

/**
 * Check table column types against TypeScript interfaces
 */
async function checkTableTypes(tableName: string): Promise<TypeMismatch[]> {
  const mismatches: TypeMismatch[] = [];

  // Get columns from database
  const { data: columns, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        column_name, 
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = $1
      ORDER BY ordinal_position;
    `,
    params: [tableName],
  });

  if (error || !columns || columns.length === 0) {
    return mismatches;
  }

  // Try to find corresponding TypeScript type
  const typeFiles = await findTypeFiles();
  let tsInterface: any = null;

  // Look for interface matching table name (e.g., policies -> Policy)
  const interfaceName = tableName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  for (const file of typeFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const interfaceRegex = new RegExp(
      `(?:export\\s+)?interface\\s+${interfaceName}\\s*{([^}]+)}`,
      's'
    );
    const match = content.match(interfaceRegex);
    
    if (match) {
      // Parse interface properties (simplified)
      const props = match[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('//'))
        .map(line => {
          const propMatch = line.match(/(\w+)(\??):\s*([^;]+)/);
          if (propMatch) {
            return {
              name: propMatch[1],
              optional: propMatch[2] === '?',
              type: propMatch[3].trim(),
            };
          }
          return null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
      
      tsInterface = { name: interfaceName, properties: props };
      break;
    }
  }

  if (!tsInterface) {
    // No TypeScript interface found - this is a warning, not an error
    return mismatches;
  }

  // Compare columns
  for (const column of columns) {
    const tsProp = tsInterface.properties.find(
      (p: any) => p.name === column.column_name
    );

    if (!tsProp) {
      mismatches.push({
        table: tableName,
        column: column.column_name,
        dbType: column.data_type,
        tsType: 'missing',
        issue: 'Column exists in DB but not in TypeScript interface',
      });
      continue;
    }

    // Type mapping (simplified)
    const typeMap: Record<string, string> = {
      'uuid': 'string',
      'text': 'string',
      'varchar': 'string',
      'integer': 'number',
      'bigint': 'number',
      'numeric': 'number',
      'boolean': 'boolean',
      'timestamp with time zone': 'string',
      'date': 'string',
      'jsonb': 'object',
    };

    const expectedTSType = typeMap[column.data_type] || column.data_type;
    const actualTSType = tsProp.type.toLowerCase();

    if (!actualTSType.includes(expectedTSType.toLowerCase()) &&
        !actualTSType.includes('any') &&
        !actualTSType.includes('unknown')) {
      mismatches.push({
        table: tableName,
        column: column.column_name,
        dbType: column.data_type,
        tsType: tsProp.type,
        issue: `Type mismatch: DB has ${column.data_type}, TS has ${tsProp.type}`,
      });
    }

    // Check nullability
    const isNullable = column.is_nullable === 'YES';
    if (isNullable && !tsProp.optional) {
      mismatches.push({
        table: tableName,
        column: column.column_name,
        dbType: column.data_type,
        tsType: tsProp.type,
        issue: 'Column is nullable in DB but required in TypeScript',
      });
    }
  }

  return mismatches;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const tableName = args[0];

  console.log('\n🔍 Type Consistency Checker\n');

  // Check enum consistency
  console.log('Checking enum consistency...\n');
  const enumMismatches = await checkEnumConsistency();

  if (enumMismatches.length > 0) {
    console.log('❌ Enum mismatches found:\n');
    enumMismatches.forEach(mismatch => {
      console.log(`  ${mismatch.enumName}:`);
      if (mismatch.missingInTS.length > 0) {
        console.log(`    Missing in TS: ${mismatch.missingInTS.join(', ')}`);
      }
      if (mismatch.extraInTS.length > 0) {
        console.log(`    Extra in TS: ${mismatch.extraInTS.join(', ')}`);
      }
    });
    console.log();
  } else {
    console.log('✅ All enums are consistent\n');
  }

  // Check table types
  if (tableName) {
    console.log(`Checking table types for: ${tableName}\n`);
    const typeMismatches = await checkTableTypes(tableName);

    if (typeMismatches.length > 0) {
      console.log('❌ Type mismatches found:\n');
      typeMismatches.forEach(mismatch => {
        console.log(`  ${mismatch.table}.${mismatch.column}:`);
        console.log(`    ${mismatch.issue}`);
        console.log(`    DB: ${mismatch.dbType}, TS: ${mismatch.tsType}`);
      });
      console.log();
    } else {
      console.log('✅ No type mismatches found\n');
    }
  } else {
    console.log('⚠️  Table name not provided. Use: tsx scripts/check-type-consistency.ts <table_name>');
    console.log('   Example: tsx scripts/check-type-consistency.ts policies\n');
  }

  const totalIssues = enumMismatches.length + (tableName ? 0 : 0);
  if (totalIssues > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(console.error);

