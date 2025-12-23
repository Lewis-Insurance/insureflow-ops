/**
 * Document Type Taxonomy & Collection Templates
 * 
 * This configuration mirrors the database seed data and is used for:
 * - UI rendering (icons, labels, descriptions)
 * - Form validation
 * - LOB-based auto-suggestions
 */

export type DocumentIconKey =
  | 'fileText'
  | 'fileCheck'
  | 'dollarSign'
  | 'clipboardList'
  | 'shield'
  | 'car'
  | 'users'
  | 'building2'
  | 'fileSignature'
  | 'camera'
  | 'fileSpreadsheet'
  | 'briefcase'
  | 'creditCard';


// =============================================================================
// DOCUMENT TYPE DEFINITION
// =============================================================================

export interface DocumentTypeDefinition {
  doc_type_key: string;
  display_name: string;
  short_description: string;
  upload_instructions: string;
  accepted_file_types: string[];
  min_quantity: number;
  max_quantity: number;
  validation_hints?: string;
  acord_links: Array<{ form: string; section?: string }>;
  tags: string[];
  lob_relevance: string[];
  icon_key: DocumentIconKey;
}

// =============================================================================
// DOCUMENT TYPES REGISTRY
// =============================================================================

export const DOCUMENT_TYPES: Record<string, DocumentTypeDefinition> = {
  ACORD_125: {
    doc_type_key: 'ACORD_125',
    display_name: 'ACORD 125',
    short_description: 'Commercial insurance application',
    upload_instructions: 'Upload the completed ACORD 125 if you have it. If not, you can skip and we\'ll gather details another way.',
    accepted_file_types: ['pdf', 'docx', 'jpg', 'png'],
    min_quantity: 0,
    max_quantity: 3,
    validation_hints: 'Look for applicant name, policy info, and signatures.',
    acord_links: [{ form: 'ACORD_125' }],
    tags: ['submission', 'underwriting'],
    lob_relevance: ['commercial', 'gl', 'property'],
    icon_key: 'fileText',
  },

  LOSS_RUNS: {
    doc_type_key: 'LOSS_RUNS',
    display_name: 'Loss Run',
    short_description: 'Claims history used for underwriting',
    upload_instructions: 'Upload loss runs for the past 3–5 years. If multiple PDFs, upload them all.',
    accepted_file_types: ['pdf'],
    min_quantity: 0,
    max_quantity: 10,
    validation_hints: 'Look for valuation date, claim list, totals, and carrier letterhead.',
    acord_links: [{ form: 'ACORD_125', section: 'LossHistory' }],
    tags: ['submission', 'underwriting', 'claims'],
    lob_relevance: ['commercial', 'personal', 'auto', 'gl', 'property', 'wc'],
    icon_key: 'fileCheck',
  },

  PAYMENT_DOC: {
    doc_type_key: 'PAYMENT_DOC',
    display_name: 'Payment Doc',
    short_description: 'Payment confirmation or authorization',
    upload_instructions: 'Upload proof of payment, payment confirmation, or authorization form if requested for binding.',
    accepted_file_types: ['pdf', 'jpg', 'png'],
    min_quantity: 0,
    max_quantity: 5,
    validation_hints: 'Look for payment amount, date, and confirmation number.',
    acord_links: [],
    tags: ['bind', 'billing'],
    lob_relevance: ['commercial', 'personal'],
    icon_key: 'creditCard',
  },

  CARRIER_SUPPLEMENT: {
    doc_type_key: 'CARRIER_SUPPLEMENT',
    display_name: 'Carrier Supplementary Form',
    short_description: 'Carrier-specific underwriting questions',
    upload_instructions: 'Upload any carrier supplemental forms requested for the quote/bind.',
    accepted_file_types: ['pdf', 'docx', 'jpg', 'png'],
    min_quantity: 0,
    max_quantity: 10,
    acord_links: [],
    tags: ['submission', 'underwriting'],
    lob_relevance: ['commercial', 'personal'],
    icon_key: 'clipboardList',
  },

  STATEMENT_NO_LOSS: {
    doc_type_key: 'STATEMENT_NO_LOSS',
    display_name: 'Statement of No Loss',
    short_description: 'Affirmation of no losses during a period',
    upload_instructions: 'Upload a signed statement of no loss if requested.',
    accepted_file_types: ['pdf', 'jpg', 'png'],
    min_quantity: 0,
    max_quantity: 3,
    validation_hints: 'Should be signed and dated by the insured.',
    acord_links: [],
    tags: ['bind', 'underwriting'],
    lob_relevance: ['commercial', 'personal'],
    icon_key: 'shield',
  },

  CURRENT_DEC: {
    doc_type_key: 'CURRENT_DEC',
    display_name: 'Current Policy Dec Page',
    short_description: 'Your current declarations page',
    upload_instructions: 'Upload the most recent dec page showing coverages, limits, and premium.',
    accepted_file_types: ['pdf', 'jpg', 'png'],
    min_quantity: 0,
    max_quantity: 5,
    validation_hints: 'Should show named insured, policy number, coverages, limits, and premium.',
    acord_links: [],
    tags: ['remarket', 'underwriting', 'submission'],
    lob_relevance: ['commercial', 'personal', 'auto', 'gl', 'property', 'wc', 'umbrella'],
    icon_key: 'fileText',
  },

  RENEWAL_DEC: {
    doc_type_key: 'RENEWAL_DEC',
    display_name: 'Renewal Dec / Renewal Offer',
    short_description: 'Renewal terms for your policy period',
    upload_instructions: 'Upload the renewal offer or renewal dec page that shows your new premium and term.',
    accepted_file_types: ['pdf', 'jpg', 'png'],
    min_quantity: 0,
    max_quantity: 5,
    validation_hints: 'Should show new premium, effective dates, and any coverage changes.',
    acord_links: [],
    tags: ['renewal', 'remarket'],
    lob_relevance: ['commercial', 'personal', 'auto', 'gl', 'property', 'wc'],
    icon_key: 'fileText',
  },

  DRIVER_LIST_MVR: {
    doc_type_key: 'DRIVER_LIST_MVR',
    display_name: 'Driver List / MVR',
    short_description: 'Drivers and motor vehicle records',
    upload_instructions: 'Upload driver list or MVRs if requested.',
    accepted_file_types: ['pdf'],
    min_quantity: 0,
    max_quantity: 20,
    validation_hints: 'Should include driver names, DOB, license numbers, and violation history.',
    acord_links: [],
    tags: ['submission', 'underwriting'],
    lob_relevance: ['auto', 'commercial_auto', 'personal_auto'],
    icon_key: 'users',
  },

  VEHICLE_SCHEDULE: {
    doc_type_key: 'VEHICLE_SCHEDULE',
    display_name: 'Vehicle Schedule',
    short_description: 'Vehicles, VINs, garaging, symbols',
    upload_instructions: 'Upload the vehicle schedule if separate from the dec page.',
    accepted_file_types: ['pdf'],
    min_quantity: 0,
    max_quantity: 10,
    validation_hints: 'Should include VINs, year/make/model, and garaging addresses.',
    acord_links: [],
    tags: ['submission', 'underwriting'],
    lob_relevance: ['auto', 'commercial_auto'],
    icon_key: 'car',
  },

  ENTITY_DOCS: {
    doc_type_key: 'ENTITY_DOCS',
    display_name: 'Entity Documents',
    short_description: 'Proof of business entity information',
    upload_instructions: 'Upload articles of incorporation, EIN letter, or similar if requested.',
    accepted_file_types: ['pdf', 'jpg', 'png'],
    min_quantity: 0,
    max_quantity: 10,
    acord_links: [],
    tags: ['submission', 'compliance'],
    lob_relevance: ['commercial'],
    icon_key: 'briefcase',
  },

  CERTIFICATE_REQUEST: {
    doc_type_key: 'CERTIFICATE_REQUEST',
    display_name: 'Certificate Request',
    short_description: 'Info needed to issue a COI',
    upload_instructions: 'Upload contract requirements or COI request details.',
    accepted_file_types: ['pdf', 'jpg', 'png'],
    min_quantity: 0,
    max_quantity: 10,
    acord_links: [],
    tags: ['service'],
    lob_relevance: ['commercial'],
    icon_key: 'fileCheck',
  },

  PROPERTY_SOV: {
    doc_type_key: 'PROPERTY_SOV',
    display_name: 'Property Schedule / SOV',
    short_description: 'Schedule of values for property underwriting',
    upload_instructions: 'Upload schedule of values (SOV) / building list / values.',
    accepted_file_types: ['pdf', 'xlsx', 'csv'],
    min_quantity: 0,
    max_quantity: 10,
    validation_hints: 'Should include building addresses, values, construction type, and occupancy.',
    acord_links: [],
    tags: ['property', 'submission', 'underwriting'],
    lob_relevance: ['property', 'commercial'],
    icon_key: 'building2',
  },

  WC_MOD_PAYROLL: {
    doc_type_key: 'WC_MOD_PAYROLL',
    display_name: 'WC Mod / Payroll',
    short_description: 'Experience mod and payroll breakdown',
    upload_instructions: 'Upload experience mod worksheet and payroll by class code if available.',
    accepted_file_types: ['pdf', 'xlsx', 'csv'],
    min_quantity: 0,
    max_quantity: 10,
    validation_hints: 'Should include experience mod rating, class codes, and payroll by class.',
    acord_links: [],
    tags: ['wc', 'underwriting'],
    lob_relevance: ['wc', 'commercial'],
    icon_key: 'fileSpreadsheet',
  },

  ID_CARDS: {
    doc_type_key: 'ID_CARDS',
    display_name: 'ID Cards',
    short_description: 'Insurance cards for vehicles/insured',
    upload_instructions: 'Upload any ID cards if requested.',
    accepted_file_types: ['pdf', 'jpg', 'png'],
    min_quantity: 0,
    max_quantity: 10,
    acord_links: [],
    tags: ['service'],
    lob_relevance: ['auto', 'personal_auto'],
    icon_key: 'creditCard',
  },

  SIGNED_APP: {
    doc_type_key: 'SIGNED_APP',
    display_name: 'Signed Application',
    short_description: 'Executed application for binding',
    upload_instructions: 'Upload the signed application or signature page.',
    accepted_file_types: ['pdf', 'jpg', 'png'],
    min_quantity: 0,
    max_quantity: 5,
    validation_hints: 'Must show signature and date.',
    acord_links: [],
    tags: ['bind'],
    lob_relevance: ['commercial', 'personal'],
    icon_key: 'fileSignature',
  },

  PRIOR_POLICY: {
    doc_type_key: 'PRIOR_POLICY',
    display_name: 'Prior Policy Documents',
    short_description: 'Previous policy or prior carrier info',
    upload_instructions: 'Upload prior policy dec page or policy documents if different from current.',
    accepted_file_types: ['pdf'],
    min_quantity: 0,
    max_quantity: 10,
    acord_links: [],
    tags: ['submission', 'underwriting'],
    lob_relevance: ['commercial', 'personal'],
    icon_key: 'fileText',
  },

  PHOTOS: {
    doc_type_key: 'PHOTOS',
    display_name: 'Photos',
    short_description: 'Property or vehicle photos',
    upload_instructions: 'Upload photos of the property, vehicles, or equipment as requested.',
    accepted_file_types: ['jpg', 'jpeg', 'png', 'heic', 'pdf'],
    min_quantity: 0,
    max_quantity: 50,
    acord_links: [],
    tags: ['underwriting'],
    lob_relevance: ['property', 'auto'],
    icon_key: 'camera',
  },

  OTHER: {
    doc_type_key: 'OTHER',
    display_name: 'Other Document',
    short_description: 'Miscellaneous document',
    upload_instructions: 'Upload any other document requested by your agent.',
    accepted_file_types: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xlsx'],
    min_quantity: 0,
    max_quantity: 20,
    acord_links: [],
    tags: [],
    lob_relevance: [],
    icon_key: 'fileText',
  },
};

