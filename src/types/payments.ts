import { z } from 'zod';

// ============================================================================
// PAYMENT METHOD TYPES
// ============================================================================

export type PaymentMethodType =
  | 'cash'
  | 'check'
  | 'credit_card'
  | 'debit_card'
  | 'ach'
  | 'agency_bill'
  | 'finance_company'
  | 'other';

export interface PaymentMethod {
  id: string;
  org_id: string;
  name: string;
  type: PaymentMethodType;
  requires_reference: boolean;
  requires_check_number: boolean;
  gl_account_code: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ============================================================================
// BANK ACCOUNT TYPES
// ============================================================================

export type BankAccountType = 'checking' | 'savings' | 'trust' | 'escrow';

export interface BankAccount {
  id: string;
  org_id: string;
  account_name: string;
  bank_name: string;
  account_type: BankAccountType;
  account_number_last4: string | null;
  routing_number: string | null;
  is_primary: boolean;
  is_active: boolean;
  gl_account_code: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ============================================================================
// DAY SHEET TYPES
// ============================================================================

export type DaySheetStatus = 'open' | 'closed' | 'deposited';

export interface DaySheet {
  id: string;
  org_id: string;
  sheet_date: string;
  sheet_number: string | null;
  status: DaySheetStatus;
  opened_by: string | null;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  total_cash: number;
  total_checks: number;
  total_credit_cards: number;
  total_debit_cards: number;
  total_ach: number;
  total_agency_bill: number;
  total_other: number;
  grand_total: number;
  payment_count: number;
  check_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DaySheetTotals {
  total_cash: number;
  total_checks: number;
  total_credit_cards: number;
  total_debit_cards: number;
  total_ach: number;
  total_agency_bill: number;
  total_other: number;
  grand_total: number;
  payment_count: number;
  check_count: number;
}

// ============================================================================
// PREMIUM PAYMENT TYPES
// ============================================================================

export type PaymentStatus = 'recorded' | 'deposited' | 'cleared' | 'voided' | 'nsf';
export type PaymentSource = 'in_person' | 'mail' | 'online' | 'phone' | 'lockbox';
export type PaidTo = 'company' | 'escrow';

export interface PremiumPayment {
  id: string;
  org_id: string;
  day_sheet_id: string | null;
  day_sheet_date: string;
  policy_id: string | null;
  account_id: string | null;
  payment_method_id: string;
  amount: number;
  amount_tendered: number | null;
  change_given: number | null;
  reference_number: string | null;
  check_number: string | null;
  check_date: string | null;
  payer_name: string | null;
  payer_address: string | null;
  received_date: string;
  received_by: string;
  payment_source: PaymentSource;
  status: PaymentStatus;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  nsf_at: string | null;
  nsf_fee: number | null;
  invoice_number: string | null;
  receipt_number: string | null;
  paid_to: PaidTo | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Joined fields
  payment_method?: PaymentMethod;
  policy?: { policy_number: string; line_of_business: string; carrier?: string | null };
  account?: { name: string };
  day_sheet?: DaySheet;
}

// ============================================================================
// ESCROW DEPOSIT TYPES
// ============================================================================

export type ReconciliationStatus = 'pending' | 'matched' | 'variance' | 'adjusted';

export interface EscrowDeposit {
  id: string;
  org_id: string;
  day_sheet_id: string | null;
  bank_account_id: string;
  deposit_date: string;
  deposit_slip_number: string | null;
  total_amount: number;
  cash_amount: number;
  check_amount: number;
  check_count: number;
  verified_amount: number | null;
  verified_at: string | null;
  verified_by: string | null;
  verification_notes: string | null;
  reconciliation_status: ReconciliationStatus;
  statement_line_id: string | null;
  matched_at: string | null;
  variance_amount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Joined fields
  bank_account?: BankAccount;
  day_sheet?: DaySheet;
}

// ============================================================================
// BANK STATEMENT TYPES
// ============================================================================

export type StatementImportSource = 'csv' | 'ofx' | 'qfx' | 'manual' | 'ocr';
export type StatementReconciliationStatus = 'pending' | 'in_progress' | 'completed' | 'finalized';

export interface BankStatement {
  id: string;
  org_id: string;
  bank_account_id: string;
  statement_date: string;
  period_start: string;
  period_end: string;
  beginning_balance: number;
  ending_balance: number;
  total_deposits: number;
  total_withdrawals: number;
  import_source: StatementImportSource | null;
  import_file_name: string | null;
  imported_at: string | null;
  imported_by: string | null;
  reconciliation_status: StatementReconciliationStatus;
  reconciled_at: string | null;
  reconciled_by: string | null;
  reconciled_balance: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Joined fields
  bank_account?: BankAccount;
  lines?: BankStatementLine[];
}

// ============================================================================
// BANK STATEMENT LINE TYPES
// ============================================================================

export type StatementLineType = 'deposit' | 'withdrawal' | 'fee' | 'interest' | 'transfer' | 'adjustment' | 'other';
export type StatementLineStatus = 'unmatched' | 'matched' | 'excluded' | 'adjusted';

export interface BankStatementLine {
  id: string;
  statement_id: string;
  line_date: string;
  post_date: string | null;
  description: string;
  amount: number;
  line_type: StatementLineType;
  reference: string | null;
  check_number: string | null;
  matched_deposit_id: string | null;
  matched_payment_id: string | null;
  matched_at: string | null;
  matched_by: string | null;
  match_confidence: number | null;
  status: StatementLineStatus;
  exclude_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  matched_deposit?: EscrowDeposit;
  matched_payment?: PremiumPayment;
}

// ============================================================================
// RECONCILIATION ADJUSTMENT TYPES
// ============================================================================

export type AdjustmentType = 'bank_error' | 'recording_error' | 'timing_difference' | 'fee' | 'interest' | 'nsf' | 'other';

export interface ReconciliationAdjustment {
  id: string;
  org_id: string;
  statement_id: string;
  adjustment_date: string;
  adjustment_type: AdjustmentType;
  description: string;
  amount: number;
  related_payment_id: string | null;
  related_deposit_id: string | null;
  related_line_id: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// PAYMENT AUDIT LOG TYPES
// ============================================================================

export type AuditAction = 'insert' | 'update' | 'delete' | 'void' | 'nsf' | 'match' | 'unmatch' | 'approve' | 'reconcile';

export interface PaymentAuditEntry {
  id: string;
  org_id: string;
  table_name: string;
  record_id: string;
  action: AuditAction;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_fields: string[] | null;
  performed_by: string;
  performed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  reason: string | null;
  notes: string | null;
}

// ============================================================================
// PAYMENT ATTACHMENT TYPES
// ============================================================================

export type AttachmentType = 'check_image_front' | 'check_image_back' | 'receipt' | 'deposit_slip' | 'statement' | 'other';

export interface PaymentAttachment {
  id: string;
  org_id: string;
  payment_id: string | null;
  deposit_id: string | null;
  file_name: string;
  file_type: string;
  file_size: number | null;
  storage_path: string;
  attachment_type: AttachmentType | null;
  description: string | null;
  uploaded_by: string;
  created_at: string;
}

// ============================================================================
// DEPOSIT MATCH SUGGESTION
// ============================================================================

export interface DepositMatchSuggestion {
  line_id: string;
  deposit_id: string;
  match_confidence: number;
  amount_match: boolean;
  date_diff: number;
  line?: BankStatementLine;
  deposit?: EscrowDeposit;
}

// ============================================================================
// ZOD SCHEMAS FOR FORM VALIDATION
// ============================================================================

export const recordPaymentSchema = z.object({
  policy_id: z.string().uuid().optional().nullable(),
  account_id: z.string().uuid().optional().nullable(),
  payment_method_id: z.string().uuid({ message: 'Payment method is required' }),
  amount: z.number({ required_error: 'Amount is required' })
    .positive({ message: 'Amount must be greater than 0' })
    .multipleOf(0.01, { message: 'Amount must have at most 2 decimal places' }),
  amount_tendered: z.number().positive().optional().nullable(),
  reference_number: z.string().max(100).optional().nullable(),
  check_number: z.string().max(50).optional().nullable(),
  check_date: z.string().optional().nullable(),
  payer_name: z.string().max(200).optional().nullable(),
  payer_address: z.string().max(500).optional().nullable(),
  received_date: z.string({ required_error: 'Received date is required' }),
  day_sheet_date: z.string().optional().nullable(),
  payment_source: z.enum(['in_person', 'mail', 'online', 'phone', 'lockbox']).default('in_person'),
  invoice_number: z.string().max(50).optional().nullable(),
  paid_to: z.enum(['company', 'escrow']).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const createDepositSchema = z.object({
  day_sheet_id: z.string().uuid().optional().nullable(),
  bank_account_id: z.string().uuid({ message: 'Bank account is required' }),
  deposit_date: z.string({ required_error: 'Deposit date is required' }),
  deposit_slip_number: z.string().max(50).optional().nullable(),
  total_amount: z.number().positive({ message: 'Amount must be greater than 0' }),
  cash_amount: z.number().nonnegative().default(0),
  check_amount: z.number().nonnegative().default(0),
  check_count: z.number().int().nonnegative().default(0),
  notes: z.string().max(1000).optional().nullable(),
});

export type CreateDepositInput = z.infer<typeof createDepositSchema>;

export const verifyDepositSchema = z.object({
  deposit_id: z.string().uuid({ message: 'Deposit ID is required' }),
  verified_amount: z.number().positive({ message: 'Verified amount is required' }),
  verification_notes: z.string().max(1000).optional().nullable(),
});

export type VerifyDepositInput = z.infer<typeof verifyDepositSchema>;

export const importStatementSchema = z.object({
  bank_account_id: z.string().uuid({ message: 'Bank account is required' }),
  statement_date: z.string({ required_error: 'Statement date is required' }),
  period_start: z.string({ required_error: 'Period start is required' }),
  period_end: z.string({ required_error: 'Period end is required' }),
  beginning_balance: z.number({ required_error: 'Beginning balance is required' }),
  ending_balance: z.number({ required_error: 'Ending balance is required' }),
  import_source: z.enum(['csv', 'ofx', 'qfx', 'manual', 'ocr']).default('csv'),
  lines: z.array(z.object({
    line_date: z.string(),
    post_date: z.string().optional().nullable(),
    description: z.string(),
    amount: z.number(),
    line_type: z.enum(['deposit', 'withdrawal', 'fee', 'interest', 'transfer', 'adjustment', 'other']),
    reference: z.string().optional().nullable(),
    check_number: z.string().optional().nullable(),
  })),
  notes: z.string().max(1000).optional().nullable(),
});

export type ImportStatementInput = z.infer<typeof importStatementSchema>;

export const matchDepositSchema = z.object({
  line_id: z.string().uuid({ message: 'Statement line ID is required' }),
  deposit_id: z.string().uuid({ message: 'Deposit ID is required' }),
});

export type MatchDepositInput = z.infer<typeof matchDepositSchema>;

export const createAdjustmentSchema = z.object({
  statement_id: z.string().uuid({ message: 'Statement ID is required' }),
  adjustment_type: z.enum(['bank_error', 'recording_error', 'timing_difference', 'fee', 'interest', 'nsf', 'other']),
  description: z.string().min(1, { message: 'Description is required' }).max(500),
  amount: z.number({ required_error: 'Amount is required' }),
  related_payment_id: z.string().uuid().optional().nullable(),
  related_deposit_id: z.string().uuid().optional().nullable(),
  related_line_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

export const voidPaymentSchema = z.object({
  payment_id: z.string().uuid({ message: 'Payment ID is required' }),
  void_reason: z.string().min(1, { message: 'Void reason is required' }).max(500),
});

export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;

export const createBankAccountSchema = z.object({
  account_name: z.string().min(1, { message: 'Account name is required' }).max(200),
  bank_name: z.string().min(1, { message: 'Bank name is required' }).max(200),
  account_type: z.enum(['checking', 'savings', 'trust', 'escrow']),
  account_number_last4: z.string().length(4).optional().nullable(),
  routing_number: z.string().length(9).optional().nullable(),
  is_primary: z.boolean().default(false),
  gl_account_code: z.string().max(50).optional().nullable(),
});

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;

// ============================================================================
// FILTER & QUERY TYPES
// ============================================================================

export interface PaymentFilters {
  status?: PaymentStatus[];
  payment_method_type?: PaymentMethodType[];
  date_from?: string;
  date_to?: string;
  account_id?: string;
  policy_id?: string;
  day_sheet_id?: string;
  search?: string;
  min_amount?: number;
  max_amount?: number;
}

export interface DaySheetFilters {
  status?: DaySheetStatus[];
  date_from?: string;
  date_to?: string;
}

export interface DepositFilters {
  reconciliation_status?: ReconciliationStatus[];
  date_from?: string;
  date_to?: string;
  bank_account_id?: string;
}

export interface StatementFilters {
  reconciliation_status?: StatementReconciliationStatus[];
  date_from?: string;
  date_to?: string;
  bank_account_id?: string;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface PaymentAnalytics {
  total_payments: number;
  total_amount: number;
  average_payment: number;
  by_method: Record<PaymentMethodType, { count: number; amount: number }>;
  by_status: Record<PaymentStatus, number>;
  by_date: Array<{ date: string; count: number; amount: number }>;
}

export interface ReconciliationSummary {
  statement_id: string;
  statement_date: string;
  beginning_balance: number;
  ending_balance: number;
  total_deposits: number;
  matched_deposits: number;
  unmatched_deposits: number;
  total_adjustments: number;
  calculated_balance: number;
  variance: number;
  is_reconciled: boolean;
}
