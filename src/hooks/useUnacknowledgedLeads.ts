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
      // Fetch leads that are:
      // 1. Not yet acknowledged (acknowledged_at IS NULL)
      // 2. Not deleted (deleted_at IS NULL)
      // 3. Not assigned to anyone (assigned_to IS NULL)
      // This ensures only truly "new" unhandled leads show in the banner
      const { data, error } = await supabase
        .from('leads')
        .select('id, first_name, last_name, email, phone, created_at, insurance_types, account_id, source_details')
        .is('acknowledged_at', null)
        .is('deleted_at', null)
        .is('assigned_to', null) // Only show unassigned leads
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

    // Set up real-time subscription for leads
    const channel = supabase
      .channel('new-leads-notification')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads',
        },
        (payload) => {
          // Add new lead only if unacknowledged, not deleted, AND not assigned
          const newLead = payload.new as any;
          if (!newLead.acknowledged_at && !newLead.deleted_at && !newLead.assigned_to) {
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leads',
        },
        (payload) => {
          // Remove lead from banner if it was assigned, acknowledged, or deleted
          const updatedLead = payload.new as any;
          if (updatedLead.assigned_to || updatedLead.acknowledged_at || updatedLead.deleted_at) {
            setLeads((prev) => prev.filter((lead) => lead.id !== updatedLead.id));
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
