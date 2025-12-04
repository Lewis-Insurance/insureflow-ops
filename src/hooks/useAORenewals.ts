import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Types
export type AORenewalStatus = "pending" | "contacted" | "quoted" | "renewed" | "lost" | "cancelled";
export type AORenewalPriority = "low" | "normal" | "high" | "urgent";

export interface AORenewalCustomData {
  loss_count?: string;
  potential_discount?: string;
  supporting_policies?: string;
  oldest_age?: string;
  insurance_score?: string;
  [key: string]: any;
}

export interface AORenewal {
  id: string;
  account_id: string | null;
  customer_name: string;
  policy_number: string;
  policy_type: string;
  renewal_date: string;
  current_premium: number | null;
  term_months: 6 | 12 | null;
  current_carrier: string | null;
  status: AORenewalStatus;
  priority: AORenewalPriority;
  assigned_to: string | null;
  notes: string | null;
  custom_data: AORenewalCustomData | null;
  losses_3yr: number | null;
  oldest_in_household: number | null;
  created_at: string;
  updated_at: string;
  last_contact_date: string | null;
}

export interface AORenewalFilters {
  status?: AORenewalStatus[];
  priority?: AORenewalPriority[];
  assigned_to?: string;
  policy_type?: string;
  renewal_date_from?: string;
  renewal_date_to?: string;
  min_premium?: number;
  max_premium?: number;
  search?: string;
}

export interface AORenewalStats {
  total_count: number;
  total_premium: number;
  by_status: Record<AORenewalStatus, number>;
  by_priority: Record<AORenewalPriority, number>;
  avg_premium: number;
  upcoming_30_days: number;
  upcoming_60_days: number;
  upcoming_90_days: number;
}

export interface ImportResult {
  successful: number;
  failed: number;
  duplicates: number;
  errors: string[];
}

type AORenewalInsert = Omit<AORenewal, "id" | "created_at" | "updated_at">;
type AORenewalUpdate = Partial<Omit<AORenewal, "id" | "created_at" | "updated_at">>;

