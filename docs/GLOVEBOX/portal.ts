// ============================================================================
// INSUREFLOW CLIENT PORTAL - TYPESCRIPT TYPES (SCHEMA-ALIGNED)
// ============================================================================
// These types EXACTLY match the database columns. No extra fields.
// ============================================================================

// =============================================================================
// DATA PROVENANCE (CRITICAL FOR E&O)
// =============================================================================

export type DataSourceType = 
  | 'agent_entered' 
  | 'client_uploaded' 
  | 'ai_extracted' 
  | 'ams_import';

export interface PolicyDataProvenance {
  id: string;
  policy_id: string;
  field_name: string;
  field_value: string | null;
  source_type: DataSourceType;
  source_document_id: string | null;
  source_description: string | null;
  as_of_date: string;
  confidence_score: number | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;
  is_current: boolean;
  superseded_by: string | null;
  superseded_at: string | null;
  created_at: string;
}

export const POLICY_DATA_DISCLAIMER = 
  "Coverage details based on documents on file. For current billing and claims status, please visit your carrier's website.";

// =============================================================================
// PORTAL BRANDING
// =============================================================================

export interface PortalFeatures {
  id_cards: boolean;
  documents: boolean;
  service_requests: boolean;
  quote_requests: boolean;
  referrals: boolean;
  emergency_mode: boolean;
  apple_wallet: boolean;
  google_wallet: boolean;
  household_members: boolean;
  document_upload: boolean;
}

