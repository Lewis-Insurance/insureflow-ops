import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FollowUpRule {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  delay_hours: number;
  max_follow_ups: number;
  follow_up_interval_hours: number;
  action_type: string;
  task_priority?: string;
  min_quote_score?: number;
  max_quote_score?: number;
  line_of_business?: string[];
  carrier_names?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuoteFollowup {
  id: string;
  quote_id: string;
  rule_id?: string;
  scheduled_at: string;
  executed_at?: string;
  next_follow_up_at?: string;
  status: "scheduled" | "pending" | "sent" | "completed" | "cancelled" | "failed";
  task_created_id?: string;
  email_sent_at?: string;
  sms_sent_at?: string;
  notification_created_id?: string;
  follow_up_number: number;
  response_received: boolean;
  response_received_at?: string;
  response_type?: string;
  outcome?: string;
  outcome_notes?: string;
  error_message?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface FollowupWithDetails extends QuoteFollowup {
  rule?: FollowUpRule;
  quote?: {
    id: string;
    quote_ref: string;
    quote_score: number;
    premium: number;
    account?: { name: string };
    carrier_info?: { name: string };
  };
}

/**
 * Hook to fetch active follow-up rules
 */
export function useFollowUpRules() {
  return useQuery({
    queryKey: ["followup-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_followup_rules")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Failed to fetch follow-up rules: ${error.message}`);
      return data as FollowUpRule[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch follow-ups for a specific quote
 */
export function useQuoteFollowups(quoteId: string) {
  return useQuery({
    queryKey: ["quote-followups", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_followups")
        .select(`
          *,
          rule:quote_followup_rules!quote_followups_rule_id_fkey(name, action_type)
        `)
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Failed to fetch follow-ups: ${error.message}`);
      return (data as any) as FollowupWithDetails[];
    },
    enabled: !!quoteId,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch all pending/scheduled follow-ups
 */
export function usePendingFollowups(limit: number = 50) {
  return useQuery({
    queryKey: ["pending-followups", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_followups")
        .select(`
          *,
          rule:quote_followup_rules!quote_followups_rule_id_fkey(*),
          quote:quotes!quote_followups_quote_id_fkey(
            id,
            quote_ref,
            quote_score,
            premium,
            account:accounts!quotes_account_id_fkey(name),
            carrier_info:carriers!quotes_carrier_id_fkey(name)
          )
        `)
        .in("status", ["scheduled", "pending"])
        .order("scheduled_at", { ascending: true })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch pending follow-ups: ${error.message}`);
      return data as FollowupWithDetails[];
    },
    staleTime: 30 * 1000, // 30 seconds - refresh frequently
  });
}

/**
 * Hook to create a follow-up rule
 */
export function useCreateFollowUpRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Partial<FollowUpRule>) => {
      const { data, error } = await supabase
        .from("quote_followup_rules")
        .insert(rule as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-rules"] });
      toast.success("Follow-up rule created successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to create follow-up rule", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to update a follow-up rule
 */
export function useUpdateFollowUpRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<FollowUpRule> }) => {
      const { data, error } = await supabase
        .from("quote_followup_rules")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-rules"] });
      toast.success("Follow-up rule updated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to update follow-up rule", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to toggle rule active status
 */
export function useToggleRuleStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from("quote_followup_rules")
        .update({ is_active: isActive })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["followup-rules"] });
      toast.success(
        variables.isActive
          ? "Follow-up rule activated"
          : "Follow-up rule deactivated"
      );
    },
    onError: (error: Error) => {
      toast.error("Failed to toggle rule status", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to manually trigger follow-up processor
 */
export function useTriggerFollowUpProcessor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params?: { quote_id?: string; force_reprocess?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("process-quote-followups", {
        body: params || {},
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["quote-followups"] });
      queryClient.invalidateQueries({ queryKey: ["pending-followups"] });

      toast.success("Follow-up processor completed", {
        description: `Created: ${data.followups_created}, Executed: ${data.followups_executed}`,
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to process follow-ups", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to mark follow-up response received
 */
export function useMarkFollowupResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      followupId,
      responseType,
      notes,
    }: {
      followupId: string;
      responseType: "accepted" | "rejected" | "requested_changes" | "no_response";
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("quote_followups")
        .update({
          response_received: true,
          response_received_at: new Date().toISOString(),
          response_type: responseType,
          outcome_notes: notes,
          status: "completed",
        })
        .eq("id", followupId)
        .select()
        .single();

      if (error) throw error;

      // Log to history
      await supabase.from("quote_followup_history").insert({
        followup_id: followupId,
        quote_id: data.quote_id,
        event_type: "response_received",
        event_data: { response_type: responseType, notes },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-followups"] });
      queryClient.invalidateQueries({ queryKey: ["pending-followups"] });
      toast.success("Response recorded successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to record response", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to cancel a scheduled follow-up
 */
export function useCancelFollowup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (followupId: string) => {
      const { data, error } = await supabase
        .from("quote_followups")
        .update({ status: "cancelled" })
        .eq("id", followupId)
        .select()
        .single();

      if (error) throw error;

      // Log to history
      await supabase.from("quote_followup_history").insert({
        followup_id: followupId,
        quote_id: data.quote_id,
        event_type: "cancelled",
        event_data: {},
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-followups"] });
      queryClient.invalidateQueries({ queryKey: ["pending-followups"] });
      toast.success("Follow-up cancelled");
    },
    onError: (error: Error) => {
      toast.error("Failed to cancel follow-up", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to get follow-up statistics
 */
export function useFollowUpStats() {
  return useQuery({
    queryKey: ["followup-stats"],
    queryFn: async () => {
      // Get counts by status
      const { data: statusCounts, error: statusError } = await supabase
        .from("quote_followups")
        .select("status", { count: "exact", head: false });

      if (statusError) throw statusError;

      // Get response rate
      const { data: responses, error: responseError } = await supabase
        .from("quote_followups")
        .select("response_received", { count: "exact", head: false })
        .eq("status", "completed");

      if (responseError) throw responseError;

      const totalCompleted = responses?.length || 0;
      const totalResponded = responses?.filter(r => r.response_received).length || 0;

      // Calculate stats
      const stats = {
        scheduled: statusCounts?.filter(s => s.status === "scheduled").length || 0,
        pending: statusCounts?.filter(s => s.status === "pending").length || 0,
        sent: statusCounts?.filter(s => s.status === "sent").length || 0,
        completed: totalCompleted,
        cancelled: statusCounts?.filter(s => s.status === "cancelled").length || 0,
        failed: statusCounts?.filter(s => s.status === "failed").length || 0,
        response_rate: totalCompleted > 0 ? (totalResponded / totalCompleted) * 100 : 0,
      };

      return stats;
    },
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}
