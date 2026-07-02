/**
 * Commercial Carrier Adapter — shared, carrier-agnostic domain model.
 *
 * This is the FIRST carrier adapter abstraction in the repo. Every commercial
 * carrier integration (Coterie is the first) implements `CommercialCarrierAdapter`
 * and maps its proprietary request/response shapes to the normalized domain
 * types defined here.
 *
 * Pure types + interface only. This module MUST stay free of any Deno- or
 * Node-specific APIs so it can be imported by edge functions (Deno), the
 * frontend build (Vite), and Vitest unit tests alike.
 *
 * GUARDRAIL: There is intentionally NO `bind()` method on the adapter
 * interface in Phase 1. Binding (issuing a policy / taking payment) is out of
 * scope. The only bind-adjacent surface is `prepareBind()`, which assembles —
 * but never transmits — a bind packet, and only after an approved human gate.
 */

// ---------------------------------------------------------------------------
// Lines of business
// ---------------------------------------------------------------------------

/** Commercial lines supported by the abstraction. BOP, General Liability, Professional Liability. */
export type CommercialLine = 'BOP' | 'GL' | 'PL';

// ---------------------------------------------------------------------------
// Addresses / locations
// ---------------------------------------------------------------------------

export interface CommercialAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export type CommercialLocationType = 'Home' | 'BuildingLeased' | 'BuildingOwned';

export interface CommercialLocation extends CommercialAddress {
  locationType: CommercialLocationType;
  /** Business Personal Property limit. */
  bppLimit?: number;
  buildingLimit?: number;
  /** Allow carrier-specific extras without losing type-safety on the known fields. */
  [key: string]: unknown;
}

export interface PreviousLoss {
  amount: number;
  description: string;
  /** ISO date (optional). */
  date?: string;
}

export interface CommercialContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

// ---------------------------------------------------------------------------
// Intake (appetite check) vs. full quote input
// ---------------------------------------------------------------------------

/** Lightweight intake used to check carrier appetite before assembling a full quote. */
export interface CommercialRiskIntake {
  lines: CommercialLine[];
  /** Primary risk state (USPS 2-letter). */
  state: string;
  industry?: string;
  naicsCode?: string;
  annualPayroll?: number;
  grossAnnualSales?: number;
  numEmployees?: number;
}

