// ============================================
// LEAD MANAGEMENT TYPES
// Complete TypeScript Interfaces
// ============================================

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'quoted' | 'won' | 'lost' | 'nurturing';

export type LeadSourceType = 
  | 'website' 
  | 'social_media' 
  | 'referral' 
  | 'walk_in' 
  | 'phone' 
  | 'event' 
  | 'purchased_list' 
  | 'other';

export type InsuranceNeedType = 
  | 'auto' 
  | 'home' 
  | 'commercial' 
  | 'life' 
  | 'umbrella' 
  | 'health' 
  | 'renters';

export type DecisionTimeframe = 
  | 'immediate' 
  | 'within_30_days' 
  | 'within_90_days' 
  | 'just_browsing' 
  | 'unknown';

export type ActivityType = 
  | 'call' 
  | 'email' 
  | 'sms' 
  | 'meeting' 
  | 'note' 
  | 'status_change' 
  | 'score_change' 
  | 'assignment_change';

export type AssignmentStrategy = 
  | 'round_robin' 
  | 'territory' 
  | 'specialty' 
  | 'performance' 
  | 'workload' 
  | 'custom';

export type CampaignStatus = 
  | 'active' 
  | 'completed' 
  | 'paused' 
  | 'cancelled' 
  | 'converted';

// Database Interfaces
export interface LeadSource {
  id: string;
  name: string;
  type: LeadSourceType;
  description?: string;
  cost_per_lead: number;
  total_leads: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  account_id?: string | null;
  source_id?: string;
  source_details?: string;
  
  // Lead Information
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  company_name?: string;
  
  // Status & Scoring
  status: LeadStatus;
  lead_score: number;
  assigned_to?: string;
  
  // Insurance Needs - using correct column name
  insurance_types: InsuranceNeedType[];
  current_carrier?: string;
  current_premium?: number;
  estimated_premium?: number;
  decision_timeframe?: DecisionTimeframe;
  
  // Additional Data
  notes?: string;
  tags: string[];
  custom_fields?: Record<string, any>;
  
  // Conversion Tracking
  converted_at?: string;
  converted_account_id?: string;
  won_premium?: number;
  lost_reason?: string;
  lost_reason_details?: string;
  
  // Engagement
  last_contact_at?: string;
  next_follow_up_date?: string;
  contact_count: number;
  email_opens: number;
  email_clicks: number;
  
  // Meta
  created_by?: string;
  created_at: string;
  updated_at: string;
  
  // Relations
  source_name?: string;
  assigned_to_name?: string;
  assigned_producer?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  activity_type: ActivityType;
  subject?: string;
  description: string;
  performed_by?: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface PipelineRule {
  id: string;
  name: string;
  description?: string;
  trigger_stage: LeadStatus;
  trigger_event: string;
  conditions: Record<string, any>;
  actions: PipelineRuleAction[];
  priority: number;
  is_active: boolean;
  execution_count: number;
  last_executed_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PipelineRuleAction {
  type: 'create_task' | 'send_email' | 'send_sms' | 'update_field' | 'assign_to' | 'add_tag';
  params: Record<string, any>;
}

export interface AssignmentRule {
  id: string;
  name: string;
  priority: number;
  conditions: Record<string, any>;
  assignment_strategy: AssignmentStrategy;
  eligible_producers: string[];
  territory_zips: string[];
  specialty_types: string[];
  last_assigned_to?: string;
  last_assigned_at?: string;
  assignment_count: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface NurtureCampaign {
  id: string;
  name: string;
  description?: string;
  campaign_type: string;
  trigger_conditions: Record<string, any>;
  steps: CampaignStep[];
  enrollment_count: number;
  active_count: number;
  completion_count: number;
  conversion_count: number;
  conversion_rate: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignStep {
  delay_hours: number;
  channel: 'email' | 'sms' | 'call' | 'task';
  template_id?: string;
  subject?: string;
  content?: string;
  conditions?: Record<string, any>;
}

export interface CampaignEnrollment {
  id: string;
  campaign_id: string;
  lead_id: string;
  current_step: number;
  total_steps: number;
  status: CampaignStatus;
  emails_sent: number;
  emails_opened: number;
  emails_clicked: number;
  enrolled_at: string;
  completed_at?: string;
  next_step_at?: string;
  last_activity_at?: string;
}

export interface LeadScoreHistory {
  id: string;
  lead_id: string;
  old_score: number;
  new_score: number;
  score_delta: number;
  reason?: string;
  factors?: Record<string, number>;
  created_at: string;
}

export interface LeadDashboardMetrics {
  id: string;
  producer_id?: string;
  metric_date: string;
  
  // Lead Volume
  new_leads: number;
  contacted_leads: number;
  qualified_leads: number;
  quoted_leads: number;
  won_leads: number;
  lost_leads: number;
  
  // Conversion Metrics
  contact_rate: number;
  qualification_rate: number;
  quote_rate: number;
  win_rate: number;
  
  // Financial Metrics
  total_pipeline_value: number;
  won_premium: number;
  avg_deal_size: number;
  
  // Engagement Metrics
  avg_response_time_hours: number;
  avg_time_to_contact_hours: number;
  
  created_at: string;
}

// API Request Types
export interface CreateLeadRequest {
  source_id?: string;
  source_details?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  company_name?: string;
  insurance_types: InsuranceNeedType[];
  current_carrier?: string;
  current_premium?: number;
  estimated_premium?: number;
  decision_timeframe?: DecisionTimeframe;
  notes?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
  assigned_to?: string;
}

export interface UpdateLeadRequest {
  status?: LeadStatus;
  lead_score?: number;
  assigned_to?: string;
  notes?: string;
  tags?: string[];
  next_follow_up_date?: string;
  lost_reason?: string;
  lost_reason_details?: string;
  custom_fields?: Record<string, any>;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

export interface LeadFilters {
  status?: LeadStatus[];
  assigned_to?: string[];
  source_id?: string[];
  lead_score_min?: number;
  lead_score_max?: number;
  insurance_types?: InsuranceNeedType[];
  decision_timeframe?: DecisionTimeframe[];
  created_after?: string;
  created_before?: string;
  search?: string;
}

export interface PipelineStats {
  stage: LeadStatus;
  count: number;
  value: number;
  avg_score: number;
  avg_time_in_stage_days: number;
}

export interface LeadSourcePerformance extends LeadSource {
  conversion_rate: number;
  avg_lead_score: number;
  total_value: number;
  roi: number;
}

// Extended types with relations
export interface LeadWithRelations extends Lead {
  source?: LeadSource;
  assigned_user?: {
    id: string;
    email: string;
    full_name?: string;
  };
  activities?: LeadActivity[];
  score_history?: LeadScoreHistory[];
  campaign_enrollments?: CampaignEnrollment[];
}
