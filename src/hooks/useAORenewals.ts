import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { parseLocalDate, todayLocalDate } from "@/lib/date/localDate";

// Types
export type AORenewalStatus =
  | "pending"
  | "contacted"
  | "quoted"
  | "renewed"
  | "lost"
  | "cancelled"
  | "moved";
export type AORenewalPriority = "low" | "normal" | "high" | "urgent";
export type AORenewalTerm = "6_month" | "annual";
export type AORenewalQueue =
  | "all"
  | "active"
  | "needs_first_contact"
  | "needs_quote"
  | "stale_follow_up"
  | "follow_up_due"
  | "expiring_30"
  | "critical_window";

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
  // Follow-up tracking (exactly one active follow-up per renewal)
  follow_up_date: string | null;
  follow_up_reason: string | null;
  // Moved status fields
  moved_carrier: string | null;
  moved_term: AORenewalTerm | null;
  moved_premium: number | null;
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
  upcoming_5_days: number;
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

export interface AORenewalOperationalMetrics {
  daysUntilRenewal: number;
  daysSinceContact: number | null;
  daysUntilFollowUp: number | null;
  isFollowUpOverdue: boolean;
  isFollowUpDueSoon: boolean;
  isPendingInside30Days: boolean;
  isCriticalWindow: boolean;
  staleReason: string | null;
  needsAttention: boolean;
  urgencyRank: number;
}

export interface AORenewalWorkQueueSummary {
  activeCount: number;
  needsFirstContact: number;
  needsQuote: number;
  staleFollowUp: number;
  followUpDue: number;
  expiringIn30Days: number;
  criticalWindow: number;
  onPace: boolean;
  onPaceReason: string;
}

type AORenewalInsert = Omit<AORenewal, "id" | "created_at" | "updated_at">;
type AORenewalUpdate = Partial<Omit<AORenewal, "id" | "created_at" | "updated_at">>;

export const ACTIVE_STATUSES: AORenewalStatus[] = ["pending", "contacted", "quoted"];
export const DEFAULT_HIDDEN_STATUSES: AORenewalStatus[] = ["moved", "cancelled", "lost"];
export const COMPLETED_STATUSES: AORenewalStatus[] = ["renewed", "lost", "cancelled", "moved"];

const startOfToday = () => startOfDay(new Date());

const normalizeDate = (date: string | null | undefined) => {
  if (!date) return null;
  return parseLocalDate(date.slice(0, 10));
};

export const getAORenewalOperationalMetrics = (
  renewal: AORenewal,
  now = new Date(),
): AORenewalOperationalMetrics => {
  const today = startOfDay(now);
  const renewalDate = normalizeDate(renewal.renewal_date) ?? today;
  const lastContactDate = normalizeDate(renewal.last_contact_date);
  const followUpDate = normalizeDate(renewal.follow_up_date);

  const daysUntilRenewal = differenceInCalendarDays(renewalDate, today);
  const daysSinceContact = lastContactDate
    ? differenceInCalendarDays(today, lastContactDate)
    : null;
  const daysUntilFollowUp = followUpDate
    ? differenceInCalendarDays(followUpDate, today)
    : null;

  const isFollowUpOverdue =
    ACTIVE_STATUSES.includes(renewal.status) && daysUntilFollowUp !== null && daysUntilFollowUp < 0;
  const isFollowUpDueSoon =
    ACTIVE_STATUSES.includes(renewal.status) && daysUntilFollowUp !== null && daysUntilFollowUp <= 2;
  const isPendingInside30Days = renewal.status === "pending" && daysUntilRenewal <= 30;
  const isCriticalWindow =
    ["contacted", "quoted"].includes(renewal.status) && daysUntilRenewal <= 5;

  let staleReason: string | null = null;
  if (renewal.status === "contacted" && daysSinceContact !== null && daysSinceContact >= 5) {
    staleReason = `No quote in ${daysSinceContact} days`;
  } else if (renewal.status === "quoted" && daysSinceContact !== null && daysSinceContact >= 3) {
    staleReason = `Quoted ${daysSinceContact} days ago, no follow-up`;
  }

  const missingFollowUp = renewal.status === "quoted" && !followUpDate;

  const needsAttention = Boolean(
    staleReason || isFollowUpOverdue || isPendingInside30Days || isCriticalWindow || missingFollowUp,
  );

  let urgencyRank = 0;
  if (renewal.status === "pending" && daysUntilRenewal <= 30) urgencyRank += 120;
  if (renewal.status === "pending" && daysUntilRenewal <= 14) urgencyRank += 80;
  if (isCriticalWindow) urgencyRank += 70;
  if (isFollowUpOverdue) urgencyRank += 60;
  if (staleReason) urgencyRank += 50;
  if (missingFollowUp) urgencyRank += 30;
  urgencyRank += Math.max(0, 45 - daysUntilRenewal);

  return {
    daysUntilRenewal,
    daysSinceContact,
    daysUntilFollowUp,
    isFollowUpOverdue,
    isFollowUpDueSoon,
    isPendingInside30Days,
    isCriticalWindow,
    staleReason,
    needsAttention,
    urgencyRank,
  };
};

