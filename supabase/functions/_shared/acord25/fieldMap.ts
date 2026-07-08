// ACORD 25 (2016/03) logical field map: the single contract between the Master
// COI read model and the exact PDF AcroForm field names of the licensed blank.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
// This file is ported verbatim to supabase/functions/_shared/acord25/fieldMap.ts
// (the only transform is appending .ts to relative import specifiers, of which
// this module has none).
//
// Authority: docs/COI Module/coi-module/05-acord25-pipeline.md Sections 3 and 0.1;
// blueprint B Section 3.2. Every pdfField below is an exact genuine name verified
// against the 129-field inventory of the licensed blank (sha 66b526...).
//
// Naming: the logical-key prefixes (gl_, auto_, umb_, wc_, other_) name ACORD 25
// FORM ROWS. The canonical line keys ('gl','auto','umbrella','wc','property',
// 'other') name coverage lines in the Master COI read model. Section 0.1 is the
// mapping; both 'property' and 'other' lines print through the other_ keys.
//
// Address blocks on this edition are SPLIT (separate line/city/state/zip fields),
// not single multiline, so the logical-key union carries split address keys and
// the builder distributes addressLines[] across them.

export type Acord25FieldKind =
  | 'text' // plain single-line text
  | 'multilineText' // description of operations, holder address block
  | 'date' // MM/DD/YYYY string, builder-formatted
  | 'limit' // thousands-separated integer string, builder-formatted
  | 'ynText' // literal 'Y' | 'N' | '' one-char code field
  | 'checkbox'; // boolean; export value handled by pdf-lib check()

export interface Acord25FieldMapEntry {
  /** EXACT name from the field inventory, authored at onboarding. */
  pdfField: string;
  kind: Acord25FieldKind;
  /** Copied from field_inventory at onboarding for visibility. */
  maxLength?: number;
  /** Authored visual capacity (multilineText only). */
  softCharLimit?: number;
  /** Checkbox 'on' export value from field_inventory.options, informational. */
  exportValue?: string;
  /** True when the $ is preprinted next to the box (limit fields). */
  dollarPrefixOnForm?: boolean;
}

