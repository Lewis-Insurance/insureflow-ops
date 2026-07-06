// fromRiskStore: commercial risk store rows -> Acord125Input.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib. The only import is ./types, so
// the runtime surface stays zero and the module ports verbatim to
// supabase/functions/_shared/acord125/ (the fromMasterCoi.ts precedent).
//
// The arg shapes below are PLAIN serializable mirrors of the columns this
// adapter reads, declared locally on purpose: no imports from
// src/integrations or src/types, so the Deno port carries no client-only
// dependency. Column names mirror commercial_profiles / commercial_locations /
// commercial_submissions (migration 20260705160000) and accounts.name exactly.
//
// Derivations (documented because the risk store is narrower than the blank):
// - Insured mailing address: commercial_profiles carries NO address columns,
//   so the mailing address prints from the FIRST location row (premises #1 is
//   the mailing address until the profile grows dedicated columns).
// - Insured phone: the risk store carries no phone column yet; prints blank.
// - Policy expiration: effective + 1 year, computed date-only (string
//   arithmetic, never new Date(), so no timezone drift). Feb 29 clamps to
//   Feb 28 when the target year is not a leap year.
// - Premises rows: the first 4 locations, in caller order (the blank carries
//   4 location rows; overflow belongs on an additional premises schedule).
// - Producer: agency constants passed by the caller; the blank fields with no
//   arg backing (address line 2, contact name, fax, customer id, authorized
//   rep) print blank at this phase.

import type {
  Acord125EntityType,
  Acord125Input,
  Acord125Premises,
  Acord125PremisesInterest,
} from './types';

// ---------------------------------------------------------------------------
// Plain row mirrors (only the columns this adapter reads)
// ---------------------------------------------------------------------------

/** commercial_submissions columns consumed by the ACORD 125. */
export interface RiskStoreSubmission {
  /** 'YYYY-MM-DD' or null. */
  effective_date: string | null;
  /** Vocabulary: gl / auto / umbrella / wc / property / other. */
  target_lines: string[];
}

/** accounts columns consumed by the ACORD 125. */
export interface RiskStoreAccount {
  name: string | null;
}

/** commercial_profiles columns consumed by the ACORD 125. */
export interface RiskStoreProfile {
  legal_name: string | null;
  entity_type: string | null;
  fein: string | null;
  sic_code: string | null;
  naics_code: string | null;
  website: string | null;
  description_of_operations: string | null;
}

/** commercial_locations columns consumed by the ACORD 125. */
export interface RiskStoreLocation {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  /** Vocabulary: owner / tenant (own / lease tolerated). */
  interest: string | null;
}

/** Agency producer constants (the caller passes them; env-overridable there). */
export interface RiskStoreProducer {
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
}

export interface BuildAcord125FromRiskStoreArgs {
  submission: RiskStoreSubmission;
  account: RiskStoreAccount;
  /** One live row per account, or null when intake has not created one yet. */
  profile: RiskStoreProfile | null;
  /** Live rows in print order; only the first 4 reach the form. */
  locations: RiskStoreLocation[];
  producer: RiskStoreProducer;
  /** 'YYYY-MM-DD', usually today in the agency timezone. */
  completionDateIso: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const PREMISES_ROW_COUNT = 4;

const ENTITY_TYPES: readonly Acord125EntityType[] = [
  'corporation',
  'llc',
  'individual',
  'partnership',
  'joint_venture',
  'trust',
  'other',
];

/** Risk-store entity_type -> the closed input vocabulary; unknown -> null. */
function toEntityType(raw: string | null | undefined): Acord125EntityType | null {
  const value = (raw ?? '').trim().toLowerCase();
  return (ENTITY_TYPES as readonly string[]).includes(value)
    ? (value as Acord125EntityType)
    : null;
}

/** Risk-store interest (owner/tenant, own/lease tolerated) -> own | lease. */
function toInterest(raw: string | null | undefined): Acord125PremisesInterest | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'owner' || value === 'own') {
    return 'own';
  }
  if (value === 'tenant' || value === 'lease') {
    return 'lease';
  }
  return null;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * ISO 'YYYY-MM-DD' + 1 year, date-only string arithmetic (never new Date(),
 * so no timezone drift). Feb 29 clamps to Feb 28 on a non-leap target year.
 * Non-ISO input returns '' (the builder treats '' as not-yet-set).
 */
function addOneYearIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) {
    return '';
  }
  const year = Number(m[1]) + 1;
  const day = m[2] === '02' && m[3] === '29' && !isLeapYear(year) ? '28' : m[3];
  return `${String(year).padStart(4, '0')}-${m[2]}-${day}`;
}

const str = (v: string | null | undefined): string => (v ?? '').trim();

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export function buildAcord125InputFromRiskStore(
  args: BuildAcord125FromRiskStoreArgs,
): Acord125Input {
  const { submission, account, profile, producer, completionDateIso } = args;
  const locations = args.locations ?? [];

  // The mailing address prints from the first location (see header comment).
  const mailing = locations[0];

  const effectiveDate = str(submission?.effective_date);
  const targetLines = submission?.target_lines ?? [];

  const premises: Acord125Premises[] = locations
    .slice(0, PREMISES_ROW_COUNT)
    .map((loc) => ({
      street: [str(loc.address_line1), str(loc.address_line2)]
        .filter((s) => s.length > 0)
        .join(', '),
      city: str(loc.city),
      state: str(loc.state),
      zip: str(loc.zip),
      county: str(loc.county),
      interest: toInterest(loc.interest),
    }));

  return {
    completionDate: str(completionDateIso),
    producer: {
      name: str(producer?.name),
      addressLine1: str(producer?.addressLine1),
      addressLine2: '',
      city: str(producer?.city),
      state: str(producer?.state),
      zip: str(producer?.zip),
      contactName: '',
      phone: str(producer?.phone),
      fax: '',
      email: str(producer?.email),
      customerId: '',
      authorizedRepName: '',
    },
    namedInsured: {
      name: str(profile?.legal_name) || str(account?.name),
      addressLine1: str(mailing?.address_line1),
      addressLine2: str(mailing?.address_line2),
      city: str(mailing?.city),
      state: str(mailing?.state),
      zip: str(mailing?.zip),
      entityType: toEntityType(profile?.entity_type),
      fein: str(profile?.fein),
      sic: str(profile?.sic_code),
      naics: str(profile?.naics_code),
      phone: '',
      website: str(profile?.website),
    },
    policy: {
      effectiveDate,
      expirationDate: effectiveDate ? addOneYearIso(effectiveDate) : '',
      policyNumber: '',
    },
    linesOfBusiness: {
      gl: targetLines.includes('gl'),
      glPremium: null,
      property: targetLines.includes('property'),
      auto: targetLines.includes('auto'),
      umbrella: targetLines.includes('umbrella'),
    },
    premises,
    natureOfBusiness: {
      description: str(profile?.description_of_operations),
    },
  };
}
