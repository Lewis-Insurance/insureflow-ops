#!/usr/bin/env tsx
/**
 * RLS Policy Auditor
 * 
 * Scans all tables for RLS policies and verifies:
 * - Multi-tenant isolation patterns
 * - Policy coverage (SELECT, INSERT, UPDATE, DELETE)
 * - Account membership checks
 * - Staff access patterns
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

interface RLSAuditResult {
  table: string;
  rlsEnabled: boolean;
  policies: PolicyInfo[];
  issues: string[];
  warnings: string[];
}

interface PolicyInfo {
  name: string;
  command: string;
  definition: string;
  hasAccountMembership: boolean;
  hasAuthUid: boolean;
  hasStaffCheck: boolean;
}

/**
 * Audit RLS policies for a table
 */
async function auditTableRLS(tableName: string): Promise<RLSAuditResult> {
  const result: RLSAuditResult = {
    table: tableName,
    rlsEnabled: false,
    policies: [],
    issues: [],
    warnings: [],
  };

  // Check if RLS is enabled
  const { data: rlsStatus, error: rlsError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relname = $1
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
    `,
    params: [tableName],
  });

  if (rlsError) {
    result.issues.push(`Failed to check RLS status: ${rlsError.message}`);
    return result;
  }

  result.rlsEnabled = rlsStatus?.[0]?.relrowsecurity || false;

  if (!result.rlsEnabled) {
    result.issues.push('RLS is not enabled on this table');
    return result;
  }

  // Get all policies
  const { data: policies, error: policyError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        policyname,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public' 
        AND tablename = $1;
    `,
    params: [tableName],
  });

  if (policyError) {
    result.issues.push(`Failed to fetch policies: ${policyError.message}`);
    return result;
  }

  // Analyze each policy
  const commands = new Set<string>();
  
  for (const policy of policies || []) {
    const policyInfo: PolicyInfo = {
      name: policy.policyname,
      command: policy.cmd,
      definition: policy.qual || policy.with_check || '',
      hasAccountMembership: false,
      hasAuthUid: false,
      hasStaffCheck: false,
    };

    // Check for multi-tenant patterns
    const definition = policyInfo.definition.toLowerCase();
    policyInfo.hasAccountMembership = definition.includes('account_memberships');
    policyInfo.hasAuthUid = definition.includes('auth.uid()');
    policyInfo.hasStaffCheck = definition.includes('is_staff()');

    result.policies.push(policyInfo);
    commands.add(policy.cmd);
  }

  // Check policy coverage
  const requiredCommands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  const missingCommands = requiredCommands.filter(cmd => !commands.has(cmd));
  
  if (missingCommands.length > 0) {
    result.warnings.push(
      `Missing policies for: ${missingCommands.join(', ')}`
    );
  }

  // Check for multi-tenant isolation
  const hasMultiTenantIsolation = result.policies.some(p =>
    p.hasAccountMembership || p.hasAuthUid
  );

  if (!hasMultiTenantIsolation) {
    result.issues.push(
      'No policies enforce multi-tenant isolation (missing account_memberships or auth.uid() check)'
    );
  }

  // Check for staff access
  const hasStaffAccess = result.policies.some(p => p.hasStaffCheck);
  if (!hasStaffAccess) {
    result.warnings.push('No policies provide staff access (consider adding is_staff() checks)');
  }

  return result;
}

/**
 * Get all tables in public schema
 */
async function getAllTables(): Promise<string[]> {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `,
    params: [],
  });

  if (error) {
    console.error('Failed to fetch tables:', error);
    return [];
  }

  return (data || []).map((row: any) => row.table_name);
}

/**
 * Main audit function
 */
async function main() {
  const args = process.argv.slice(2);
  const tableName = args[0];

  console.log('\n🔒 RLS Policy Auditor\n');

  if (tableName) {
    // Audit single table
    console.log(`Auditing table: ${tableName}\n`);
    const result = await auditTableRLS(tableName);
    printAuditResult(result);
  } else {
    // Audit all tables
    console.log('Auditing all tables...\n');
    const tables = await getAllTables();
    
    const results: RLSAuditResult[] = [];
    for (const table of tables) {
      const result = await auditTableRLS(table);
      results.push(result);
    }

    // Summary
    const tablesWithIssues = results.filter(r => r.issues.length > 0);
    const tablesWithWarnings = results.filter(r => r.warnings.length > 0);
    const tablesWithoutRLS = results.filter(r => !r.rlsEnabled);

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total tables: ${results.length}`);
    console.log(`Tables with RLS enabled: ${results.length - tablesWithoutRLS.length}`);
    console.log(`Tables with issues: ${tablesWithIssues.length}`);
    console.log(`Tables with warnings: ${tablesWithWarnings.length}`);
    console.log('='.repeat(80) + '\n');

    // Print tables with issues
    if (tablesWithIssues.length > 0) {
      console.log('❌ Tables with issues:\n');
      tablesWithIssues.forEach(result => {
        console.log(`  ${result.table}:`);
        result.issues.forEach(issue => console.log(`    - ${issue}`));
      });
      console.log();
    }

    // Print tables with warnings
    if (tablesWithWarnings.length > 0) {
      console.log('⚠️  Tables with warnings:\n');
      tablesWithWarnings.forEach(result => {
        console.log(`  ${result.table}:`);
        result.warnings.forEach(warning => console.log(`    - ${warning}`));
      });
      console.log();
    }
  }
}

function printAuditResult(result: RLSAuditResult) {
  console.log('='.repeat(80));
  console.log(`Table: ${result.table}`);
  console.log(`RLS Enabled: ${result.rlsEnabled ? '✅' : '❌'}`);
  console.log(`Policies: ${result.policies.length}`);
  console.log('='.repeat(80));

  if (result.policies.length > 0) {
    console.log('\nPolicies:');
    result.policies.forEach(policy => {
      console.log(`\n  ${policy.name} (${policy.command})`);
      console.log(`    Account Membership: ${policy.hasAccountMembership ? '✅' : '❌'}`);
      console.log(`    Auth UID: ${policy.hasAuthUid ? '✅' : '❌'}`);
      console.log(`    Staff Check: ${policy.hasStaffCheck ? '✅' : '❌'}`);
      if (policy.definition) {
        console.log(`    Definition: ${policy.definition.substring(0, 100)}...`);
      }
    });
  }

  if (result.issues.length > 0) {
    console.log('\n❌ Issues:');
    result.issues.forEach(issue => console.log(`  - ${issue}`));
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach(warning => console.log(`  - ${warning}`));
  }

  if (result.issues.length === 0 && result.warnings.length === 0) {
    console.log('\n✅ No issues found!');
  }

  console.log();
}

main().catch(console.error);

