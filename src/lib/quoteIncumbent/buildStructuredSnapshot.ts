import type { PolicySnapshot, SnapshotField } from '@/types/coverage-comparison';
import { CURRENT_VERSIONS } from '@/types/coverage-comparison';
import type { Database } from '@/integrations/supabase/types';
import type { QuoteCoverage } from '@/hooks/useRankedQuotes';
import type { ProposedQuoteFee } from '@/lib/extractWritebackProposal';
import {
  lineKeyFromLineOfBusiness,
  mapLineKeyToComparisonLob,
  type CoverageLineKey,
} from '@/lib/quoteIncumbent/lineKey';
import { makeSnapshotField } from '@/lib/quoteIncumbent/snapshotField';

type PolicyRow = Database['public']['Tables']['policies']['Row'];

export interface QuoteSnapshotSource {
  id: string;
  line_of_business: string;
  premium: number | null;
  quote_ref?: string | null;
  effective_date?: string | null;
  expiration_date?: string | null;
  carrier_name?: string | null;
  options?: Record<string, unknown> | null;
  coverages: QuoteCoverage[];
  /** Optional term flags when not stored on quote.options (e.g. live extract snapshot). */
  claims_made?: boolean | null;
  defense_inside_limits?: boolean | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPath(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function formatMoney(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function addField(
  fields: Record<string, SnapshotField>,
  limits: Record<string, SnapshotField>,
  deductibles: Record<string, SnapshotField>,
  premiums: Record<string, SnapshotField>,
  field: SnapshotField,
): void {
  fields[field.fieldName] = field;
  if (field.category === 'limits') limits[field.fieldName] = field;
  if (field.category === 'deductibles') deductibles[field.fieldName] = field;
  if (field.category === 'premium') premiums[field.fieldName] = field;
}

function emptySnapshotShell(
  id: string,
  docRole: 'A' | 'B',
  lineKey: CoverageLineKey,
  carrier: string | null,
): PolicySnapshot {
  const namedInsured = makeSnapshotField('NamedInsured', null, 'text', 'identifiers');
  const policyNumber = makeSnapshotField('PolicyNumber', null, 'identifier', 'identifiers');
  const effectiveDate = makeSnapshotField('EffectiveDate', null, 'date', 'dates');
  const expirationDate = makeSnapshotField('ExpirationDate', null, 'date', 'dates');

  return {
    id,
    workspaceId: 'structured',
    workspaceDocumentId: id,
    docRole,
    documentType: docRole === 'A' ? 'policy' : 'quote',
    lineOfBusiness: mapLineKeyToComparisonLob(lineKey),
    carrier,
    carrierNAIC: null,
    namedInsured,
    policyNumber,
    effectiveDate,
    expirationDate,
    fields: {
      NamedInsured: namedInsured,
      PolicyNumber: policyNumber,
      EffectiveDate: effectiveDate,
      ExpirationDate: expirationDate,
    },
    limits: {},
    deductibles: {},
    premiums: {},
    forms: [],
    vehicleCount: null,
    locationCount: null,
    employeeCount: null,
    extractionConfidence: 1,
    totalFields: 0,
    autoAppliedCount: 0,
    needsReviewCount: 0,
    notFoundCount: 0,
    conflictCount: 0,
    status: 'extracted',
    versions: CURRENT_VERSIONS,
    extractedAt: new Date().toISOString(),
  };
}

function policyDetailBlob(policy: PolicyRow, lineKey: CoverageLineKey): unknown {
  switch (lineKey) {
    case 'gl':
      return policy.cgl_details;
    case 'auto':
      return policy.bap_details;
    case 'wc':
      return policy.wc_details;
    case 'property':
      return policy.property_details;
    case 'umbrella':
      return policy.umbrella_details;
    default:
      return null;
  }
}

function addPolicyLineFields(
  snapshot: PolicySnapshot,
  policy: PolicyRow,
  lineKey: CoverageLineKey,
): void {
  const blob = policyDetailBlob(policy, lineKey);
  const add = (field: SnapshotField) =>
    addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, field);

  if (lineKey === 'gl' && isRecord(blob)) {
    const limits = isRecord(blob.limits) ? blob.limits : {};
    add(makeSnapshotField('EachOccurrence', formatMoney(limits.each_occurrence), 'limit', 'limits'));
    add(makeSnapshotField('GeneralAggregate', formatMoney(limits.general_aggregate), 'limit', 'limits'));
    add(
      makeSnapshotField(
        'ProductsCompletedOps',
        formatMoney(limits.products_completed_ops_aggregate),
        'limit',
        'limits',
      ),
    );
    add(
      makeSnapshotField(
        'PersonalAdvInjury',
        formatMoney(limits.personal_advertising_injury),
        'limit',
        'limits',
      ),
    );
    add(
      makeSnapshotField(
        'DamageToRentedPremises',
        formatMoney(limits.damage_to_rented_premises),
        'limit',
        'limits',
      ),
    );
    add(makeSnapshotField('MedicalExpense', formatMoney(limits.medical_expense), 'limit', 'limits'));

    const coverageOptions = isRecord(blob.coverage_options) ? blob.coverage_options : {};
    const policyForm = coverageOptions.policy_form;
    if (policyForm === 'claims_made' || policyForm === 'occurrence') {
      add(
        makeSnapshotField(
          'ClaimsMade',
          policyForm === 'claims_made' ? 'claims_made' : 'occurrence',
          'text',
          'other',
        ),
      );
    }
    const defense = coverageOptions.defense_costs;
    if (defense === 'inside_limits' || defense === 'outside_limits') {
      add(
        makeSnapshotField(
          'DefenseInsideLimits',
          defense === 'inside_limits' ? 'inside_limits' : 'outside_limits',
          'text',
          'other',
        ),
      );
    }
  }

  if (lineKey === 'auto' && isRecord(blob)) {
    const liability = isRecord(readPath(blob, ['coverage', 'liability']))
      ? (readPath(blob, ['coverage', 'liability']) as Record<string, unknown>)
      : {};
    add(makeSnapshotField('CombinedSingleLimit', formatMoney(liability.csl_limit), 'limit', 'limits'));
    add(
      makeSnapshotField(
        'BodilyInjuryPerPerson',
        formatMoney(liability.bodily_injury_per_person),
        'limit',
        'limits',
      ),
    );
    add(
      makeSnapshotField(
        'BodilyInjuryPerAccident',
        formatMoney(liability.bodily_injury_per_accident),
        'limit',
        'limits',
      ),
    );
    add(makeSnapshotField('PropertyDamage', formatMoney(liability.property_damage), 'limit', 'limits'));
  }

  if (lineKey === 'umbrella' && isRecord(blob)) {
    const limits = isRecord(blob.limits) ? blob.limits : {};
    add(makeSnapshotField('UmbrellaOccurrence', formatMoney(limits.per_occurrence), 'limit', 'limits'));
    add(makeSnapshotField('UmbrellaAggregate', formatMoney(limits.aggregate), 'limit', 'limits'));
    const coiSummary = isRecord(blob.coi_summary) ? blob.coi_summary : {};
    if (coiSummary.occurrence_or_claims_made === 'claims_made' || coiSummary.occurrence_or_claims_made === 'occurrence') {
      add(
        makeSnapshotField(
          'ClaimsMade',
          coiSummary.occurrence_or_claims_made === 'claims_made' ? 'claims_made' : 'occurrence',
          'text',
          'other',
        ),
      );
    }
    if (limits.defense_costs === 'inside_limits' || limits.defense_costs === 'outside_limits') {
      add(
        makeSnapshotField(
          'DefenseInsideLimits',
          limits.defense_costs === 'inside_limits' ? 'inside_limits' : 'outside_limits',
          'text',
          'other',
        ),
      );
    }
    const retention = isRecord(blob.retention) ? blob.retention : {};
    add(makeSnapshotField('UmbrellaRetention', formatMoney(retention.amount), 'deductible', 'deductibles'));
  }

  if (lineKey === 'wc' && isRecord(blob)) {
    const el = isRecord(readPath(blob, ['coverage', 'part_two_employers_liability']))
      ? (readPath(blob, ['coverage', 'part_two_employers_liability']) as Record<string, unknown>)
      : {};
    add(makeSnapshotField('EmployersLiability', formatMoney(el.each_accident), 'limit', 'limits'));
    add(
      makeSnapshotField(
        'WCStatutoryLimits',
        formatMoney(el.disease_each_employee),
        'limit',
        'limits',
      ),
    );
    add(
      makeSnapshotField(
        'WCDiseasePolicyLimit',
        formatMoney(el.disease_policy_limit),
        'limit',
        'limits',
      ),
    );
  }

  if (lineKey === 'property' && isRecord(blob)) {
    const coiSummary = isRecord(blob.coi_summary) ? blob.coi_summary : {};
    add(makeSnapshotField('PropertyLimit', formatMoney(coiSummary.limit_amount), 'limit', 'limits'));
    const label =
      typeof coiSummary.label === 'string' && coiSummary.label.trim() ? coiSummary.label.trim() : null;
    add(makeSnapshotField('PropertyLabel', label, 'text', 'other'));
  }
}

export function buildPolicyStructuredSnapshot(policy: PolicyRow, carrierName?: string | null): PolicySnapshot {
  const lineKey = lineKeyFromLineOfBusiness(policy.line_of_business);
  const carrier = carrierName ?? policy.carrier ?? null;
  const snapshot = emptySnapshotShell(`policy-${policy.id}`, 'A', lineKey, carrier);

  const namedInsured = makeSnapshotField('NamedInsured', policy.named_insured ?? null, 'text', 'identifiers');
  const policyNumber = makeSnapshotField('PolicyNumber', policy.policy_number ?? null, 'identifier', 'identifiers');
  const effectiveDate = makeSnapshotField('EffectiveDate', policy.effective_date ?? null, 'date', 'dates');
  const expirationDate = makeSnapshotField('ExpirationDate', policy.expiration_date ?? null, 'date', 'dates');
  const totalPremium = makeSnapshotField(
    'TotalPremium',
    policy.premium != null ? String(policy.premium) : null,
    'currency',
    'premium',
  );

  addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, namedInsured);
  addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, policyNumber);
  addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, effectiveDate);
  addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, expirationDate);
  addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, totalPremium);

  snapshot.namedInsured = namedInsured;
  snapshot.policyNumber = policyNumber;
  snapshot.effectiveDate = effectiveDate;
  snapshot.expirationDate = expirationDate;
  snapshot.premiums.TotalPremium = totalPremium;

  addPolicyLineFields(snapshot, policy, lineKey);

  snapshot.totalFields = Object.keys(snapshot.fields).length;
  snapshot.autoAppliedCount = snapshot.totalFields;
  return snapshot;
}

