// src/integrations/supabase/hooks/useRenewals.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Renewal = Database["public"]["Tables"]["renewals"]["Row"];
type RenewalInsert = Database["public"]["Tables"]["renewals"]["Insert"];
type RenewalUpdate = Database["public"]["Tables"]["renewals"]["Update"];

// ==================== FETCH HOOKS ====================

/**
 * Fetch all renewals with optional filters
 */
export const useRenewals = (filters?: {
  status?: string[];
  riskLevel?: string[];
  assignedTo?: string;
  accountId?: string;
  daysUntilRenewal?: number;
  minRiskScore?: number;
  sortBy?: "renewal_date" | "risk_score" | "updated_at" | "expiration_date";
  sortOrder?: "asc" | "desc";
}) => {
  return useQuery({
    queryKey: ["renewals", filters],
    queryFn: async () => {
      let query = supabase
        .from("renewals")
        .select(
          `
          *,
          account:accounts!renewals_account_id_fkey(
            id,
            name,
            email,
            phone
          ),
          policy:policies!renewals_policy_id_fkey(
            id,
            policy_number,
            carrier,
            policy_type
          ),
          assigned_producer:profiles!renewals_assigned_to_fkey(
            id,
            full_name,
            email
          )
        `
        );

      // Apply filters
      if (filters?.status && filters.status.length > 0) {
        query = query.in("status", filters.status);
      }

      if (filters?.riskLevel && filters.riskLevel.length > 0) {
        query = query.in("risk_level", filters.riskLevel);
      }

      if (filters?.assignedTo) {
        query = query.eq("assigned_to", filters.assignedTo);
      }

      if (filters?.accountId) {
        query = query.eq("account_id", filters.accountId);
      }

      if (filters?.daysUntilRenewal) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + filters.daysUntilRenewal);
        query = query.lte("renewal_date", targetDate.toISOString().split("T")[0]);
      }

      if (filters?.minRiskScore) {
        query = query.gte("risk_score", filters.minRiskScore);
      }

      // Apply sorting
      const sortBy = filters?.sortBy || "renewal_date";
      const sortOrder = filters?.sortOrder || "asc";
      query = query.order(sortBy, { ascending: sortOrder === "asc" });

      const { data, error } = await query;

      if (error) throw error;
      return data as Renewal[];
    },
  });
};

/**
 * Fetch a single renewal by ID with full details
 */
export const useRenewal = (renewalId?: string) => {
  return useQuery({
    queryKey: ["renewal", renewalId],
    queryFn: async () => {
      if (!renewalId) throw new Error("Renewal ID is required");

      const { data, error } = await supabase
        .from("renewals")
        .select(
          `
          *,
          account:accounts!renewals_account_id_fkey(
            id,
            name,
            email,
            phone,
            address
          ),
          policy:policies!renewals_policy_id_fkey(
            id,
            policy_number,
            carrier,
            policy_type,
            effective_date,
            expiration_date,
            premium
          ),
          assigned_producer:profiles!renewals_assigned_to_fkey(
            id,
            full_name,
            email,
            phone
          )
        `
        )
        .eq("id", renewalId)
        .single();

      if (error) throw error;
      return data as Renewal;
    },
    enabled: !!renewalId,
  });
};

/**
 * Fetch renewals by account
 */
export const useAccountRenewals = (accountId?: string) => {
  return useQuery({
    queryKey: ["renewals", "account", accountId],
    queryFn: async () => {
      if (!accountId) throw new Error("Account ID is required");

      const { data, error } = await supabase
        .from("renewals")
        .select(
          `
          *,
          policy:policies!renewals_policy_id_fkey(
            id,
            policy_number,
            carrier,
            policy_type
          ),
          assigned_producer:profiles!renewals_assigned_to_fkey(
            id,
            full_name
          )
        `
        )
        .eq("account_id", accountId)
        .order("renewal_date", { ascending: true });

      if (error) throw error;
      return data as Renewal[];
    },
    enabled: !!accountId,
  });
};

/**
 * Fetch at-risk renewals (risk_score >= 70 or risk_level = 'critical'/'high')
 */