// =============================================================================
// LOB-BASED SUGGESTIONS
// =============================================================================

export interface LOBSuggestion {
  lob_key: string;
  lob_display_name: string;
  suggested_doc_types: string[];
}

export const LOB_SUGGESTIONS: LOBSuggestion[] = [
  {
    lob_key: 'personal_auto',
    lob_display_name: 'Personal Auto',
    suggested_doc_types: ['CURRENT_DEC', 'RENEWAL_DEC', 'ID_CARDS', 'DRIVER_LIST_MVR'],
  },
  {
    lob_key: 'commercial_auto',
    lob_display_name: 'Commercial Auto',
    suggested_doc_types: ['CURRENT_DEC', 'VEHICLE_SCHEDULE', 'DRIVER_LIST_MVR', 'LOSS_RUNS'],
  },
  {
    lob_key: 'gl',
    lob_display_name: 'General Liability (CGL)',
    suggested_doc_types: ['CURRENT_DEC', 'LOSS_RUNS', 'ACORD_125', 'CARRIER_SUPPLEMENT'],
  },
  {
    lob_key: 'property',
    lob_display_name: 'Commercial Property',
    suggested_doc_types: ['CURRENT_DEC', 'PROPERTY_SOV', 'LOSS_RUNS', 'PHOTOS'],
  },
  {
    lob_key: 'wc',
    lob_display_name: 'Workers Compensation',
    suggested_doc_types: ['CURRENT_DEC', 'LOSS_RUNS', 'WC_MOD_PAYROLL'],
  },
  {
    lob_key: 'umbrella',
    lob_display_name: 'Umbrella / Excess',
    suggested_doc_types: ['CURRENT_DEC', 'LOSS_RUNS'],
  },
  {
    lob_key: 'bop',
    lob_display_name: 'Business Owners Policy',
    suggested_doc_types: ['CURRENT_DEC', 'LOSS_RUNS', 'PROPERTY_SOV'],
  },
  {
    lob_key: 'home',
    lob_display_name: 'Homeowners',
    suggested_doc_types: ['CURRENT_DEC', 'RENEWAL_DEC', 'PHOTOS'],
  },
  {
    lob_key: 'professional',
    lob_display_name: 'Professional Liability / E&O',
    suggested_doc_types: ['CURRENT_DEC', 'LOSS_RUNS', 'ACORD_125'],
  },
];