function readQuoteOptions(options: Record<string, unknown> | null | undefined): {
  fees: ProposedQuoteFee[];
  commission_pct: number | null;
  claims_made: boolean | null;
  defense_inside_limits: boolean | null;
  effective_date: string | null;
} {
  if (!isRecord(options)) {
    return { fees: [], commission_pct: null, claims_made: null, defense_inside_limits: null, effective_date: null };
  }

  const feesRaw = options.fees;
  const fees: ProposedQuoteFee[] = Array.isArray(feesRaw)
    ? feesRaw
        .filter(isRecord)
        .map((fee) => ({
          type: String(fee.type ?? 'other'),
          amount: typeof fee.amount === 'number' ? fee.amount : null,
          label: typeof fee.label === 'string' ? fee.label : undefined,
        }))
    : [];

  const commissionPct =
    typeof options.commission_pct === 'number'
      ? options.commission_pct
      : typeof options.commission_pct === 'string'
        ? Number(options.commission_pct)
        : null;

  const claimsMade =
    options.claims_made === true || options.claims_made === false ? options.claims_made : null;
  const defenseInside =
    options.defense_inside_limits === true || options.defense_inside_limits === false
      ? options.defense_inside_limits
      : null;

  const effectiveDate =
    typeof options.effective_date === 'string' ? options.effective_date : null;

  return {
    fees,
    commission_pct: Number.isFinite(commissionPct) ? commissionPct : null,
    claims_made: claimsMade,
    defense_inside_limits: defenseInside,
    effective_date: effectiveDate,
  };
}

