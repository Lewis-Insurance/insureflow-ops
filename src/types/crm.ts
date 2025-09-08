export interface Account {
  id: string;
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
  tags?: AccountTag[];
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Contact {
  id: string;
  account_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  role?: string;
  source?: string;
  tags?: ContactTag[];
  consent_sms: boolean;
  consent_voice: boolean;
  consent_sms_at?: string;
  consent_voice_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
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

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  user_id?: string;
  user_name?: string;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
  changed_fields?: Record<string, { old: any; new: any }>;
  metadata?: Record<string, any>;
  occurred_at: string;
  created_at: string;
}