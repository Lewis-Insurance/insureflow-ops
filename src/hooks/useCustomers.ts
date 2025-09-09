import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface Customer {
  account_id: string;
  display_name: string | null;
  org_name: string | null;
  type: string | null;
  city: string | null;
  state: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  policies_count: number | null;
  balance: number | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
  rank?: number;
  // Computed fields for compatibility
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: string;
  notes_summary?: string;
  tags?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

export function useCustomers(accountId?: string) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = async (searchQuery = '', limit = 25, offset = 0) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('customers_search_v1', {
        p_filters: { q: searchQuery },
        p_limit: limit,
        p_offset: offset,
        p_sort: 'updated_at_desc'
      });

      if (error) throw error;
      
      // Transform the data to match our Customer interface
      const transformedData = (data || []).map((row: any) => ({
        ...row,
        id: row.account_id,
        name: row.display_name || row.org_name || 'Unknown',
        email: row.primary_email,
        phone: row.primary_phone,
        status: 'active', // Default status since it's not in the RPC response
        notes_summary: null,
        tags: []
      }));
      
      setCustomers(transformedData);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      toast({
        title: "Error loading customers",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createCustomer = async (customerData: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'tags'>) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([customerData])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Customer created",
        description: `${customerData.name} has been added successfully.`,
      });

      // Refresh customers list
      await fetchCustomers();
      return data;
    } catch (err: any) {
      toast({
        title: "Error creating customer",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Customer updated",
        description: "Customer information has been updated successfully.",
      });

      // Refresh customers list
      await fetchCustomers();
      return data;
    } catch (err: any) {
      toast({
        title: "Error updating customer",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteCustomer = async (id: string) => {
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Customer deleted",
        description: "Customer has been removed successfully.",
      });

      // Refresh customers list
      await fetchCustomers();
    } catch (err: any) {
      toast({
        title: "Error deleting customer",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  useEffect(() => {
    if (accountId) {
      fetchCustomers();
    }
  }, [accountId]);

  return {
    customers,
    loading,
    error,
    fetchCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    refetch: () => fetchCustomers()
  };
}