// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

export type TriggerType =
  | "document_analysis_complete"
  | "coverage_gap_identified"
  | "renewal_risk_alert"
  | "lead_score_increase"
  | "policy_expiring_soon"
  | "quote_expired"
  | "customer_interaction"
  | "claim_filed"
  | "payment_overdue";

export interface TaskGenerationRule {
  id: string;
  name: string;
  description?: string;
  trigger_type: TriggerType;
  conditions: any;
  task_title_template: string;
  task_description_template?: string;
  task_type?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  assign_to_type?: "creator" | "account_owner" | "specific_user" | "role" | "ai_suggestion";
  assign_to_user_id?: string;
  assign_to_role?: string;
  due_in_days?: number;
  due_in_hours?: number;
  tags?: string[];
  ai_prompt?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface GeneratedTaskLog {
  id: string;
  task_id?: string;
  rule_id?: string;
  trigger_type: TriggerType;
  trigger_entity_type?: string;
  trigger_entity_id?: string;
  trigger_data: any;
  was_ai_enhanced: boolean;
  ai_context?: string;
  ai_suggestions?: any;
  assigned_to?: string;
  assignment_reason?: string;
  generation_status: "pending" | "success" | "failed" | "skipped";
  generation_error?: string;
  was_helpful?: boolean;
  user_feedback?: string;
  created_at: string;
  completed_at?: string;
}

export interface GenerateTaskParams {
  triggerType: TriggerType;
  triggerData: {
    account_id?: string;
    customer_name?: string;
    entity_type?: string;
    entity_id?: string;
    [key: string]: any;
  };
  ruleId?: string;
  enhanceWithAI?: boolean;
}

export interface TaskGenerationAnalytics {
  date: string;
  trigger_type: TriggerType;
  rule_id?: string;
  generation_status: string;
  total_attempts: number;
  successful_generations: number;
  failed_generations: number;
  success_rate: number;
  ai_enhanced_count: number;
  ai_enhancement_rate: number;
  helpful_count: number;
  not_helpful_count: number;
  helpfulness_rate: number;
  unique_assignees: number;
}

// ============================================================================
// Hooks for Task Generation Rules
// ============================================================================

/**
 * Get all task generation rules
 */
export function useTaskGenerationRules(activeOnly: boolean = false) {
  return useQuery({
    queryKey: ["task-generation-rules", activeOnly],
    queryFn: async () => {
      let query = supabase.from("task_generation_rules").select("*").order("created_at", { ascending: false });

      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;

      if (error) throw new Error(`Failed to fetch rules: ${error.message}`);
      return data as TaskGenerationRule[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get rules by trigger type
 */
export function useRulesByTriggerType(triggerType: TriggerType) {
  return useQuery({
    queryKey: ["task-generation-rules", "trigger", triggerType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_generation_rules")
        .select("*")
        .eq("trigger_type", triggerType)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Failed to fetch rules: ${error.message}`);
      return data as TaskGenerationRule[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Create new task generation rule
 */
export function useCreateTaskGenerationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Partial<TaskGenerationRule>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("task_generation_rules")
        .insert({
          ...rule,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create rule: ${error.message}`);
      return data as TaskGenerationRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-generation-rules"] });
      toast.success("Task generation rule created successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to create rule", {
        description: error.message,
      });
    },
  });
}

/**
 * Update task generation rule
 */
export function useUpdateTaskGenerationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TaskGenerationRule> }) => {
      const { data, error } = await supabase
        .from("task_generation_rules")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update rule: ${error.message}`);
      return data as TaskGenerationRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-generation-rules"] });
      toast.success("Task generation rule updated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to update rule", {
        description: error.message,
      });
    },
  });
}

/**
 * Delete task generation rule
 */
export function useDeleteTaskGenerationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_generation_rules").delete().eq("id", id);

      if (error) throw new Error(`Failed to delete rule: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-generation-rules"] });
      toast.success("Task generation rule deleted successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete rule", {
        description: error.message,
      });
    },
  });
}

// ============================================================================
// Hooks for Task Generation
// ============================================================================

/**
 * Generate task(s) from trigger
 */
