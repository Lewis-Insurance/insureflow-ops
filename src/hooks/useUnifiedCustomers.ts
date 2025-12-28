import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface UnifiedCustomer {
  id: string;
  account_id: string;
  name: string;
  display_name: string;
  org_name?: string;
  type: string;
  email?: string;
  phone?: string;
  primary_email?: string;
  primary_phone?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  status: string;
  notes_summary?: string;
  policies_count: number;
  balance?: number;
  last_contact_at?: string;
  created_at: string;
  updated_at: string;
  rank?: number;
}

export function useUnifiedCustomers() {
  const [customers, setCustomers] = useState<UnifiedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = async (searchQuery = '', limit = 25, offset = 0, sort = 'updated_at_desc') => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('unified_customer_search', {
        p_filters: { q: searchQuery },
        p_limit: limit,
        p_offset: offset,
        p_sort: sort
      });

      if (error) throw error;

      setCustomers(data || []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast({
        title: "Error loading customers",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createCustomer = async (customerData: {
    name: string;
    email?: string;
    phone?: string;
    city?: string;
    state?: string;
    type?: string;
    status?: string;
  }) => {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .insert([{
          name: customerData.name,
          email: customerData.email,
          phone: customerData.phone,
          city: customerData.city,
          state: customerData.state,
          type: (customerData.type === 'business' ? 'commercial_business' : 'household'),
          account_status: (customerData.status || 'lead')
        }])
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
    } catch (err) {
      toast({
        title: "Error creating customer",
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateCustomer = async (id: string, updates: Partial<{
    name: string;
    email: string;
    phone: string;
    city: string;
    state: string;
    type: string;
    status: string;
  }>) => {
    try {
      const accountUpdates: Record<string, unknown> = {};
      
      if (updates.name) accountUpdates.name = updates.name;
      if (updates.email) accountUpdates.email = updates.email;
      if (updates.phone) accountUpdates.phone = updates.phone;
      if (updates.city) accountUpdates.city = updates.city;
      if (updates.state) accountUpdates.state = updates.state;
      if (updates.type) accountUpdates.type = updates.type;
      if (updates.status) accountUpdates.account_status = updates.status;

      const { data, error } = await supabase
        .from('accounts')
        .update(accountUpdates)
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
    } catch (err) {
      toast({
        title: "Error updating customer",
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteCustomer = async (id: string) => {
    try {
      const { error } = await supabase
        .from('accounts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Customer deleted",
        description: "Customer has been removed successfully.",
      });

      // Refresh customers list
      await fetchCustomers();
    } catch (err) {
      toast({
        title: "Error deleting customer",
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: "destructive",
      });
      throw err;
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

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