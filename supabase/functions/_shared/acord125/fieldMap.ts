// ACORD 125 (2016/03) logical field map: the single contract between the
// commercial risk store and the exact PDF AcroForm field names of the licensed
// blank. Clones the acord25/fieldMap.ts pattern.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
//
// Authority: src/lib/acord/blanks/acord125.inventory.json (603 fields, machine
// extracted from the qpdf-normalized licensed blank; provenance and the
// normalized sha256[:12] 6d685e5b13f4 are recorded in blanks/README.md). Every
// pdfField below is an exact verbatim name from that inventory. Names on this
// blank are XFA-qualified (F[0].P<page>[0].<Stem>[0], pages P1-P4), unlike the
// bare names of the ACORD 25 blank. acord125.test.ts loads the inventory and
// asserts set membership plus type agreement for every entry. Byte pinning of
// the stored template (the ACORD25_TEMPLATE_SHA256 / V9 pattern) lands with the
// fill pipeline, not here.
//
// SCOPE. This is the curated Phase 1b core, NOT all 603 fields: form header and
// producer block, named insured #1 (the _A block), policy number and dates, the
// four core lines of business (GL, commercial property, business auto,
// commercial umbrella), premises rows 1-4, nature of business, and the page 4
// producer signature line.
//
// DEFERRED (present in the inventory, intentionally NOT mapped):
// - Policy_SectionAttached_* checkboxes. The prefix is overloaded: the three
//   Policy_SectionAttached_OtherPremiumAmount_A/B/C fields are the premium
//   boxes of the OTHER rows inside the LINES OF BUSINESS grid, not attachment
//   marks, so the group's semantics are not decidable from names alone.
// - CommercialPolicy_Attachment_* checkboxes. Names read cleanly but the Phase
//   1b input model carries no attachment selections; deferred together with the
//   Policy_SectionAttached_* group so attachments land in one authored pass.
// - Policy_Status_* group (quote/issue/renew/bound/change/cancel indicators,
//   status effective date/time, AM/PM boxes) and the billing plan row
//   (Policy_Payment_*, Policy_PaymentMethod_*, Policy_Audit_*): transaction
//   status and billing are not in the Phase 1b input model.
// - Policy_LineOfBusiness_* rows beyond the four core lines (boiler and
//   machinery, business owners, inland marine, crime, cyber, fiduciary, garage
//   and dealers, liquor, motor carrier, truckers, yacht, and the three OTHER
//   rows with their descriptions), plus the premium boxes for property, auto,
//   and umbrella: the input model carries a premium for GL only.
// - CommercialStructure_RiskLocation_* (inside/outside city limits, other) and
//   CommercialStructure_InsuredInterest_OtherIndicator/_OtherDescription: the
//   input interest vocabulary is own/lease only.
// - CommercialStructure_PhysicalAddress_LineTwo_* (street is a single line in
//   the input model) and the per-premises occupancy block (employee counts,
//   annual revenue, occupied/public/building areas,
//   BuildingOccupancy_OperationsDescription_*).
// - NamedInsured_GeneralLiabilityCode_A, NamedInsured_LegalEntity_
//   MemberManagerCount_A, NamedInsured_LegalEntity_OtherDescription_A: rating
//   code, member count, and free-text entity description are not in the model.
// - CommercialPolicy_OperationsDescription_B: a second full-width description
//   box; the name alone does not distinguish its role from _A (the printed
//   blank labels _A as primary operations), so only _A is mapped.
// - NamedInsured_Signature_A, NamedInsured_SignatureDate_A (applicant wet-ink
//   fields) and Producer_StateLicenseIdentifier_A / Producer_NationalIdentifier
//   _A (licensing identifiers): not agency prefill core.
// - Everything else on pages 1-4 outside the blocks above: named insured _B/_C
//   blocks, page 2 contacts, additional interests, underwriting questions and
//   their one-char Y/N code boxes (a ynText kind joins this union when those
//   are mapped), prior coverage, loss history, cancel/non-renew, remarks.
//
// Naming: logical keys group by form section (producer*, insured*, policy*,
// lob*, premises<row>*, nature*). Premises rows 1-4 print through the
// inventory's _A.._D suffixes; the numeric row index follows how acord25
// handles its insurer letter rows.

export type Acord125FieldKind =
  | 'text' // plain single-line text
  | 'multilineText' // description of operations
  | 'date' // MM/DD/YYYY string, builder-formatted
  | 'limit' // thousands-separated integer string, builder-formatted
  | 'checkbox'; // boolean; export value handled by pdf-lib check()