export const getAORenewalWorkQueueSummary = (
  renewals: AORenewal[],
  now = new Date(),
): AORenewalWorkQueueSummary => {
  const active = renewals.filter((renewal) => ACTIVE_STATUSES.includes(renewal.status));
  const metrics = active.map((renewal) => ({
    renewal,
    metrics: getAORenewalOperationalMetrics(renewal, now),
  }));

  const needsFirstContact = metrics.filter(({ renewal }) => renewal.status === "pending").length;
  const needsQuote = metrics.filter(({ renewal }) => renewal.status === "contacted").length;
  const staleFollowUp = metrics.filter(({ metrics }) => Boolean(metrics.staleReason)).length;
  const followUpDue = metrics.filter(({ metrics }) => metrics.isFollowUpOverdue || metrics.isFollowUpDueSoon).length;
  const expiringIn30Days = metrics.filter(({ metrics }) => metrics.daysUntilRenewal <= 30).length;
  const criticalWindow = metrics.filter(({ metrics }) => metrics.isCriticalWindow).length;

  const pendingSoonest = metrics
    .filter(({ renewal }) => renewal.status === "pending")
    .reduce<number | null>((soonest, { metrics }) => {
      if (soonest === null) return metrics.daysUntilRenewal;
      return Math.min(soonest, metrics.daysUntilRenewal);
    }, null);

  const hasOneMonthLead = pendingSoonest === null || pendingSoonest > 30;
  const hasNoNearTermDrift = !metrics.some(
    ({ renewal, metrics }) =>
      ["contacted", "quoted"].includes(renewal.status) && metrics.daysUntilRenewal <= 5,
  );

  const onPace = hasOneMonthLead && hasNoNearTermDrift;
  const onPaceReason = onPace
    ? "Team is at least 30 days ahead and no near-term active files are drifting."
    : !hasOneMonthLead
      ? "There are pending renewals inside the next 30 days."
      : "There are active files inside 5 days that still need movement.";

  return {
    activeCount: active.length,
    needsFirstContact,
    needsQuote,
    staleFollowUp,
    followUpDue,
    expiringIn30Days,
    criticalWindow,
    onPace,
    onPaceReason,
  };
};

export const filterAORenewalsByQueue = (
  renewals: AORenewal[],
  queue: AORenewalQueue,
  now = new Date(),
) => {
  if (queue === "all") return renewals;

  return renewals.filter((renewal) => {
    const metrics = getAORenewalOperationalMetrics(renewal, now);

    switch (queue) {
      case "active":
        return ACTIVE_STATUSES.includes(renewal.status);
      case "needs_first_contact":
        return renewal.status === "pending";
      case "needs_quote":
        return renewal.status === "contacted";
      case "stale_follow_up":
        return Boolean(metrics.staleReason);
      case "follow_up_due":
        return metrics.isFollowUpOverdue || metrics.isFollowUpDueSoon;
      case "expiring_30":
        return ACTIVE_STATUSES.includes(renewal.status) && metrics.daysUntilRenewal <= 30;
      case "critical_window":
        return metrics.isCriticalWindow;
      default:
        return true;
    }
  });
};

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
          `customer_name.ilike.%${filters.search}%,policy_number.ilike.%${filters.search}%`,
        );
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AORenewal[];
    },
  });
};

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

export const useAORenewalsStats = () => {
  return useQuery({
    queryKey: ["ao-renewals-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ao_renewals").select("*");

      if (error) throw error;

      const renewals = data as AORenewal[];
      const now = startOfToday();

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
          moved: 0,
        },
        by_priority: {
          low: 0,
          normal: 0,
          high: 0,
          urgent: 0,
        },
        avg_premium: 0,
        upcoming_5_days: 0,
        upcoming_30_days: 0,
        upcoming_60_days: 0,
        upcoming_90_days: 0,
      };

      renewals.forEach((renewal) => {
        stats.by_status[renewal.status]++;
        stats.by_priority[renewal.priority]++;

        const renewalDate = normalizeDate(renewal.renewal_date) ?? now;
        const daysUntil = differenceInCalendarDays(renewalDate, now);

        if (daysUntil <= 5 && daysUntil >= 0) stats.upcoming_5_days++;
        if (daysUntil <= 30 && daysUntil >= 0) stats.upcoming_30_days++;
        if (daysUntil <= 60 && daysUntil >= 0) stats.upcoming_60_days++;
        if (daysUntil <= 90 && daysUntil >= 0) stats.upcoming_90_days++;
      });

      stats.avg_premium = stats.total_count > 0 ? stats.total_premium / stats.total_count : 0;

      return stats;
    },
  });
};

