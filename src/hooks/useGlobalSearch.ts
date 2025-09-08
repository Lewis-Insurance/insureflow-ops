import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface SearchResult {
  entity_type: 'contact' | 'account' | 'business';
  id: string;
  label: string;
  email: string | null;
  phone: string | null;
}

export function useGlobalSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: searchError } = await supabase.rpc('search_customers', {
        q: query.trim()
      });

      if (searchError) {
        throw searchError;
      }

      setResults(data || []);
    } catch (err: any) {
      console.error('Global search error:', err);
      setError(err.message || 'Search failed');
      toast({
        title: "Search Error",
        description: err.message || 'Failed to search customers',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    results,
    loading,
    error,
    search,
    clearResults
  };
}