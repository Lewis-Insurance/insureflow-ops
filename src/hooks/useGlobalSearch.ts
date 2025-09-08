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
    if (!query || typeof query !== 'string' || !query.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // For now, use regular table queries since search_customers RPC may not exist
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id, name, email, phone')
        .ilike('name', `%${query.trim()}%`)
        .limit(10);

      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary, phone_mobile')
        .or(`first_name.ilike.%${query.trim()}%,last_name.ilike.%${query.trim()}%,email_primary.ilike.%${query.trim()}%`)
        .limit(10);

      const results: SearchResult[] = [];
      
      if (accountData) {
        results.push(...accountData.map(account => ({
          entity_type: 'account' as const,
          id: account.id,
          label: account.name || 'Unnamed Account',
          email: account.email,
          phone: account.phone
        })));
      }

      if (contactData) {
        results.push(...contactData.map(contact => ({
          entity_type: 'contact' as const,
          id: contact.id,
          label: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
          email: contact.email_primary,
          phone: contact.phone_mobile
        })));
      }

      const data = results;

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