import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface Opportunity {
  id: string;
  account_id: string;
  customer_id: string;
  name: string;
  stage: 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
  expected_value?: number;
  close_date?: string;
  source?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export function useOpportunities(customerId?: string) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOpportunities = async () => {
    if (!customerId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOpportunities(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      toast({
        title: "Error loading opportunities",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createOpportunity = async (opportunityData: Omit<Opportunity, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .insert([opportunityData])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Opportunity created",
        description: `${opportunityData.name} has been added successfully.`,
      });

      await fetchOpportunities();
      return data;
    } catch (err: any) {
      toast({
        title: "Error creating opportunity",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateOpportunity = async (id: string, updates: Partial<Opportunity>) => {
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Opportunity updated",
        description: "Opportunity has been updated successfully.",
      });

      await fetchOpportunities();
      return data;
    } catch (err: any) {
      toast({
        title: "Error updating opportunity",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteOpportunity = async (id: string) => {
    try {
      const { error } = await supabase
        .from('opportunities')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Opportunity deleted",
        description: "Opportunity has been removed successfully.",
      });

      await fetchOpportunities();
    } catch (err: any) {
      toast({
        title: "Error deleting opportunity",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  useEffect(() => {
    fetchOpportunities();
  }, [customerId]);

  return {
    opportunities,
    loading,
    error,
    fetchOpportunities,
    createOpportunity,
    updateOpportunity,
    deleteOpportunity,
    refetch: fetchOpportunities
  };
}