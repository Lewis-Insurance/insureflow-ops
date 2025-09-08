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
}

export interface CreateContactData {
  account_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  role?: string;
  consent_sms?: boolean;
  consent_voice?: boolean;
}