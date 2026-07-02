import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface SearchResult {
  entity_type: 'contact' | 'account' | 'business' | 'policy';
  id: string;
  label: string;
  email: string | null;
  phone: string | null;
  subtitle?: string;
}

/**
 * Global search hook using optimized database RPC function
 * Searches across accounts, contacts, businesses, and policies in a single query
 * with proper carrier name resolution via JOIN
 */
export function useGlobalSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request counter: a slow response for "smi" must never overwrite
  // the results for "smith" typed after it (Enter would open the wrong record).
  const requestSeq = useRef(0);

  const search = useCallback(async (query: string) => {
    const seq = ++requestSeq.current;
    if (!query || typeof query !== 'string' || !query.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const trimmedQuery = query.trim();
      logger.debug('Global search for:', trimmedQuery);

      // Use the optimized RPC function for unified search
      const { data, error: rpcError } = await supabase.rpc('global_search_v1', {
        p_search_term: trimmedQuery,
        p_limit: 50
      });

      if (rpcError) {
        logger.error('Global search RPC error:', rpcError);
        throw new Error(rpcError.message);
      }

      // Map RPC results to SearchResult interface
      const searchResults: SearchResult[] = (data || []).map((row: any) => ({
        entity_type: row.entity_type as 'contact' | 'account' | 'business' | 'policy',
        id: row.id,
        label: row.label || 'Unknown',
        email: row.email,
        phone: row.phone,
        subtitle: row.subtitle || undefined
      }));

      logger.debug('Global search results count:', searchResults.length);
      if (seq === requestSeq.current) setResults(searchResults);

    } catch (err: any) {
      if (seq !== requestSeq.current) return; // superseded; a flaky request must not toast-spam
      logger.error('Global search error:', err);
      setError(err.message || 'Search failed');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
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
