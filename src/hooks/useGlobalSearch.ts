import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { sanitizeForILike } from '@/lib/sanitize';

export interface SearchResult {
  entity_type: 'contact' | 'account' | 'business' | 'policy';
  id: string;
  label: string;
  email: string | null;
  phone: string | null;
  subtitle?: string;
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
      const sanitizedQuery = sanitizeForILike(trimmedQuery);
      logger.debug('Global search for:', trimmedQuery, 'sanitized:', sanitizedQuery);

      // Search across all entity types
      const [accountResponse, contactResponse, businessResponse, policyResponse] = await Promise.allSettled([
        // Search accounts by name, email, phone, address, notes, zip, tin_last4
        supabase
          .from('accounts')
          .select('id, name, email, phone, city, state, tin_last4, address_line1, address_line2, zip_code, notes')
          .or(`name.ilike.%${sanitizedQuery}%,email.ilike.%${sanitizedQuery}%,phone.ilike.%${sanitizedQuery}%,city.ilike.%${sanitizedQuery}%,state.ilike.%${sanitizedQuery}%,tin_last4.ilike.%${sanitizedQuery}%,address_line1.ilike.%${sanitizedQuery}%,address_line2.ilike.%${sanitizedQuery}%,zip_code.ilike.%${sanitizedQuery}%,notes.ilike.%${sanitizedQuery}%`)
          .is('deleted_at', null)
          .limit(15),

        // Search contacts by name, email, phone, SSN
        supabase
          .from('contacts')
          .select('id, first_name, last_name, email_primary, phone_mobile, phone_home, phone_work, ssn_last4')
          .or(`first_name.ilike.%${sanitizedQuery}%,last_name.ilike.%${sanitizedQuery}%,email_primary.ilike.%${sanitizedQuery}%,phone_mobile.ilike.%${sanitizedQuery}%,phone_home.ilike.%${sanitizedQuery}%,phone_work.ilike.%${sanitizedQuery}%,ssn_last4.ilike.%${sanitizedQuery}%`)
          .is('deleted_at', null)
          .limit(15),

        // Search businesses by legal name, DBA
        supabase
          .from('businesses')
          .select('id, legal_name, dba')
          .or(`legal_name.ilike.%${sanitizedQuery}%,dba.ilike.%${sanitizedQuery}%`)
          .is('deleted_at', null)
          .limit(15),

        // Search policies by policy number, carrier, line of business, named_insured
        supabase
          .from('policies')
          .select(`
            id,
            policy_number,
            carrier,
            line_of_business,
            named_insured,
            account:accounts!policies_account_id_fkey(id, name),
            carrier_info:carriers!policies_carrier_id_fkey(name)
          `)
          .or(`policy_number.ilike.%${sanitizedQuery}%,carrier.ilike.%${sanitizedQuery}%,line_of_business.ilike.%${sanitizedQuery}%,named_insured.ilike.%${sanitizedQuery}%`)
          .limit(15)
      ]);

      const results: SearchResult[] = [];
      
      // Process account results
      if (accountResponse.status === 'fulfilled') {
        if (accountResponse.value.error) {
          logger.error('Account search error:', accountResponse.value.error);
        } else if (accountResponse.value.data) {
          logger.debug('Account results count:', accountResponse.value.data.length);
          results.push(...accountResponse.value.data.map(account => ({
            entity_type: 'account' as const,
            id: account.id,
            label: account.name || 'Unnamed Account',
            email: account.email,
            phone: account.phone,
            subtitle: account.city && account.state ? `${account.city}, ${account.state}` : undefined
          })));
        }
      } else if (accountResponse.status === 'rejected') {
        logger.error('Account search failed:', accountResponse.reason);
      }

      // Process contact results
      if (contactResponse.status === 'fulfilled') {
        if (contactResponse.value.error) {
          logger.error('Contact search error:', contactResponse.value.error);
        } else if (contactResponse.value.data) {
          logger.debug('Contact results count:', contactResponse.value.data.length);
          results.push(...contactResponse.value.data.map(contact => ({
            entity_type: 'contact' as const,
            id: contact.id,
            label: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unnamed Contact',
            email: contact.email_primary,
            phone: contact.phone_mobile || contact.phone_home || contact.phone_work
          })));
        }
      } else if (contactResponse.status === 'rejected') {
        logger.error('Contact search failed:', contactResponse.reason);
      }

      // Process business results
      if (businessResponse.status === 'fulfilled') {
        if (businessResponse.value.error) {
          logger.error('Business search error:', businessResponse.value.error);
        } else if (businessResponse.value.data) {
          logger.debug('Business results count:', businessResponse.value.data.length);
          results.push(...businessResponse.value.data.map(business => ({
            entity_type: 'business' as const,
            id: business.id,
            label: business.legal_name || business.dba || 'Unnamed Business',
            email: null,
            phone: null
          })));
        }
      } else if (businessResponse.status === 'rejected') {
        logger.error('Business search failed:', businessResponse.reason);
      }

      // Process policy results
      if (policyResponse.status === 'fulfilled' && policyResponse.value.data) {
        logger.debug('Policy results:', policyResponse.value.data);
        results.push(...policyResponse.value.data.map(policy => ({
          entity_type: 'policy' as const,
          id: policy.id,
          label: policy.policy_number ? `Policy #${policy.policy_number}` : (policy.named_insured || 'Unnamed Policy'),
          email: null,
          phone: null,
          subtitle: `${policy.carrier_info?.name || policy.carrier || 'Unknown Carrier'} - ${policy.line_of_business || 'Unknown Line'}${policy.account?.name ? ` (${policy.account.name})` : ''}`
        })));
      } else if (policyResponse.status === 'rejected') {
        logger.error('Policy search failed:', policyResponse.reason);
      } else if (policyResponse.status === 'fulfilled' && policyResponse.value.error) {
        logger.error('Policy search error:', policyResponse.value.error);
      }

      logger.debug('Final search results:', results);
      setResults(results);

    } catch (err: any) {
      logger.error('Global search error:', err);
      logger.error('Full error object:', err);
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