import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { usePermissions } from './usePermissions';

export function useSSNReveal() {
  const [revealedSSNs, setRevealedSSNs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const { canRevealSSN } = usePermissions();

  const revealSSN = useCallback(async (contactId: string, encryptedSSN: string) => {
    if (!canRevealSSN) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to reveal SSN data",
        variant: "destructive",
      });
      return;
    }

    if (!encryptedSSN) {
      toast({
        title: "No SSN Available",
        description: "This contact does not have an encrypted SSN on file",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(prev => ({ ...prev, [contactId]: true }));

      // Call the reveal_ssn RPC which decrypts and logs access
      const { data, error } = await supabase
        .rpc('reveal_ssn', {
          p_contact_id: contactId,
          p_encrypted_ssn: encryptedSSN,
        });

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('No data returned from decrypt function');
      }

      setRevealedSSNs(prev => ({ ...prev, [contactId]: data }));

      toast({
        title: "SSN Revealed",
        description: "Full SSN has been revealed for authorized viewing",
      });
    } catch (err: any) {
      console.error('SSN reveal error:', err);
      toast({
        title: "SSN Reveal Failed",
        description: err.message || 'Failed to reveal SSN',
        variant: "destructive",
      });
    } finally {
      setLoading(prev => ({ ...prev, [contactId]: false }));
    }
  }, [canRevealSSN]);

  const hideSSN = useCallback((contactId: string) => {
    setRevealedSSNs(prev => {
      const updated = { ...prev };
      delete updated[contactId];
      return updated;
    });
  }, []);

  const isRevealed = useCallback((contactId: string) => {
    return !!revealedSSNs[contactId];
  }, [revealedSSNs]);

  const getRevealedSSN = useCallback((contactId: string) => {
    return revealedSSNs[contactId] || null;
  }, [revealedSSNs]);

  const isLoading = useCallback((contactId: string) => {
    return !!loading[contactId];
  }, [loading]);

  return {
    revealSSN,
    hideSSN,
    isRevealed,
    getRevealedSSN,
    isLoading,
    canRevealSSN
  };
}