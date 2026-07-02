/**
 * Coterie frontend DTOs.
 *
 * These mirror the normalized domain types in
 * `supabase/functions/_shared/carrier-adapter/types.ts` (the source of truth).
 * They are intentionally DUPLICATED here rather than imported, so the Vite
 * frontend never pulls Deno edge code into its build. Keep the two in sync when
 * the shared contract changes.
 */

export type CommercialLine = 'BOP' | 'GL' | 'PL';

export const COMMERCIAL_LINES: { value: CommercialLine; label: string }[] = [
  { value: 'BOP', label: 'Business Owners Policy (BOP)' },
  { value: 'GL', label: 'General Liability (GL)' },
  { value: 'PL', label: 'Professional Liability (PL)' },
];

/** Coterie GL per-occurrence limit options (documented allowed values). */
export const GL_LIMIT_OPTIONS = [300000, 500000, 1000000, 2000000] as const;

export type CommercialLocationType = 'Home' | 'BuildingLeased' | 'BuildingOwned';

export interface CommercialContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface CommercialAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface PreviousLoss {
  amount: number;
  description: string;
  date?: string;
}

/** Values collected by the intake form and posted to the edge function. */
export interface CoterieQuoteFormValues {
  accountId: string;
  lines: CommercialLine[];
  businessName: string;
  legalBusinessName?: string;
  businessStartDate?: string;
  glLimit?: number;
  glAggregateLimit?: number;
  annualPayroll?: number;
  grossAnnualSales?: number;
  numEmployees?: number;
  contact: CommercialContact;
  mailingAddress: CommercialAddress;
  /** Optional override for the location type derived from the mailing address. */
  locationType?: CommercialLocationType;
  previousLosses?: PreviousLoss[];
  idempotencyKey?: string;
}

export interface LineItem {
  description: string;
  amount: number;
  lineItemType?: string;
  premiumType?: string;
}

export interface FeeLine {
  description: string;
  amount: number;
  frequency?: string;
  feeType?: string;
}

export interface LineQuote {
  quoteId: string;
  applicationId?: string;
  policyType: string;
  premium: number;
  expirationDate?: string;
  insuranceCarrier?: string;
  lineItems: LineItem[];
  fees: FeeLine[];
}

export type QuoteStatus = 'quoted' | 'declined' | 'error' | 'referral';

export interface QuoteDeclination {
  policyType: string;
  reasons: string[];
}

export interface NormalizedQuoteResult {
  status: QuoteStatus;
  carrier: string;
  externalId?: string;
  premium?: number;
  monthlyPremium?: number;
  totalYearlyFees?: number;
  totalYearlyOwed?: number;
  isEstimate?: boolean;
  fees?: number;
  lineQuotes: LineQuote[];
  proposalUrl?: string;
  applicationUrl?: string;
  disclosures: string[];
  declinations?: QuoteDeclination[];
  errors?: string[];
  warnings?: string[];
  underwritingId?: string;
}

/** Shape returned by the `coterie-quote` edge function. */
export interface CoterieQuoteResponse {
  success: boolean;
  mock: boolean;
  idempotent?: boolean;
  sessionId: string;
  quoteId: string | null;
  approvalGateId: string | null;
  result: NormalizedQuoteResult | null;
}

// ---------------------------------------------------------------------------
// Database row shapes (subset) read directly by the frontend
// ---------------------------------------------------------------------------

export interface CoterieQuoteRow {
  id: string;
  session_id: string;
  account_id: string;
  external_id: string | null;
  line_quotes: LineQuote[];
  premium: number | null;
  monthly_premium: number | null;
  decision: QuoteStatus;
  raw_response: unknown;
  carrier: string;
  proposal_url: string | null;
  created_at: string;
  deleted_at: string | null;
}

export type ApprovalEntityType =
  | 'quote'
  | 'proposal'
  | 'bind'
  | 'client_message'
  | 'policy_change';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface CarrierApprovalGateRow {
  id: string;
  entity_type: ApprovalEntityType;
  entity_id: string;
  account_id: string | null;
  requested_by: string | null;
  assigned_to: string | null;
  status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  denial_reason: string | null;
  summary: string;
  risk_flags: string[];
  audit_trail: unknown[];
  created_at: string;
  updated_at: string;
}