export type InsurerLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type Acord25LogicalKey =
  // header
  | 'certificateDate'
  | 'certificateNumber'
  | 'revisionNumber'
  // producer block (split address)
  | 'producerName'
  | 'producerAddress'
  | 'producerAddress2'
  | 'producerCity'
  | 'producerState'
  | 'producerZip'
  | 'producerContactName'
  | 'producerPhone'
  | 'producerFax'
  | 'producerEmail'
  // insured block (split address)
  | 'insuredName'
  | 'insuredAddress'
  | 'insuredAddress2'
  | 'insuredCity'
  | 'insuredState'
  | 'insuredZip'
  // insurer table (A-F)
  | `insurerName_${InsurerLetter}`
  | `insurerNaic_${InsurerLetter}`
  // GL row
  | 'gl_insrLtr'
  | 'gl_policyNumber'
  | 'gl_effDate'
  | 'gl_expDate'
  | 'gl_addlInsd'
  | 'gl_subrWvd'
  | 'gl_occurCheckbox'
  | 'gl_claimsMadeCheckbox'
  | 'gl_aggPerPolicyCheckbox'
  | 'gl_aggPerProjectCheckbox'
  | 'gl_aggPerLocCheckbox'
  | 'gl_eachOccurrence'
  | 'gl_damageToRented'
  | 'gl_medExp'
  | 'gl_personalAdvInjury'
  | 'gl_generalAggregate'
  | 'gl_productsCompOpAgg'
  // GL per-section write-in coverage (custom coverage name + limit amount)
  | 'gl_writeInDesc'
  | 'gl_writeInAmount'
  // Auto row
  | 'auto_insrLtr'
  | 'auto_policyNumber'
  | 'auto_effDate'
  | 'auto_expDate'
  | 'auto_addlInsd'
  | 'auto_subrWvd'
  | 'auto_anyAutoCheckbox'
  | 'auto_ownedOnlyCheckbox'
  | 'auto_scheduledCheckbox'
  | 'auto_hiredCheckbox'
  | 'auto_nonOwnedCheckbox'
  | 'auto_combinedSingleLimit'
  | 'auto_biPerPerson'
  | 'auto_biPerAccident'
  | 'auto_propertyDamage'
  // Auto per-section write-in coverage (custom coverage name + limit amount)
  | 'auto_writeInDesc'
  | 'auto_writeInAmount'
  // Umbrella/Excess row
  | 'umb_insrLtr'
  | 'umb_policyNumber'
  | 'umb_effDate'
  | 'umb_expDate'
  | 'umb_addlInsd'
  | 'umb_subrWvd'
  | 'umb_umbrellaCheckbox'
  | 'umb_excessCheckbox'
  | 'umb_occurCheckbox'
  | 'umb_claimsMadeCheckbox'
  | 'umb_dedCheckbox'
  | 'umb_retentionCheckbox'
  | 'umb_dedRetAmount'
  | 'umb_eachOccurrence'
  | 'umb_aggregate'
  // Umbrella/Excess per-section write-in coverage (custom coverage name + limit amount)
  | 'umb_writeInDesc'
  | 'umb_writeInAmount'
  // WC row (no ADDL INSD column on the 25)
  | 'wc_insrLtr'
  | 'wc_policyNumber'
  | 'wc_effDate'
  | 'wc_expDate'
  | 'wc_subrWvd'
  | 'wc_perStatuteCheckbox'
  | 'wc_otherCheckbox'
  | 'wc_elEachAccident'
  | 'wc_elDiseaseEachEmployee'
  | 'wc_elDiseasePolicyLimit'
  | 'wc_anyProprietorExcluded'
  // Other row (prints property OR other lines, Section 0.1)
  | 'other_insrLtr'
  | 'other_type'
  | 'other_policyNumber'
  | 'other_effDate'
  | 'other_expDate'
  | 'other_addlInsd'
  | 'other_subrWvd'
  | 'other_limitsText'
  // remarks + holder (split address) + signature
  | 'descriptionOfOperations'
  | 'holderName'
  | 'holderAddress'
  | 'holderAddress2'
  | 'holderCity'
  | 'holderState'
  | 'holderZip'
  | 'authorizedRepName';

