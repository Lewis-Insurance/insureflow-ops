import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addMonths } from "date-fns";

export type LeadFollowupConfirmation = {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_email: string | null;
  lead_phone: string | null;
  insurance_types: string[] | null;
  assigned_to: string | null;
  estimated_effective_date: string | null;
  created_by: string | null;
  status: 'pending' | 'confirmed' | 'dismissed';
  confirmed_at: string | null;
  confirmed_by: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
};

export function usePendingFollowupConfirmations() {
  return useQuery({
    queryKey: ["lead-followup-confirmations", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_followup_confirmations")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as LeadFollowupConfirmation[];
    },
  });
}

export function useCreateFollowupConfirmation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      lead_id: string;
      lead_name: string;
      lead_email?: string;
      lead_phone?: string;
      insurance_types?: string[];
      assigned_to?: string;
      estimated_effective_date?: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data: confirmation, error } = await supabase
        .from("lead_followup_confirmations")
        .insert({
          ...data,
          created_by: user.user?.id,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;
      return confirmation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-followup-confirmations"] });
      toast.success("Follow-up confirmation created");
    },
    onError: (error) => {
      toast.error(`Failed to create confirmation: ${error.message}`);
    },
  });
}

export function useConfirmFollowup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      confirmationId: string;
      assigned_to: string;
      estimated_effective_date: string;
      lead_name: string;
      insurance_types?: string[];
    }) => {
      const { data: user } = await supabase.auth.getUser();
      
      // Calculate due date: 5 months from estimated effective date
      const effectiveDate = new Date(params.estimated_effective_date);
      const dueDate = addMonths(effectiveDate, 5);

      // Create the task
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .insert({
          title: `Follow up with ${params.lead_name} to re-quote insurance`,
          description: `Reach back out to ${params.lead_name} for another chance to re-quote their ${params.insurance_types?.join(', ') || 'insurance'} needs.`,
          assigned_to: params.assigned_to,
          due_date: dueDate.toISOString(),
          priority: "medium",
          status: "pending",
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Update the confirmation record
      const { error: confirmError } = await supabase
        .from("lead_followup_confirmations")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          confirmed_by: user.user?.id,
          task_id: task.id,
          assigned_to: params.assigned_to,
          estimated_effective_date: params.estimated_effective_date,
        })
        .eq("id", params.confirmationId);

      if (confirmError) throw confirmError;

      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-followup-confirmations"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Follow-up task created successfully");
    },
    onError: (error) => {
      toast.error(`Failed to confirm follow-up: ${error.message}`);
    },
  });
}

export function useDismissFollowup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (confirmationId: string) => {
      const { data: user } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("lead_followup_confirmations")
        .update({
          status: "dismissed",
          confirmed_at: new Date().toISOString(),
          confirmed_by: user.user?.id,
        })
        .eq("id", confirmationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-followup-confirmations"] });
      toast.success("Follow-up confirmation dismissed");
    },
    onError: (error) => {
      toast.error(`Failed to dismiss confirmation: ${error.message}`);
    },
  });
}
