import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

export interface UnacknowledgedLead {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  created_at: string;
  insurance_types?: string[];
  account_id?: string;
}

export function useUnacknowledgedLeads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<UnacknowledgedLead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUnacknowledgedLeads = useCallback(async () => {
    if (!user) {
      setLeads([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch leads from Canopy that haven't been acknowledged yet
      const { data, error } = await supabase
        .from('leads')
        .select('id, first_name, last_name, email, phone, created_at, insurance_types, account_id')
        .is('acknowledged_at', null)
        .contains('source_details', { source: 'canopy_import' })
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        // If the column doesn't exist yet (migration not run), gracefully handle it
        if (error.message?.includes('acknowledged_at')) {
          logger.warn('acknowledged_at column not found - migration may not be deployed yet');
          setLeads([]);
        } else {
          logger.error('Error fetching unacknowledged leads:', error);
        }
        return;
      }

      setLeads(data || []);
    } catch (error) {
      logger.error('Error in fetchUnacknowledgedLeads:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Acknowledge a lead (marks it as seen)
  const acknowledgeLead = useCallback(async (leadId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('leads')
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
        })
        .eq('id', leadId);

      if (error) {
        logger.error('Error acknowledging lead:', error);
        return false;
      }

      // Remove from local state immediately for instant UI feedback
      setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
      return true;
    } catch (error) {
      logger.error('Error in acknowledgeLead:', error);
      return false;
    }
  }, [user]);

  // Acknowledge all leads at once
  const acknowledgeAllLeads = useCallback(async () => {
    if (!user || leads.length === 0) return false;

    try {
      const leadIds = leads.map((lead) => lead.id);
      const { error } = await supabase
        .from('leads')
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
        })
        .in('id', leadIds);

      if (error) {
        logger.error('Error acknowledging all leads:', error);
        return false;
      }

      setLeads([]);
      return true;
    } catch (error) {
      logger.error('Error in acknowledgeAllLeads:', error);
      return false;
    }
  }, [user, leads]);

  useEffect(() => {
    fetchUnacknowledgedLeads();

    // Set up real-time subscription for new leads
    const channel = supabase
      .channel('new-canopy-leads')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads',
        },
        (payload) => {
          // Check if it's a Canopy lead
          const newLead = payload.new as any;
          if (newLead.source_details?.source === 'canopy_import' && !newLead.acknowledged_at) {
            setLeads((prev) => [
              {
                id: newLead.id,
                first_name: newLead.first_name,
                last_name: newLead.last_name,
                email: newLead.email,
                phone: newLead.phone,
                created_at: newLead.created_at,
                insurance_types: newLead.insurance_types,
                account_id: newLead.account_id,
              },
              ...prev,
            ]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUnacknowledgedLeads]);

  return {
    leads,
    loading,
    acknowledgeLead,
    acknowledgeAllLeads,
    refetch: fetchUnacknowledgedLeads,
    hasUnacknowledgedLeads: leads.length > 0,
  };
}