export function useGenerateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: GenerateTaskParams) => {
      const { data, error } = await supabase.functions.invoke("ai-task-generator", {
        body: params,
      });

      if (error) throw new Error(`Task generation failed: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["generated-tasks-log"] });

      if (data.generatedTasks && data.generatedTasks.length > 0) {
        toast.success(`Generated ${data.generatedTasks.length} task(s)`, {
          description: data.generatedTasks.map((t: any) => t.taskTitle).join(", "),
        });
      } else {
        toast.info("No tasks generated", {
          description: "No matching rules found or conditions not met",
        });
      }
    },
    onError: (error: Error) => {
      toast.error("Failed to generate task", {
        description: error.message,
      });
    },
  });
}

/**
 * Silent task generation (no toast notifications)
 * Use for background automation
 */
export function useGenerateTaskSilent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: GenerateTaskParams) => {
      const { data, error } = await supabase.functions.invoke("ai-task-generator", {
        body: params,
      });

      if (error) throw new Error(`Task generation failed: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["generated-tasks-log"] });
    },
    onError: (error: Error) => {
      console.error("Silent task generation failed:", error);
    },
  });
}

// ============================================================================
// Hooks for Generated Tasks Log
// ============================================================================

/**
 * Get generated tasks log
 */
export function useGeneratedTasksLog(limit: number = 100) {
  return useQuery({
    queryKey: ["generated-tasks-log", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_tasks_log")
        .select("*, task:tasks(*), rule:task_generation_rules(name)")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch log: ${error.message}`);
      return data;
    },
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

/**
 * Get log by task ID
 */
export function useTaskGenerationLog(taskId: string | null) {
  return useQuery({
    queryKey: ["generated-tasks-log", taskId],
    queryFn: async () => {
      if (!taskId) return null;

      const { data, error } = await supabase
        .from("generated_tasks_log")
        .select("*, rule:task_generation_rules(*)")
        .eq("task_id", taskId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw new Error(`Failed to fetch log: ${error.message}`);
      }
      return data as GeneratedTaskLog;
    },
    enabled: !!taskId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Update task feedback
 */
export function useUpdateTaskFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      logId,
      wasHelpful,
      feedback,
    }: {
      logId: string;
      wasHelpful: boolean;
      feedback?: string;
    }) => {
      const { data, error } = await supabase
        .from("generated_tasks_log")
        .update({
          was_helpful: wasHelpful,
          user_feedback: feedback,
        })
        .eq("id", logId)
        .select()
        .single();

      if (error) throw new Error(`Failed to update feedback: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-tasks-log"] });
      toast.success("Feedback recorded");
    },
    onError: (error: Error) => {
      toast.error("Failed to record feedback", {
        description: error.message,
      });
    },
  });
}

// ============================================================================
// Hooks for Analytics
// ============================================================================

/**
 * Get task generation analytics
 */
export function useTaskGenerationAnalytics(days: number = 30) {
  return useQuery({
    queryKey: ["task-generation-analytics", days],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from("task_generation_analytics")
        .select("*")
        .gte("date", startDate.toISOString())
        .order("date", { ascending: false });

      if (error) throw new Error(`Failed to fetch analytics: ${error.message}`);
      return data as TaskGenerationAnalytics[];
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

/**
 * Refresh task generation analytics
 */
export function useRefreshTaskGenerationAnalytics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("refresh_task_generation_analytics");
      if (error) throw new Error(`Failed to refresh analytics: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-generation-analytics"] });
      toast.success("Analytics refreshed successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to refresh analytics", {
        description: error.message,
      });
    },
  });
}

// ============================================================================
// Helper Hooks
// ============================================================================

/**
 * Get generation statistics by trigger type
 */
export function useGenerationStatsByTrigger(triggerType: TriggerType) {
  return useQuery({
    queryKey: ["task-generation-stats", triggerType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_tasks_log")
        .select("generation_status, was_helpful")
        .eq("trigger_type", triggerType);

      if (error) throw new Error(`Failed to fetch stats: ${error.message}`);

      const stats = {
        total: data.length,
        success: data.filter((l) => l.generation_status === "success").length,
        failed: data.filter((l) => l.generation_status === "failed").length,
        helpful: data.filter((l) => l.was_helpful === true).length,
        notHelpful: data.filter((l) => l.was_helpful === false).length,
      };

      return stats;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