function coverageFieldKey(coverageType: string): string {
  return canonicalCoverageFieldName(coverageType);
}

const COVERAGE_TYPE_ALIASES: Record<string, string> = {
  general_liability: 'EachOccurrence',
  gl_each_occurrence: 'EachOccurrence',
  gl_general_aggregate: 'GeneralAggregate',
  general_aggregate: 'GeneralAggregate',
  products_completed_ops: 'ProductsCompletedOps',
  products_completed_ops_aggregate: 'ProductsCompletedOps',
  personal_advertising_injury: 'PersonalAdvInjury',
  damage_to_rented_premises: 'DamageToRentedPremises',
  medical_expense: 'MedicalExpense',
  auto_csl: 'CombinedSingleLimit',
  umbrella_per_occurrence: 'UmbrellaOccurrence',
  umbrella_aggregate: 'UmbrellaAggregate',
  wc_el_each_accident: 'EmployersLiability',
  property_limit: 'PropertyLimit',
};

function canonicalCoverageFieldName(coverageType: string): string {
  const normalized = coverageType.toLowerCase().trim();
  if (COVERAGE_TYPE_ALIASES[normalized]) {
    return COVERAGE_TYPE_ALIASES[normalized];
  }
  if (normalized.includes('each_occurrence') && !normalized.includes('aggregate')) {
    return 'EachOccurrence';
  }
  if (normalized.includes('general_aggregate') || (normalized.includes('aggregate') && normalized.includes('gl'))) {
    return 'GeneralAggregate';
  }
  return `coverage_${coverageType}`;
}

