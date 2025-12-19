// ============================================
// Intake System - Type Definitions
// ============================================

import { TransformConfig } from './acord';

// ============================================
// INTAKE TEMPLATES
// ============================================

export interface IntakeTemplate {
  id: string;
  name: string;
  description?: string;
  intake_type: IntakeType;
  questions: IntakeQuestion[];
  dynamic_sections: Record<string, string[]>;
  settings: IntakeSettings;
  branding: IntakeBranding;
  is_published: boolean;
  is_archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type IntakeType = 'acord' | 'survey' | 'fnol' | 'general' | 'renewal' | 'endorsement';

export interface IntakeSettings {
  allowSaveDraft: boolean;
  showProgressBar: boolean;
  requireEmail: boolean;
  sendConfirmationEmail: boolean;
  notifyOnSubmission: string[];
  expirationDays: number;
  rateLimit: {
    maxRequests: number;
    windowHours: number;
  };
  honeypotFieldName?: string;
  redirectUrl?: string;
  customThankYouMessage?: string;
}

export interface IntakeBranding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  companyName?: string;
  customCss?: string;
  headerHtml?: string;
  footerHtml?: string;
}

// ============================================
// QUESTIONS
// ============================================

export interface IntakeQuestion {
  id: string;
  type: QuestionType;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  validation?: QuestionValidation;
  options?: SelectOption[];
  conditionalDisplay?: ConditionalDisplay;
  repeaterConfig?: RepeaterQuestionConfig;
  section?: string;
  order: number;
  helpText?: string;
  defaultValue?: any;
}

export type QuestionType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multi_select'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'signature'
  | 'address'
  | 'phone'
  | 'email'
  | 'ssn'
  | 'ein'
  | 'vin'
  | 'repeater'
  | 'section_header'
  | 'info_text';

export interface QuestionValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
  allowedFileTypes?: string[];
  maxFileSize?: number;
  customValidator?: string;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
}

export interface ConditionalDisplay {
  dependsOn: string;
  operator: ConditionalOperator;
  value: any;
  showWhenTrue?: boolean;
}

export type ConditionalOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'is_empty'
  | 'is_not_empty'
  | 'matches_pattern';

export interface RepeaterQuestionConfig {
  minItems: number;
  maxItems: number;
  itemLabel: string;
  itemLabelTemplate?: string;
  fields: IntakeQuestion[];
  addButtonText?: string;
  removeButtonText?: string;
  confirmRemove?: boolean;
}

// ============================================
// SUBMISSIONS
// ============================================

export interface IntakeSubmission {
  id: string;
  template_id: string;
  account_id?: string;
  access_token_hash: string;
  token_expires_at: string;
  responses: Record<string, any>;
  draft_responses?: Record<string, any>;
  last_draft_save?: string;
  client_name?: string;
  client_email?: string;
  client_ip?: string;
  status: SubmissionStatus;
  submitted_at?: string;
  created_at: string;
}

export type SubmissionStatus = 'draft' | 'in_progress' | 'submitted' | 'processed' | 'expired' | 'cancelled';

// ============================================
// MAPPINGS
// ============================================

export interface IntakeAcordMapping {
  id: string;
  intake_template_id: string;
  intake_question_id: string;
  acord_form_number: string;
  acord_field_name: string;
  transform_type: TransformType;
  transform_config: TransformConfig;
  is_repeater_field: boolean;
  repeater_config_id?: string;
  created_at: string;
}

export type TransformType =
  | 'direct'
  | 'format'
  | 'concatenate'
  | 'calculate'
  | 'lookup'
  | 'boolean'
  | 'date_format'
  | 'phone_format'
  | 'currency_format'
  | 'uppercase'
  | 'lowercase'
  | 'split'
  | 'substring'
  | 'conditional';

// ============================================
// ENRICHMENT
// ============================================

export interface EnrichmentCache {
  id: string;
  lookup_key: string;
  lookup_type: EnrichmentType;
  data: Record<string, any>;
  source: string;
  cost_cents: number;
  fetched_at: string;
  expires_at: string;
}

export type EnrichmentType = 'property' | 'business' | 'vin' | 'naics' | 'address';

export interface EnrichmentUsage {
  id: string;
  user_id: string;
  lookup_type: EnrichmentType;
  lookup_key: string;
  cost_cents: number;
  created_at: string;
}

export interface EnrichmentQuota {
  tier: 'basic' | 'standard' | 'premium';
  monthlyQuota: number;
  usedThisMonth: number;
  remainingLookups: number;
  pricePerLookup: number;
}

export interface PropertyEnrichmentResult {
  address: string;
  squareFootage?: number;
  yearBuilt?: number;
  constructionType?: string;
  roofType?: string;
  stories?: number;
  bedrooms?: number;
  bathrooms?: number;
  lotSize?: number;
  lastSaleDate?: string;
  lastSalePrice?: number;
  estimatedValue?: number;
  propertyType?: string;
  heating?: string;
  cooling?: string;
  foundation?: string;
}

