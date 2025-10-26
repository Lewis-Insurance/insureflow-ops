// src/types/leadAssignment.ts

export type AssignmentStrategy = 
  | 'round_robin'
  | 'territory' 
  | 'specialty'
  | 'performance'
  | 'workload'
  | 'custom';

export type AssignmentMethod = 'automatic' | 'manual' | 'reassignment';

export interface AssignmentRuleConditions {
  min_lead_score?: number;
  max_lead_score?: number;
  insurance_types?: string[];
  states?: string[];
  zip_codes?: string[];
  premium_min?: number;
  premium_max?: number;
  lead_sources?: string[];
}

export interface AssignmentRule {
  id: string;
  account_id: string;
  name: string;
  description?: string;
  priority: number;
  is_active: boolean;
  assignment_strategy: AssignmentStrategy;
  conditions: AssignmentRuleConditions;
  eligible_users: string[]; // Note: column is "eligible_users" not "eligible_producer_ids"
  last_assigned_to?: string;
  last_assigned_at?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface LeadAssignment {
  id: string;
  lead_id: string;
  assigned_to: string;
  assigned_by?: string;
  assignment_rule_id?: string;
  assignment_method: AssignmentMethod;
  reason?: string;
  created_at: string;
}

export interface ProducerWorkloadStats {
  producer_id: string;
  account_id: string;
  active_leads_count: number;
  pending_tasks_count: number;
  quoted_this_week: number;
  won_this_month: number;
  total_pipeline_value: number;
  avg_response_time_hours?: number;
  last_updated: string;
}

export interface AssignmentRuleCreateInput {
  name: string;
  description?: string;
  priority?: number;
  assignment_strategy: AssignmentStrategy;
  conditions?: AssignmentRuleConditions;
  eligible_users: string[];
}

export interface AssignmentRuleUpdateInput {
  name?: string;
  description?: string;
  priority?: number;
  is_active?: boolean;
  assignment_strategy?: AssignmentStrategy;
  conditions?: AssignmentRuleConditions;
  eligible_users?: string[];
}

export interface LeadAssignmentInput {
  lead_id: string;
  assigned_to: string;
  assignment_rule_id?: string;
  reason?: string;
}
