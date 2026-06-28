import { useState, useEffect, useRef } from 'react';
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
  next_expiration_at?: string | null;
  created_at: string;
  updated_at: string;
  rank?: number;
}

const PAGE_SIZE = 250;

interface CustomerFilters {
  q?: string;
  sort?: string;
  cohort?: string;
  type?: string;
}

export function useUnifiedCustomers() {
  const [customers, setCustomers] = useState<UnifiedCustomer[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active filters + how many rows are loaded, so fetchNextPage pages from the
  // right offset without re-running the whole query.
  const filtersRef = useRef<CustomerFilters>({ q: '', sort: 'updated_at_desc' });
  const loadedRef = useRef(0);

  const buildFilters = (f: CustomerFilters): Record<string, string> => {
    const out: Record<string, string> = { q: f.q ?? '' };
    if (f.cohort && f.cohort !== 'all') out.cohort = f.cohort;
    if (f.type) out.type = f.type;
    return out;
  };

  // Load the FIRST page for a given filter set. Replaces the prior approach of
  // accumulating the entire book on every call (which was heavy and, run twice
  // concurrently, tripped a statement timeout). Cohort and type are applied
  // server-side so the rendered rows match the triage tile / type filter.
  const fetchCustomers = async (searchQuery = '', sort = 'updated_at_desc', cohort?: string, type?: string) => {
    try {
      setLoading(true);
      filtersRef.current = { q: searchQuery, sort, cohort, type };

      const { data, error } = await supabase.rpc('unified_customer_search', {
        p_filters: buildFilters(filtersRef.current),
        p_limit: PAGE_SIZE,
        p_offset: 0,
        p_sort: sort,
      });

      if (error) throw error;

      const rows = data || [];
      setCustomers(rows);
      loadedRef.current = rows.length;
      setHasMore(rows.length === PAGE_SIZE);
      setTotalCount(rows.length);
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

  // Append the next page for the current filter set.
  const fetchNextPage = async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const { data, error } = await supabase.rpc('unified_customer_search', {
        p_filters: buildFilters(filtersRef.current),
        p_limit: PAGE_SIZE,
        p_offset: loadedRef.current,
        p_sort: filtersRef.current.sort ?? 'updated_at_desc',
      });

      if (error) throw error;

      const rows = data || [];
      setCustomers((prev) => [...prev, ...rows]);
      loadedRef.current += rows.length;
      setHasMore(rows.length === PAGE_SIZE);
      setTotalCount(loadedRef.current);
    } catch (err) {
      toast({
        title: "Error loading more customers",
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setLoadingMore(false);
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
    totalCount,
    loading,
    loadingMore,
    hasMore,
    error,
    fetchCustomers,
    fetchNextPage,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    refetch: () => fetchCustomers()
  };
}