// src/utils/checkSchema.ts
import { supabase } from '@/integrations/supabase/client';

/**
 * Check if a table exists and get its columns
 * Run this in browser console or as a test
 */
export async function checkTableSchema(tableName: string) {
  try {
    // Try to query the table with limit 0 to get structure without data
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(0);
    
    if (error) {
      console.error(`❌ Table "${tableName}" does not exist or you don't have access`);
      console.error('Error:', error);
      return { exists: false, error };
    }
    
    console.log(`✅ Table "${tableName}" exists`);
    
    // Get a sample row to see actual columns
    const { data: sample } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)
      .single();
    
    if (sample) {
      console.log(`📋 Columns in "${tableName}":`, Object.keys(sample));
      console.log('Sample data:', sample);
    } else {
      console.log(`📋 Table is empty, fetching column info...`);
    }
    
    return { exists: true, sample };
  } catch (err) {
    console.error(`❌ Error checking table "${tableName}":`, err);
    return { exists: false, error: err };
  }
}

/**
 * Check multiple tables at once
 */
export async function checkAllTables(tableNames: string[]) {
  console.log('🔍 Checking database schema...\n');
  
  const results: Record<string, any> = {};
  
  for (const tableName of tableNames) {
    console.log(`\n--- Checking: ${tableName} ---`);
    results[tableName] = await checkTableSchema(tableName);
  }
  
  console.log('\n📊 Summary:');
  Object.entries(results).forEach(([table, result]) => {
    console.log(`  ${result.exists ? '✅' : '❌'} ${table}`);
  });
  
  return results;
}

/**
 * Verify the schema we need for renewal risk hooks
 */
export async function verifyRenewalRiskSchema() {
  console.log('🔍 Verifying Renewal Risk Schema Requirements...\n');
  
  const requiredTables = [
    'renewals',
    'renewal_risk_history',
    'renewal_campaigns',
    'accounts',
    'profiles',
    'policies'
  ];
  
  const results = await checkAllTables(requiredTables);
  
  // Check if renewals table has risk fields
  if (results.renewals?.exists) {
    const { data: renewal } = await supabase
      .from('renewals')
      .select('*')
      .limit(1)
      .single();
    
    const requiredFields = [
      'risk_score',
      'risk_level', 
      'risk_factors',
      'last_risk_calculation',
      'days_since_last_contact',
      'contact_count',
      'has_recent_claims',
      'has_payment_issues',
      'competitor_activity_detected',
      'customer_satisfaction_score',
      'engagement_score',
      'sentiment_score'
    ];
    
    console.log('\n🔍 Checking renewals table for risk fields:');
    if (renewal) {
      requiredFields.forEach(field => {
        const exists = field in renewal;
        console.log(`  ${exists ? '✅' : '❌'} ${field}`);
      });
    } else {
      console.log('  ⚠️ Renewals table is empty, cannot verify fields');
    }
  }
  
  return results;
}

/**
 * Quick test function - call this from browser console
 * Usage: import { testRenewalSchema } from '@/utils/checkSchema'; testRenewalSchema();
 */
export async function testRenewalSchema() {
  await verifyRenewalRiskSchema();
}