export const ACORD25_FIELD_MAP: Record<Acord25LogicalKey, Acord25FieldMapEntry> = {
  // ----- header / cert number -----
  certificateDate: { pdfField: 'Form_CompletionDate_A', kind: 'date' },
  certificateNumber: { pdfField: 'CertificateOfInsurance_CertificateNumberIdentifier_A', kind: 'text' },
  revisionNumber: { pdfField: 'CertificateOfInsurance_RevisionNumberIdentifier_A', kind: 'text' },

  // ----- producer block -----
  producerName: { pdfField: 'Producer_FullName_A', kind: 'text' },
  producerAddress: { pdfField: 'Producer_MailingAddress_LineOne_A', kind: 'text' },
  producerAddress2: { pdfField: 'Producer_MailingAddress_LineTwo_A', kind: 'text' },
  producerCity: { pdfField: 'Producer_MailingAddress_CityName_A', kind: 'text' },
  producerState: { pdfField: 'Producer_MailingAddress_StateOrProvinceCode_A', kind: 'text' },
  producerZip: { pdfField: 'Producer_MailingAddress_PostalCode_A', kind: 'text' },
  producerContactName: { pdfField: 'Producer_ContactPerson_FullName_A', kind: 'text' },
  producerPhone: { pdfField: 'Producer_ContactPerson_PhoneNumber_A', kind: 'text' },
  producerFax: { pdfField: 'Producer_FaxNumber_A', kind: 'text' },
  producerEmail: { pdfField: 'Producer_ContactPerson_EmailAddress_A', kind: 'text' },

  // ----- insured block -----
  insuredName: { pdfField: 'NamedInsured_FullName_A', kind: 'text' },
  insuredAddress: { pdfField: 'NamedInsured_MailingAddress_LineOne_A', kind: 'text' },
  insuredAddress2: { pdfField: 'NamedInsured_MailingAddress_LineTwo_A', kind: 'text' },
  insuredCity: { pdfField: 'NamedInsured_MailingAddress_CityName_A', kind: 'text' },
  insuredState: { pdfField: 'NamedInsured_MailingAddress_StateOrProvinceCode_A', kind: 'text' },
  insuredZip: { pdfField: 'NamedInsured_MailingAddress_PostalCode_A', kind: 'text' },

  // ----- insurer table A-F -----
  insurerName_A: { pdfField: 'Insurer_FullName_A', kind: 'text' },
  insurerNaic_A: { pdfField: 'Insurer_NAICCode_A', kind: 'text' },
  insurerName_B: { pdfField: 'Insurer_FullName_B', kind: 'text' },
  insurerNaic_B: { pdfField: 'Insurer_NAICCode_B', kind: 'text' },
  insurerName_C: { pdfField: 'Insurer_FullName_C', kind: 'text' },
  insurerNaic_C: { pdfField: 'Insurer_NAICCode_C', kind: 'text' },
  insurerName_D: { pdfField: 'Insurer_FullName_D', kind: 'text' },
  insurerNaic_D: { pdfField: 'Insurer_NAICCode_D', kind: 'text' },
  insurerName_E: { pdfField: 'Insurer_FullName_E', kind: 'text' },
  insurerNaic_E: { pdfField: 'Insurer_NAICCode_E', kind: 'text' },
  insurerName_F: { pdfField: 'Insurer_FullName_F', kind: 'text' },
  insurerNaic_F: { pdfField: 'Insurer_NAICCode_F', kind: 'text' },

  // ----- GL row -----
  gl_insrLtr: { pdfField: 'GeneralLiability_InsurerLetterCode_A', kind: 'text' },
  gl_policyNumber: { pdfField: 'Policy_GeneralLiability_PolicyNumberIdentifier_A', kind: 'text' },
  gl_effDate: { pdfField: 'Policy_GeneralLiability_EffectiveDate_A', kind: 'date' },
  gl_expDate: { pdfField: 'Policy_GeneralLiability_ExpirationDate_A', kind: 'date' },
  gl_addlInsd: { pdfField: 'CertificateOfInsurance_GeneralLiability_AdditionalInsuredCode_A', kind: 'ynText' },
  gl_subrWvd: { pdfField: 'Policy_GeneralLiability_SubrogationWaivedCode_A', kind: 'ynText' },
  gl_occurCheckbox: { pdfField: 'GeneralLiability_OccurrenceIndicator_A', kind: 'checkbox', exportValue: '1' },
  gl_claimsMadeCheckbox: { pdfField: 'GeneralLiability_ClaimsMadeIndicator_A', kind: 'checkbox', exportValue: '1' },
  gl_aggPerPolicyCheckbox: {
    pdfField: 'GeneralLiability_GeneralAggregate_LimitAppliesPerPolicyIndicator_A',
    kind: 'checkbox',
    exportValue: '1',
  },
  gl_aggPerProjectCheckbox: {
    pdfField: 'GeneralLiability_GeneralAggregate_LimitAppliesPerProjectIndicator_A',
    kind: 'checkbox',
    exportValue: '1',
  },
  gl_aggPerLocCheckbox: {
    pdfField: 'GeneralLiability_GeneralAggregate_LimitAppliesPerLocationIndicator_A',
    kind: 'checkbox',
    exportValue: '1',
  },
  gl_eachOccurrence: { pdfField: 'GeneralLiability_EachOccurrence_LimitAmount_A', kind: 'limit', dollarPrefixOnForm: true },
  gl_damageToRented: {
    pdfField: 'GeneralLiability_FireDamageRentedPremises_EachOccurrenceLimitAmount_A',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  gl_medExp: { pdfField: 'GeneralLiability_MedicalExpense_EachPersonLimitAmount_A', kind: 'limit', dollarPrefixOnForm: true },
  gl_personalAdvInjury: {
    pdfField: 'GeneralLiability_PersonalAndAdvertisingInjury_LimitAmount_A',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  gl_generalAggregate: { pdfField: 'GeneralLiability_GeneralAggregate_LimitAmount_A', kind: 'limit', dollarPrefixOnForm: true },
  gl_productsCompOpAgg: {
    pdfField: 'GeneralLiability_ProductsAndCompletedOperations_AggregateLimitAmount_A',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  // GL per-section write-in coverage. The narrow (w~83pt) description box takes a
  // custom coverage name; the amount box sits in the preprinted-$ LIMITS column.
  gl_writeInDesc: {
    pdfField: 'GeneralLiability_OtherCoverageLimitDescription_A',
    kind: 'multilineText',
    softCharLimit: 40,
  },
  gl_writeInAmount: {
    pdfField: 'GeneralLiability_OtherCoverageLimitAmount_A',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },

  // ----- Auto row -----
  auto_insrLtr: { pdfField: 'Vehicle_InsurerLetterCode_A', kind: 'text' },
  auto_policyNumber: { pdfField: 'Policy_AutomobileLiability_PolicyNumberIdentifier_A', kind: 'text' },
  auto_effDate: { pdfField: 'Policy_AutomobileLiability_EffectiveDate_A', kind: 'date' },
  auto_expDate: { pdfField: 'Policy_AutomobileLiability_ExpirationDate_A', kind: 'date' },
  auto_addlInsd: { pdfField: 'CertificateOfInsurance_AutomobileLiability_AdditionalInsuredCode_A', kind: 'ynText' },
  auto_subrWvd: { pdfField: 'Policy_AutomobileLiability_SubrogationWaivedCode_A', kind: 'ynText' },
  auto_anyAutoCheckbox: { pdfField: 'Vehicle_AnyAutoIndicator_A', kind: 'checkbox', exportValue: '1' },
  auto_ownedOnlyCheckbox: { pdfField: 'Vehicle_AllOwnedAutosIndicator_A', kind: 'checkbox', exportValue: '1' },
  auto_scheduledCheckbox: { pdfField: 'Vehicle_ScheduledAutosIndicator_A', kind: 'checkbox', exportValue: '1' },
  auto_hiredCheckbox: { pdfField: 'Vehicle_HiredAutosIndicator_A', kind: 'checkbox', exportValue: '1' },
  auto_nonOwnedCheckbox: { pdfField: 'Vehicle_NonOwnedAutosIndicator_A', kind: 'checkbox', exportValue: '1' },
  auto_combinedSingleLimit: {
    pdfField: 'Vehicle_CombinedSingleLimit_EachAccidentAmount_A',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  auto_biPerPerson: { pdfField: 'Vehicle_BodilyInjury_PerPersonLimitAmount_A', kind: 'limit', dollarPrefixOnForm: true },
  auto_biPerAccident: { pdfField: 'Vehicle_BodilyInjury_PerAccidentLimitAmount_A', kind: 'limit', dollarPrefixOnForm: true },
  auto_propertyDamage: { pdfField: 'Vehicle_PropertyDamage_PerAccidentLimitAmount_A', kind: 'limit', dollarPrefixOnForm: true },
  // Auto per-section write-in coverage (narrow description box + preprinted-$ amount).
  auto_writeInDesc: {
    pdfField: 'Vehicle_OtherCoverage_CoverageDescription_A',
    kind: 'multilineText',
    softCharLimit: 40,
  },
  auto_writeInAmount: {
    pdfField: 'Vehicle_OtherCoverage_LimitAmount_A',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },

  // ----- Umbrella / Excess row -----
  umb_insrLtr: { pdfField: 'ExcessUmbrella_InsurerLetterCode_A', kind: 'text' },
  umb_policyNumber: { pdfField: 'Policy_ExcessLiability_PolicyNumberIdentifier_A', kind: 'text' },
  umb_effDate: { pdfField: 'Policy_ExcessLiability_EffectiveDate_A', kind: 'date' },
  umb_expDate: { pdfField: 'Policy_ExcessLiability_ExpirationDate_A', kind: 'date' },
  umb_addlInsd: { pdfField: 'CertificateOfInsurance_ExcessLiability_AdditionalInsuredCode_A', kind: 'ynText' },
  umb_subrWvd: { pdfField: 'Policy_ExcessLiability_SubrogationWaivedCode_A', kind: 'ynText' },
  umb_umbrellaCheckbox: { pdfField: 'Policy_PolicyType_UmbrellaIndicator_A', kind: 'checkbox', exportValue: '1' },
  umb_excessCheckbox: { pdfField: 'Policy_PolicyType_ExcessIndicator_A', kind: 'checkbox', exportValue: '1' },
  umb_occurCheckbox: { pdfField: 'ExcessUmbrella_OccurrenceIndicator_A', kind: 'checkbox', exportValue: '1' },
  umb_claimsMadeCheckbox: { pdfField: 'ExcessUmbrella_ClaimsMadeIndicator_A', kind: 'checkbox', exportValue: '1' },
  umb_dedCheckbox: { pdfField: 'ExcessUmbrella_DeductibleIndicator_A', kind: 'checkbox', exportValue: '1' },
  umb_retentionCheckbox: { pdfField: 'ExcessUmbrella_RetentionIndicator_A', kind: 'checkbox', exportValue: '1' },
  umb_dedRetAmount: {
    pdfField: 'ExcessUmbrella_Umbrella_DeductibleOrRetentionAmount_A',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  umb_eachOccurrence: { pdfField: 'ExcessUmbrella_Umbrella_EachOccurrenceAmount_A', kind: 'limit', dollarPrefixOnForm: true },
  umb_aggregate: { pdfField: 'ExcessUmbrella_Umbrella_AggregateAmount_A', kind: 'limit', dollarPrefixOnForm: true },
  // Umbrella/Excess per-section write-in coverage (narrow description box + preprinted-$ amount).
  umb_writeInDesc: {
    pdfField: 'ExcessUmbrella_OtherCoverageDescription_A',
    kind: 'multilineText',
    softCharLimit: 40,
  },
  umb_writeInAmount: {
    pdfField: 'ExcessUmbrella_OtherCoverageLimitAmount_A',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },

  // ----- WC row -----
  wc_insrLtr: { pdfField: 'WorkersCompensationEmployersLiability_InsurerLetterCode_A', kind: 'text' },
  wc_policyNumber: { pdfField: 'Policy_WorkersCompensationAndEmployersLiability_PolicyNumberIdentifier_A', kind: 'text' },
  wc_effDate: { pdfField: 'Policy_WorkersCompensationAndEmployersLiability_EffectiveDate_A', kind: 'date' },
  wc_expDate: { pdfField: 'Policy_WorkersCompensationAndEmployersLiability_ExpirationDate_A', kind: 'date' },
  wc_subrWvd: { pdfField: 'Policy_WorkersCompensation_SubrogationWaivedCode_A', kind: 'ynText' },
  wc_perStatuteCheckbox: {
    pdfField: 'WorkersCompensationEmployersLiability_WorkersCompensationStatutoryLimitIndicator_A',
    kind: 'checkbox',
    exportValue: '1',
  },
  wc_otherCheckbox: {
    pdfField: 'WorkersCompensationEmployersLiability_OtherCoverageIndicator_A',
    kind: 'checkbox',
    exportValue: '1',
  },
  wc_elEachAccident: {
    pdfField: 'WorkersCompensationEmployersLiability_EmployersLiability_EachAccidentLimitAmount_A',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  wc_elDiseaseEachEmployee: {
    pdfField: 'WorkersCompensationEmployersLiability_EmployersLiability_DiseaseEachEmployeeLimitAmount_A',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  wc_elDiseasePolicyLimit: {
    pdfField: 'WorkersCompensationEmployersLiability_EmployersLiability_DiseasePolicyLimitAmount_A',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  wc_anyProprietorExcluded: {
    pdfField: 'WorkersCompensationEmployersLiability_AnyPersonsExcludedIndicator_A',
    kind: 'ynText',
  },

  // ----- Other row -----
  other_insrLtr: { pdfField: 'OtherPolicy_InsurerLetterCode_A', kind: 'text' },
  other_type: { pdfField: 'OtherPolicy_OtherPolicyDescription_A', kind: 'text' },
  other_policyNumber: { pdfField: 'OtherPolicy_PolicyNumberIdentifier_A', kind: 'text' },
  other_effDate: { pdfField: 'OtherPolicy_PolicyEffectiveDate_A', kind: 'date' },
  other_expDate: { pdfField: 'OtherPolicy_PolicyExpirationDate_A', kind: 'date' },
  other_addlInsd: { pdfField: 'CertificateOfInsurance_OtherPolicy_AdditionalInsuredCode_A', kind: 'ynText' },
  other_subrWvd: { pdfField: 'OtherPolicy_SubrogationWaivedCode_A', kind: 'ynText' },
  other_limitsText: { pdfField: 'OtherPolicy_CoverageCode_A', kind: 'multilineText', softCharLimit: 40 },

  // ----- remarks / holder / signature -----
  descriptionOfOperations: {
    pdfField: 'CertificateOfLiabilityInsurance_ACORDForm_RemarkText_A',
    kind: 'multilineText',
    // Measured at onboarding from the widget rectangle (568 x 66 pt) at Helvetica
    // size 10: about 113 chars/line x 6 lines; held conservative for word wrap.
    softCharLimit: 640,
  },
  holderName: { pdfField: 'CertificateHolder_FullName_A', kind: 'text' },
  holderAddress: { pdfField: 'CertificateHolder_MailingAddress_LineOne_A', kind: 'text' },
  holderAddress2: { pdfField: 'CertificateHolder_MailingAddress_LineTwo_A', kind: 'text' },
  holderCity: { pdfField: 'CertificateHolder_MailingAddress_CityName_A', kind: 'text' },
  holderState: { pdfField: 'CertificateHolder_MailingAddress_StateOrProvinceCode_A', kind: 'text' },
  holderZip: { pdfField: 'CertificateHolder_MailingAddress_PostalCode_A', kind: 'text' },
  authorizedRepName: { pdfField: 'Producer_AuthorizedRepresentative_Signature_A', kind: 'text' },
};

// sha256 hex of the sanitized stored template bytes (pdf-lib getForm()+save()
// of the licensed blank), uploaded to documents/acord-templates/25/2016-03/.
// generate-certificate and the client preview both refuse to fill when the
// fetched template bytes do not hash to this pin (validateAcord25 V9).
export const ACORD25_TEMPLATE_SHA256: string =
  '3f3f38afff792e782f817ceda78aa652085c52b061c27b4a9b10d031d7a31fea';

// ACORD edition date; must match acord_templates.version.
export const ACORD25_TEMPLATE_VERSION: string = '2016-03';

// Critical subset fed to templateIngestion validateAcordFields (Section 1.4):
// the load-bearing fields a genuine ACORD 25 must expose, used to reject a
// lookalike/stub at upload time.
export const ACORD25_EXPECTED_FIELD_NAMES: string[] = [
  'Producer_FullName_A',
  'NamedInsured_FullName_A',
  'Insurer_FullName_A',
  'Insurer_NAICCode_A',
  'Policy_GeneralLiability_PolicyNumberIdentifier_A',
  'Policy_GeneralLiability_EffectiveDate_A',
  'Policy_GeneralLiability_ExpirationDate_A',
  'GeneralLiability_EachOccurrence_LimitAmount_A',
  'Vehicle_CombinedSingleLimit_EachAccidentAmount_A',
  'WorkersCompensationEmployersLiability_EmployersLiability_EachAccidentLimitAmount_A',
  'CertificateOfLiabilityInsurance_ACORDForm_RemarkText_A',
  'CertificateHolder_FullName_A',
  'Form_CompletionDate_A',
  'Producer_AuthorizedRepresentative_Signature_A',
];

// ---------------------------------------------------------------------------
// Appearance-styling field sets (consumed by the preview fill and the issue
// fill). These name PDF FIELDS, not values, so they never touch the preview hash
// - only how the flattened certificate looks.
// ---------------------------------------------------------------------------

/**
 * The per-line POLICY EFF / POLICY EXP date columns. They are narrow, so the
 * fillers render them a size smaller than the rest of the form. The header
 * certificate date (Form_CompletionDate) is excluded; it has room.
 */
export const ACORD25_DATE_COLUMN_FIELDS: string[] = (
  Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]
)
  .filter((k) => ACORD25_FIELD_MAP[k].kind === 'date' && k !== 'certificateDate')
  .map((k) => ACORD25_FIELD_MAP[k].pdfField);

/**
 * The authorized-representative signature field, rendered in an italic standard
 * font so it reads as a signature.
 */
export const ACORD25_SIGNATURE_FIELDS: string[] = [
  ACORD25_FIELD_MAP.authorizedRepName.pdfField,
];
