/**
 * Coterie <-> normalized domain mappers.
 *
 * PURE functions only — no I/O, no Deno/Node APIs, no fetch. This module is
 * imported by the Coterie client/adapter (Deno edge runtime) and exercised
 * directly by Vitest unit tests.
 *
 * Coterie commercial quote API reference (modeled, not called in Phase 1):
 *   POST {base}/quotes/bindable   (Publishable key, header `Authorization: token <key>`)
 */

import type {
  CommercialLine,
  CommercialQuoteInput,
  LineQuote,
  QuoteResult,
} from '../carrier-adapter/types.ts';

export const COTERIE_DISPLAY_NAME = 'Coterie Insurance';

// ---------------------------------------------------------------------------
// Raw Coterie request shape (POST /quotes/bindable)
// ---------------------------------------------------------------------------

export interface CoterieRequestLocation {
  street: string;
  city: string;
  state: string;
  zip: string;
  locationType: 'Home' | 'BuildingLeased' | 'BuildingOwned';
  bppLimit?: number;
  buildingLimit?: number;
  [key: string]: unknown;
}

export interface CoteriePreviousLoss {
  amount: number;
  description: string;
  date?: string;
}

export interface CoterieBindableQuoteRequest {
  applicationTypes: CommercialLine[];
  agencyExternalId?: string;
  producerExternalId?: string;
  glLimit?: number;
  glAggregateLimit?: number;
  annualPayroll?: number;
  grossAnnualSales?: number;
  numEmployees?: number;
  AKHash?: string;
  FEIN?: string;
  /** Coterie accepts both name fields; we always send both. */
  businessName: string;
  legalBusinessName: string;
  /** MM-DD-YYYY. */
  businessStartDate?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactEmail?: string;
  contactPhone?: string;
  mailingAddressStreet?: string;
  mailingAddressCity?: string;
  mailingAddressState?: string;
  mailingAddressZip?: string;
  locations: CoterieRequestLocation[];
  /** Always present; `[]` denotes "no prior losses". */
  previousLosses: CoteriePreviousLoss[];
  professionalLiability?: Record<string, unknown>;
  endorsements?: Record<string, unknown>;
  additionalInsureds?: Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Raw Coterie response shape
// ---------------------------------------------------------------------------

export interface CoterieLineItem {
  description: string;
  amount: number;
  lineItemType?: string;
  premiumType?: string;
}

export interface CoterieFee {
  description: string;
  amount: number;
  frequency?: string;
  feeType?: string;
}

export interface CoterieLineQuote {
  quoteId: string;
  applicationId?: string;
  policyType: string;
  premium: number;
  expirationDate?: string;
  insuranceCarrier?: string;
  lineItems?: CoterieLineItem[];
  fees?: CoterieFee[];
}

export interface CoterieQuoteEnvelope {
  premium?: number;
  monthlyPremium?: number;
  totalYearlyFees?: number;
  totalYearlyOwed?: number;
  isEstimate?: boolean;
  externalId?: string;
  quotes?: CoterieLineQuote[];
  quoteProposalUrl?: string;
  applicationUrl?: string;
  stateNoticeText?: string;
}

export interface CoterieDeclination {
  policyType: string;
  declination: string[];
}

export interface CoterieUnderwritingInformation {
  underwritingId?: string;
  declinations?: CoterieDeclination[];
}

export interface RawCoterieQuoteResponse {
  quote?: CoterieQuoteEnvelope;
  underwritingInformation?: CoterieUnderwritingInformation;
  warnings?: string[];
  isSuccess?: boolean;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Date helper
// ---------------------------------------------------------------------------

/**
 * Normalize a date to Coterie's MM-DD-YYYY format.
 * Accepts ISO `YYYY-MM-DD`, `MM-DD-YYYY`, or `MM/DD/YYYY`.
 * Returns undefined for empty/unparseable input (mapper stays pure & lossless).
 */
export function toCoterieDate(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Already MM-DD-YYYY
  let m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // MM/DD/YYYY
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (m) return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[3]}`;

  // ISO YYYY-MM-DD (optionally with time component)
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (m) return `${m[2]}-${m[3]}-${m[1]}`;

  return undefined;
}

// ---------------------------------------------------------------------------
// Intake -> Coterie request
// ---------------------------------------------------------------------------

/** Default risk-location type for a location derived from the mailing address. */
const DEFAULT_DERIVED_LOCATION_TYPE: CoterieRequestLocation['locationType'] = 'BuildingLeased';

export function mapIntakeToCoterieQuoteRequest(
  intake: CommercialQuoteInput,
): CoterieBindableQuoteRequest {
  const explicitLocations: CoterieRequestLocation[] = (intake.locations ?? []).map((loc) => {
    const { street, city, state, zip, locationType, bppLimit, buildingLimit, ...rest } = loc;
    return {
      street,
      city,
      state,
      zip,
      locationType,
      ...(bppLimit !== undefined ? { bppLimit } : {}),
      ...(buildingLimit !== undefined ? { buildingLimit } : {}),
      ...rest,
    };
  });

  // Coterie's bindable endpoint requires >= 1 risk location, but the Phase 1
  // intake only collects a mailing address. When no explicit location is given,
  // DERIVE a single location from the mailing address so the bindable body is
  // always valid. `locationType` defaults to 'BuildingLeased' (the common
  // small-commercial posture) and is overridable via `intake.locationType`.
  const locations: CoterieRequestLocation[] =
    explicitLocations.length > 0
      ? explicitLocations
      : intake.mailingAddress
        ? [
            {
              street: intake.mailingAddress.street,
              city: intake.mailingAddress.city,
              state: intake.mailingAddress.state,
              zip: intake.mailingAddress.zip,
              locationType: intake.locationType ?? DEFAULT_DERIVED_LOCATION_TYPE,
            },
          ]
        : [];

  // Always emit an explicit array; [] means "no prior losses". Loss dates are
  // normalized to Coterie's MM-DD-YYYY just like businessStartDate (LOW-10).
  const previousLosses: CoteriePreviousLoss[] = (intake.previousLosses ?? []).map((loss) => {
    const date = toCoterieDate(loss.date);
    return {
      amount: loss.amount,
      description: loss.description,
      ...(date ? { date } : {}),
    };
  });

  const request: CoterieBindableQuoteRequest = {
    applicationTypes: [...intake.lines],
    businessName: intake.businessName,
    // Send both name fields; legal falls back to the operating/business name.
    legalBusinessName: intake.legalBusinessName ?? intake.businessName,
    locations,
    previousLosses,
  };

  if (intake.agencyExternalId) request.agencyExternalId = intake.agencyExternalId;
  if (intake.producerExternalId) request.producerExternalId = intake.producerExternalId;
  if (intake.glLimit !== undefined) request.glLimit = intake.glLimit;
  if (intake.glAggregateLimit !== undefined) request.glAggregateLimit = intake.glAggregateLimit;
  if (intake.annualPayroll !== undefined) request.annualPayroll = intake.annualPayroll;
  if (intake.grossAnnualSales !== undefined) request.grossAnnualSales = intake.grossAnnualSales;
  if (intake.numEmployees !== undefined) request.numEmployees = intake.numEmployees;
  if (intake.akHash) request.AKHash = intake.akHash;
  if (intake.fein) request.FEIN = intake.fein;

  const businessStartDate = toCoterieDate(intake.businessStartDate);
  if (businessStartDate) request.businessStartDate = businessStartDate;

  if (intake.contact) {
    request.contactFirstName = intake.contact.firstName;
    request.contactLastName = intake.contact.lastName;
    request.contactEmail = intake.contact.email;
    request.contactPhone = intake.contact.phone;
  }

  if (intake.mailingAddress) {
    request.mailingAddressStreet = intake.mailingAddress.street;
    request.mailingAddressCity = intake.mailingAddress.city;
    request.mailingAddressState = intake.mailingAddress.state;
    request.mailingAddressZip = intake.mailingAddress.zip;
  }

  if (intake.professionalLiability) request.professionalLiability = intake.professionalLiability;
  if (intake.endorsements) request.endorsements = intake.endorsements;
  if (intake.additionalInsureds) request.additionalInsureds = intake.additionalInsureds;

  return request;
}

// ---------------------------------------------------------------------------
// Coterie response -> normalized QuoteResult
// ---------------------------------------------------------------------------

function mapLineQuote(line: CoterieLineQuote): LineQuote {
  return {
    quoteId: line.quoteId,
    applicationId: line.applicationId,
    policyType: line.policyType,
    premium: line.premium,
    expirationDate: line.expirationDate,
    insuranceCarrier: line.insuranceCarrier ?? COTERIE_DISPLAY_NAME,
    lineItems: (line.lineItems ?? []).map((li) => ({
      description: li.description,
      amount: li.amount,
      lineItemType: li.lineItemType,
      premiumType: li.premiumType,
    })),
    fees: (line.fees ?? []).map((f) => ({
      description: f.description,
      amount: f.amount,
      frequency: f.frequency,
      feeType: f.feeType,
    })),
  };
}

export interface MapResponseOptions {
  /** Opaque reference to the persisted raw response (e.g. coterie_quotes row id). */
  rawResponseRef?: string;
}

export function mapCoterieQuoteResponseToResult(
  resp: RawCoterieQuoteResponse | null | undefined,
  opts: MapResponseOptions = {},
): QuoteResult {
  const carrier = COTERIE_DISPLAY_NAME;
  const disclosures: string[] = [];
  const noticeText = resp?.quote?.stateNoticeText;
  if (noticeText) disclosures.push(noticeText);

  const declinationEntries = resp?.underwritingInformation?.declinations ?? [];
  const hasDeclinations = declinationEntries.some((d) => (d.declination?.length ?? 0) > 0);
  const errors = resp?.errors ?? [];
  const warnings = resp?.warnings ?? [];
  const underwritingId = resp?.underwritingInformation?.underwritingId;

  // 1) Success path
  if (resp?.isSuccess === true && resp.quote) {
    const q = resp.quote;
    return {
      status: 'quoted',
      carrier,
      externalId: q.externalId,
      premium: q.premium,
      monthlyPremium: q.monthlyPremium,
      totalYearlyFees: q.totalYearlyFees,
      totalYearlyOwed: q.totalYearlyOwed,
      isEstimate: q.isEstimate,
      fees: q.totalYearlyFees,
      lineQuotes: (q.quotes ?? []).map(mapLineQuote),
      proposalUrl: q.quoteProposalUrl,
      applicationUrl: q.applicationUrl,
      disclosures,
      warnings,
      underwritingId,
      rawResponseRef: opts.rawResponseRef,
    };
  }

  // 2) Declination path (check BEFORE generic errors — declines also carry an errors[] entry)
  if (hasDeclinations) {
    return {
      status: 'declined',
      carrier,
      lineQuotes: [],
      disclosures,
      declinations: declinationEntries.map((d) => ({
        policyType: d.policyType,
        reasons: d.declination ?? [],
      })),
      errors,
      warnings,
      underwritingId,
      rawResponseRef: opts.rawResponseRef,
    };
  }

  // 3) Validation / generic error path
  if (errors.length > 0) {
    return {
      status: 'error',
      carrier,
      lineQuotes: [],
      disclosures,
      errors,
      warnings,
      underwritingId,
      rawResponseRef: opts.rawResponseRef,
    };
  }

  // 4) Fallback — unrecognized shape
  return {
    status: 'error',
    carrier,
    lineQuotes: [],
    disclosures,
    errors: ['Unrecognized Coterie response shape'],
    warnings,
    rawResponseRef: opts.rawResponseRef,
  };
}
