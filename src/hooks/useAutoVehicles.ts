import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AutoVehicle = {
  id?: string;
  lead_id: string;
  account_id?: string;
  vehicle_year?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_vin?: string;
  vehicle_usage?: 'personal' | 'business' | 'pleasure';
  annual_mileage?: number;
  current_liability_limits?: string;
  current_collision_deductible?: number;
  current_comprehensive_deductible?: number;
  uninsured_motorist?: boolean;
  rental_reimbursement?: boolean;
  roadside_assistance?: boolean;
};

export const useAutoVehicles = (leadId: string) => {
  return useQuery({
    queryKey: ['auto-vehicles', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_auto_vehicles')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as AutoVehicle[];
    },
    enabled: !!leadId,
  });
};

export const useAddAutoVehicle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vehicle: AutoVehicle) => {
      const { data, error } = await supabase
        .from('lead_auto_vehicles')
        .insert(vehicle)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['auto-vehicles', variables.lead_id] });
      toast.success('Vehicle added successfully');
    },
    onError: (error: any) => {
      console.error('Error adding vehicle:', error);
      toast.error(`Failed to add vehicle: ${error.message}`);
    },
  });
};

export const useUpdateAutoVehicle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...vehicle }: AutoVehicle & { id: string }) => {
      const { data, error } = await supabase
        .from('lead_auto_vehicles')
        .update(vehicle)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auto-vehicles', data.lead_id] });
      toast.success('Vehicle updated successfully');
    },
    onError: (error: any) => {
      console.error('Error updating vehicle:', error);
      toast.error(`Failed to update vehicle: ${error.message}`);
    },
  });
};

export const useDeleteAutoVehicle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, leadId }: { id: string; leadId: string }) => {
      const { error } = await supabase
        .from('lead_auto_vehicles')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, leadId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auto-vehicles', data.leadId] });
      toast.success('Vehicle removed successfully');
    },
    onError: (error: any) => {
      console.error('Error deleting vehicle:', error);
      toast.error(`Failed to remove vehicle: ${error.message}`);
    },
  });
};
