// fromRiskStore: commercial risk store rows -> Acord126Input.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib. The only import is ./types, so
// the runtime surface stays zero and the module ports verbatim to
// supabase/functions/_shared/acord126/ (the acord125/fromRiskStore.ts twin).
//
// The arg shapes below are PLAIN serializable mirrors of the columns this
// adapter reads, declared locally on purpose (no imports from
// src/integrations or src/types). glLimits mirrors policies.cgl_details.limits
// (the extract-cgl-policy JSONB contract) exactly; the caller sources it from
// the remarket source policy when commercial_submissions.remarket_of_policy_id
// is set, else passes null (all limits print blank and validateAcord126 tells
// the operator which are required).
//
// Defaults specific to this phase:
// - Coverage form: OCCURRENCE checked, CLAIMS MADE unchecked. The risk store
//   carries no coverage-form field yet; occurrence is the E&S GL norm.
// - hazards: [] (the schedule of hazards is a later slice; the blank's 9 rows
//   print their totality defaults).
// - account.name: the caller passes the RESOLVED insured display name (the
//   built 125 input's namedInsured.name), so the two forms can never disagree.
// - producerName: the 126 header carries only the agency name (no address
//   block on this blank), passed as a plain string.
// - completionDateIso is accepted for signature parity with the 125 adapter
//   but does not flow anywhere yet: the 2009-08 blank's form-date box
//   (fieldMap 'formDate') has no Phase 1b input backing on Acord126Input.

import type {
  Acord126AggregateAppliesPer,
  Acord126Input,
} from './types';

// ---------------------------------------------------------------------------
// Plain row mirrors (only the columns this adapter reads)
// ---------------------------------------------------------------------------

/** commercial_submissions columns consumed by the ACORD 126. */
export interface RiskStoreSubmission126 {
  /** 'YYYY-MM-DD' or null. */
  effective_date: string | null;
}

/** The resolved insured display name (see header comment). */
export interface RiskStoreAccount126 {
  name: string | null;
}

/**
 * policies.cgl_details.limits, verbatim keys from the extract-cgl-policy
 * JSONB contract. Values tolerate anything the JSONB may carry; non-finite
 * numbers print blank.
 */
export interface RiskStoreGlLimits {
  each_occurrence: number | null;
  general_aggregate: number | null;
  damage_to_rented_premises: number | null;
  medical_expense: number | null;
  personal_advertising_injury: number | null;
  products_completed_ops_aggregate: number | null;
  /** policy / project / location (anything else checks no box). */
  aggregate_applies_per: string | null;
}

export interface BuildAcord126FromRiskStoreArgs {
  submission: RiskStoreSubmission126;
  account: RiskStoreAccount126;
  /** null when the submission is not a remarket (all limits print blank). */
  glLimits: RiskStoreGlLimits | null;
  /** Agency name for the header AGENCY box. */
  producerName: string;
  /** 'YYYY-MM-DD'; accepted for parity, unused until formDate gains backing. */
  completionDateIso: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const AGGREGATE_BASES: readonly Acord126AggregateAppliesPer[] = [
  'policy',
  'project',
  'location',
];

/** JSONB basis string -> the closed checkbox vocabulary; unknown -> null. */
function toAggregateAppliesPer(
  raw: string | null | undefined,
): Acord126AggregateAppliesPer | null {
  const value = (raw ?? '').trim().toLowerCase();
  return (AGGREGATE_BASES as readonly string[]).includes(value)
    ? (value as Acord126AggregateAppliesPer)
    : null;
}

/** JSONB money value -> whole-dollar number or null (null prints blank). */
function toLimit(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

const str = (v: string | null | undefined): string => (v ?? '').trim();

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export function buildAcord126InputFromRiskStore(
  args: BuildAcord126FromRiskStoreArgs,
): Acord126Input {
  const { submission, account, glLimits, producerName } = args;

  return {
    header: {
      namedInsured: str(account?.name),
      effectiveDate: str(submission?.effective_date),
      producerName: str(producerName),
    },
    coverage: {
      occurrence: true,
      claimsMade: false,
    },
    limits: {
      eachOccurrence: toLimit(glLimits?.each_occurrence),
      damageToRentedPremises: toLimit(glLimits?.damage_to_rented_premises),
      medicalExpense: toLimit(glLimits?.medical_expense),
      personalAdvInjury: toLimit(glLimits?.personal_advertising_injury),
      generalAggregate: toLimit(glLimits?.general_aggregate),
      productsCompOpsAggregate: toLimit(glLimits?.products_completed_ops_aggregate),
    },
    aggregateAppliesPer: toAggregateAppliesPer(glLimits?.aggregate_applies_per),
    hazards: [],
  };
}