export const useAtRiskRenewals = (assignedTo?: string) => {
  return useQuery({
    queryKey: ["renewals", "at-risk", assignedTo],
    queryFn: async () => {
      let query = supabase
        .from("renewals")
        .select(
          `
          *,
          account:accounts!renewals_account_id_fkey(
            id,
            name,
            email,
            phone
          ),
          policy:policies!renewals_policy_id_fkey(
            id,
            policy_number,
            carrier,
            policy_type
          )
        `
        )
        .in("status", ["upcoming", "in_progress"])
        .or("risk_score.gte.70,risk_level.in.(critical,high)");

      if (assignedTo) {
        query = query.eq("assigned_to", assignedTo);
      }

      query = query.order("risk_score", { ascending: false, nullsFirst: false });

      const { data, error } = await query;

      if (error) throw error;
      return data as Renewal[];
    },
  });
};

/**
 * Fetch upcoming renewals (within specified days)
 */
export const useUpcomingRenewals = (days: number = 30, assignedTo?: string) => {
  return useQuery({
    queryKey: ["renewals", "upcoming", days, assignedTo],
    queryFn: async () => {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + days);

      let query = supabase
        .from("renewals")
        .select(
          `
          *,
          account:accounts!renewals_account_id_fkey(
            id,
            name,
            email,
            phone
          ),
          policy:policies!renewals_policy_id_fkey(
            id,
            policy_number,
            carrier,
            policy_type
          ),
          assigned_producer:profiles!renewals_assigned_to_fkey(
            id,
            full_name
          )
        `
        )
        .gte("renewal_date", today.toISOString().split("T")[0])
        .lte("renewal_date", futureDate.toISOString().split("T")[0])
        .in("status", ["upcoming", "in_progress"]);

      if (assignedTo) {
        query = query.eq("assigned_to", assignedTo);
      }

      query = query.order("renewal_date", { ascending: true });

      const { data, error } = await query;

      if (error) throw error;
      return data as Renewal[];
    },
  });
};

/**
 * Fetch renewals dashboard metrics
 */
export const useRenewalsDashboardMetrics = (assignedTo?: string) => {
  return useQuery({
    queryKey: ["renewals", "dashboard-metrics", assignedTo],
    queryFn: async () => {
      let query = supabase.from("renewals").select("*");

      if (assignedTo) {
        query = query.eq("assigned_to", assignedTo);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Calculate metrics
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

      const metrics = {
        total: data.length,
        upcoming: data.filter(
          (r) =>
            r.status === "upcoming" &&
            new Date(r.renewal_date) >= today &&
            new Date(r.renewal_date) <= thirtyDaysFromNow
        ).length,
        inProgress: data.filter((r) => r.status === "in_progress").length,
        completed: data.filter((r) => r.status === "completed").length,
        lost: data.filter((r) => r.status === "lost").length,
        atRisk: data.filter(
          (r) =>
            (r.risk_score && r.risk_score >= 70) ||
            r.risk_level === "critical" ||
            r.risk_level === "high"
        ).length,
        avgRiskScore:
          data.filter((r) => r.risk_score !== null).length > 0
            ? Math.round(
                data
                  .filter((r) => r.risk_score !== null)
                  .reduce((sum, r) => sum + (r.risk_score || 0), 0) /
                  data.filter((r) => r.risk_score !== null).length
              )
            : 0,
        totalCurrentPremium: data.reduce(
          (sum, r) => sum + (Number(r.current_premium) || 0),
          0
        ),
        totalRenewalPremium: data.reduce(
          (sum, r) => sum + (Number(r.renewal_premium) || 0),
          0
        ),
        withPriceIncrease: data.filter((r) => (r.price_change_pct || 0) > 0).length,
        withPaymentIssues: data.filter((r) => r.has_payment_issues === true).length,
        withRecentClaims: data.filter((r) => r.has_recent_claims === true).length,
      };

      return metrics;
    },
  });
};

// ==================== MUTATION HOOKS ====================

/**
 * Create a new renewal
 */
export const useCreateRenewal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (renewal: RenewalInsert) => {
      const { data, error } = await supabase
        .from("renewals")
        .insert(renewal)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["renewals"] });
      toast.success("Renewal created successfully");
    },
    onError: (error: Error) => {
      console.error("Error creating renewal:", error);
      toast.error("Failed to create renewal");
    },
  });
};

/**
 * Update an existing renewal
 */
