import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from '@/lib/logger';
import { useAuth } from './useAuth';

// ============================================================================
// TYPES
// ============================================================================

export type RenewalStatus =
  | 'pending'
  | 'contacted'
  | 'quoted'
  | 'renewed'
  | 'lost'
  | 'cancelled'
  | 'moved'
  | 'non_renewed'
  // Legacy values
  | 'upcoming'
  | 'in_progress'
  | 'completed';

export type RenewalPriority = 'low' | 'normal' | 'high' | 'urgent';
export type RenewalTerm = '6_month' | 'annual';
export type ContactType = 'call' | 'email' | 'sms' | 'meeting' | 'other';
export type ContactDirection = 'inbound' | 'outbound';
export type DocumentType = 'dec_page' | 'quote' | 'application' | 'endorsement' | 'correspondence' | 'policy' | 'claim' | 'other';
export type QuoteStatus = 'pending' | 'presented' | 'accepted' | 'declined' | 'expired';

export interface Renewal {
  id: string;
  account_id: string;
  policy_id: string | null;
  policy_number: string | null;
  policy_type: string;
  carrier: string | null;
  renewal_date: string;
  expiration_date: string | null;
  current_premium: number | null;
  renewal_premium: number | null;
  price_change_pct: number | null;
  status: RenewalStatus;
  priority: RenewalPriority | null;
  assigned_to: string | null;
  notes: string | null;
  risk_score: number | null;
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  risk_factors: any[];
  last_risk_calculation: string | null;
  days_since_last_contact: number | null;
  contact_count: number;
  last_contact_date: string | null;
  has_recent_claims: boolean;
  has_payment_issues: boolean;
  competitor_activity_detected: boolean;
  customer_satisfaction_score: number | null;
  engagement_score: number | null;
  sentiment_score: number | null;
  lost_reason: string | null;
  moved_carrier: string | null;
  moved_term: RenewalTerm | null;
  moved_premium: number | null;
  non_renewal_reason: string | null;
  cancelled_reason: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Joined data
  account?: {
    id: string;
    name: string;
    type: string;
  };
  assigned_user?: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
}

export interface RenewalNote {
  id: string;
  renewal_id: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
}

export interface RenewalContact {
  id: string;
  renewal_id: string;
  contact_type: ContactType;
  direction: ContactDirection;
  outcome: string | null;
  notes: string | null;
  duration_minutes: number | null;
  contacted_by: string;
  contacted_at: string;
  author?: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
}

