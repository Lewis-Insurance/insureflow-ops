import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface Customer {
  id: string;
  account_id: string;
  name: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  status: string;
  type: string;
  notes_summary?: string;
  created_at: string;
  updated_at: string;
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
      const { data, error } = await supabase.rpc('customers_search', {
        q: searchQuery || null,
        p_account_id: accountId,
        limit_count: limit,
        offset_count: offset
      });

      if (error) throw error;
      
      // Data comes directly from customers table with correct field names
      setCustomers(data || []);
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
        .from('accounts')
        .insert([{
          name: customerData.name,
          email: customerData.email,
          phone: customerData.phone,
          address_line1: customerData.address_line1,
          address_line2: customerData.address_line2,
          city: customerData.city,
          state: customerData.state,
          zip_code: customerData.postal_code,
          type: customerData.type as any,
          account_status: customerData.status as any,
          notes: customerData.notes_summary
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
        .from('accounts')
        .update({
          name: updates.name,
          email: updates.email,
          phone: updates.phone,
          address_line1: updates.address_line1,
          address_line2: updates.address_line2,
          city: updates.city,
          state: updates.state,
          zip_code: updates.postal_code,
          type: updates.type as any,
          account_status: updates.status as any,
          notes: updates.notes_summary
        })
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