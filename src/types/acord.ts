// ============================================
// ACORD Form Automation Suite - Type Definitions
// ============================================

// ============================================
// ACORD TEMPLATES
// ============================================

export interface AcordTemplate {
  id: string;
  form_number: string;
  form_name: string;
  version: string;
  is_current: boolean;
  effective_date: string | null;
  sunset_date: string | null;
  pdf_type: 'acroform' | 'xfa' | 'static';
  pdf_template_url: string;
  pdf_url?: string; // Alias for pdf_template_url
  field_inventory: FieldInventoryItem[];
  field_schema: FieldSchemaItem[];
  field_definitions?: FieldDefinition[]; // Parsed field definitions for UI
  section_definitions: SectionDefinition[];
  validation_rules: ValidationRule[];
  signature_anchors: SignatureAnchor[];
  repeater_configs: RepeaterConfig[];
  template_source: 'acord_portal' | 'carrier' | 'custom';
  license_notes?: string;
  uploaded_by?: string;
  created_at: string;
  updated_at: string;
}

export interface FieldInventoryItem {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'button' | 'signature';
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  maxLength?: number;
  options?: string[];
  required: boolean;
  tooltip?: string;
}

// Field definition used in templates and mapping
export interface FieldDefinition {
  fieldName: string;
  label?: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'date' | 'currency' | 'number' | 'signature';
  section?: string;
  page?: number;
  required: boolean;
  maxLength?: number;
  options?: string[];
  validation?: FieldValidation;
  tooltip?: string;
}

export interface FieldSchemaItem {
  name: string;
  label: string;
  section: number;
  type: string;
  required: boolean;
  defaultValue?: any;
  validation?: FieldValidation;
}

export interface FieldValidation {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

export interface SectionDefinition {
  sectionNumber: number;
  sectionName: string;
  description: string;
  fields: string[];
  requiredForSubmission: boolean;
  estimatedMinutes: number;
}

export interface ValidationRule {
  id: string;
  type: 'required' | 'conditional_required' | 'format' | 'range' | 'dependency';
  field: string;
  condition?: {
    dependsOn: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'checked' | 'unchecked';
    value: any;
  };
  message: string;
  severity: 'error' | 'warning';
}

export interface SignatureAnchor {
  tag: string;
  page: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  signerRole: 'insured' | 'producer' | 'witness' | 'additional_insured';
  required: boolean;
}

export interface RepeaterConfig {
  id: string;
  sourceArrayPath: string;
  itemsPerPage: number;
  overflowStrategy: 'clone_page' | 'append_continuation_form';
  continuationFormNumber?: string;
  namingPattern: string;
  fieldMap: Record<string, string>;
  startIndex?: number;
}

// ============================================
// ACORD FORMS
// ============================================

export interface AcordForm {
  id: string;
  account_id: string;
  template_id: string;
  intake_submission_id?: string;
  field_values: Record<string, any>;
  pdf_url?: string;
  pdf_generated_at?: string;
  has_addendum: boolean;
  addendum_url?: string;
  cloned_from?: string;
  signature_status: SignatureStatus;
  signature_request_id?: string;
  signed_pdf_url?: string;
  signed_at?: string;
  submission_status: SubmissionStatus;
  submitted_to_carrier?: string;
  submitted_at?: string;
  created_by: string;
  row_version: number;
  created_at: string;
  updated_at: string;
}

export type SignatureStatus = 'unsigned' | 'pending' | 'signed' | 'declined' | 'expired';
export type SubmissionStatus = 'draft' | 'ready' | 'submitted' | 'accepted' | 'rejected' | 'pending_info';

export interface AcordFormSection {
  id: string;
  acord_form_id: string;
  section_number: number;
  section_name: string;
  status: SectionStatus;
  assigned_to?: string;
  completed_by?: string;
  completed_at?: string;
  notes?: string;
}

export type SectionStatus = 'incomplete' | 'in_progress' | 'complete' | 'flagged';

export interface AcordFieldAudit {
  id: string;
  acord_form_id: string;
  field_name: string;
  old_value?: string;
  new_value?: string;
  is_encrypted: boolean;
  changed_by?: string;
  changed_at: string;
  change_source: ChangeSource;
  ip_address?: string;
  user_agent?: string;
}

export type ChangeSource = 'manual' | 'intake' | 'enrichment' | 'import' | 'api' | 'clone';

// ============================================
// TRANSFORM CONFIG
// ============================================

export interface TransformConfig {
  // Formatting options
  dateFormat?: string;
  phoneFormat?: string;
  uppercase?: boolean;
  lowercase?: boolean;
  trim?: boolean;

  // Concatenation
  sourceFields?: string[];
  separator?: string;

  // Calculation
  formula?: string;

  // Lookup
  lookupTable?: string;

  // Boolean mapping
  trueValue?: string;
  falseValue?: string;

  // Repeater support
  repeaterConfig?: RepeaterConfig;

  // Error handling
  onError: 'skip' | 'default' | 'fail';
  defaultValue?: string;