export interface RenewalQuote {
  id: string;
  renewal_id: string;
  carrier: string;
  premium: number;
  term_months: number;
  coverage_summary: string | null;
  quote_date: string | null;
  expiration_date: string | null;
  document_url: string | null;
  is_selected: boolean;
  status: QuoteStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RenewalDocument {
  id: string;
  renewal_id: string;
  name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  document_type: DocumentType | null;
  description: string | null;
  uploaded_by: string;
  created_at: string;
  uploader?: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
}

export interface RenewalStatusHistory {
  id: string;
  renewal_id: string;
  old_status: RenewalStatus | null;
  new_status: RenewalStatus;
  changed_by: string;
  reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
  changer?: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
}

export interface RenewalFilters {
  status?: RenewalStatus[];
  priority?: RenewalPriority[];
  risk_level?: ('low' | 'medium' | 'high' | 'critical')[];
  assigned_to?: string;
  policy_type?: string;
  carrier?: string;
  renewal_date_from?: string;
  renewal_date_to?: string;
  search?: string;
}

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Fetch a single renewal by ID with related data
 */
export function useRenewal(id: string | null | undefined) {
  return useQuery({
    queryKey: ['renewal', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('renewals')
        .select(`
          *,
          account:accounts!account_id(id, name, type),
          assigned_user:profiles!assigned_to(id, full_name, email)
        `)
        .eq('id', id)
        .single();

      if (error) {
        // Try looking up by policy_id if not found by renewal id
        const { data: byPolicy, error: policyError } = await supabase
          .from('renewals')
          .select(`
            *,
            account:accounts!account_id(id, name, type),
            assigned_user:profiles!assigned_to(id, full_name, email)
          `)
          .eq('policy_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (policyError) {
          logger.error('[useRenewal] Error fetching renewal:', policyError);
          throw policyError;
        }
        return byPolicy as Renewal;
      }

      return data as Renewal;
    },
    enabled: !!id,
  });
}

/**
 * Fetch renewals with optional filters
 */
export function useRenewals(filters?: RenewalFilters) {
  return useQuery({
    queryKey: ['renewals', filters],
    queryFn: async () => {
      let query = supabase
        .from('renewals')
        .select(`
          *,
          account:accounts!account_id(id, name, type),
          assigned_user:profiles!assigned_to(id, full_name, email)
        `)
        .order('renewal_date', { ascending: true });

      if (filters?.status?.length) {
        query = query.in('status', filters.status);
      }

      if (filters?.priority?.length) {
        query = query.in('priority', filters.priority);
      }

      if (filters?.risk_level?.length) {
        query = query.in('risk_level', filters.risk_level);
      }

      if (filters?.assigned_to) {
        if (filters.assigned_to === 'unassigned') {
          query = query.is('assigned_to', null);
        } else {
          query = query.eq('assigned_to', filters.assigned_to);
        }
      }

      if (filters?.policy_type) {
        query = query.eq('policy_type', filters.policy_type);
      }

      if (filters?.carrier) {
        query = query.eq('carrier', filters.carrier);
      }

      if (filters?.renewal_date_from) {
        query = query.gte('renewal_date', filters.renewal_date_from);
      }

      if (filters?.renewal_date_to) {
        query = query.lte('renewal_date', filters.renewal_date_to);
      }

      if (filters?.search) {
        query = query.or(
          `policy_number.ilike.%${filters.search}%,account.name.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;

      if (error) {
        logger.error('[useRenewals] Error fetching renewals:', error);
        throw error;
      }

      return data as Renewal[];
    },
  });
}

/**
 * Fetch notes for a renewal
 */
export function useRenewalNotes(renewalId: string | null | undefined) {
  return useQuery({
    queryKey: ['renewal-notes', renewalId],
    queryFn: async () => {
      if (!renewalId) return [];

      const { data, error } = await supabase
        .from('renewal_notes')
        .select(`
          *,
          author:profiles!created_by(id, full_name, email)
        `)
        .eq('renewal_id', renewalId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('[useRenewalNotes] Error:', error);
        throw error;
      }

      return data as RenewalNote[];
    },
    enabled: !!renewalId,
  });
}

/**
 * Fetch contact log for a renewal
 */
export function useRenewalContacts(renewalId: string | null | undefined) {
  return useQuery({
    queryKey: ['renewal-contacts', renewalId],
    queryFn: async () => {
      if (!renewalId) return [];

      const { data, error } = await supabase
        .from('renewal_contact_log')
        .select(`
          *,
          author:profiles!contacted_by(id, full_name, email)
        `)
        .eq('renewal_id', renewalId)
        .order('contacted_at', { ascending: false });

      if (error) {
        logger.error('[useRenewalContacts] Error:', error);
        throw error;
      }

      return data as RenewalContact[];
    },
    enabled: !!renewalId,
  });
}

/**
 * Fetch quotes for a renewal
 */
export function useRenewalQuotes(renewalId: string | null | undefined) {
  return useQuery({
    queryKey: ['renewal-quotes', renewalId],
    queryFn: async () => {
      if (!renewalId) return [];

      const { data, error } = await supabase
        .from('renewal_quotes')
        .select('*')
        .eq('renewal_id', renewalId)
        .order('premium', { ascending: true });

      if (error) {
        logger.error('[useRenewalQuotes] Error:', error);
        throw error;
      }

      return data as RenewalQuote[];
    },
    enabled: !!renewalId,
  });
}

/**
 * Fetch documents for a renewal
 */
export function useRenewalDocuments(renewalId: string | null | undefined) {
  return useQuery({
    queryKey: ['renewal-documents', renewalId],
    queryFn: async () => {
      if (!renewalId) return [];

      const { data, error } = await supabase
        .from('renewal_documents')
        .select(`
          *,
          uploader:profiles!uploaded_by(id, full_name, email)
        `)
        .eq('renewal_id', renewalId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('[useRenewalDocuments] Error:', error);
        throw error;
      }

      return data as RenewalDocument[];
    },
    enabled: !!renewalId,
  });
}

/**
 * Fetch status history for a renewal
 */
export function useRenewalStatusHistory(renewalId: string | null | undefined) {
  return useQuery({
    queryKey: ['renewal-status-history', renewalId],
    queryFn: async () => {
      if (!renewalId) return [];

      const { data, error } = await supabase
        .from('renewal_status_history')
        .select(`
          *,
          changer:profiles!changed_by(id, full_name, email)
        `)
        .eq('renewal_id', renewalId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('[useRenewalStatusHistory] Error:', error);
        throw error;
      }

      return data as RenewalStatusHistory[];
    },
    enabled: !!renewalId,
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Update renewal status
 */
export function useUpdateRenewalStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      renewalId: string;
      status: RenewalStatus;
      lost_reason?: string;
      moved_carrier?: string;
      moved_term?: RenewalTerm;
      moved_premium?: number;
      non_renewal_reason?: string;
      cancelled_reason?: string;
    }) => {
      const { renewalId, status, ...outcomeFields } = params;

      const updateData: Record<string, any> = { status };

      // Add outcome fields based on status
      if (status === 'lost' && outcomeFields.lost_reason) {
        updateData.lost_reason = outcomeFields.lost_reason;
      }
      if (status === 'moved') {
        if (outcomeFields.moved_carrier) updateData.moved_carrier = outcomeFields.moved_carrier;
        if (outcomeFields.moved_term) updateData.moved_term = outcomeFields.moved_term;
        if (outcomeFields.moved_premium) updateData.moved_premium = outcomeFields.moved_premium;
      }
      if (status === 'non_renewed' && outcomeFields.non_renewal_reason) {
        updateData.non_renewal_reason = outcomeFields.non_renewal_reason;
      }
      if (status === 'cancelled' && outcomeFields.cancelled_reason) {
        updateData.cancelled_reason = outcomeFields.cancelled_reason;
      }

      const { data, error } = await supabase
        .from('renewals')
        .update(updateData)
        .eq('id', renewalId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal', data.id] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['renewal-status-history', data.id] });
      toast.success('Status updated successfully');
    },
    onError: (error) => {
      logger.error('[useUpdateRenewalStatus] Error:', error);
      toast.error('Failed to update status');
    },
  });
}

/**
 * Update renewal details
 */
export function useUpdateRenewal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      renewalId: string;
      updates: Partial<Omit<Renewal, 'id' | 'created_at' | 'updated_at'>>;
    }) => {
      const { renewalId, updates } = params;

      const { data, error } = await supabase
        .from('renewals')
        .update(updates)
        .eq('id', renewalId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal', data.id] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      toast.success('Renewal updated');
    },
    onError: (error) => {
      logger.error('[useUpdateRenewal] Error:', error);
      toast.error('Failed to update renewal');
    },
  });
}

/**
 * Assign renewal to a user
 */
export function useAssignRenewal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { renewalId: string; assignedTo: string | null }) => {
      const { renewalId, assignedTo } = params;

      const { data, error } = await supabase
        .from('renewals')
        .update({ assigned_to: assignedTo })
        .eq('id', renewalId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal', data.id] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      toast.success('Renewal assigned');
    },
    onError: (error) => {
      logger.error('[useAssignRenewal] Error:', error);
      toast.error('Failed to assign renewal');
    },
  });
}

/**
 * Add a note to a renewal
 */
export function useAddRenewalNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { renewalId: string; content: string }) => {
      const { renewalId, content } = params;

      const { data, error } = await supabase
        .from('renewal_notes')
        .insert({ renewal_id: renewalId, content })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-notes', data.renewal_id] });
      toast.success('Note added');
    },
    onError: (error) => {
      logger.error('[useAddRenewalNote] Error:', error);
      toast.error('Failed to add note');
    },
  });
}

/**
 * Update a note
 */
export function useUpdateRenewalNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { noteId: string; content: string; renewalId: string }) => {
      const { noteId, content } = params;

      const { data, error } = await supabase
        .from('renewal_notes')
        .update({ content })
        .eq('id', noteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-notes', variables.renewalId] });
      toast.success('Note updated');
    },
    onError: (error) => {
      logger.error('[useUpdateRenewalNote] Error:', error);
      toast.error('Failed to update note');
    },
  });
}

/**
 * Delete a note
 */
export function useDeleteRenewalNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { noteId: string; renewalId: string }) => {
      const { noteId } = params;

      const { error } = await supabase
        .from('renewal_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-notes', variables.renewalId] });
      toast.success('Note deleted');
    },
    onError: (error) => {
      logger.error('[useDeleteRenewalNote] Error:', error);
      toast.error('Failed to delete note');
    },
  });
}

/**
 * Log a contact attempt
 */
export function useLogRenewalContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      renewalId: string;
      contact_type: ContactType;
      direction: ContactDirection;
      outcome?: string;
      notes?: string;
      duration_minutes?: number;
    }) => {
      const { renewalId, ...contactData } = params;

      const { data, error } = await supabase
        .from('renewal_contact_log')
        .insert({ renewal_id: renewalId, ...contactData })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-contacts', data.renewal_id] });
      queryClient.invalidateQueries({ queryKey: ['renewal', data.renewal_id] });
      toast.success('Contact logged');
    },
    onError: (error) => {
      logger.error('[useLogRenewalContact] Error:', error);
      toast.error('Failed to log contact');
    },
  });
}

/**
 * Add a competitive quote
 */
export function useAddRenewalQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      renewalId: string;
      carrier: string;
      premium: number;
      term_months?: number;
      coverage_summary?: string;
      quote_date?: string;
      expiration_date?: string;
      document_url?: string;
      notes?: string;
    }) => {
      const { renewalId, ...quoteData } = params;

      const { data, error } = await supabase
        .from('renewal_quotes')
        .insert({ renewal_id: renewalId, ...quoteData })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-quotes', data.renewal_id] });
      toast.success('Quote added');
    },
    onError: (error) => {
      logger.error('[useAddRenewalQuote] Error:', error);
      toast.error('Failed to add quote');
    },
  });
}

/**
 * Update a quote
 */
export function useUpdateRenewalQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      quoteId: string;
      renewalId: string;
      updates: Partial<Omit<RenewalQuote, 'id' | 'renewal_id' | 'created_at' | 'created_by'>>;
    }) => {
      const { quoteId, updates } = params;

      const { data, error } = await supabase
        .from('renewal_quotes')
        .update(updates)
        .eq('id', quoteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-quotes', variables.renewalId] });
      toast.success('Quote updated');
    },
    onError: (error) => {
      logger.error('[useUpdateRenewalQuote] Error:', error);
      toast.error('Failed to update quote');
    },
  });
}

/**
 * Select a quote (mark as selected, unselect others)
 */
export function useSelectRenewalQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { quoteId: string; renewalId: string }) => {
      const { quoteId, renewalId } = params;

      // First, unselect all quotes for this renewal
      await supabase
        .from('renewal_quotes')
        .update({ is_selected: false })
        .eq('renewal_id', renewalId);

      // Then select the chosen quote
      const { data, error } = await supabase
        .from('renewal_quotes')
        .update({ is_selected: true, status: 'accepted' })
        .eq('id', quoteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-quotes', variables.renewalId] });
      toast.success('Quote selected');
    },
    onError: (error) => {
      logger.error('[useSelectRenewalQuote] Error:', error);
      toast.error('Failed to select quote');
    },
  });
}

/**
 * Delete a quote
 */
export function useDeleteRenewalQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { quoteId: string; renewalId: string }) => {
      const { quoteId } = params;

      const { error } = await supabase
        .from('renewal_quotes')
        .delete()
        .eq('id', quoteId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-quotes', variables.renewalId] });
      toast.success('Quote deleted');
    },
    onError: (error) => {
      logger.error('[useDeleteRenewalQuote] Error:', error);
      toast.error('Failed to delete quote');
    },
  });
}

/**
 * Upload a document
 */
export function useUploadRenewalDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      renewalId: string;
      file: File;
      document_type?: DocumentType;
      description?: string;
    }) => {
      const { renewalId, file, document_type, description } = params;

      // Upload file to storage
      const filePath = `renewals/${renewalId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create document record
      const { data, error } = await supabase
        .from('renewal_documents')
        .insert({
          renewal_id: renewalId,
          name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
          document_type,
          description,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-documents', data.renewal_id] });
      toast.success('Document uploaded');
    },
    onError: (error) => {
      logger.error('[useUploadRenewalDocument] Error:', error);
      toast.error('Failed to upload document');
    },
  });
}

/**
 * Delete a document
 */
export function useDeleteRenewalDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { documentId: string; renewalId: string; filePath: string }) => {
      const { documentId, filePath } = params;

      // Delete from storage
      await supabase.storage.from('documents').remove([filePath]);

      // Delete record
      const { error } = await supabase
        .from('renewal_documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-documents', variables.renewalId] });
      toast.success('Document deleted');
    },
    onError: (error) => {
      logger.error('[useDeleteRenewalDocument] Error:', error);
      toast.error('Failed to delete document');
    },
  });
}