// Fetch all renewals with filters
export const useAORenewals = (filters?: AORenewalFilters) => {
  return useQuery({
    queryKey: ["ao-renewals", filters],
    queryFn: async () => {
      let query = supabase
        .from("ao_renewals")
        .select("*")
        .order("renewal_date", { ascending: true });

      if (filters?.status?.length) {
        query = query.in("status", filters.status);
      }

      if (filters?.priority?.length) {
        query = query.in("priority", filters.priority);
      }

      if (filters?.assigned_to) {
        query = query.eq("assigned_to", filters.assigned_to);
      }

      if (filters?.policy_type) {
        query = query.eq("policy_type", filters.policy_type);
      }

      if (filters?.renewal_date_from) {
        query = query.gte("renewal_date", filters.renewal_date_from);
      }

      if (filters?.renewal_date_to) {
        query = query.lte("renewal_date", filters.renewal_date_to);
      }

      if (filters?.min_premium) {
        query = query.gte("current_premium", filters.min_premium);
      }

      if (filters?.max_premium) {
        query = query.lte("current_premium", filters.max_premium);
      }

      if (filters?.search) {
        query = query.or(
          `customer_name.ilike.%${filters.search}%,policy_number.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AORenewal[];
    },
  });
};

// Fetch single renewal by ID
export const useAORenewal = (id: string | null | undefined) => {
  return useQuery({
    queryKey: ["ao-renewal", id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("ao_renewals")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as AORenewal;
    },
    enabled: !!id,
  });
};

// Fetch renewal statistics
export const useAORenewalsStats = () => {
  return useQuery({
    queryKey: ["ao-renewals-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ao_renewals").select("*");

      if (error) throw error;

      const renewals = data as AORenewal[];
      const now = new Date();

      const stats: AORenewalStats = {
        total_count: renewals.length,
        total_premium: renewals.reduce((sum, r) => sum + (r.current_premium || 0), 0),
        by_status: {
          pending: 0,
          contacted: 0,
          quoted: 0,
          renewed: 0,
          lost: 0,
          cancelled: 0,
        },
        by_priority: {
          low: 0,
          normal: 0,
          high: 0,
          urgent: 0,
        },
        avg_premium: 0,
        upcoming_30_days: 0,
        upcoming_60_days: 0,
        upcoming_90_days: 0,
      };

      renewals.forEach((renewal) => {
        stats.by_status[renewal.status]++;
        stats.by_priority[renewal.priority]++;

        const renewalDate = new Date(renewal.renewal_date);
        const daysUntil = Math.floor(
          (renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntil <= 30 && daysUntil >= 0) stats.upcoming_30_days++;
        if (daysUntil <= 60 && daysUntil >= 0) stats.upcoming_60_days++;
        if (daysUntil <= 90 && daysUntil >= 0) stats.upcoming_90_days++;
      });

      stats.avg_premium = stats.total_count > 0 ? stats.total_premium / stats.total_count : 0;

      return stats;
    },
  });
};

// Fetch upcoming renewals
export const useUpcomingAORenewals = (days: number = 30) => {
  return useQuery({
    queryKey: ["ao-renewals-upcoming", days],
    queryFn: async () => {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + days);

      const { data, error } = await supabase
        .from("ao_renewals")
        .select("*")
        .gte("renewal_date", today.toISOString().split("T")[0])
        .lte("renewal_date", futureDate.toISOString().split("T")[0])
        .order("renewal_date", { ascending: true });

      if (error) throw error;
      return data as AORenewal[];
    },
  });
};

// Create renewal
export const useCreateAORenewal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (renewal: AORenewalInsert) => {
      const { data, error } = await supabase
        .from("ao_renewals")
        .insert([renewal])
        .select()
        .single();

      if (error) throw error;
      return data as AORenewal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals-stats"] });
      toast.success("Renewal created successfully");
    },
    onError: (error) => {
      console.error("Error creating renewal:", error);
      toast.error("Failed to create renewal");
    },
  });
};

// Update renewal
export const useUpdateAORenewal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: AORenewalUpdate }) => {
      const { data, error } = await supabase
        .from("ao_renewals")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as AORenewal;
    },
    onSuccess: (data) => {
      // Invalidate all renewal-related queries
      queryClient.invalidateQueries({ queryKey: ["ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewal", data.id] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals-stats"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-ao-renewals"] });
      
      // Invalidate analytics queries
      queryClient.invalidateQueries({ queryKey: ["ao-analytics-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["ao-pipeline-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-priority-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-monthly-forecast"] });
      queryClient.invalidateQueries({ queryKey: ["ao-at-risk-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-top-renewals"] });
      
      toast.success("Renewal updated successfully");
    },
    onError: (error) => {
      console.error("Error updating renewal:", error);
      toast.error("Failed to update renewal");
    },
  });
};

// Delete renewal
export const useDeleteAORenewal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ao_renewals").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals-stats"] });
      toast.success("Renewal deleted successfully");
    },
    onError: (error) => {
      console.error("Error deleting renewal:", error);
      toast.error("Failed to delete renewal");
    },
  });
};

// Update renewal status
export const useUpdateAORenewalStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AORenewalStatus }) => {
      const { data, error } = await supabase
        .from("ao_renewals")
        .update({ status })
        .eq("id", id)
        .select('id, status, customer_name, policy_number')
        .single();

      if (error) throw error;
      return data as AORenewal;
    },
    onSuccess: () => {
      // Invalidate all renewal-related queries
      queryClient.invalidateQueries({ queryKey: ["ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals-stats"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-ao-renewals"] });
      
      // Invalidate analytics queries
      queryClient.invalidateQueries({ queryKey: ["ao-analytics-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["ao-pipeline-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-priority-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-monthly-forecast"] });
      queryClient.invalidateQueries({ queryKey: ["ao-at-risk-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-top-renewals"] });
      toast.success("Status updated successfully");
    },
    onError: (error) => {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    },
  });
};

// Bulk update renewals
export const useBulkUpdateAORenewals = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: AORenewalUpdate }) => {
      const { data, error } = await supabase
        .from("ao_renewals")
        .update(updates)
        .in("id", ids)
        .select();

      if (error) throw error;
      return data as AORenewal[];
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals-stats"] });
      toast.success(`${data.length} renewals updated successfully`);
    },
    onError: (error) => {
      console.error("Error bulk updating renewals:", error);
      toast.error("Failed to update renewals");
    },
  });
};

// Bulk delete all renewals
export const useBulkDeleteAllAORenewals = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ao_renewals")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all records

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals-stats"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-analytics-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["ao-pipeline-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-priority-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-monthly-forecast"] });
      queryClient.invalidateQueries({ queryKey: ["ao-at-risk-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-top-renewals"] });
      toast.success("All renewal data cleared successfully");
    },
    onError: (error) => {
      console.error("Error deleting all renewals:", error);
      toast.error("Failed to clear renewal data");
    },
  });
};

// Bulk import renewals
export const useImportAORenewals = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      data,
      filename,
      importType = "initial",
    }: {
      data: Partial<AORenewal>[];
      filename: string;
      importType?: "initial" | "update";
    }): Promise<ImportResult> => {
      const result: ImportResult = {
        successful: 0,
        failed: 0,
        duplicates: 0,
        errors: [],
      };

      // No authentication required for ao_renewals imports

      for (const renewal of data) {
        try {
          if (!renewal.customer_name || !renewal.policy_number || !renewal.policy_type || !renewal.renewal_date) {
            result.errors.push(`Missing required fields for renewal: ${renewal.policy_number || 'unknown'}`);
            result.failed++;
            continue;
          }

          const { data: existing, error: checkError } = await supabase
            .from("ao_renewals")
            .select("id")
            .eq("policy_number", renewal.policy_number)
            .maybeSingle();

          if (checkError) {
            console.error("Error checking for duplicates:", checkError);
            result.errors.push(
              `Error checking duplicate for ${renewal.policy_number}: ${checkError.message}`
            );
            result.failed++;
            continue;
          }

          if (existing) {
            if (importType === "update") {
              const { error: updateError } = await supabase
                .from("ao_renewals")
                .update(renewal)
                .eq("id", existing.id);

              if (updateError) {
                console.error("Error updating renewal:", updateError);
                result.errors.push(
                  `Error updating ${renewal.policy_number}: ${updateError.message}`
                );
                result.failed++;
              } else {
                result.successful++;
              }
            } else {
              result.duplicates++;
            }
            continue;
          }

          const insertData: AORenewalInsert = {
            account_id: renewal.account_id || null,
            customer_name: renewal.customer_name,
            policy_number: renewal.policy_number,
            policy_type: renewal.policy_type,
            renewal_date: renewal.renewal_date,
            current_premium: renewal.current_premium || null,
            term_months: null, // User will set this manually
            current_carrier: renewal.current_carrier || null,
            status: (renewal.status as AORenewalStatus) || "pending",
            priority: (renewal.priority as AORenewalPriority) || "normal",
            assigned_to: renewal.assigned_to || null,
            notes: renewal.notes || null,
            custom_data: renewal.custom_data || null,
            losses_3yr: renewal.losses_3yr || null,
            oldest_in_household: renewal.oldest_in_household || null,
            last_contact_date: renewal.last_contact_date || null,
          };

          const { error: insertError } = await supabase
            .from("ao_renewals")
            .insert([insertData]);

          if (insertError) {
            console.error("Error inserting renewal:", insertError);
            result.errors.push(
              `Error inserting ${renewal.policy_number}: ${insertError.message}`
            );
            result.failed++;
          } else {
            result.successful++;
          }
        } catch (error) {
          console.error("Unexpected error processing renewal:", error);
          result.errors.push(
            `Unexpected error for ${renewal.policy_number}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
          result.failed++;
        }
      }

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals-stats"] });
      
      if (result.failed === 0) {
        toast.success(`Successfully imported ${result.successful} renewals!`);
      } else {
        toast.warning(
          `Import completed with ${result.successful} successes and ${result.failed} failures`
        );
      }
    },
    onError: (error) => {
      console.error("Import failed:", error);
      toast.error("Failed to import renewals. Please try again.");
    },
  });
};