export interface Acord125FieldMapEntry {
  /** EXACT name from the field inventory, authored at onboarding. */
  pdfField: string;
  kind: Acord125FieldKind;
  /** Copied from the field inventory when present (this inventory has none). */
  maxLength?: number;
  /** Authored visual capacity (multilineText only). */
  softCharLimit?: number;
  /** Checkbox 'on' export value, informational (this inventory carries none). */
  exportValue?: string;
  /** True when the $ is preprinted next to the box (limit fields). */
  dollarPrefixOnForm?: boolean;
}

export type PremisesRowNumber = 1 | 2 | 3 | 4;

export type Acord125LogicalKey =
  // header
  | 'completionDate'
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
  // agency customer id, page 1 box plus the page 2-4 header repeats
  | 'producerCustomerId'
  | 'producerCustomerIdP2'
  | 'producerCustomerIdP3'
  | 'producerCustomerIdP4'
  // named insured #1 (split address)
  | 'insuredName'
  | 'insuredAddress'
  | 'insuredAddress2'
  | 'insuredCity'
  | 'insuredState'
  | 'insuredZip'
  | 'insuredFein'
  | 'insuredSic'
  | 'insuredNaics'
  | 'insuredPhone'
  | 'insuredWebsite'
  // named insured #1 legal entity checkboxes (everything the blank carries;
  // notForProfit and subchapterSCorp have no value in the Phase 1b entity
  // vocabulary yet and print unchecked)
  | 'insuredEntityCorporationCheckbox'
  | 'insuredEntityIndividualCheckbox'
  | 'insuredEntityJointVentureCheckbox'
  | 'insuredEntityLlcCheckbox'
  | 'insuredEntityNotForProfitCheckbox'
  | 'insuredEntityPartnershipCheckbox'
  | 'insuredEntitySubchapterSCorpCheckbox'
  | 'insuredEntityTrustCheckbox'
  | 'insuredEntityOtherCheckbox'
  // policy block
  | 'policyNumber'
  | 'policyEffectiveDate'
  | 'policyExpirationDate'
  // lines of business (the four core lines; premium is input-backed for GL only)
  | 'lobGlCheckbox'
  | 'lobGlPremium'
  | 'lobPropertyCheckbox'
  | 'lobAutoCheckbox'
  | 'lobUmbrellaCheckbox'
  // premises rows 1-4 (inventory suffixes _A.._D); 'lease' prints through the
  // blank's TENANT box
  | `premises${PremisesRowNumber}Street`
  | `premises${PremisesRowNumber}City`
  | `premises${PremisesRowNumber}State`
  | `premises${PremisesRowNumber}Zip`
  | `premises${PremisesRowNumber}County`
  | `premises${PremisesRowNumber}OwnCheckbox`
  | `premises${PremisesRowNumber}LeaseCheckbox`
  // nature of business (checkbox group is mapped for the contract; the Phase 1b
  // model carries free-text description only, so the boxes print unchecked)
  | 'natureApartmentsCheckbox'
  | 'natureCondominiumsCheckbox'
  | 'natureContractorCheckbox'
  | 'natureInstitutionalCheckbox'
  | 'natureManufacturingCheckbox'
  | 'natureOfficeCheckbox'
  | 'natureRestaurantCheckbox'
  | 'natureRetailCheckbox'
  | 'natureServiceCheckbox'
  | 'natureWholesaleCheckbox'
  | 'natureOtherCheckbox'
  | 'natureOfBusinessDescription'
  // page 4 producer signature line (text fields on this blank)
  | 'producerSignature'
  | 'producerPrintedName';