/**
 * Bulk update renewals status
 */
export function useBulkUpdateRenewalStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { renewalIds: string[]; status: RenewalStatus }) => {
      const { renewalIds, status } = params;

      const { data, error } = await supabase
        .from('renewals')
        .update({ status })
        .in('id', renewalIds)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      toast.success('Renewals updated');
    },
    onError: (error) => {
      logger.error('[useBulkUpdateRenewalStatus] Error:', error);
      toast.error('Failed to update renewals');
    },
  });
}

/**
 * Bulk assign renewals
 */
export function useBulkAssignRenewals() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { renewalIds: string[]; assignedTo: string | null }) => {
      const { renewalIds, assignedTo } = params;

      const { data, error } = await supabase
        .from('renewals')
        .update({ assigned_to: assignedTo })
        .in('id', renewalIds)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      toast.success('Renewals assigned');
    },
    onError: (error) => {
      logger.error('[useBulkAssignRenewals] Error:', error);
      toast.error('Failed to assign renewals');
    },
  });
}

/**
 * Complete a renewal (mark as renewed and update policy)
 * This updates the existing policy with new term details
 */
export function useCompleteRenewal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      renewalId: string;
      policyId: string;
      policyUpdates: {
        policy_number?: string;
        premium: number;
        effective_date: string;
        expiration_date: string;
      };
      notes?: string;
    }) => {
      const { renewalId, policyId, policyUpdates, notes } = params;

      // 1. Update the policy record with new term details
      const { error: policyError } = await supabase
        .from('policies')
        .update({
          policy_number: policyUpdates.policy_number,
          premium: policyUpdates.premium,
          effective_date: policyUpdates.effective_date,
          expiration_date: policyUpdates.expiration_date,
          status: 'active',
        })
        .eq('id', policyId);

      if (policyError) throw policyError;

      // 2. Update renewal status to 'renewed' (trigger auto-sets completed_at)
      const { error: renewalError } = await supabase
        .from('renewals')
        .update({
          status: 'renewed',
          renewal_premium: policyUpdates.premium,
        })
        .eq('id', renewalId);

      if (renewalError) throw renewalError;

      // 3. Add note if provided
      if (notes) {
        await supabase.from('renewal_notes').insert({
          renewal_id: renewalId,
          content: `Renewal completed: ${notes}`,
        });
      }

      // 4. Trigger retention analytics recalculation (best effort)
      try {
        await supabase.functions.invoke('run-retention-scoring', {
          body: { policy_id: policyId, immediate: true },
        });
      } catch (analyticsError) {
        logger.warn('[useCompleteRenewal] Analytics trigger failed:', analyticsError);
        // Don't fail the whole operation for analytics
      }

      return { renewalId, policyId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal', data.renewalId] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['policy', data.policyId] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      queryClient.invalidateQueries({ queryKey: ['policy-renewal-risk-scores'] });
      queryClient.invalidateQueries({ queryKey: ['account-churn-risk-scores'] });
      toast.success('Renewal completed successfully');
    },
    onError: (error) => {
      logger.error('[useCompleteRenewal] Error:', error);
      toast.error('Failed to complete renewal');
    },
  });
}