export const useUpdateRenewal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: RenewalUpdate;
    }) => {
      const { data, error } = await supabase
        .from("renewals")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["renewals"] });
      queryClient.invalidateQueries({ queryKey: ["renewal", data.id] });
      toast.success("Renewal updated successfully");
    },
    onError: (error: Error) => {
      console.error("Error updating renewal:", error);
      toast.error("Failed to update renewal");
    },
  });
};

/**
 * Delete a renewal
 */
export const useDeleteRenewal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (renewalId: string) => {
      const { error } = await supabase
        .from("renewals")
        .delete()
        .eq("id", renewalId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["renewals"] });
      toast.success("Renewal deleted successfully");
    },
    onError: (error: Error) => {
      console.error("Error deleting renewal:", error);
      toast.error("Failed to delete renewal");
    },
  });
};

/**
 * Update renewal status
 */
export const useUpdateRenewalStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      lostReason,
    }: {
      id: string;
      status: string;
      lostReason?: string;
    }) => {
      const updates: RenewalUpdate = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === "completed") {
        updates.completed_at = new Date().toISOString();
      }

      if (status === "lost" && lostReason) {
        updates.lost_reason = lostReason;
      }

      const { data, error } = await supabase
        .from("renewals")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["renewals"] });
      queryClient.invalidateQueries({ queryKey: ["renewal", data.id] });
      toast.success("Renewal status updated");
    },
    onError: (error: Error) => {
      console.error("Error updating renewal status:", error);
      toast.error("Failed to update renewal status");
    },
  });
};

/**
 * Assign renewal to producer
 */
export const useAssignRenewal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      assignedTo,
    }: {
      id: string;
      assignedTo: string;
    }) => {
      const { data, error } = await supabase
        .from("renewals")
        .update({
          assigned_to: assignedTo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["renewals"] });
      queryClient.invalidateQueries({ queryKey: ["renewal", data.id] });
      toast.success("Renewal assigned successfully");
    },
    onError: (error: Error) => {
      console.error("Error assigning renewal:", error);
      toast.error("Failed to assign renewal");
    },
  });
};

/**
 * Update renewal risk score and factors
 */
export const useUpdateRenewalRisk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      riskScore,
      riskLevel,
      riskFactors,
    }: {
      id: string;
      riskScore: number;
      riskLevel: string;
      riskFactors: any;
    }) => {
      const { data, error } = await supabase
        .from("renewals")
        .update({
          risk_score: riskScore,
          risk_level: riskLevel,
          risk_factors: riskFactors,
          last_risk_calculation: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["renewals"] });
      queryClient.invalidateQueries({ queryKey: ["renewal", data.id] });
    },
    onError: (error: Error) => {
      console.error("Error updating renewal risk:", error);
      toast.error("Failed to update renewal risk");
    },
  });
};

/**
 * Log renewal contact
 */
export const useLogRenewalContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      // First fetch current contact_count
      const { data: currentRenewal, error: fetchError } = await supabase
        .from("renewals")
        .select("contact_count")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      const newContactCount = (currentRenewal.contact_count || 0) + 1;

      const { data, error } = await supabase
        .from("renewals")
        .update({
          last_contact_date: new Date().toISOString(),
          contact_count: newContactCount,
          days_since_last_contact: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["renewals"] });
      queryClient.invalidateQueries({ queryKey: ["renewal", data.id] });
      toast.success("Contact logged");
    },
    onError: (error: Error) => {
      console.error("Error logging contact:", error);
      toast.error("Failed to log contact");
    },
  });
};

/**
 * Bulk update renewals
 */
export const useBulkUpdateRenewals = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ids,
      updates,
    }: {
      ids: string[];
      updates: RenewalUpdate;
    }) => {
      const { data, error } = await supabase
        .from("renewals")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .in("id", ids)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["renewals"] });
      toast.success(`${data.length} renewals updated successfully`);
    },
    onError: (error: Error) => {
      console.error("Error bulk updating renewals:", error);
      toast.error("Failed to update renewals");
    },
  });
};

// ==================== EXPORT ALL ====================

export default {
  useRenewals,
  useRenewal,
  useAccountRenewals,
  useAtRiskRenewals,
  useUpcomingRenewals,
  useRenewalsDashboardMetrics,
  useCreateRenewal,
  useUpdateRenewal,
  useDeleteRenewal,
  useUpdateRenewalStatus,
  useAssignRenewal,
  useUpdateRenewalRisk,
  useLogRenewalContact,
  useBulkUpdateRenewals,
};