export const ACORD125_FIELD_MAP: Record<Acord125LogicalKey, Acord125FieldMapEntry> = {
  // ----- header -----
  completionDate: { pdfField: 'F[0].P1[0].Form_CompletionDate_A[0]', kind: 'date' },

  // ----- producer block -----
  producerName: { pdfField: 'F[0].P1[0].Producer_FullName_A[0]', kind: 'text' },
  producerAddress: { pdfField: 'F[0].P1[0].Producer_MailingAddress_LineOne_A[0]', kind: 'text' },
  producerAddress2: { pdfField: 'F[0].P1[0].Producer_MailingAddress_LineTwo_A[0]', kind: 'text' },
  producerCity: { pdfField: 'F[0].P1[0].Producer_MailingAddress_CityName_A[0]', kind: 'text' },
  producerState: { pdfField: 'F[0].P1[0].Producer_MailingAddress_StateOrProvinceCode_A[0]', kind: 'text' },
  producerZip: { pdfField: 'F[0].P1[0].Producer_MailingAddress_PostalCode_A[0]', kind: 'text' },
  producerContactName: { pdfField: 'F[0].P1[0].Producer_ContactPerson_FullName_A[0]', kind: 'text' },
  producerPhone: { pdfField: 'F[0].P1[0].Producer_ContactPerson_PhoneNumber_A[0]', kind: 'text' },
  producerFax: { pdfField: 'F[0].P1[0].Producer_FaxNumber_A[0]', kind: 'text' },
  producerEmail: { pdfField: 'F[0].P1[0].Producer_ContactPerson_EmailAddress_A[0]', kind: 'text' },

  // ----- agency customer id (page 1 box + page 2-4 header repeats) -----
  producerCustomerId: { pdfField: 'F[0].P1[0].Producer_CustomerIdentifier_A[0]', kind: 'text' },
  producerCustomerIdP2: { pdfField: 'F[0].P2[0].Producer_CustomerIdentifier_A[0]', kind: 'text' },
  producerCustomerIdP3: { pdfField: 'F[0].P3[0].Producer_CustomerIdentifier_A[0]', kind: 'text' },
  producerCustomerIdP4: { pdfField: 'F[0].P4[0].Producer_CustomerIdentifier_A[0]', kind: 'text' },

  // ----- named insured #1 -----
  insuredName: { pdfField: 'F[0].P1[0].NamedInsured_FullName_A[0]', kind: 'text' },
  insuredAddress: { pdfField: 'F[0].P1[0].NamedInsured_MailingAddress_LineOne_A[0]', kind: 'text' },
  insuredAddress2: { pdfField: 'F[0].P1[0].NamedInsured_MailingAddress_LineTwo_A[0]', kind: 'text' },
  insuredCity: { pdfField: 'F[0].P1[0].NamedInsured_MailingAddress_CityName_A[0]', kind: 'text' },
  insuredState: { pdfField: 'F[0].P1[0].NamedInsured_MailingAddress_StateOrProvinceCode_A[0]', kind: 'text' },
  insuredZip: { pdfField: 'F[0].P1[0].NamedInsured_MailingAddress_PostalCode_A[0]', kind: 'text' },
  insuredFein: { pdfField: 'F[0].P1[0].NamedInsured_TaxIdentifier_A[0]', kind: 'text' },
  insuredSic: { pdfField: 'F[0].P1[0].NamedInsured_SICCode_A[0]', kind: 'text' },
  insuredNaics: { pdfField: 'F[0].P1[0].NamedInsured_NAICSCode_A[0]', kind: 'text' },
  insuredPhone: { pdfField: 'F[0].P1[0].NamedInsured_Primary_PhoneNumber_A[0]', kind: 'text' },
  insuredWebsite: { pdfField: 'F[0].P1[0].NamedInsured_Primary_WebsiteAddress_A[0]', kind: 'text' },

  // ----- named insured #1 legal entity -----
  insuredEntityCorporationCheckbox: {
    pdfField: 'F[0].P1[0].NamedInsured_LegalEntity_CorporationIndicator_A[0]',
    kind: 'checkbox',
  },
  insuredEntityIndividualCheckbox: {
    pdfField: 'F[0].P1[0].NamedInsured_LegalEntity_IndividualIndicator_A[0]',
    kind: 'checkbox',
  },
  insuredEntityJointVentureCheckbox: {
    pdfField: 'F[0].P1[0].NamedInsured_LegalEntity_JointVentureIndicator_A[0]',
    kind: 'checkbox',
  },
  insuredEntityLlcCheckbox: {
    pdfField: 'F[0].P1[0].NamedInsured_LegalEntity_LimitedLiabilityCorporationIndicator_A[0]',
    kind: 'checkbox',
  },
  insuredEntityNotForProfitCheckbox: {
    pdfField: 'F[0].P1[0].NamedInsured_LegalEntity_NotForProfitIndicator_A[0]',
    kind: 'checkbox',
  },
  insuredEntityPartnershipCheckbox: {
    pdfField: 'F[0].P1[0].NamedInsured_LegalEntity_PartnershipIndicator_A[0]',
    kind: 'checkbox',
  },
  insuredEntitySubchapterSCorpCheckbox: {
    pdfField: 'F[0].P1[0].NamedInsured_LegalEntity_SubchapterSCorporationIndicator_A[0]',
    kind: 'checkbox',
  },
  insuredEntityTrustCheckbox: {
    pdfField: 'F[0].P1[0].NamedInsured_LegalEntity_TrustIndicator_A[0]',
    kind: 'checkbox',
  },
  insuredEntityOtherCheckbox: {
    pdfField: 'F[0].P1[0].NamedInsured_LegalEntity_OtherIndicator_A[0]',
    kind: 'checkbox',
  },

  // ----- policy block -----
  policyNumber: { pdfField: 'F[0].P1[0].Policy_PolicyNumberIdentifier_A[0]', kind: 'text' },
  policyEffectiveDate: { pdfField: 'F[0].P1[0].Policy_EffectiveDate_A[0]', kind: 'date' },
  policyExpirationDate: { pdfField: 'F[0].P1[0].Policy_ExpirationDate_A[0]', kind: 'date' },

  // ----- lines of business -----
  lobGlCheckbox: {
    pdfField: 'F[0].P1[0].Policy_LineOfBusiness_CommercialGeneralLiability_A[0]',
    kind: 'checkbox',
  },
  // The premium column preprints the dollar sign, so the builder emits bare
  // grouped digits here (never a '$' of its own, which could double up).
  lobGlPremium: {
    pdfField: 'F[0].P1[0].GeneralLiabilityLineOfBusiness_TotalPremiumAmount_A[0]',
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  lobPropertyCheckbox: {
    pdfField: 'F[0].P1[0].Policy_LineOfBusiness_CommercialProperty_A[0]',
    kind: 'checkbox',
  },
  lobAutoCheckbox: {
    pdfField: 'F[0].P1[0].Policy_LineOfBusiness_BusinessAutoIndicator_A[0]',
    kind: 'checkbox',
  },
  lobUmbrellaCheckbox: {
    pdfField: 'F[0].P1[0].Policy_LineOfBusiness_UmbrellaIndicator_A[0]',
    kind: 'checkbox',
  },

  // ----- premises row 1 (inventory suffix _A) -----
  premises1Street: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_LineOne_A[0]', kind: 'text' },
  premises1City: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_CityName_A[0]', kind: 'text' },
  premises1State: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_StateOrProvinceCode_A[0]', kind: 'text' },
  premises1Zip: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_PostalCode_A[0]', kind: 'text' },
  premises1County: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_CountyName_A[0]', kind: 'text' },
  premises1OwnCheckbox: { pdfField: 'F[0].P2[0].CommercialStructure_InsuredInterest_OwnerIndicator_A[0]', kind: 'checkbox' },
  premises1LeaseCheckbox: { pdfField: 'F[0].P2[0].CommercialStructure_InsuredInterest_TenantIndicator_A[0]', kind: 'checkbox' },

  // ----- premises row 2 (inventory suffix _B) -----
  premises2Street: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_LineOne_B[0]', kind: 'text' },
  premises2City: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_CityName_B[0]', kind: 'text' },
  premises2State: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_StateOrProvinceCode_B[0]', kind: 'text' },
  premises2Zip: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_PostalCode_B[0]', kind: 'text' },
  premises2County: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_CountyName_B[0]', kind: 'text' },
  premises2OwnCheckbox: { pdfField: 'F[0].P2[0].CommercialStructure_InsuredInterest_OwnerIndicator_B[0]', kind: 'checkbox' },
  premises2LeaseCheckbox: { pdfField: 'F[0].P2[0].CommercialStructure_InsuredInterest_TenantIndicator_B[0]', kind: 'checkbox' },

  // ----- premises row 3 (inventory suffix _C) -----
  premises3Street: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_LineOne_C[0]', kind: 'text' },
  premises3City: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_CityName_C[0]', kind: 'text' },
  premises3State: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_StateOrProvinceCode_C[0]', kind: 'text' },
  premises3Zip: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_PostalCode_C[0]', kind: 'text' },
  premises3County: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_CountyName_C[0]', kind: 'text' },
  premises3OwnCheckbox: { pdfField: 'F[0].P2[0].CommercialStructure_InsuredInterest_OwnerIndicator_C[0]', kind: 'checkbox' },
  premises3LeaseCheckbox: { pdfField: 'F[0].P2[0].CommercialStructure_InsuredInterest_TenantIndicator_C[0]', kind: 'checkbox' },

  // ----- premises row 4 (inventory suffix _D) -----
  premises4Street: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_LineOne_D[0]', kind: 'text' },
  premises4City: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_CityName_D[0]', kind: 'text' },
  premises4State: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_StateOrProvinceCode_D[0]', kind: 'text' },
  premises4Zip: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_PostalCode_D[0]', kind: 'text' },
  premises4County: { pdfField: 'F[0].P2[0].CommercialStructure_PhysicalAddress_CountyName_D[0]', kind: 'text' },
  premises4OwnCheckbox: { pdfField: 'F[0].P2[0].CommercialStructure_InsuredInterest_OwnerIndicator_D[0]', kind: 'checkbox' },
  premises4LeaseCheckbox: { pdfField: 'F[0].P2[0].CommercialStructure_InsuredInterest_TenantIndicator_D[0]', kind: 'checkbox' },

  // ----- nature of business -----
  natureApartmentsCheckbox: {
    pdfField: 'F[0].P2[0].BusinessInformation_BusinessType_ApartmentsIndicator_A[0]',
    kind: 'checkbox',
  },
  natureCondominiumsCheckbox: {
    pdfField: 'F[0].P2[0].BusinessInformation_BusinessType_CondominiumsIndicator_A[0]',
    kind: 'checkbox',
  },
  natureContractorCheckbox: {
    pdfField: 'F[0].P2[0].BusinessInformation_BusinessType_ContractorIndicator_A[0]',
    kind: 'checkbox',
  },
  natureInstitutionalCheckbox: {
    pdfField: 'F[0].P2[0].BusinessInformation_BusinessType_InstitutionalIndicator_A[0]',
    kind: 'checkbox',
  },
  natureManufacturingCheckbox: {
    pdfField: 'F[0].P2[0].BusinessInformation_BusinessType_ManufacturingIndicator_A[0]',
    kind: 'checkbox',
  },
  natureOfficeCheckbox: {
    pdfField: 'F[0].P2[0].BusinessInformation_BusinessType_OfficeIndicator_A[0]',
    kind: 'checkbox',
  },
  natureRestaurantCheckbox: {
    pdfField: 'F[0].P2[0].BusinessInformation_BusinessType_RestaurantIndicator_A[0]',
    kind: 'checkbox',
  },
  natureRetailCheckbox: {
    pdfField: 'F[0].P2[0].BusinessInformation_BusinessType_RetailIndicator_A[0]',
    kind: 'checkbox',
  },
  natureServiceCheckbox: {
    pdfField: 'F[0].P2[0].BusinessInformation_BusinessType_ServiceIndicator_A[0]',
    kind: 'checkbox',
  },
  natureWholesaleCheckbox: {
    pdfField: 'F[0].P2[0].BusinessInformation_BusinessType_WholesaleIndicator_A[0]',
    kind: 'checkbox',
  },
  natureOtherCheckbox: {
    pdfField: 'F[0].P2[0].BusinessInformation_BusinessType_OtherIndicator_A[0]',
    kind: 'checkbox',
  },
  natureOfBusinessDescription: {
    pdfField: 'F[0].P2[0].CommercialPolicy_OperationsDescription_A[0]',
    kind: 'multilineText',
    // Measured from the widget rectangle (568 x 78 pt) at Helvetica size 10:
    // about 113 chars/line x 7 lines; held conservative for word wrap.
    softCharLimit: 750,
  },

  // ----- page 4 producer signature line -----
  producerSignature: { pdfField: 'F[0].P4[0].Producer_AuthorizedRepresentative_Signature_A[0]', kind: 'text' },
  producerPrintedName: { pdfField: 'F[0].P4[0].Producer_AuthorizedRepresentative_FullName_A[0]', kind: 'text' },
};

// ACORD edition date; must match acord_templates.version at onboarding.
export const ACORD125_TEMPLATE_VERSION: string = '2016-03';

// Critical subset for templateIngestion validateAcordFields (the acord25
// ACORD25_EXPECTED_FIELD_NAMES pattern): the load-bearing fields a genuine
// ACORD 125 must expose, used to reject a lookalike/stub at upload time.
export const ACORD125_EXPECTED_FIELD_NAMES: string[] = [
  'F[0].P1[0].Form_CompletionDate_A[0]',
  'F[0].P1[0].Producer_FullName_A[0]',
  'F[0].P1[0].NamedInsured_FullName_A[0]',
  'F[0].P1[0].NamedInsured_TaxIdentifier_A[0]',
  'F[0].P1[0].Policy_PolicyNumberIdentifier_A[0]',
  'F[0].P1[0].Policy_EffectiveDate_A[0]',
  'F[0].P1[0].Policy_LineOfBusiness_CommercialGeneralLiability_A[0]',
  'F[0].P1[0].GeneralLiabilityLineOfBusiness_TotalPremiumAmount_A[0]',
  'F[0].P2[0].CommercialStructure_PhysicalAddress_LineOne_A[0]',
  'F[0].P2[0].CommercialPolicy_OperationsDescription_A[0]',
  'F[0].P4[0].Producer_AuthorizedRepresentative_Signature_A[0]',
];
