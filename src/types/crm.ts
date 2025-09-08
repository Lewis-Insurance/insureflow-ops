// Core CRM entities aligned with actual database schema
export interface Account {
  id: string;
  account_type: 'individual' | 'business' | 'household' | null;
  account_status: 'lead' | 'prospect' | 'customer' | 'inactive' | null;
  name: string;
  tin_last4?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  lead_source_detail?: string | null;
  notes?: string | null;
  custom?: Record<string, any> | null;
  team_id?: string | null;
  owner_agent_id?: string | null;
  business_id?: string | null;
  contact_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  tags?: AccountTag[];
}

export interface Contact {
  id: string;
  account_id: string;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  email?: string | null;
  email_primary?: string | null;
  email_other?: string[] | null;
  phone?: string | null;
  phone_mobile?: string | null;
  phone_home?: string | null;
  phone_work?: string | null;
  date_of_birth?: string | null;
  role?: string | null;
  source?: string | null;
  ssn_encrypted?: string | null;
  ssn_last4?: string | null;
  best_call_time?: string | null;
  preferred_contact_method?: 'phone' | 'email' | 'sms' | 'mail' | null;
  address_residential?: Record<string, any> | null;
  address_mailing?: Record<string, any> | null;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  marital_status?: 'single' | 'married' | 'divorced' | 'widowed' | 'separated' | null;
  tags?: string[] | null;
  consent_sms: boolean;
  consent_voice: boolean;
  consent_sms_at?: string | null;
  consent_voice_at?: string | null;
  lead_score?: number | null;
  risk_score?: number | null;
  renewal_probability?: number | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Policy {
  id: string;
  account_id: string;
  carrier_id?: string;
  policy_number: string;
  line_of_business: string;
  effective_date: string;
  expiration_date: string;
  premium?: number;
  payment_type: 'direct' | 'agency';
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  carrier?: {
    id: string;
    name: string;
  };
}

export interface Claim {
  id: string;
  policy_id: string;
  claim_number: string;
  description?: string;
  loss_date?: string;
  status: 'open' | 'closed' | 'pending' | 'denied' | 'in_review' | 'approved';
  amount_estimate?: number;
  created_at: string;
  updated_at: string;
  policy?: Policy;
}

export interface CallSession {
  id: string;
  twilio_call_sid?: string;
  from_number: string;
  to_number: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  recording_url?: string;
  consent_played: boolean;
  disposition?: string;
  account_id?: string;
  contact_id?: string;
  created_at: string;
  direction?: 'inbound' | 'outbound';
}

export interface SMSMessage {
  id: string;
  twilio_message_sid?: string;
  direction: 'in' | 'out';
  from_number: string;
  to_number: string;
  body?: string;
  status?: string;
  error_code?: string;
  campaign_id?: string;
  account_id?: string;
  contact_id?: string;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  type: string;
  entity_type?: string;
  entity_id?: string;
  payload?: any;
  occurred_at: string;
  created_at: string;
}

export interface Task {
  id: string;
  entity_type?: string;
  entity_id?: string;
  title: string;
  description?: string;
  assignee_id?: string;
  due_at?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface AccountWithDetails extends Account {
  contacts?: Contact[];
  policies?: Policy[];
  claims?: Claim[];
  calls?: CallSession[];
  messages?: SMSMessage[];
  tasks?: Task[];
  events?: ActivityEvent[];
}

export interface CRMFilters {
  search?: string;
  type?: 'household' | 'business' | 'all';
  state?: string;
  hasActivePolicies?: boolean;
  hasOpenClaims?: boolean;
}

export interface CreateAccountData {
  type: 'household' | 'business';
  name: string;
  tin_last4?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  email?: string;
  source?: string;
}

export interface CreateContactData {
  account_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  role?: string;
  source?: string;
  consent_sms?: boolean;
  consent_voice?: boolean;
}

// Tags and other enhancements
export interface AccountTag {
  id: string;
  account_id: string;
  tag_name: string;
  created_at: string;
  created_by?: string;
}

export interface ContactTag {
  id: string;
  contact_id: string;
  tag_name: string;
  created_at: string;
  created_by?: string;
}

export interface SavedView {
  id: string;
  name: string;
  description?: string;
  filters: Record<string, any>;
  view_type: string;
  created_by: string;
  organization_shared: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface BulkAction {
  id: string;
  action_type: string;
  entity_type: string;
  entity_ids: string[];
  parameters: Record<string, any>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  total_count: number;
  success_count: number;
  error_count: number;
  errors: any[];
  created_by: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export const COMMON_ACCOUNT_SOURCES = [
  'web_form',
  'referral', 
  'walk_in',
  'phone_call',
  'email',
  'marketing_campaign',
  'existing_client'
];

export const COMMON_CONTACT_SOURCES = [
  'primary_account',
  'referral',
  'walk_in', 
  'phone_call',
  'email',
  'existing_contact'
];

// Enhanced data quality types
export interface DuplicateGroup {
  id: string;
  entity_type: 'account' | 'contact';
  entity_ids: string[];
  match_score: number;
  status: 'pending' | 'reviewed' | 'merged' | 'dismissed';
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  import_type: 'accounts' | 'contacts';
  filename: string;
  total_rows: number;
  processed_rows: number;
  successful_rows: number;
  error_rows: number;
  status: 'staging' | 'processing' | 'completed' | 'failed';
  field_mapping?: Record<string, string>;
  validation_errors: any[];
  imported_by: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface ConsentRecord {
  id: string;
  contact_id: string;
  consent_type: 'sms' | 'voice' | 'email' | 'data_processing';
  method: 'verbal' | 'written' | 'web_form' | 'sms_keyword' | 'api';
  status: 'granted' | 'revoked';
  evidence_ref?: string;
  ip_address?: string;
  user_agent?: string;
  location_data?: any;
  notes?: string;
  granted_at: string;
  expires_at?: string;
  revoked_at?: string;
  created_by?: string;
  created_at: string;
}

// Enhanced audit system
export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  user_id?: string | null;
  user_name?: string | null;
  session_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  changed_fields?: Record<string, { old: any; new: any }> | null;
  metadata?: Record<string, any> | null;
  occurred_at: string;
  created_at: string;
}

export interface DetailedAuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  user_id?: string | null;
  user_name?: string | null;
  session_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  changed_fields?: Record<string, { old: any; new: any }> | null;
  metadata?: Record<string, any> | null;
  occurred_at: string;
  created_at: string;
}

// TCPA Compliance
export interface TwilioConsent {
  id: string;
  contact_id: string;
  channel: 'sms' | 'voice';
  event: 'consent_granted' | 'consent_revoked';
  method?: string | null;
  evidence?: Record<string, any> | null;
  created_at: string;
}

export interface ConsentEvidence {
  id: string;
  contact_id: string;
  consent_type: string;
  method: string;
  status: string;
  granted_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  evidence_ref?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  location_data?: Record<string, any> | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}

// User Management  
export interface UserSession {
  id: string;
  user_id: string;
  session_token: string;
  device_info?: Record<string, any> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  location_data?: Record<string, any> | null;
  last_active: string;
  expires_at: string;
  created_at: string;
}

export interface ImpersonationLog {
  id: string;
  impersonator_id: string;
  target_user_id: string;
  session_id: string;
  reason?: string | null;
  started_at: string;
  ended_at?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  actions_taken?: Record<string, any>[] | null;
  created_at: string;
}

export interface RoleChangeRequest {
  id: string;
  user_id: string;
  current_role: string;
  requested_role: string;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_reason?: string | null;
  created_at: string;
}

// Enhanced Import/Export System
export interface ImportBatch {
  id: string;
  import_type: string;
  filename: string;
  total_rows: number;
  processed_rows: number;
  successful_rows: number;
  error_rows: number;
  status: 'staging' | 'processing' | 'completed' | 'failed';
  field_mapping?: Record<string, any> | null;
  validation_errors?: Record<string, any>[] | null;
  imported_by: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface ImportStaging {
  id: string;
  batch_id: string;
  row_number: number;
  raw_data: Record<string, any>;
  mapped_data?: Record<string, any> | null;
  validation_status: 'pending' | 'valid' | 'invalid';
  validation_errors?: Record<string, any>[] | null;
  entity_id?: string | null;
  created_at: string;
}

export interface DataExportRequest {
  id: string;
  user_id: string;
  request_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  export_url?: string | null;
  download_count: number;
  requested_at: string;
  completed_at?: string | null;
  expires_at?: string | null;
  created_at: string;
}

// Enhanced Duplicate Detection
export interface DuplicateDetectionRule {
  id: string;
  entity_type: string;
  rule_name: string;
  match_fields: Record<string, any>;
  threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DuplicateGroup {
  id: string;
  entity_type: string;
  entity_ids: string[];
  match_score: number;
  status: 'pending' | 'reviewed' | 'merged' | 'dismissed';
  rule_id?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface MergeHistory {
  id: string;
  entity_type: string;
  survivor_id: string;
  merged_ids: string[];
  merge_data: Record<string, any>;
  merged_by: string;
  created_at: string;
}

// Phone Verification
export interface PhoneVerificationCode {
  id: string;
  user_id: string;
  phone_number: string;
  verification_code: string;
  attempts: number;
  verified: boolean;
  expires_at: string;
  created_at: string;
}

// Email Change Management
export interface EmailChangeRequest {
  id: string;
  user_id: string;
  current_email: string;
  requested_email: string;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expires_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_reason?: string | null;
  requested_at: string;
  created_at: string;
}

// Document Management
export interface Document {
  id: string;
  account_id?: string | null;
  policy_id?: string | null;
  name?: string | null;
  filename: string;
  mime_type?: string | null;
  file_size?: number | null;
  size_bytes?: number | null;
  storage_path: string;
  category?: 'policy' | 'claim' | 'application' | 'id_document' | 'financial' | 'other' | null;
  kind: string;
  pii_level?: string | null;
  sha256?: string | null;
  signature_request_id?: string | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  created_at: string;
  updated_at: string;
}

// Enhanced Profile Access Logs
export interface ProfileAccessLog {
  id: string;
  target_user_id: string;
  accessor_user_id?: string | null;
  action: string;
  details?: Record<string, any> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}