  // Overflow handling
  maxLength?: number;
  overflowBehavior?: 'truncate' | 'addendum' | 'fail';
}

// ============================================
// CARRIER & SUBMISSION
// ============================================

export interface CarrierPortal {
  id: string;
  carrier_name: string;
  carrier_code?: string;
  submission_url?: string;
  portal_login_url?: string;
  required_forms: string[];
  required_documents: string[];
  submission_checklist: ChecklistItem[];
  producer_codes: Record<string, string>;
  validation_overrides: Record<string, any>;
  notes?: string;
  is_active: boolean;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  order: number;
}

export interface CarrierFieldRequirement {
  id: string;
  carrier_id: string;
  acord_form_number: string;
  field_name: string;
  requirement_type: 'required' | 'optional' | 'not_accepted' | 'format_override';
  notes?: string;
}

// Carrier-specific validation overrides
export interface CarrierOverride {
  carrier_id: string;
  form_number: string;
  field_overrides: Record<string, any>;
  required_fields: string[];
  optional_fields: string[];
  validation_rules: ValidationRule[];
  notes?: string;
}

export interface SubmissionPackage {
  id: string;
  account_id: string;
  carrier_id: string;
  name: string;
  documents: PackageDocument[];
  package_url?: string;
  package_generated_at?: string;
  status: PackageStatus;
  submitted_via?: string;
  submitted_at?: string;
  submission_reference?: string;
  created_by: string;
  created_at: string;
}

export interface PackageDocument {
  id: string;
  type: 'acord_form' | 'loss_runs' | 'driver_mvr' | 'certificate' | 'dec_page' | 'supplemental' | 'photo' | 'other';
  document_id?: string;
  file_url?: string;
  file_name: string;
  required: boolean;
  status: 'missing' | 'uploaded' | 'generated';
  added_at?: string;
}

export type PackageStatus = 'draft' | 'complete' | 'submitted' | 'accepted' | 'rejected';

// ============================================
// GENERATION JOBS
// ============================================

export interface AcordGenerationJob {
  id: string;
  idempotency_key?: string;
  form_ids: string[];
  job_type: 'generate' | 'regenerate' | 'package';
  requested_by: string;
  status: JobStatus;
  current_form_id?: string;
  progress_percent: number;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at?: string;
  error_message?: string;
  result_urls: string[];
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export type JobStatus = 'queued' | 'processing' | 'complete' | 'failed' | 'cancelled';

// ============================================
// NOTIFICATIONS
// ============================================

export interface AcordNotification {
  id: string;
  acord_form_id: string;
  notification_type: string;
  recipient_id: string;
  sent_at?: string;
  read_at?: string;
  created_at: string;
}

// ============================================
// VALIDATION RESULTS
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  completionPercentage: number;
}

export interface ValidationError {
  field: string;
  message: string;
  rule?: ValidationRule;
}

// ============================================
// PDF FILLING
// ============================================

export interface PdfFillOptions {
  flatten: boolean;
  updateAppearances: boolean;
  preserveEmptyFields: boolean;
  fontName?: string;
  fontSize?: number;
}

export interface PdfFillResult {
  success: boolean;
  pdfBytes?: Uint8Array;
  filledFieldCount: number;
  skippedFields: string[];
  errors: string[];
}

export interface FieldTypeMap {
  [fieldName: string]: 'text' | 'checkbox' | 'dropdown' | 'radio';
}

// ============================================
// FORM COMPARISON
// ============================================

export interface FormComparison {
  field_name: string;
  field_label: string;
  prior_value: any;
  current_value: any;
  change_type: 'unchanged' | 'increased' | 'decreased' | 'modified' | 'added' | 'removed';
  significance: 'normal' | 'attention' | 'critical';
}

// ============================================
// PRODUCER INFO
// ============================================

export interface ProducerInfo {
  agencyName: string;
  agencyAddress: string;
  agencyCity: string;
  agencyState: string;
  agencyZip: string;
  agencyPhone: string;
  agencyFax?: string;
  agencyEmail: string;
  producerName: string;
  producerEmail?: string;
  producerPhone?: string;
  producerLicense?: string;
  carrierProducerCodes: Record<string, string>;
}

// ============================================
// COMMON ACORD FORMS
// ============================================

export const ACORD_FORMS = {
  '125': { name: 'Commercial Insurance Application', pages: 4 },
  '126': { name: 'Commercial General Liability Section', pages: 2 },
  '127': { name: 'Commercial Auto Section', pages: 2 },
  '130': { name: 'Workers Compensation Application', pages: 3 },
  '140': { name: 'Property Section', pages: 2 },
  '35': { name: 'Homeowners Application', pages: 4 },
  '80': { name: 'Personal Auto Application', pages: 2 },
  '25': { name: 'Certificate of Liability Insurance', pages: 1 },
  '27': { name: 'Evidence of Property Insurance', pages: 1 },
  '28': { name: 'Evidence of Commercial Property Insurance', pages: 1 },
} as const;

export type AcordFormNumber = keyof typeof ACORD_FORMS;