// =============================================================================
// TEMPLATE DEFINITIONS
// =============================================================================

export interface PacketTemplate {
  template_key: string;
  name: string;
  description: string;
  use_case: string;
  line_of_business?: string;
  requirements: Array<{
    doc_type: string;
    label: string;
    instructions?: string;
    is_required: boolean;
    min_quantity?: number;
    max_quantity?: number;
  }>;
  default_expiration_days: number;
}

export const PACKET_TEMPLATES: PacketTemplate[] = [
  {
    template_key: 'commercial_submission',
    name: 'Commercial Submission Packet',
    description: 'Standard document collection for new commercial insurance submissions',
    use_case: 'new_commercial_submission',
    line_of_business: 'commercial',
    requirements: [
      { doc_type: 'ACORD_125', label: 'ACORD 125 - Commercial Application', is_required: false },
      { doc_type: 'LOSS_RUNS', label: 'Loss Runs (3-5 Years)', is_required: true, min_quantity: 1 },
      { doc_type: 'CURRENT_DEC', label: 'Current Dec Page', is_required: true, min_quantity: 1 },
      { doc_type: 'CARRIER_SUPPLEMENT', label: 'Carrier Supplementary Forms', is_required: false },
      { doc_type: 'ENTITY_DOCS', label: 'Entity Documents', is_required: false },
    ],
    default_expiration_days: 30,
  },
  {
    template_key: 'commercial_binding',
    name: 'Binding Requirements',
    description: 'Documents needed to bind a commercial policy',
    use_case: 'commercial_bind',
    line_of_business: 'commercial',
    requirements: [
      { doc_type: 'PAYMENT_DOC', label: 'Payment Information', is_required: true, min_quantity: 1 },
      { doc_type: 'SIGNED_APP', label: 'Signed Application', is_required: true, min_quantity: 1 },
      { doc_type: 'STATEMENT_NO_LOSS', label: 'Statement of No Loss', is_required: false },
      { doc_type: 'CARRIER_SUPPLEMENT', label: 'Carrier Supplementary Forms', is_required: false },
    ],
    default_expiration_days: 14,
  },
  {
    template_key: 'renewal_remarketing',
    name: 'Renewal Review / Remarketing',
    description: 'Documents needed to remarket an upcoming renewal',
    use_case: 'commercial_renewal',
    requirements: [
      { doc_type: 'RENEWAL_DEC', label: 'Renewal Offer / Dec Page', is_required: true, min_quantity: 1 },
      { doc_type: 'CURRENT_DEC', label: 'Current Policy Dec Page', is_required: true, min_quantity: 1 },
      { doc_type: 'LOSS_RUNS', label: 'Loss Runs', is_required: false },
    ],
    default_expiration_days: 21,
  },
  {
    template_key: 'commercial_auto',
    name: 'Commercial Auto Submission',
    description: 'Documents for commercial auto insurance submission',
    use_case: 'new_commercial_submission',
    line_of_business: 'commercial_auto',
    requirements: [
      { doc_type: 'CURRENT_DEC', label: 'Current Auto Dec Page', is_required: true, min_quantity: 1 },
      { doc_type: 'VEHICLE_SCHEDULE', label: 'Vehicle Schedule', is_required: true, min_quantity: 1 },
      { doc_type: 'DRIVER_LIST_MVR', label: 'Driver List / MVRs', is_required: true, min_quantity: 1 },
      { doc_type: 'LOSS_RUNS', label: 'Auto Loss Runs (5 Years)', is_required: true, min_quantity: 1 },
      { doc_type: 'ACORD_125', label: 'ACORD 125 (Optional)', is_required: false },
    ],
    default_expiration_days: 30,
  },
  {
    template_key: 'personal_lines_bind',
    name: 'Personal Lines Bind',
    description: 'Documents needed to bind a personal lines policy',
    use_case: 'personal_lines_bind',
    line_of_business: 'personal',
    requirements: [
      { doc_type: 'PAYMENT_DOC', label: 'Payment Information', is_required: true, min_quantity: 1 },
      { doc_type: 'SIGNED_APP', label: 'Signed Application', is_required: true, min_quantity: 1 },
      { doc_type: 'PRIOR_POLICY', label: 'Proof of Prior Insurance', is_required: false },
    ],
    default_expiration_days: 14,
  },
  {
    template_key: 'certificate_request',
    name: 'Certificate / COI Request',
    description: 'Documents needed to issue a certificate of insurance',
    use_case: 'certificate_request',
    requirements: [
      { doc_type: 'CERTIFICATE_REQUEST', label: 'Certificate Request Details', is_required: true, min_quantity: 1 },
    ],
    default_expiration_days: 7,
  },
  {
    template_key: 'wc_submission',
    name: 'Workers Comp Submission',
    description: 'Documents for workers compensation submission',
    use_case: 'new_commercial_submission',
    line_of_business: 'wc',
    requirements: [
      { doc_type: 'CURRENT_DEC', label: 'Current WC Dec Page', is_required: true, min_quantity: 1 },
      { doc_type: 'LOSS_RUNS', label: 'WC Loss Runs (5 Years)', is_required: true, min_quantity: 1 },
      { doc_type: 'WC_MOD_PAYROLL', label: 'Experience Mod & Payroll', is_required: true, min_quantity: 1 },
      { doc_type: 'ENTITY_DOCS', label: 'Entity Documents', is_required: false },
    ],
    default_expiration_days: 30,
  },
  {
    template_key: 'property_submission',
    name: 'Property Submission',
    description: 'Documents for commercial property submission',
    use_case: 'new_commercial_submission',
    line_of_business: 'property',
    requirements: [
      { doc_type: 'CURRENT_DEC', label: 'Current Property Dec Page', is_required: true, min_quantity: 1 },
      { doc_type: 'PROPERTY_SOV', label: 'Schedule of Values (SOV)', is_required: true, min_quantity: 1 },
      { doc_type: 'LOSS_RUNS', label: 'Property Loss Runs', is_required: true, min_quantity: 1 },
      { doc_type: 'PHOTOS', label: 'Property Photos', is_required: false },
    ],
    default_expiration_days: 30,
  },
  {
    template_key: 'quick_request',
    name: 'Quick Document Request',
    description: 'Ad-hoc request for specific documents',
    use_case: 'general',
    requirements: [],
    default_expiration_days: 14,
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get document type definition by key
 */
export function getDocType(key: string): DocumentTypeDefinition | undefined {
  return DOCUMENT_TYPES[key];
}

/**
 * Get all document types as array
 */
export function getAllDocTypes(): DocumentTypeDefinition[] {
  return Object.values(DOCUMENT_TYPES);
}

/**
 * Get suggested doc types for a line of business
 */
export function getSuggestedDocTypesForLOB(lobKey: string): DocumentTypeDefinition[] {
  const suggestion = LOB_SUGGESTIONS.find(s => s.lob_key === lobKey);
  if (!suggestion) return [];
  
  return suggestion.suggested_doc_types
    .map(key => DOCUMENT_TYPES[key])
    .filter(Boolean);
}

/**
 * Get template by key
 */
export function getTemplate(templateKey: string): PacketTemplate | undefined {
  return PACKET_TEMPLATES.find(t => t.template_key === templateKey);
}

/**
 * Get templates filtered by use case
 */
export function getTemplatesByUseCase(useCase: string): PacketTemplate[] {
  return PACKET_TEMPLATES.filter(t => t.use_case === useCase);
}

/**
 * Portal intro text
 */
export const PORTAL_INTRO_TEXT = 
  "To help us move quickly on your insurance request, please upload the documents below. " +
  "If you don't have a document handy, upload what you have and we'll follow up.";


