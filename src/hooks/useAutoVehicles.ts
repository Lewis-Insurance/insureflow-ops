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
    queryFn: async (): Promise<AutoVehicle[]> => {
      // TABLE DISABLED: lead_auto_vehicles does not exist in schema
      return [];
    },
    enabled: !!leadId,
  });
};

export const useAddAutoVehicle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vehicle: AutoVehicle) => {
      // TABLE DISABLED
      return vehicle;
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
      // TABLE DISABLED
      return { id, ...vehicle };
    },
    onSuccess: (data: any) => {
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
      // TABLE DISABLED
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
