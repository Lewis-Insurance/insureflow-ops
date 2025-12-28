import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from '@/lib/logger';

export type AutoDriver = {
  id?: string;
  lead_id: string;
  account_id?: string;
  driver_name: string;
  driver_dob?: string;
  driver_license?: string;
  driver_relationship?: string;
  is_primary?: boolean;
  accidents_last_3_years?: number;
  violations_last_3_years?: number;
};

export const useAutoDrivers = (leadId: string) => {
  return useQuery({
    queryKey: ['auto-drivers', leadId],
    queryFn: async (): Promise<AutoDriver[]> => {
      const { data, error } = await supabase
        .from('lead_auto_drivers' as any)
        .select('*')
        .eq('lead_id', leadId)
        .order('is_primary', { ascending: false });

      if (error) {
        logger.error('Error fetching auto drivers:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!leadId,
  });
};

export const useAddAutoDriver = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (driver: AutoDriver) => {
      // Clean up empty date strings
      const cleanDriver = {
        ...driver,
        driver_dob: driver.driver_dob && driver.driver_dob.trim() !== '' ? driver.driver_dob : null,
      };

      // If setting as primary, unset other primary drivers
      if (cleanDriver.is_primary) {
        await supabase
          .from('lead_auto_drivers' as any)
          .update({ is_primary: false })
          .eq('lead_id', cleanDriver.lead_id);
      }

      const { data, error } = await supabase
        .from('lead_auto_drivers' as any)
        .insert(cleanDriver)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['auto-drivers', variables.lead_id] });
      toast.success('Driver added successfully');
    },
    onError: (error: any) => {
      logger.error('Error adding driver:', error);
      toast.error(`Failed to add driver: ${error.message}`);
    },
  });
};

export const useUpdateAutoDriver = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...driver }: AutoDriver & { id: string }) => {
      // Clean up empty date strings
      const cleanDriver = {
        ...driver,
        driver_dob: driver.driver_dob && driver.driver_dob.trim() !== '' ? driver.driver_dob : null,
      };

      // If setting as primary, unset other primary drivers
      if (cleanDriver.is_primary) {
        await supabase
          .from('lead_auto_drivers' as any)
          .update({ is_primary: false })
          .eq('lead_id', cleanDriver.lead_id)
          .neq('id', id);
      }

      const { data, error } = await supabase
        .from('lead_auto_drivers' as any)
        .update(cleanDriver)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['auto-drivers', data.lead_id] });
      toast.success('Driver updated successfully');
    },
    onError: (error: any) => {
      logger.error('Error updating driver:', error);
      toast.error(`Failed to update driver: ${error.message}`);
    },
  });
};

export const useDeleteAutoDriver = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, leadId }: { id: string; leadId: string }) => {
      const { error } = await supabase
        .from('lead_auto_drivers' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, leadId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auto-drivers', data.leadId] });
      toast.success('Driver removed successfully');
    },
    onError: (error: any) => {
      logger.error('Error deleting driver:', error);
      toast.error(`Failed to remove driver: ${error.message}`);
    },
  });
};
