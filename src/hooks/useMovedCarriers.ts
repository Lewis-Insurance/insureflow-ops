import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from '@/lib/logger';

export interface MovedCarrier {
  id: string;
  name: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Hook to fetch the list of carriers that policies can be moved to.
 * Only returns active carriers, sorted by display_order.
 */
export function useMovedCarriers() {
  return useQuery({
    queryKey: ["moved-carriers"],
    queryFn: async (): Promise<MovedCarrier[]> => {
      const { data, error } = await supabase
        .from("ao_moved_carriers")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) {
        logger.error("Error fetching moved carriers:", error);
        throw error;
      }

      return (data || []) as MovedCarrier[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - carriers don't change often
  });
}

/**
 * Hook to fetch all carriers (including inactive) for admin management.
 */
export function useAllMovedCarriers() {
  return useQuery({
    queryKey: ["moved-carriers-all"],
    queryFn: async (): Promise<MovedCarrier[]> => {
      const { data, error } = await supabase
        .from("ao_moved_carriers")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) {
        logger.error("Error fetching all moved carriers:", error);
        throw error;
      }

      return (data || []) as MovedCarrier[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to add a new carrier to the moved carriers list.
 */
export function useAddMovedCarrier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string): Promise<MovedCarrier> => {
      // Get the next display order
      const { data: existing } = await supabase
        .from("ao_moved_carriers")
        .select("display_order")
        .order("display_order", { ascending: false })
        .limit(1);

      const nextOrder = existing && existing.length > 0
        ? (existing[0].display_order || 0) + 1
        : 0;

      const { data, error } = await supabase
        .from("ao_moved_carriers")
        .insert([{ name, display_order: nextOrder }])
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error("A carrier with this name already exists");
        }
        throw error;
      }

      return data as MovedCarrier;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moved-carriers"] });
      queryClient.invalidateQueries({ queryKey: ["moved-carriers-all"] });
      toast.success("Carrier added successfully");
    },
    onError: (error) => {
      logger.error("Error adding carrier:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add carrier");
    },
  });
}

/**
 * Hook to update a carrier.
 */
export function useUpdateMovedCarrier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<MovedCarrier, "name" | "is_active" | "display_order">>;
    }): Promise<MovedCarrier> => {
      const { data, error } = await supabase
        .from("ao_moved_carriers")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error("A carrier with this name already exists");
        }
        throw error;
      }

      return data as MovedCarrier;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moved-carriers"] });
      queryClient.invalidateQueries({ queryKey: ["moved-carriers-all"] });
      toast.success("Carrier updated successfully");
    },
    onError: (error) => {
      logger.error("Error updating carrier:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update carrier");
    },
  });
}

/**
 * Hook to delete a carrier.
 */
export function useDeleteMovedCarrier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("ao_moved_carriers")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moved-carriers"] });
      queryClient.invalidateQueries({ queryKey: ["moved-carriers-all"] });
      toast.success("Carrier deleted successfully");
    },
    onError: (error) => {
      logger.error("Error deleting carrier:", error);
      toast.error("Failed to delete carrier");
    },
  });
}
