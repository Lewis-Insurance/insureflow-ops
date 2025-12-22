// ============================================================================
// Commission Tracking Types
// ============================================================================

export type CommissionStructureType = 
  | 'percentage'
  | 'flat'
  | 'tiered'
  | 'hybrid'
  | 'sliding_scale';

export type CommissionCalculationStatus = 
  | 'calculated'
  | 'pending'
  | 'paid'
  | 'adjusted'
  | 'voided';

export type CommissionPaymentStatus = 
  | 'expected'
  | 'received'
  | 'deposited'
  | 'reconciled'
  | 'disputed';

export type CommissionPaymentMethod = 
  | 'check'
  | 'wire'
  | 'ach'
  | 'credit'
  | 'other';

export type CommissionReportType = 
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'custom';

export type CommissionReportStatus = 
  | 'draft'
  | 'final'
  | 'archived';

// ============================================================================
// Commission Structure Types
// ============================================================================

export interface PercentageCommissionConfig {
  rate: number; // 0.15 = 15%
  minimum?: number;
  maximum?: number;
}

export interface FlatCommissionConfig {
  amount: number;
}

export interface CommissionTier {
  min_premium: number;
  max_premium: number | null; // null = no upper limit
  rate: number;
}

export interface TieredCommissionConfig {
  tiers: CommissionTier[];
}

export interface HybridCommissionConfig {
  base_rate: number;
  flat_bonus: number;
  applies_after?: number; // Premium threshold for bonus
}

export interface SlidingScaleCommissionConfig {
  base_rate: number;
  scale_factor: number; // Rate increase per dollar of premium
  max_rate: number;
}

export type CommissionConfig = 
  | PercentageCommissionConfig
  | FlatCommissionConfig
  | TieredCommissionConfig
  | HybridCommissionConfig
  | SlidingScaleCommissionConfig;

export interface CommissionStructure {
  id: string;
  account_id?: string;
  carrier_id?: string;
  mga_id?: string;
  name: string;
  description?: string;
  structure_type: CommissionStructureType;
  line_of_business?: string;
  applies_to_all_lobs: boolean;
  commission_config: CommissionConfig;
  effective_date: string; // ISO date string
  expiration_date?: string; // ISO date string
  is_active: boolean;
  is_default: boolean;
  priority: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CommissionStructureCreateInput {
  account_id?: string;
  carrier_id?: string;
  mga_id?: string;
  name: string;
  description?: string;
  structure_type: CommissionStructureType;
  line_of_business?: string;
  applies_to_all_lobs?: boolean;
  commission_config: CommissionConfig;
  effective_date: string;
  expiration_date?: string;
  is_active?: boolean;
  is_default?: boolean;
  priority?: number;
}

export interface CommissionStructureUpdateInput {
  name?: string;
  description?: string;
  structure_type?: CommissionStructureType;
  line_of_business?: string;
  applies_to_all_lobs?: boolean;
  commission_config?: CommissionConfig;
  effective_date?: string;
  expiration_date?: string;
  is_active?: boolean;
  is_default?: boolean;
  priority?: number;
}

// ============================================================================
// Commission Calculation Types
// ============================================================================

export interface CommissionBreakdown {
  base_commission?: number;
  bonus?: number;
  tier_adjustment?: number;
  flat_adjustment?: number;
  total: number;
}

export interface CommissionCalculation {
  id: string;
  source_type: 'policy' | 'quote' | 'renewal';
  source_id: string;
  commission_structure_id?: string;
  premium_amount: number;
  commission_rate?: number;
  commission_amount: number;
  commission_breakdown?: CommissionBreakdown;
  status: CommissionCalculationStatus;
  expected_payment_date?: string;
  actual_payment_date?: string;
  payment_reference?: string;
  adjustment_reason?: string;
  adjustment_amount: number;
  adjusted_by?: string;
  adjusted_at?: string;
  notes?: string;
  calculated_by?: string;
  calculated_at: string;
  created_at: string;
  updated_at: string;
}

export interface CommissionCalculationCreateInput {
  source_type: 'policy' | 'quote' | 'renewal';
  source_id: string;
  commission_structure_id?: string;
  premium_amount: number;
  commission_rate?: number;
  commission_amount: number;
  commission_breakdown?: CommissionBreakdown;
  status?: CommissionCalculationStatus;
  expected_payment_date?: string;
  notes?: string;
}

// ============================================================================
// Commission Payment Types
// ============================================================================

export interface CommissionPayment {
  id: string;
  carrier_id?: string;
  mga_id?: string;
  payment_date: string;
  payment_amount: number;
  payment_method?: CommissionPaymentMethod;
  payment_reference?: string;
  period_start_date?: string;
  period_end_date?: string;
  status: CommissionPaymentStatus;
  reconciled_at?: string;
  reconciled_by?: string;
  reconciliation_notes?: string;
  expected_amount?: number;
  discrepancy_amount?: number;
  discrepancy_reason?: string;
  notes?: string;
  received_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CommissionPaymentCreateInput {
  carrier_id?: string;
  mga_id?: string;
  payment_date: string;
  payment_amount: number;
  payment_method?: CommissionPaymentMethod;
  payment_reference?: string;
  period_start_date?: string;
  period_end_date?: string;
  status?: CommissionPaymentStatus;
  expected_amount?: number;
  notes?: string;
}

// ============================================================================
// Commission Payment Allocation Types
// ============================================================================

export interface CommissionPaymentAllocation {
  id: string;
  payment_id: string;
  calculation_id: string;
  allocated_amount: number;
  is_allocated: boolean;
  allocated_at: string;
  allocated_by?: string;
  created_at: string;
}

export interface CommissionPaymentAllocationCreateInput {
  payment_id: string;
  calculation_id: string;
  allocated_amount: number;
}

// ============================================================================
// Commission Report Types
// ============================================================================

export interface CommissionReportBreakdown {
  [key: string]: {
    premium: number;
    commission: number;
    rate: number;
    count: number;
  };
}

export interface CommissionReport {
  id: string;
  report_type: CommissionReportType;
  period_start_date: string;
  period_end_date: string;
  account_id?: string;
  carrier_id?: string;
  line_of_business?: string;
  total_premium: number;
  total_commission: number;
  average_commission_rate?: number;
  breakdown_by_lob?: CommissionReportBreakdown;
  breakdown_by_carrier?: CommissionReportBreakdown;
  breakdown_by_producer?: CommissionReportBreakdown;
  status: CommissionReportStatus;
  generated_by?: string;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface CommissionReportCreateInput {
  report_type: CommissionReportType;
  period_start_date: string;
  period_end_date: string;
  account_id?: string;
  carrier_id?: string;
  line_of_business?: string;
  status?: CommissionReportStatus;
}