export const useUpcomingAORenewals = (days: number = 30) => {
  return useQuery({
    queryKey: ["ao-renewals-upcoming", days],
    queryFn: async () => {
      const today = startOfToday();
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
      queryClient.invalidateQueries({ queryKey: ["ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewal", data.id] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals-stats"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-analytics-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["ao-pipeline-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-priority-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-monthly-forecast"] });
      queryClient.invalidateQueries({ queryKey: ["ao-at-risk-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-top-renewals"] });
      toast.success("Renewal updated");
    },
    onError: (error: any) => {
      console.error("Error updating renewal:", error);
      toast.error(error?.message || "Failed to update renewal");
    },
  });
};

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
      toast.success("Renewal deleted");
    },
    onError: (error) => {
      console.error("Error deleting renewal:", error);
      toast.error("Failed to delete renewal");
    },
  });
};

export const useUpdateAORenewalStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AORenewalStatus }) => {
      // Clear follow-up when moving to a terminal status
      const updates: Partial<AORenewal> = { status };
      if (COMPLETED_STATUSES.includes(status)) {
        updates.follow_up_date = null;
        updates.follow_up_reason = null;
      }

      const { data, error } = await supabase
        .from("ao_renewals")
        .update(updates)
        .eq("id", id)
        .select("id, status, customer_name, policy_number")
        .single();

      if (error) throw error;
      return data as AORenewal;
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
      toast.success("Status updated");
    },
    onError: (error: any) => {
      console.error("Error updating status:", error);
      toast.error(error?.message || "Failed to update status");
    },
  });
};

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
      toast.success(`${data.length} renewals updated`);
    },
    onError: (error) => {
      console.error("Error bulk updating renewals:", error);
      toast.error("Failed to update renewals");
    },
  });
};

export const useBulkDeleteAllAORenewals = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ao_renewals")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

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
      toast.success("All renewal data cleared");
    },
    onError: (error) => {
      console.error("Error deleting all renewals:", error);
      toast.error("Failed to clear renewal data");
    },
  });
};

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

      for (const renewal of data) {
        try {
          if (!renewal.customer_name || !renewal.policy_number || !renewal.policy_type || !renewal.renewal_date) {
            result.errors.push(`Missing required fields for renewal: ${renewal.policy_number || "unknown"}`);
            result.failed++;
            continue;
          }

          const { data: existing, error: checkError } = await supabase
            .from("ao_renewals")
            .select("id")
            .eq("policy_number", renewal.policy_number)
            .maybeSingle();

          if (checkError) {
            result.errors.push(`Error checking duplicate for ${renewal.policy_number}: ${checkError.message}`);
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
                result.errors.push(`Error updating ${renewal.policy_number}: ${updateError.message}`);
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
            term_months: null,
            current_carrier: renewal.current_carrier || null,
            status: (renewal.status as AORenewalStatus) || "pending",
            priority: (renewal.priority as AORenewalPriority) || "normal",
            assigned_to: renewal.assigned_to || null,
            notes: renewal.notes || null,
            custom_data: renewal.custom_data || null,
            losses_3yr: renewal.losses_3yr || null,
            oldest_in_household: renewal.oldest_in_household || null,
            last_contact_date: renewal.last_contact_date || null,
            follow_up_date: renewal.follow_up_date || null,
            follow_up_reason: renewal.follow_up_reason || null,
            moved_carrier: renewal.moved_carrier || null,
            moved_term: renewal.moved_term || null,
            moved_premium: renewal.moved_premium || null,
          };

          const { error: insertError } = await supabase.from("ao_renewals").insert([insertData]);

          if (insertError) {
            result.errors.push(`Error inserting ${renewal.policy_number}: ${insertError.message}`);
            result.failed++;
          } else {
            result.successful++;
          }
        } catch (error) {
          result.errors.push(
            `Unexpected error for ${renewal.policy_number}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
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
          `Import completed with ${result.successful} successes and ${result.failed} failures`,
        );
      }
    },
    onError: (error) => {
      console.error("Import failed:", error);
      toast.error("Failed to import renewals. Please try again.");
    },
  });
};
