import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from '@/lib/logger';
import { useAuth } from './useAuth';
import {
  mapLostReason,
  type PolicyTerm,
  type LostReasonCategory,
} from '@/lib/renewals/renewalTerm';

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
  // Draft (in-progress) new-term fields — persisted on Save, pushed to the policy on commit.
  policy_term: string | null;
  new_effective_date: string | null;
  new_expiration_date: string | null;
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
        .is('deleted_at', null)
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
      accountId?: string | null;
      policyId?: string | null;
    }) => {
      const { renewalId, file, document_type, description, accountId, policyId } = params;

      // Upload file to storage (single object, shared by both document records).
      const filePath = `renewals/${renewalId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create renewal document record
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

      // Dual-write to the shared documents table so the dec page / application is
      // immediately visible on the customer + policy pages. Best-effort: a mirror failure
      // must not strand the renewal upload (same storage object backs both rows).
      try {
        const { data: auth } = await supabase.auth.getUser();
        await supabase.from('documents').insert({
          account_id: accountId ?? null,
          policy_id: policyId ?? null,
          name: file.name,
          filename: file.name,
          file_name: file.name,
          storage_path: filePath,
          file_path: filePath,
          storage_bucket: 'documents',
          mime_type: file.type,
          file_size: file.size,
          size_bytes: file.size,
          kind: 'renewal_document',
          document_type: document_type ?? null,
          uploaded_by: auth?.user?.id ?? null,
          created_by: auth?.user?.id ?? null,
          file_missing: false,
        });
      } catch (mirrorError) {
        logger.warn('[useUploadRenewalDocument] documents mirror failed:', mirrorError);
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-documents', data.renewal_id] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
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
      const now = new Date().toISOString();

      // Soft delete (invariant: soft deletes only). The storage object is retained.
      const { error } = await supabase
        .from('renewal_documents')
        .update({ deleted_at: now })
        .eq('id', documentId);

      if (error) throw error;

      // Soft-delete the mirrored documents row pointing at the same storage object.
      try {
        await supabase
          .from('documents')
          .update({ deleted_at: now })
          .eq('storage_path', filePath)
          .eq('kind', 'renewal_document');
      } catch (mirrorError) {
        logger.warn('[useDeleteRenewalDocument] documents mirror soft-delete failed:', mirrorError);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-documents', variables.renewalId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
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

// ============================================================================
// WRITE-THROUGH TERMINAL COMMITS (two-tier renewal model)
// ============================================================================

/** Kick the retention model after a terminal commit (best-effort; never gates the save). */
async function bestEffortRetention(policyId: string): Promise<void> {
  try {
    await supabase.functions.invoke('run-retention-scoring', {
      body: { policy_id: policyId, immediate: true },
    });
  } catch (e) {
    logger.warn('[renewal write-through] retention scoring failed:', e);
  }
}

/**
 * Working "Save" — persists the agent's in-progress edits to the RENEWAL row only.
 * Never touches the policy. The draft (new_effective_date/new_expiration_date/policy_term/
 * renewal_premium/policy_number) is pushed to the policy only by a terminal commit below.
 * Working status maps: "Pending" -> stored 'upcoming' (keeps policy->renewal sync live),
 * "Quoted" -> 'quoted'.
 */
export function useSaveRenewalDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      renewalId: string;
      status?: 'upcoming' | 'quoted';
      policy_number?: string | null;
      renewal_premium?: number | null;
      policy_term?: PolicyTerm | null;
      new_effective_date?: string | null;
      new_expiration_date?: string | null;
      /** Autosave path: skip the success toast (an inline "Saved" indicator carries it). */
      silent?: boolean;
    }) => {
      const { renewalId, silent: _silent, ...rest } = params;
      const update: Record<string, any> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) update[k] = v;
      }

      // Only open rows are writable: an autosave still in flight when the agent
      // commits Renewed/Moved/Lost must no-op instead of resurrecting the closed
      // renewal (and re-clobbering its status back to 'upcoming').
      const { data, error } = await supabase
        .from('renewals')
        .update(update)
        .eq('id', renewalId)
        .in('status', ['upcoming', 'in_progress', 'quoted', 'pending', 'contacted'])
        .select()
        .maybeSingle();

      if (error) throw error;
      return data; // null = renewal was closed mid-save; treated as a silent no-op
    },
    onSuccess: (data, variables) => {
      if (!data) return; // closed underneath the save; nothing to refresh or toast
      queryClient.invalidateQueries({ queryKey: ['renewal', data.id] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      if (!variables.silent) toast.success('Renewal saved');
    },
    onError: (error) => {
      logger.error('[useSaveRenewalDraft] Error:', error);
      toast.error('Failed to save renewal');
    },
  });
}

/**
 * Terminal commit: RENEWED. Atomic via the renewal_mark_renewed RPC: closes the renewal
 * FIRST (so the policy->renewal sync trigger spawns a fresh next-term 'upcoming' row
 * instead of rewriting this one's history), then overwrites the policy in place with the
 * new-term details, and writes the customer note - all in one transaction.
 */
export function useMarkRenewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      renewalId: string;
      policyId: string;
      accountId: string;
      policy_number: string;
      premium: number;
      policy_term: PolicyTerm;
      effective_date: string;
      expiration_date: string;
      notes?: string;
    }) => {
      const {
        renewalId, policyId, accountId, policy_number, premium,
        policy_term, effective_date, expiration_date, notes,
      } = params;

      const { error } = await (supabase as any).rpc('renewal_mark_renewed', {
        p_renewal_id: renewalId,
        p_policy_id: policyId,
        p_account_id: accountId,
        p_policy_number: policy_number,
        p_premium: premium,
        p_policy_term: policy_term,
        p_effective_date: effective_date,
        p_expiration_date: expiration_date,
        p_notes: notes ?? null,
      });
      if (error) throw new Error(error.message || 'Failed to complete renewal');

      await bestEffortRetention(policyId);

      return { renewalId, policyId, accountId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal', data.renewalId] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['policy', data.policyId] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['policy-renewal-risk-scores'] });
      queryClient.invalidateQueries({ queryKey: ['account-churn-risk-scores'] });
      queryClient.invalidateQueries({ queryKey: ['account-notes', data.accountId] });
      toast.success('Renewal completed successfully');
    },
    onError: (error: Error) => {
      logger.error('[useMarkRenewed] Error:', error);
      toast.error(error.message || 'Failed to complete renewal');
    },
  });
}

/**
 * Terminal commit: MOVED. Creates a NEW active policy with the moved-to carrier/term/premium
 * (copying durable fields from the old policy), flips the OLD policy to 'inactive' (its data
 * preserved), and closes the renewal as 'moved'. The new policy gets its own 'upcoming'
 * renewal via the policy->renewal sync trigger.
 */
export function useMarkMoved() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      renewalId: string;
      policyId: string;
      accountId: string;
      carrier: string;
      policy_number: string;
      premium: number;
      policy_term: PolicyTerm;
      effective_date: string;
      expiration_date: string;
      notes?: string;
    }) => {
      const {
        renewalId, policyId, accountId, carrier, policy_number, premium,
        policy_term, effective_date, expiration_date, notes,
      } = params;

      // Atomic + idempotent: the new policy INSERT, old policy -> inactive, renewal -> moved,
      // and the audit note all run in one transaction inside renewal_mark_moved, so a failed or
      // retried commit can never leave two active policies or duplicate the new policy.
      const { data: newPolicyId, error } = await (supabase as any).rpc('renewal_mark_moved', {
        p_renewal_id: renewalId,
        p_policy_id: policyId,
        p_account_id: accountId,
        p_carrier: carrier,
        p_policy_number: policy_number,
        p_premium: premium,
        p_policy_term: policy_term,
        p_effective_date: effective_date,
        p_expiration_date: expiration_date,
        p_notes: notes ?? null,
      });
      if (error) {
        // The RPC raises a human MESSAGE with the owner account id in DETAIL
        // ('DUPLICATE_POLICY_NUMBER=<uuid>'); a raw 23505 is the fallback. Any of these becomes a
        // typed error the widget turns into the friendly "already added" prompt with a deep link.
        const msg = error.message || '';
        const blob = `${msg} ${(error as any).details || ''}`;
        const dup = /DUPLICATE_POLICY_NUMBER=([0-9a-fA-F-]*)/.exec(blob);
        if (dup || (error as any).code === '23505' || /already added/i.test(msg)) {
          const dupErr: any = new Error(msg || 'This policy is already added for this customer.');
          dupErr.code = 'DUPLICATE_POLICY';
          dupErr.existingAccountId = dup?.[1] || null;
          throw dupErr;
        }
        throw new Error(msg || 'Failed to record move');
      }

      await bestEffortRetention(policyId);

      return { renewalId, policyId, newPolicyId: newPolicyId as string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal', data.renewalId] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['policy', data.policyId] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['policy-renewal-risk-scores'] });
      queryClient.invalidateQueries({ queryKey: ['account-churn-risk-scores'] });
      toast.success('Policy moved — new policy created');
    },
    onError: (error: any) => {
      if (error?.code === 'DUPLICATE_POLICY') return; // widget shows a friendly modal instead
      logger.error('[useMarkMoved] Error:', error);
      toast.error(error.message || 'Failed to record move');
    },
  });
}

/**
 * Terminal commit: LOST / DID NOT RENEW. Writes the reason-mapped terminal status to both
 * the renewal and the policy (cancelled / non_renewed / lost / lapsed; 'other' -> lost with a
 * neutral cancelled policy). Policy data is preserved aside from status (+ cancellation fields
 * when cancelled).
 */
export function useMarkLost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      renewalId: string;
      policyId: string;
      accountId: string;
      category: LostReasonCategory;
      reason: string;
      terminationDate?: string;
      notes?: string;
    }) => {
      const { renewalId, policyId, accountId, category, reason, terminationDate, notes } = params;

      // Atomic via the renewal_mark_lost RPC: closes the renewal (status + reason column
      // per the category mapping), writes the dead status through to the policy, and adds
      // the customer note in one transaction. Mapping mirrors mapLostReason server-side.
      const { data, error } = await (supabase as any).rpc('renewal_mark_lost', {
        p_renewal_id: renewalId,
        p_policy_id: policyId,
        p_account_id: accountId,
        p_category: category,
        p_reason: reason,
        p_termination_date: terminationDate ?? null,
        p_notes: notes ?? null,
      });
      if (error) throw new Error(error.message || 'Failed to update renewal');

      await bestEffortRetention(policyId);

      return { renewalId, policyId, accountId, status: (data as string) || mapLostReason(category).renewalStatus };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal', data.renewalId] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['policy', data.policyId] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      queryClient.invalidateQueries({ queryKey: ['policy-renewal-risk-scores'] });
      queryClient.invalidateQueries({ queryKey: ['account-churn-risk-scores'] });
      queryClient.invalidateQueries({ queryKey: ['account-notes', data.accountId] });
      toast.success(`Renewal marked ${data.status}`);
    },
    onError: (error: Error) => {
      logger.error('[useMarkLost] Error:', error);
      toast.error(error.message || 'Failed to update renewal');
    },
  });
}

/**
 * Reopen a closed renewal (from the Renewals page "Closed" view). Returns it to the working
 * queue as 'upcoming' and, for the did-not-renew family (lost/cancelled/non_renewed/lapsed),
 * reactivates the policy. Moved/renewed reopen the renewal only. See the renewal_reopen RPC.
 */
export function useReopenRenewal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { renewalId: string }) => {
      const { error } = await (supabase as any).rpc('renewal_reopen', {
        p_renewal_id: params.renewalId,
      });
      if (error) throw new Error(error.message || 'Failed to reopen renewal');
      return params;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      queryClient.invalidateQueries({ queryKey: ['policy-renewal-risk-scores'] });
      queryClient.invalidateQueries({ queryKey: ['account-churn-risk-scores'] });
      toast.success('Renewal reopened');
    },
    onError: (error: Error) => {
      logger.error('[useReopenRenewal] Error:', error);
      toast.error(error.message || 'Failed to reopen renewal');
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
