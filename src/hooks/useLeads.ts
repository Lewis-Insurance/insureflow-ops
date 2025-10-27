import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

// Types
type LeadRow = Database['public']['Tables']['leads']['Row'];
type LeadInsert = Database['public']['Tables']['leads']['Insert'];
type LeadUpdate = Database['public']['Tables']['leads']['Update'];

export interface Lead extends Omit<LeadRow, 'insurance_types' | 'lead_score'> {
  lead_score: number;
  insurance_types: string[];
  source_name?: string;
  assigned_to_name?: string;
}

export interface LeadFilters {
  status?: string[];
  assigned_to?: string;
  source_id?: string;
  min_score?: number;
  max_score?: number;
  insurance_types?: string[];
  search?: string;
}

// Fetch all leads with filters
export function useLeads(filters?: LeadFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(`
          *,
          source:lead_sources(name),
          assigned:profiles!leads_assigned_to_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }
      if (filters?.source_id) {
        query = query.eq('source_id', filters.source_id);
      }
      if (filters?.min_score) {
        query = query.gte('lead_score', filters.min_score);
      }
      if (filters?.max_score) {
        query = query.lte('lead_score', filters.max_score);
      }
      if (filters?.insurance_types && filters.insurance_types.length > 0) {
        query = query.overlaps('insurance_types', filters.insurance_types);
      }
      if (filters?.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;

      if (error) throw error;

      return data.map(lead => ({
        ...lead,
        source_name: lead.source?.name,
        assigned_to_name: lead.assigned?.full_name
      }));
    }
  });
}

// Fetch single lead by ID
export function useLead(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      if (!leadId) return null;

      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          source:lead_sources(*),
          assigned:profiles!leads_assigned_to_fkey(id, full_name, avatar_url),
          activities:lead_activities(*)
        `)
        .eq('id', leadId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!leadId
  });
}

// Alias for useLead to match common naming convention
export function useLeadById(leadId: string | undefined) {
  return useLead(leadId);
}

// Fetch lead sources - moved to @/integrations/supabase/hooks/useLeadSources
// Import from the new location instead

// Fetch leads by pipeline stage
export function useLeadsByStage() {
  return useQuery({
    queryKey: ['leads-by-stage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          source:lead_sources(name),
          assigned:profiles!leads_assigned_to_fkey(full_name)
        `)
        .order('lead_score', { ascending: false });

      if (error) throw error;

      // Group by status
      const grouped = {
        new: [] as Lead[],
        contacted: [] as Lead[],
        qualified: [] as Lead[],
        quoted: [] as Lead[],
        won: [] as Lead[],
        lost: [] as Lead[],
        nurturing: [] as Lead[]
      };

      data.forEach(lead => {
        grouped[lead.status as keyof typeof grouped]?.push({
          ...lead,
          source_name: lead.source?.name,
          assigned_to_name: lead.assigned?.full_name
        });
      });

      return grouped;
    }
  });
}

// Create lead mutation
export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadData: LeadInsert) => {
      const { data, error } = await supabase
        .from('leads')
        .insert([leadData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-by-stage'] });
      toast.success('Lead created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create lead: ${error.message}`);
    }
  });
}

// Update lead mutation
export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: LeadUpdate & { id: string }) => {
      // Fetch the current lead and all columns so we can adapt to schema differences
      const { data: currentLead, error: fetchError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Map status to whichever column exists in DB
      const statusKey = ['status', 'lead_status', 'pipeline_stage', 'stage'].find((k) => currentLead && k in currentLead) as string | undefined;
      const dbUpdates: any = { ...updates };

      // Remove deprecated fields
      delete dbUpdates.decision_timeframe;

      if ('status' in dbUpdates) {
        if (statusKey && statusKey !== 'status') {
          dbUpdates[statusKey] = (dbUpdates as any).status;
          delete (dbUpdates as any).status;
        } else if (!statusKey) {
          // If no status-like column exists, don't attempt to update it
          delete (dbUpdates as any).status;
        }
      }

      const { data, error } = await supabase
        .from('leads')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // If status changed to "Lost", create a follow-up confirmation
      if (updates.status === 'lost' && currentLead?.status !== 'lost') {
        const { error: confirmationError } = await supabase
          .from('lead_followup_confirmations')
          .insert({
            lead_id: id,
            lead_name: `${currentLead.first_name} ${currentLead.last_name}`,
            lead_email: currentLead.email,
            lead_phone: currentLead.phone,
            insurance_types: currentLead.insurance_types,
            assigned_to: currentLead.assigned_to,
            estimated_effective_date: currentLead.estimated_effective_date,
            status: 'pending',
          });

        if (confirmationError) {
          console.error('Failed to create follow-up confirmation:', confirmationError);
          // Don't throw error - the lead update was successful
        }
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', data.id] });
      queryClient.invalidateQueries({ queryKey: ['leads-by-stage'] });
      queryClient.invalidateQueries({ queryKey: ['lead-followup-confirmations'] });
      toast.success('Lead updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update lead: ${error.message}`);
    }
  });
}

