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

      const trimmedQuery = query.trim();
      console.log('Searching for:', trimmedQuery);

      // Fallback to manual search with broader criteria
      const [accountResponse, contactResponse, businessResponse] = await Promise.allSettled([
        // Search accounts by name, email, phone, address, notes, zip, tin_last4
        supabase
          .from('accounts')
          .select('id, name, email, phone, city, state, tin_last4, address_line1, address_line2, zip_code, notes')
          .or(`name.ilike.%${trimmedQuery}%,email.ilike.%${trimmedQuery}%,phone.ilike.%${trimmedQuery}%,city.ilike.%${trimmedQuery}%,state.ilike.%${trimmedQuery}%,tin_last4.ilike.%${trimmedQuery}%,address_line1.ilike.%${trimmedQuery}%,address_line2.ilike.%${trimmedQuery}%,zip_code.ilike.%${trimmedQuery}%,notes.ilike.%${trimmedQuery}%`)
          .is('deleted_at', null)
          .limit(10),

        // Search contacts by name, email, phone, SSN, date of birth, address data
        supabase
          .from('contacts')
          .select('id, first_name, last_name, email_primary, phone_mobile, phone_home, phone_work, ssn_last4, date_of_birth')
          .or(`first_name.ilike.%${trimmedQuery}%,last_name.ilike.%${trimmedQuery}%,email_primary.ilike.%${trimmedQuery}%,phone_mobile.ilike.%${trimmedQuery}%,phone_home.ilike.%${trimmedQuery}%,phone_work.ilike.%${trimmedQuery}%,ssn_last4.ilike.%${trimmedQuery}%,date_of_birth::text.ilike.%${trimmedQuery}%`)
          .is('deleted_at', null)
          .limit(10),

        // Search businesses by legal name, DBA, and addresses if available
        supabase
          .from('businesses')
          .select('id, legal_name, dba')
          .or(`legal_name.ilike.%${trimmedQuery}%,dba.ilike.%${trimmedQuery}%`)
          .is('deleted_at', null)
          .limit(10)
      ]);

      const results: SearchResult[] = [];
      
      // Process account results
      if (accountResponse.status === 'fulfilled' && accountResponse.value.data) {
        console.log('Account results:', accountResponse.value.data);
        results.push(...accountResponse.value.data.map(account => ({
          entity_type: 'account' as const,
          id: account.id,
          label: account.name || 'Unnamed Account',
          email: account.email,
          phone: account.phone
        })));
      }

      // Process contact results
      if (contactResponse.status === 'fulfilled' && contactResponse.value.data) {
        console.log('Contact results:', contactResponse.value.data);
        results.push(...contactResponse.value.data.map(contact => ({
          entity_type: 'contact' as const,
          id: contact.id,
          label: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unnamed Contact',
          email: contact.email_primary,
          phone: contact.phone_mobile || contact.phone_home || contact.phone_work
        })));
      }

      // Process business results
      if (businessResponse.status === 'fulfilled' && businessResponse.value.data) {
        console.log('Business results:', businessResponse.value.data);
        results.push(...businessResponse.value.data.map(business => ({
          entity_type: 'business' as const,
          id: business.id,
          label: business.legal_name || business.dba || 'Unnamed Business',
          email: null,
          phone: null
        })));
      }

      console.log('Final search results:', results);
      setResults(results);

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