export interface BusinessEnrichmentResult {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  website?: string;
  naicsCode?: string;
  sicCode?: string;
  naicsDescription?: string;
  employeeCount?: number;
  annualRevenue?: number;
  yearFounded?: number;
  businessType?: string;
  industryCategory?: string;
}

export interface VinDecoderResult {
  vin: string;
  make: string;
  model: string;
  year: number;
  vehicleType: string;
  bodyClass?: string;
  driveType?: string;
  engineCylinders?: number;
  engineSize?: string;
  fuelType?: string;
  gvwr?: string;
  manufacturer?: string;
  plantCountry?: string;
  errorCode?: string;
  errorText?: string;
}

// ============================================
// AUTO-SAVE
// ============================================

export interface AutoSaveState {
  intakeId: string;
  responses: Record<string, any>;
  savedAt: string;
  currentSection?: number;
  currentQuestion?: string;
}

export interface RestorePrompt {
  available: boolean;
  savedProgress?: AutoSaveState;
  hoursSinceSave?: number;
}

// ============================================
// RATE LIMITING
// ============================================

export interface RateLimitInfo {
  ipAddress: string;
  requestCount: number;
  firstRequestAt: string;
  blockedUntil?: string;
  isBlocked: boolean;
  remainingRequests: number;
}

// ============================================
// FORM BUILDER
// ============================================

export interface FormBuilderState {
  questions: IntakeQuestion[];
  selectedQuestionId?: string;
  isDirty: boolean;
  lastSaved?: string;
  validationErrors: FormBuilderError[];
}

export interface FormBuilderError {
  questionId: string;
  field: string;
  message: string;
}

export interface DragDropResult {
  source: { index: number; droppableId: string };
  destination: { index: number; droppableId: string } | null;
  draggableId: string;
}

// ============================================
// COMMON INTAKE TEMPLATES
// ============================================

export const INTAKE_TEMPLATE_TYPES = {
  commercial_general: {
    name: 'Commercial General Liability',
    forms: ['125', '126'],
    description: 'General liability coverage for businesses',
  },
  commercial_auto: {
    name: 'Commercial Auto',
    forms: ['125', '127'],
    description: 'Commercial vehicle coverage',
  },
  workers_comp: {
    name: 'Workers Compensation',
    forms: ['125', '130'],
    description: 'Employee injury coverage',
  },
  commercial_property: {
    name: 'Commercial Property',
    forms: ['125', '140'],
    description: 'Building and contents coverage',
  },
  bop: {
    name: 'Business Owners Policy',
    forms: ['125', '126', '140'],
    description: 'Combined liability and property coverage',
  },
  full_commercial: {
    name: 'Full Commercial Package',
    forms: ['125', '126', '127', '130', '140'],
    description: 'Complete commercial coverage submission',
  },
} as const;

// ============================================
// QUESTION TYPE METADATA
// ============================================

export const QUESTION_TYPE_INFO: Record<QuestionType, { label: string; icon: string; hasOptions: boolean }> = {
  text: { label: 'Short Text', icon: 'Type', hasOptions: false },
  textarea: { label: 'Long Text', icon: 'AlignLeft', hasOptions: false },
  number: { label: 'Number', icon: 'Hash', hasOptions: false },
  currency: { label: 'Currency', icon: 'DollarSign', hasOptions: false },
  date: { label: 'Date', icon: 'Calendar', hasOptions: false },
  datetime: { label: 'Date & Time', icon: 'Clock', hasOptions: false },
  select: { label: 'Dropdown', icon: 'ChevronDown', hasOptions: true },
  multi_select: { label: 'Multi-Select', icon: 'CheckSquare', hasOptions: true },
  checkbox: { label: 'Checkbox', icon: 'CheckSquare', hasOptions: false },
  radio: { label: 'Radio Buttons', icon: 'Circle', hasOptions: true },
  file: { label: 'File Upload', icon: 'Upload', hasOptions: false },
  signature: { label: 'Signature', icon: 'PenTool', hasOptions: false },
  address: { label: 'Address', icon: 'MapPin', hasOptions: false },
  phone: { label: 'Phone Number', icon: 'Phone', hasOptions: false },
  email: { label: 'Email', icon: 'Mail', hasOptions: false },
  ssn: { label: 'SSN', icon: 'Lock', hasOptions: false },
  ein: { label: 'EIN', icon: 'Building', hasOptions: false },
  vin: { label: 'VIN', icon: 'Car', hasOptions: false },
  repeater: { label: 'Repeating Section', icon: 'Plus', hasOptions: false },
  section_header: { label: 'Section Header', icon: 'Heading', hasOptions: false },
  info_text: { label: 'Info Text', icon: 'Info', hasOptions: false },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

export function generateAccessToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashAccessToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

export function getQuestionIcon(type: QuestionType): string {
  return QUESTION_TYPE_INFO[type]?.icon || 'HelpCircle';
}