// Move lead to stage with task auto-creation
export function useMoveLeadToStage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ leadId, newStatus }: { leadId: string; newStatus: string }) => {
      // Update lead status
      const { data: lead, error } = await supabase
        .from('leads')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId)
        .select('*, assigned_to, first_name, last_name')
        .single();

      if (error) throw error;

      // Auto-create tasks based on stage transition
      const taskTemplates: Record<string, { title: string; description: string; priority: string }> = {
        contacted: {
          title: 'Follow up on initial contact',
          description: `Follow up with ${lead.first_name} ${lead.last_name} after initial contact`,
          priority: 'medium'
        },
        qualified: {
          title: 'Prepare quote for qualified lead',
          description: `Prepare and send quote to ${lead.first_name} ${lead.last_name}`,
          priority: 'high'
        },
        quoted: {
          title: 'Follow up on quote',
          description: `Follow up with ${lead.first_name} ${lead.last_name} on quote sent`,
          priority: 'high'
        },
        nurturing: {
          title: 'Nurture lead relationship',
          description: `Continue building relationship with ${lead.first_name} ${lead.last_name}`,
          priority: 'low'
        }
      };

      // Create task if template exists for this stage
      if (taskTemplates[newStatus] && lead.assigned_to) {
        const template = taskTemplates[newStatus];
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (newStatus === 'quoted' ? 2 : 7)); // 2 days for quoted, 7 for others

        await supabase.from('tasks').insert({
          title: template.title,
          description: template.description,
          priority: template.priority as 'low' | 'medium' | 'high' | 'urgent',
          status: 'pending',
          due_at: dueDate.toISOString(),
          assignee_id: lead.assigned_to,
          created_by: user?.id
        });
      }

      return lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-by-stage'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Lead status updated and task created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update status: ${error.message}`);
    }
  });
}

// Delete lead mutation
export function useDeleteLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-by-stage'] });
      toast.success('Lead deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete lead: ${error.message}`);
    }
  });
}

// Fetch lead analytics (uses lead_source_performance view)
export function useLeadAnalytics(dateRange?: { start: string; end: string }) {
  return useQuery({
    queryKey: ['lead-analytics', dateRange],
    queryFn: async () => {
      // Using lead_source_performance view as analytics source
      const { data, error } = await supabase
        .from('lead_source_performance')
        .select('*');

      if (error) throw error;

      return data;
    }
  });
}

// Fetch users for assignment
export function useUsers() {
  return useQuery({
    queryKey: ['users-for-assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('is_staff', true)
        .order('full_name');

      if (error) throw error;
      return data;
    }
  });
}

// Bulk move leads to stage
export function useBulkMoveLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadIds, newStatus }: { leadIds: string[]; newStatus: string }) => {
      const { data, error } = await supabase
        .from('leads')
        .update({ status: newStatus })
        .in('id', leadIds)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-by-stage'] });
      toast.success(`${data.length} leads moved successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to move leads: ${error.message}`);
    }
  });
}

// Assign lead to user
export function useAssignLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, assignedTo, reason }: { leadId: string; assignedTo: string; reason?: string }) => {
      // First update the lead
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .update({ assigned_to: assignedTo })
        .eq('id', leadId)
        .select()
        .single();

      if (leadError) throw leadError;

      // Then create an assignment record
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('lead_assignments')
        .insert({
          lead_id: leadId,
          assigned_to: assignedTo,
          assignment_method: 'manual',
          reason: reason || 'Manual assignment'
        })
        .select()
        .single();

      if (assignmentError) throw assignmentError;

      return { lead: leadData, assignment: assignmentData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-by-stage'] });
      toast.success('Lead assigned successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign lead: ${error.message}`);
    }
  });
}

// Bulk assign leads to user
export function useBulkAssignLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadIds, assignedTo, reason }: { leadIds: string[]; assignedTo: string; reason?: string }) => {
      // Update all leads
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .update({ assigned_to: assignedTo })
        .in('id', leadIds)
        .select();

      if (leadError) throw leadError;

      // Create assignment records for each lead
      const assignmentRecords = leadIds.map(leadId => ({
        lead_id: leadId,
        assigned_to: assignedTo,
        assignment_method: 'manual' as const,
        reason: reason || 'Bulk manual assignment'
      }));

      const { data: assignmentData, error: assignmentError } = await supabase
        .from('lead_assignments')
        .insert(assignmentRecords)
        .select();

      if (assignmentError) throw assignmentError;

      return { leads: leadData, assignments: assignmentData };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-by-stage'] });
      toast.success(`${data.leads.length} leads assigned successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign leads: ${error.message}`);
    }
  });
}