/**
 * Terminate a renewal (cancelled, lapsed, non_renewed, lost, moved)
 * Updates both renewal and policy status with full details
 */
export function useTerminateRenewal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      renewalId: string;
      policyId: string;
      status: 'cancelled' | 'lapsed' | 'non_renewed' | 'lost' | 'moved';
      reason: string;
      terminationDate: string;
      notes?: string;
      movedData?: {
        carrier: string;
        premium: number;
        term: '6_month' | 'annual';
      };
    }) => {
      const { renewalId, policyId, status, reason, terminationDate, notes, movedData } = params;

      // Build renewal update object
      const renewalUpdate: Record<string, any> = {
        status,
        termination_effective_date: terminationDate,
      };

      // Set reason field based on status
      switch (status) {
        case 'cancelled':
          renewalUpdate.cancelled_reason = reason;
          break;
        case 'lapsed':
          renewalUpdate.lapsed_reason = reason;
          break;
        case 'non_renewed':
          renewalUpdate.non_renewal_reason = reason;
          break;
        case 'lost':
          renewalUpdate.lost_reason = reason;
          break;
        case 'moved':
          if (movedData) {
            renewalUpdate.moved_carrier = movedData.carrier;
            renewalUpdate.moved_premium = movedData.premium;
            renewalUpdate.moved_term = movedData.term;
          }
          break;
      }

      // 1. Update renewal (trigger auto-sets completed_at)
      const { error: renewalError } = await supabase
        .from('renewals')
        .update(renewalUpdate)
        .eq('id', renewalId);

      if (renewalError) throw renewalError;

      // 2. Update policy status
      // For 'moved', we mark the policy as cancelled since customer moved elsewhere
      const policyStatus = status === 'moved' ? 'cancelled' : status;
      const { error: policyError } = await supabase
        .from('policies')
        .update({
          status: policyStatus,
        })
        .eq('id', policyId);

      if (policyError) throw policyError;

      // 3. Add note with status change details
      const noteContent = notes
        ? `Status changed to ${status}: ${reason}. ${notes}`
        : `Status changed to ${status}: ${reason}`;

      await supabase.from('renewal_notes').insert({
        renewal_id: renewalId,
        content: noteContent,
      });

      // 4. Trigger retention analytics recalculation (best effort)
      try {
        await supabase.functions.invoke('run-retention-scoring', {
          body: { policy_id: policyId, immediate: true },
        });
      } catch (analyticsError) {
        logger.warn('[useTerminateRenewal] Analytics trigger failed:', analyticsError);
      }

      return { renewalId, policyId, status };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal', data.renewalId] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['policy', data.policyId] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      queryClient.invalidateQueries({ queryKey: ['policy-renewal-risk-scores'] });
      queryClient.invalidateQueries({ queryKey: ['account-churn-risk-scores'] });
      toast.success(`Renewal marked as ${data.status}`);
    },
    onError: (error) => {
      logger.error('[useTerminateRenewal] Error:', error);
      toast.error('Failed to update renewal status');
    },
  });
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Get status color and icon info
 */