/** Full normalized commercial quote input. */
export interface CommercialQuoteInput {
  /** InsureFlow account the quote belongs to (tenant scoping). */
  accountId: string;
  lines: CommercialLine[];
  businessName: string;
  /** Falls back to `businessName` when omitted; both are sent to carriers that want each. */
  legalBusinessName?: string;
  /** Accepts ISO (YYYY-MM-DD) or MM-DD-YYYY; carrier mappers normalize as needed. */
  businessStartDate?: string;
  glLimit?: number;
  glAggregateLimit?: number;
  annualPayroll?: number;
  grossAnnualSales?: number;
  numEmployees?: number;
  contact: CommercialContact;
  mailingAddress: CommercialAddress;
  locations?: CommercialLocation[];
  /**
   * Default location type used when a single risk location is DERIVED from the
   * mailing address (intake collected no explicit `locations`). Carriers such as
   * Coterie require >= 1 location. Defaults to `'BuildingLeased'` when omitted.
   */
  locationType?: CommercialLocationType;
  /** Empty array (or omitted) means "no prior losses"; mappers emit [] explicitly. */
  previousLosses?: PreviousLoss[];
  professionalLiability?: Record<string, unknown>;
  endorsements?: Record<string, unknown>;
  additionalInsureds?: Array<Record<string, unknown>>;
  agencyExternalId?: string;
  producerExternalId?: string;
  /** Opaque carrier hash (e.g. Coterie AKHash). Sensitive — never logged. */
  akHash?: string;
  /** Federal Employer ID Number. Sensitive — never logged. */
  fein?: string;
  /** When provided, repeated submissions with the same key return the first result. */
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------
// Quote results
// ---------------------------------------------------------------------------

export interface FeeLine {
  description: string;
  amount: number;
  frequency?: string;
  feeType?: string;
}

export interface LineItem {
  description: string;
  amount: number;
  lineItemType?: string;
  premiumType?: string;
}

/** A single per-line quote inside a (potentially multi-line) carrier quote. */
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

export interface QuoteResult {
  status: QuoteStatus;
  carrier: string;
  externalId?: string;
  premium?: number;
  monthlyPremium?: number;
  totalYearlyFees?: number;
  totalYearlyOwed?: number;
  isEstimate?: boolean;
  /** Convenience scalar mirror of `totalYearlyFees` for simple displays. */
  fees?: number;
  lineQuotes: LineQuote[];
  proposalUrl?: string;
  applicationUrl?: string;
  /** Compliance / state notice text and any other carrier disclosures. */
  disclosures: string[];
  declinations?: QuoteDeclination[];
  errors?: string[];
  warnings?: string[];
  underwritingId?: string;
  /**
   * Opaque reference to where the full raw carrier response is persisted
   * (e.g. a `coterie_quotes` row id). The raw payload is never returned inline.
   */
  rawResponseRef?: string;
}

export interface AppetiteResult {
  eligible: boolean;
  carrier: string;
  supportedLines: CommercialLine[];
  unsupportedLines: CommercialLine[];
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Approval gates + audit (human-in-the-loop)
// ---------------------------------------------------------------------------

export type ApprovalEntityType =
  | 'quote'
  | 'proposal'
  | 'bind'
  | 'client_message'
  | 'policy_change';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface AuditEvent {
  id?: string;
  /** ISO timestamp. */
  at: string;
  /** Authenticated user id or 'system'. */
  actor: string;
  eventType: string;
  /** MUST be redacted before persistence/logging. */
  detail?: Record<string, unknown>;
}

/**
 * A named-human approval gate. No client-facing action (send, bind, payment)
 * may proceed without an `approved` gate created by an identified user.
 */
export interface ApprovalGate {
  id: string;
  entityType: ApprovalEntityType;
  entityId: string;
  requestedBy: string;
  assignedTo?: string;
  status: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  denialReason?: string;
  summary: string;
  riskFlags: string[];
  auditTrail: AuditEvent[];
}

// ---------------------------------------------------------------------------
// Bind preparation (Phase 1: prepare only — NEVER execute)
// ---------------------------------------------------------------------------

export type PaymentInterval = 'Monthly' | 'None';

export interface BindPreparationInput {
  quoteId: string;
  accountId: string;
  /** REQUIRED to be `approved` for prepareBind to succeed. */
  approvalGate?: ApprovalGate;
  paymentInterval?: PaymentInterval;
  /** Sensitive — stripped from all logs; only ever placed inside the un-sent packet. */
  tokenizedPaymentId?: string;
  agencyExternalId?: string;
  preparedBy: string;
}

/**
 * The fully-assembled body that WOULD be sent to a carrier bind endpoint.
 * In Phase 1 this is produced for review only and is never transmitted —
 * `executed` is the literal `false` to make that invariant type-visible.
 */
export interface BindPacket {
  carrier: string;
  quoteId: string;
  request: {
    tokenizedPaymentID?: string;
    paymentInterval: PaymentInterval;
    agencyExternalId?: string;
  };
  approvalGateId: string;
  preparedBy: string;
  preparedAt: string;
  /** Hard guardrail marker: this packet was assembled but not sent. */
  executed: false;
  notice: string;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface CommercialCarrierAdapter {
  /** Stable machine id, e.g. 'coterie'. */
  id: string;
  /** Human-friendly carrier name, e.g. 'Coterie Insurance'. */
  displayName: string;

  checkAppetite(input: CommercialRiskIntake): Promise<AppetiteResult>;

  createQuote(input: CommercialQuoteInput): Promise<QuoteResult>;

  retrieveQuote?(quoteId: string): Promise<QuoteResult>;

  /**
   * Assemble (do NOT send) a bind packet. Implementations MUST refuse unless an
   * approved {@link ApprovalGate} is supplied AND binding is explicitly enabled.
   */
  prepareBind(input: BindPreparationInput): Promise<BindPacket>;

  // NOTE: bind(...) is intentionally NOT part of the Phase 1 interface.
}