export interface PortalBranding {
  id: string;
  agency_name: string;
  agency_code: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  welcome_title: string;
  welcome_message: string | null;
  support_email: string | null;
  support_phone: string | null;
  office_address: string | null;
  privacy_policy_url: string | null;
  terms_of_service_url: string | null;
  e_and_o_disclaimer: string;
  social_links: Record<string, string>;
  ios_app_url: string | null;
  android_app_url: string | null;
  features_enabled: PortalFeatures;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// PORTAL USERS
// =============================================================================

export type PortalUserStatus = 'invited' | 'active' | 'disabled';

export interface PortalUserPreferences {
  email_notifications: boolean;
  sms_notifications: boolean;
  renewal_reminders: boolean;
  marketing_opt_in: boolean;
  theme: 'light' | 'dark' | 'system';
}

// Matches client_portal_users table exactly
export interface ClientPortalUser {
  id: string;
  auth_user_id: string | null;
  branding_id: string | null;
  account_id: string;
  contact_id: string | null;
  email: string;
  // NOTE: email_verified is NOT in this table - it's in auth.users
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  portal_status: PortalUserStatus;
  invited_at: string | null;
  invited_by: string | null;
  first_login_at: string | null;
  last_login_at: string | null;
  login_count: number;
  biometric_enabled: boolean;
  device_tokens: string[];
  preferences: PortalUserPreferences;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// HOUSEHOLD MEMBERS
// =============================================================================

export type HouseholdRelationship = 
  | 'spouse' 
  | 'child' 
  | 'dependent' 
  | 'business_partner'
  | 'parent'
  | 'other';

export type HouseholdMemberStatus = 'invited' | 'active' | 'disabled';

export interface HouseholdPermissions {
  view_policies: boolean;
  view_documents: boolean;
  download_documents: boolean;
  view_id_cards: boolean;
  add_to_wallet: boolean;
  view_billing_links: boolean;
  request_service_changes: boolean;
  request_quotes: boolean;
  manage_household: boolean;
  view_premium_amounts: boolean;
}

export interface HouseholdMember {
  id: string;
  primary_user_id: string;
  auth_user_id: string | null;
  member_email: string;
  member_name: string | null;
  relationship: HouseholdRelationship | null;
  permissions: HouseholdPermissions;
  status: HouseholdMemberStatus;
  invited_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// DOCUMENTS
// =============================================================================

export type DocumentType = 
  | 'dec_page' 
  | 'id_card' 
  | 'certificate' 
  | 'endorsement' 
  | 'invoice' 
  | 'application'
  | 'other';

export type DocumentSourceType = 
  | 'agent_uploaded' 
  | 'client_uploaded' 
  | 'ai_generated' 
  | 'system_generated';

export interface PortalDocument {
  id: string;
  account_id: string;
  policy_id: string | null;
  branding_id: string | null;
  document_type: DocumentType;
  document_name: string;
  file_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  source_type: DocumentSourceType;
  uploaded_by_profile_id: string | null;
  uploaded_by_portal_user_id: string | null;
  document_date: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  is_client_visible: boolean;
  visibility_notes: string | null;
  requires_verification: boolean;
  verified_for_client_view: boolean; // IMPORTANT: in schema, used in RLS
  download_count: number;
  last_downloaded_at: string | null;
  last_downloaded_by_portal_user_id: string | null;
  last_downloaded_by_household_member_id: string | null;
  watermark_enabled: boolean;
  watermark_text: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// ID CARDS
// =============================================================================

export interface IDCardVehicle {
  year: string;
  make: string;
  model: string;
  vin: string;
}

export interface IDCardData {
  carrier_name: string;
  carrier_logo_url?: string;
  policy_number: string;
  named_insured: string;
  additional_insureds?: string[];
  vehicle?: IDCardVehicle;
  effective_date: string;
  expiration_date: string;
  coverage_summary?: string;
  agent_name?: string;
  agent_phone?: string;
  claims_phone?: string;
}

export interface PortalIDCard {
  id: string;
  account_id: string;
  policy_id: string;
  vehicle_id: string | null;
  branding_id: string | null;
  card_data: IDCardData;
  card_image_path: string | null;
  card_pdf_path: string | null;
  apple_wallet_pass_path: string | null;
  apple_wallet_pass_serial: string | null;
  apple_wallet_pass_updated_at: string | null;
  google_wallet_pass_url: string | null;
  google_wallet_pass_id: string | null;
  google_wallet_pass_updated_at: string | null;
  data_as_of: string;
  source_document_id: string | null;
  is_active: boolean;
  view_count: number;
  download_count: number;
  wallet_add_count: number;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// SERVICE REQUESTS
// =============================================================================

export type ServiceRequestType = 
  | 'add_vehicle' | 'remove_vehicle' | 'replace_vehicle'
  | 'add_driver' | 'remove_driver'
  | 'address_change' | 'name_change'
  | 'coverage_question' | 'coverage_change'
  | 'document_request' | 'certificate_request'
  | 'cancel_policy' | 'reinstate_policy'
  | 'billing_question' | 'claims_question'
  | 'general_inquiry' | 'other';

export type ServiceRequestStatus = 
  | 'new' | 'in_progress' | 'pending_info' | 'completed' | 'cancelled';

export type ServiceRequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ServiceRequestAttachment {
  file_path: string;
  file_name: string;
  mime_type: string;
}

export interface PortalServiceRequest {
  id: string;
  request_number: number;
  portal_user_id: string;
  household_member_id: string | null;
  account_id: string;
  policy_id: string | null;
  branding_id: string | null;
  request_type: ServiceRequestType;
  request_title: string;
  request_data: Record<string, unknown>;
  prefilled_data: Record<string, unknown> | null;
  attachments: ServiceRequestAttachment[];
  status: ServiceRequestStatus;
  priority: ServiceRequestPriority;
  assigned_to: string | null;
  assigned_at: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
  resolution_notes: string | null;
  completed_at: string | null;
  completed_by: string | null;
  task_id: string | null;
  client_notified: boolean;
  client_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// SERVICE REQUEST MESSAGES
// =============================================================================

export type MessageAuthorType = 'client' | 'household_member' | 'agent' | 'system';

export interface ServiceRequestMessage {
  id: string;
  request_id: string;
  author_type: MessageAuthorType;
  author_portal_user_id: string | null;
  author_household_member_id: string | null;
  author_profile_id: string | null;
  message_text: string;
  attachments: ServiceRequestAttachment[];
  is_internal: boolean;
  read_by_client: boolean;
  read_by_client_at: string | null;
  created_at: string;
}

// =============================================================================
// DOCUMENT UPLOADS (Staging)
// =============================================================================

export type ExtractionStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'skipped';
export type VerificationStatus = 'pending' | 'confirmed' | 'rejected';
export type AgentVerificationStatus = 'pending' | 'approved' | 'rejected';

export interface DocumentUploadStaging {
  id: string;
  portal_user_id: string;
  account_id: string;
  branding_id: string | null;
  file_path: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  declared_document_type: string | null;
  declared_policy_id: string | null;
  client_notes: string | null;
  extraction_status: ExtractionStatus;
  extraction_started_at: string | null;
  extraction_completed_at: string | null;
  extraction_error: string | null;
  extracted_data: Record<string, unknown> | null;
  extraction_confidence: number | null;
  client_verification_status: VerificationStatus;
  client_verified_at: string | null;
  client_corrections: Record<string, unknown> | null;
  agent_verification_status: AgentVerificationStatus;
  agent_verified_by: string | null;
  agent_verified_at: string | null;
  agent_notes: string | null;
  target_policy_id: string | null;
  merged_to_document_id: string | null;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// QUOTE REQUESTS
// =============================================================================

export type QuoteProductType = 
  | 'auto' | 'home' | 'renters' | 'umbrella' | 'life' 
  | 'pet' | 'boat' | 'rv' | 'commercial' | 'other';

export type QuoteSource = 'portal' | 'coverage_gap' | 'referral' | 'cross_sell_suggestion';

export type QuoteRequestStatus = 
  | 'new' | 'contacted' | 'quoting' | 'quoted' | 'bound' | 'declined' | 'lost';

export interface PortalQuoteRequest {
  id: string;
  request_number: number;
  portal_user_id: string;
  account_id: string;
  branding_id: string | null;
  product_type: QuoteProductType;
  request_data: Record<string, unknown>;
  prefilled_data: Record<string, unknown> | null;
  source: QuoteSource;
  source_opportunity_id: string | null;
  status: QuoteRequestStatus;
  assigned_to: string | null;
  lead_id: string | null;
  quote_id: string | null;
  policy_id: string | null;
  quoted_premium: number | null;
  bound_premium: number | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// REFERRALS
// =============================================================================

export type ReferralStatus = 'submitted' | 'contacted' | 'quoting' | 'converted' | 'declined';

export interface PortalReferral {
  id: string;
  referring_user_id: string;
  referring_account_id: string;
  branding_id: string | null;
  referee_name: string;
  referee_email: string | null;
  referee_phone: string | null;
  referee_relationship: string | null;
  products_interested: QuoteProductType[];
  notes: string | null;
  referral_code: string;
  status: ReferralStatus;
  converted_to_lead_id: string | null;
  converted_to_account_id: string | null;
  converted_at: string | null;
  reward_eligible: boolean;
  reward_type: string | null;
  reward_amount: number | null;
  reward_paid: boolean;
  reward_paid_at: string | null;
  reward_notes: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// COVERAGE OPPORTUNITIES
// =============================================================================

export type OpportunityType = 'coverage_gap' | 'bundling' | 'upgrade' | 'life_event';
export type OpportunityStatus = 'active' | 'clicked' | 'converted' | 'dismissed' | 'expired';

export interface CoverageOpportunity {
  id: string;
  portal_user_id: string;
  account_id: string;
  branding_id: string | null;
  opportunity_type: OpportunityType;
  product_type: QuoteProductType;
  title: string;
  description: string | null;
  icon: string | null;
  cta_text: string;
  priority: number;
  trigger_reason: string | null;
  trigger_data: Record<string, unknown> | null;
  status: OpportunityStatus;
  displayed_count: number;
  clicked_at: string | null;
  dismissed_at: string | null;
  dismissed_reason: string | null;
  quote_request_id: string | null;
  converted_policy_id: string | null;
  created_at: string;
  expires_at: string | null;
  updated_at: string;
}

// =============================================================================
// CARRIER CONFIG
// =============================================================================

export interface CarrierPortalConfig {
  id: string;
  carrier_name: string;
  carrier_code: string | null;
  logo_url: string | null;
  main_portal_url: string | null;
  login_url: string | null;
  bill_pay_url: string | null;
  claims_url: string | null;
  documents_url: string | null;
  roadside_url: string | null;
  bill_pay_url_template: string | null;
  claims_url_template: string | null;
  customer_service_phone: string | null;
  claims_phone: string | null;
  roadside_phone: string | null;
  customer_service_hours: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// ACTIVITY LOG
// =============================================================================

export type PortalActivityType = 
  | 'login' | 'logout' | 'login_failed'
  | 'view_policy' | 'view_document' | 'download_document'
  | 'view_id_card' | 'download_id_card' | 'add_to_wallet'
  | 'submit_service_request' | 'submit_quote_request' | 'submit_referral'
  | 'upload_document' | 'click_carrier_link'
  | 'emergency_mode_activated' | 'update_preferences' | 'add_household_member';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type Platform = 'ios' | 'android' | 'web';

export interface PortalActivity {
  id: string;
  portal_user_id: string | null;
  household_member_id: string | null;
  activity_type: string;
  activity_data: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  device_type: DeviceType | null;
  platform: Platform | null;
  processed_for_automation: boolean;
  created_at: string;
}

// =============================================================================
// EMERGENCY LOG
// =============================================================================

export type EmergencyType = 'accident' | 'roadside' | 'theft' | 'damage' | 'weather' | 'other';

export interface EmergencyAction {
  action: string;
  completed_at: string;
}

export interface EmergencyPhoto {
  file_path: string;
  description?: string;
  taken_at: string;
}

export interface EmergencyLog {
  id: string;
  portal_user_id: string;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_meters: number | null;
  location_consent_given: boolean;
  location_consent_timestamp: string | null;
  emergency_type: EmergencyType | null;
  actions_taken: EmergencyAction[];
  photos: EmergencyPhoto[];
  claim_initiated: boolean;
  claim_number: string | null;
  service_request_id: string | null;
  agency_contacted: boolean;
  agency_contacted_at: string | null;
  expires_at: string;
  created_at: string;
}

// =============================================================================
// RPC RESPONSE TYPES
// =============================================================================

export interface DocumentDownloadResponse {
  document_id: string;
  file_path: string;
  document_name: string;
}

export interface IDCardActionResponse {
  card_id: string;
  card_image_path: string | null;
  card_pdf_path: string | null;
  card_data: IDCardData;
  policy_id: string;
}

export interface PortalInvitationCheckResponse {
  allowed: boolean;
  reason: 'existing_user' | 'account_disabled' | 'valid_invitation' | 'household_invitation' | 'no_invitation';
  account_id?: string;
  invitation_id?: string;
  household_member_id?: string;
}