export function getStatusConfig(status: RenewalStatus) {
  const configs: Record<RenewalStatus, { label: string; color: string; bgColor: string }> = {
    pending: { label: 'Pending', color: 'text-gray-700', bgColor: 'bg-gray-100' },
    contacted: { label: 'Contacted', color: 'text-blue-700', bgColor: 'bg-blue-100' },
    quoted: { label: 'Quoted', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
    renewed: { label: 'Renewed', color: 'text-green-700', bgColor: 'bg-green-100' },
    lost: { label: 'Lost', color: 'text-red-700', bgColor: 'bg-red-100' },
    cancelled: { label: 'Cancelled', color: 'text-red-700', bgColor: 'bg-red-100' },
    moved: { label: 'Moved', color: 'text-purple-700', bgColor: 'bg-purple-100' },
    non_renewed: { label: 'Non-Renewed', color: 'text-orange-700', bgColor: 'bg-orange-100' },
    // Legacy
    upcoming: { label: 'Upcoming', color: 'text-gray-700', bgColor: 'bg-gray-100' },
    in_progress: { label: 'In Progress', color: 'text-blue-700', bgColor: 'bg-blue-100' },
    completed: { label: 'Completed', color: 'text-green-700', bgColor: 'bg-green-100' },
  };

  return configs[status] || configs.pending;
}

/**
 * Get priority color
 */
export function getPriorityConfig(priority: RenewalPriority | null) {
  const configs: Record<RenewalPriority, { label: string; color: string; bgColor: string }> = {
    low: { label: 'Low', color: 'text-gray-600', bgColor: 'bg-gray-100' },
    normal: { label: 'Normal', color: 'text-blue-600', bgColor: 'bg-blue-100' },
    high: { label: 'High', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    urgent: { label: 'Urgent', color: 'text-red-600', bgColor: 'bg-red-100' },
  };

  return priority ? configs[priority] : configs.normal;
}
