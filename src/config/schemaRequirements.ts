// src/config/schemaRequirements.ts

/**
 * Schema requirements for the Renewal Risk Management System
 * Defines which tables and columns are required for the system to function
 */
export const SCHEMA_REQUIREMENTS = {
  renewals: {
    required: true,
    description: 'Policy renewal tracking with AI-powered risk scoring',
    columns: [
      'id',
      'account_id',
      'policy_id',
      'policy_number',
      'policy_type',
      'carrier',
      'renewal_date',
      'current_premium',
      'renewal_premium',
      'price_change_pct',
      'status',
      'priority',
      'assigned_to',
      'notes',
      
      // Risk scoring fields
      'risk_score',
      'risk_level',
      'risk_factors',
      'last_risk_calculation',
      
      // Risk indicators
      'days_since_last_contact',
      'contact_count',
      'last_contact_date',
      'has_recent_claims',
      'has_payment_issues',
      'competitor_activity_detected',
      'customer_satisfaction_score',
      'engagement_score',
      'sentiment_score',
      
      // Timestamps
      'created_at',
      'updated_at',
      'created_by'
    ]
  },
  renewal_risk_history: {
    required: true,
    description: 'Historical risk score calculations for renewals',
    columns: [
      'id',
      'renewal_id',
      'risk_score',
      'risk_level',
      'risk_factors',
      'calculated_at',
      'calculated_by',
      'calculation_method'
    ]
  },
  renewal_campaigns: {
    required: true,
    description: 'Automated renewal campaigns with multi-channel touchpoints',
    columns: [
      'id',
      'renewal_id',
      'account_id',
      'campaign_type',
      'days_before_renewal',
      'start_date',
      'end_date',
      'status',
      'touchpoints',
      'total_touchpoints',
      'completed_touchpoints',
      'personalization',
      'created_at',
      'updated_at',
      'created_by'
    ]
  },
  accounts: {
    required: true,
    description: 'Customer accounts (dependency)',
    columns: ['id', 'name', 'email', 'phone']
  },
  profiles: {
    required: true,
    description: 'User profiles (dependency)',
    columns: ['id', 'full_name', 'email']
  },
  policies: {
    required: false,
    description: 'Insurance policies (optional)',
    columns: ['id', 'account_id', 'policy_number']
  }
} as const;

/**
 * Get all required tables
 */
export function getRequiredTables() {
  return Object.entries(SCHEMA_REQUIREMENTS)
    .filter(([_, config]) => config.required)
    .map(([name]) => name);
}

/**
 * Get required columns for a specific table
 */
export function getRequiredColumns(tableName: keyof typeof SCHEMA_REQUIREMENTS) {
  return SCHEMA_REQUIREMENTS[tableName]?.columns || [];
}

/**
 * Check if a table is required
 */
export function isTableRequired(tableName: string): boolean {
  return SCHEMA_REQUIREMENTS[tableName as keyof typeof SCHEMA_REQUIREMENTS]?.required || false;
}