function coverageLabel(coverageType: string): string {
  return coverageType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildQuoteStructuredSnapshot(source: QuoteSnapshotSource): PolicySnapshot {
  const lineKey = lineKeyFromLineOfBusiness(source.line_of_business);
  const options = readQuoteOptions(source.options);
  const carrier = source.carrier_name ?? null;
  const snapshot = emptySnapshotShell(`quote-${source.id}`, 'B', lineKey, carrier);

  const policyNumber = makeSnapshotField('PolicyNumber', source.quote_ref ?? null, 'identifier', 'identifiers');
  const effectiveDate = makeSnapshotField(
    'EffectiveDate',
    source.effective_date ?? options.effective_date ?? null,
    'date',
    'dates',
  );
  const expirationDate = makeSnapshotField(
    'ExpirationDate',
    source.expiration_date ?? null,
    'date',
    'dates',
  );
  const quotedPremium = makeSnapshotField(
    'QuotedPremium',
    source.premium != null ? String(source.premium) : null,
    'currency',
    'premium',
  );

  addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, policyNumber);
  addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, effectiveDate);
  addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, expirationDate);
  addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, quotedPremium);

  snapshot.policyNumber = policyNumber;
  snapshot.effectiveDate = effectiveDate;
  snapshot.expirationDate = expirationDate;
  snapshot.premiums.QuotedPremium = quotedPremium;

  const claimsMade = source.claims_made ?? options.claims_made;
  const defenseInside = source.defense_inside_limits ?? options.defense_inside_limits;
  if (claimsMade === true || claimsMade === false) {
    const field = makeSnapshotField(
      'ClaimsMade',
      claimsMade ? 'claims_made' : 'occurrence',
      'text',
      'other',
    );
    addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, field);
  }
  if (defenseInside === true || defenseInside === false) {
    const field = makeSnapshotField(
      'DefenseInsideLimits',
      defenseInside ? 'inside_limits' : 'outside_limits',
      'text',
      'other',
    );
    addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, field);
  }

  if (options.commission_pct != null) {
    const field = makeSnapshotField(
      'CommissionPct',
      String(options.commission_pct),
      'percentage',
      'premium',
    );
    addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, field);
  }

  for (const fee of options.fees) {
    const slug = fee.type.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'fee';
    const fieldName = `fee_${slug}`;
    const label = fee.label ?? fee.type;
    const field = makeSnapshotField(
      fieldName,
      fee.amount != null ? String(fee.amount) : null,
      'currency',
      'premium',
    );
    field.displayValue = fee.amount != null ? field.displayValue : label;
    addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, field);
  }

  for (const cov of source.coverages) {
    const fieldName = coverageFieldKey(cov.coverage_type);
    const includedInParent =
      cov.is_included && (!cov.limit_amount || cov.limit_amount.trim() === '');

    let rawLimit: string | null = cov.limit_amount ?? null;
    let fieldType: 'limit' | 'text' = 'limit';
    if (includedInParent) {
      rawLimit = 'Included in parent';
      fieldType = 'text';
    }

    const field = makeSnapshotField(fieldName, rawLimit, fieldType, 'limits');
    field.displayValue = includedInParent ? 'Included in parent' : field.displayValue;
    addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, field);

    if (cov.deductible_amount) {
      const dedField = makeSnapshotField(
        `${fieldName}_deductible`,
        cov.deductible_amount,
        'deductible',
        'deductibles',
      );
      addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, dedField);
    }

    if (cov.premium_amount != null) {
      const premField = makeSnapshotField(
        `${fieldName}_premium`,
        String(cov.premium_amount),
        'currency',
        'premium',
      );
      addField(snapshot.fields, snapshot.limits, snapshot.deductibles, snapshot.premiums, premField);
    }
  }

  snapshot.totalFields = Object.keys(snapshot.fields).length;
  snapshot.autoAppliedCount = snapshot.totalFields;
  return snapshot;
}

export function coverageDisplayLabel(fieldPath: string): string {
  if (fieldPath.startsWith('coverage_')) {
    return coverageLabel(fieldPath.replace(/^coverage_/, '').replace(/_deductible$|_premium$/, ''));
  }
  if (fieldPath.startsWith('fee_')) {
    return fieldPath.replace(/^fee_/, '').replace(/_/g, ' ');
  }
  const canonicalLabels: Record<string, string> = {
    EachOccurrence: 'Each occurrence',
    GeneralAggregate: 'General aggregate',
    ProductsCompletedOps: 'Products completed ops',
    CombinedSingleLimit: 'Combined single limit',
    QuotedPremium: 'Quoted premium',
    TotalPremium: 'Total premium',
    ClaimsMade: 'Claims made',
    DefenseInsideLimits: 'Defense inside limits',
  };
  return canonicalLabels[fieldPath] ?? fieldPath;
}
