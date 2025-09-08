/**
 * Final CRM types - replacing all 'any' usage with proper TypeScript types
 * This consolidates both enhanced.ts and crm.ts into properly typed interfaces
 */

import type { Database } from '@/integrations/supabase/types';

// Base Supabase table types
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Account = Database['public']['Tables']['accounts']['Row'];
export type Contact = Database['public']['Tables']['contacts']['Row'];
export type Policy = Database['public']['Tables']['policies']['Row'];
export type Claim = Database['public']['Tables']['claims']['Row'];
export type CallSession = Database['public']['Tables']['call_sessions']['Row'];
export type SMSMessage = Database['public']['Tables']['sms_messages']['Row'];
export type Task = Database['public']['Tables']['tasks']['Row'];
export type Event = Database['public']['Tables']['events']['Row'];

// Form data types
export type CreateAccountData = Database['public']['Tables']['accounts']['Insert'];
export type UpdateAccountData = Database['public']['Tables']['accounts']['Update'];
export type CreateContactData = Database['public']['Tables']['contacts']['Insert'];
export type UpdateContactData = Database['public']['Tables']['contacts']['Update'];

// Extended account interface with related data
export interface AccountWithDetails extends Account {
  contacts?: Contact[];
  policies?: Policy[];
  claims?: Claim[];
  calls?: CallSession[];
  messages?: SMSMessage[];
  tasks?: Task[];
  events?: Event[];
}

// CRM Filter types (fixing type compatibility)
export interface CRMFilters {
  search?: string;
  type?: 'household' | 'business' | 'all';
  state?: string;
  tags?: string[];
  hasActivePolicies?: boolean;
  hasOpenClaims?: boolean;
  dateRange?: {
    start: string;
    end: string;
  };
}

// Saved view interface
export interface SavedView {
  id: string;
  name: string;
  description?: string;
  filters: CRMFilters;
  view_type: string;
  created_by: string;
  organization_shared: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// Bulk action types (replacing errors: any[])
export interface BulkActionError {
  entity_id: string;
  entity_type: string;
  error_message: string;
  error_code?: string;
}

export interface BulkAction {
  id: string;
  action_type: string;
  entity_type: string;
  entity_ids: string[];
  parameters: Record<string, string | number>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  total_count: number;
  success_count: number;
  error_count: number;
  errors: BulkActionError[];
  created_by: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

// CSV Import types (replacing any[] and validation_errors: any[])
export interface CSVRowData {
  [columnName: string]: string | number | boolean | null;
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
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
  field_mapping: Record<string, string>;
  validation_errors: ValidationError[];
  started_at?: string;
  completed_at?: string;
}

// Event payload types (replacing payload?: any)
export interface EventPayload {
  [key: string]: string | number | boolean | null | EventPayload | EventPayload[];
}

export interface ActivityEvent {
  id: string;
  type: string;
  entity_type?: string;
  entity_id?: string;
  payload?: EventPayload;
  occurred_at: string;
  created_at: string;
}

// Notification preferences (replacing any)
export interface NotificationPreferences {
  notification_email: boolean;
  notification_sms: boolean;
  marketing_emails?: boolean;
  security_alerts?: boolean;
  policy_reminders?: boolean;
  claim_updates?: boolean;
  timezone?: string;
  locale?: string;
}

// Function parameter types for hooks
export type UpdatePreferenceFunction = (
  key: keyof NotificationPreferences, 
  value: boolean | string
) => void;

export type FilterUpdateFunction = <K extends keyof CRMFilters>(
  key: K, 
  value: CRMFilters[K]
) => void;

// Error handling types (replacing error: any)
export interface SupabaseErrorDetails {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

// Activity icons mapping
export interface ActivityIconMapping {
  [eventType: string]: React.ComponentType<{ className?: string }>;
}

// Tag interfaces
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

// Audit trail types (replacing changed_fields?: Record<string, { old: any; new: any }>)
export interface FieldChange {
  old: string | number | boolean | null;
  new: string | number | boolean | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string; 
  user_id?: string;
  user_name?: string;
  changed_fields?: Record<string, FieldChange>;
  metadata?: Record<string, string | number | boolean>;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  occurred_at: string;
  created_at: string;
}

// Session and device types (replacing device_info: any, location_data: any)
export interface DeviceInfo {
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  device?: string;
  deviceType?: 'mobile' | 'tablet' | 'desktop';
}

export interface LocationData {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
}

export interface UserSession {
  id: string;
  user_id: string;
  session_token?: string;
  ip_address?: string;
  user_agent?: string;
  device_info?: DeviceInfo;
  location_data?: LocationData;
  created_at: string;
  last_active: string;
  expires_at: string;
  revoked_at?: string;
}

// Access log types (replacing details: any)
export interface AccessLogDetails {
  action_type: 'view' | 'edit' | 'export' | 'login' | 'logout';
  resource?: string;
  changes?: Record<string, FieldChange>;
  metadata?: Record<string, string | number | boolean>;
}

export interface AccessLog {
  id: string;
  target_user_id: string;
  accessor_user_id?: string;
  action: string;
  details: AccessLogDetails;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  accessor_profile?: {
    full_name?: string;
    role?: string;
  };
}

// Consent evidence types (replacing location_data?: any)
export interface ConsentRecord {
  id: string;
  contact_id: string;
  consent_type: 'sms' | 'voice' | 'email' | 'data_processing';
  method: 'verbal' | 'written' | 'web_form' | 'sms_keyword' | 'api';
  status: 'granted' | 'revoked';
  evidence_ref?: string;
  ip_address?: string;
  user_agent?: string;
  location_data?: LocationData;
  notes?: string;
  granted_at: string;
  expires_at?: string;
  revoked_at?: string;
  created_by?: string;
  created_at: string;
}

// Common source constants
export const COMMON_ACCOUNT_SOURCES = [
  'web_form',
  'referral', 
  'walk_in',
  'phone_call',
  'email',
  'marketing_campaign',
  'existing_client'
] as const;

export const COMMON_CONTACT_SOURCES = [
  'primary_account',
  'referral',
  'walk_in', 
  'phone_call',
  'email',
  'existing_contact'
] as const;