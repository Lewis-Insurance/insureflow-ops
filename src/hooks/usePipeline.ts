/**
 * The pipeline data layer.
 *
 * Everything that changes an item goes through one of the four database functions
 * (pipeline_start, pipeline_bind, pipeline_mark_lost, lead_promote) or through a
 * narrow table write for the things that are genuinely just edits: stage, follow up
 * date, assignees, quotes and notes. The functions own anything that has to be one
 * transaction or has to be idempotent.
 *
 * The generated Supabase types predate these tables, so the table names and the RPC
 * names are cast. That is the established convention in this codebase (see
 * useCertificates, useRenewalWorkflow) and not something to "fix" here by regenerating
 * types as a side effect of a feature.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';
import type { PipelineKind, PipelineStage, LostReason, QuoteStatus } from '@/lib/pipeline/stages';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineParty {
  id: string;
  name: string;
  kind: 'lead' | 'account';
  phone: string | null;
  email: string | null;
}

export interface PipelineQuote {
  id: string;
  item_id: string;
  line: string;
  carrier_id: string | null;
  carrier_text: string | null;
  carrier_name: string | null;
  premium: number | null;
  term: 'semiannual' | 'annual' | null;
  quoted_date: string | null;
  status: QuoteStatus;
  note: string | null;
  bound_policy_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PipelineNote {
  id: string;
  item_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  author_name?: string | null;
}

export interface PipelineItem {
  id: string;
  agency_workspace_id: string;
  lead_id: string | null;
  account_id: string | null;
  kind: PipelineKind;
  stage: PipelineStage;
  source_renewal_id: string | null;
  source_policy_id: string | null;
  lines_wanted: string[];
  assignees: string[];
  next_follow_up_date: string | null;
  last_touch_at: string;
  lost_reason: LostReason | null;
  lost_note: string | null;
  bound_at: string | null;
  bind_result: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  party: PipelineParty | null;
  quotes: PipelineQuote[];
}

export interface PipelineFilters {
  search?: string;
  mine?: boolean;
  kinds?: PipelineKind[];
  hideClosed?: boolean;
  stage?: PipelineStage;
}

export const pipelineKeys = {
  all: ['pipeline'] as const,
  lists: () => [...pipelineKeys.all, 'list'] as const,
  list: (filters: PipelineFilters) => [...pipelineKeys.lists(), filters] as const,
  details: () => [...pipelineKeys.all, 'detail'] as const,
  detail: (id: string) => [...pipelineKeys.details(), id] as const,
  notes: (id: string) => [...pipelineKeys.all, 'notes', id] as const,
};

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

function partyFromRow(row: Record<string, any>): PipelineParty | null {
  if (row.lead) {
    const lead = row.lead;
    const name =
      (lead.company_name && String(lead.company_name).trim()) ||
      [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() ||
      'Unnamed prospect';
    return { id: lead.id, name, kind: 'lead', phone: lead.phone ?? null, email: lead.email ?? null };
  }
  if (row.account) {
    const account = row.account;
    return {
      id: account.id,
      name: account.name ?? 'Unnamed customer',
      kind: 'account',
      phone: account.phone ?? null,
      email: account.email ?? null,
    };
  }
  return null;
}

function quoteFromRow(row: Record<string, any>): PipelineQuote {
  return {
    id: row.id,
    item_id: row.item_id,
    line: row.line,
    carrier_id: row.carrier_id ?? null,
    carrier_text: row.carrier_text ?? null,
    carrier_name: row.carrier?.name ?? row.carrier_text ?? null,
    premium: row.premium === null || row.premium === undefined ? null : Number(row.premium),
    term: row.term ?? null,
    quoted_date: row.quoted_date ?? null,
    status: row.status,
    note: row.note ?? null,
    bound_policy_id: row.bound_policy_id ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
  };
}

function itemFromRow(row: Record<string, any>): PipelineItem {
  return {
    id: row.id,
    agency_workspace_id: row.agency_workspace_id,
    lead_id: row.lead_id ?? null,
    account_id: row.account_id ?? null,
    kind: row.kind,
    stage: row.stage,
    source_renewal_id: row.source_renewal_id ?? null,
    source_policy_id: row.source_policy_id ?? null,
    lines_wanted: row.lines_wanted ?? [],
    assignees: row.assignees ?? [],
    next_follow_up_date: row.next_follow_up_date ?? null,
    last_touch_at: row.last_touch_at,
    lost_reason: row.lost_reason ?? null,
    lost_note: row.lost_note ?? null,
    bound_at: row.bound_at ?? null,
    bind_result: row.bind_result ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    party: partyFromRow(row),
    quotes: (row.quotes ?? []).map(quoteFromRow),
  };
}

const ITEM_SELECT = `
  *,
  lead:leads!pipeline_items_lead_id_fkey(id, first_name, last_name, company_name, phone, email),
  account:accounts!pipeline_items_account_id_fkey(id, name, phone, email),
  quotes:pipeline_quotes!pipeline_quotes_item_id_fkey(
    *, carrier:carriers!pipeline_quotes_carrier_id_fkey(id, name, naic)
  )
`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function usePipelineItems(filters: PipelineFilters = {}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: pipelineKeys.list(filters),
    queryFn: async (): Promise<PipelineItem[]> => {
      let query = (supabase as any)
        .from('pipeline_items')
        .select(ITEM_SELECT)
        .is('deleted_at', null)
        .order('last_touch_at', { ascending: false });

      if (filters.hideClosed !== false) {
        query = query.not('stage', 'in', '("bound","lost")');
      }
      if (filters.kinds && filters.kinds.length > 0) {
        query = query.in('kind', filters.kinds);
      }
      if (filters.stage) {
        query = query.eq('stage', filters.stage);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Could not load the pipeline: ${error.message}`);

      let items = ((data ?? []) as Record<string, any>[]).map(itemFromRow);

      // Party name and quote carrier live on embedded rows, so the text search is done
      // here rather than in PostgREST. The board is a working set, not the whole book.
      const term = (filters.search ?? '').trim().toLowerCase();
      if (term) {
        items = items.filter(
          (item) =>
            item.party?.name.toLowerCase().includes(term) ||
            item.party?.phone?.toLowerCase().includes(term) ||
            item.party?.email?.toLowerCase().includes(term) ||
            item.lines_wanted.some((line) => line.toLowerCase().includes(term)) ||
            item.quotes.some((quote) => (quote.carrier_name ?? '').toLowerCase().includes(term)),
        );
      }

      if (filters.mine && user?.id) {
        items = items.filter((item) => item.assignees.includes(user.id));
      }

      return items;
    },
    staleTime: 30 * 1000,
  });
}

export function usePipelineItem(itemId?: string) {
  return useQuery({
    queryKey: pipelineKeys.detail(itemId ?? 'none'),
    queryFn: async (): Promise<PipelineItem | null> => {
      if (!itemId) return null;
      const { data, error } = await (supabase as any)
        .from('pipeline_items')
        .select(ITEM_SELECT)
        .eq('id', itemId)
        .maybeSingle();
      if (error) throw new Error(`Could not load that item: ${error.message}`);
      return data ? itemFromRow(data as Record<string, any>) : null;
    },
    enabled: !!itemId,
  });
}

export function usePipelineNotes(itemId?: string) {
  return useQuery({
    queryKey: pipelineKeys.notes(itemId ?? 'none'),
    queryFn: async (): Promise<PipelineNote[]> => {
      if (!itemId) return [];
      const { data, error } = await (supabase as any)
        .from('pipeline_notes')
        .select('*, author:profiles!pipeline_notes_created_by_fkey(full_name)')
        .eq('item_id', itemId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load the notes: ${error.message}`);
      return ((data ?? []) as Record<string, any>[]).map((row) => ({
        id: row.id,
        item_id: row.item_id,
        body: row.body,
        created_by: row.created_by ?? null,
        created_at: row.created_at,
        author_name: row.author?.full_name ?? null,
      }));
    },
    enabled: !!itemId,
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function useInvalidatePipeline() {
  const queryClient = useQueryClient();
  return (itemId?: string) => {
    queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    if (itemId) {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(itemId) });
      queryClient.invalidateQueries({ queryKey: pipelineKeys.notes(itemId) });
    }
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  };
}

export interface StartPipelineInput {
  kind: PipelineKind;
  leadId?: string | null;
  accountId?: string | null;
  sourceRenewalId?: string | null;
  sourcePolicyId?: string | null;
  lines?: string[];
  assignSelf?: boolean;
}

export function useStartPipelineItem() {
  const invalidate = useInvalidatePipeline();

  return useMutation({
    mutationFn: async (input: StartPipelineInput) => {
      const { data, error } = await (supabase as any).rpc('pipeline_start', {
        p_kind: input.kind,
        p_lead_id: input.leadId ?? null,
        p_account_id: input.accountId ?? null,
        p_source_renewal_id: input.sourceRenewalId ?? null,
        p_source_policy_id: input.sourcePolicyId ?? null,
        p_lines: input.lines ?? [],
        p_assign_self: input.assignSelf ?? true,
      });
      if (error) throw error;
      return data as { item_id: string; created: boolean; stage: PipelineStage };
    },
    onSuccess: (result) => {
      invalidate(result.item_id);
      toast.success(result.created ? 'Added to the pipeline' : 'Already in the pipeline, opening it');
    },
    onError: (error: Error) => {
      logger.error('pipeline_start failed', error);
      toast.error(error.message || 'Could not add that to the pipeline');
    },
  });
}

export interface BindPolicyInput {
  quote_id: string;
  policy_number: string;
  effective_date: string;
  expiration_date?: string | null;
}

export interface BindInput {
  itemId: string;
  policies: BindPolicyInput[];
  partyMode?: 'create' | 'attach' | null;
  accountId?: string | null;
  note?: string | null;
}

export function useBindPipelineItem() {
  const invalidate = useInvalidatePipeline();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: BindInput) => {
      const { data, error } = await (supabase as any).rpc('pipeline_bind', {
        p_item_id: input.itemId,
        p_policies: input.policies,
        p_party_mode: input.partyMode ?? null,
        p_account_id: input.accountId ?? null,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return data as {
        item_id: string;
        account_id: string;
        policy_ids: string[];
        policy_count: number;
        premium_total: number;
        renewal_outcome: string | null;
        already_bound: boolean;
      };
    },
    onSuccess: (result) => {
      invalidate(result.item_id);
      // A bind touches half the app, so the invalidation is deliberately wide.
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });

      if (result.already_bound) {
        toast.success('That sale was already bound. Showing what it produced.');
      } else {
        const lines = result.policy_count === 1 ? '1 policy' : `${result.policy_count} policies`;
        toast.success(`Bound. ${lines} written.`);
      }
    },
    onError: (error: Error) => {
      logger.error('pipeline_bind failed', error);
      toast.error(error.message || 'The bind did not go through. Nothing was saved.');
    },
  });
}

export function useMarkPipelineItemLost() {
  const invalidate = useInvalidatePipeline();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      itemId: string;
      reason: LostReason;
      note?: string | null;
      closeRenewal?: boolean;
    }) => {
      const { data, error } = await (supabase as any).rpc('pipeline_mark_lost', {
        p_item_id: input.itemId,
        p_reason: input.reason,
        p_note: input.note ?? null,
        p_close_renewal: input.closeRenewal ?? false,
      });
      if (error) throw error;
      return data as { item_id: string; already_lost: boolean; renewal_outcome: string | null };
    },
    onSuccess: (result) => {
      invalidate(result.item_id);
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      toast.success(result.already_lost ? 'That was already closed' : 'Closed as lost');
    },
    onError: (error: Error) => {
      logger.error('pipeline_mark_lost failed', error);
      toast.error(error.message || 'Could not close that item');
    },
  });
}

export function useUpdatePipelineItem() {
  const invalidate = useInvalidatePipeline();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      stage?: PipelineStage;
      next_follow_up_date?: string | null;
      assignees?: string[];
      lines_wanted?: string[];
    }) => {
      const patch: Record<string, unknown> = {};
      if (input.stage !== undefined) patch.stage = input.stage;
      if (input.next_follow_up_date !== undefined) patch.next_follow_up_date = input.next_follow_up_date || null;
      if (input.assignees !== undefined) patch.assignees = input.assignees;
      if (input.lines_wanted !== undefined) patch.lines_wanted = input.lines_wanted;

      const { error } = await (supabase as any)
        .from('pipeline_items')
        .update(patch)
        .eq('id', input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => invalidate(input.id),
    onError: (error: Error) => {
      logger.error('pipeline item update failed', error);
      toast.error(error.message || 'That change did not save');
    },
  });
}

export function useAddPipelineQuote() {
  const invalidate = useInvalidatePipeline();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      itemId: string;
      line: string;
      carrierId?: string | null;
      carrierText?: string | null;
      premium?: number | null;
      term?: 'semiannual' | 'annual' | null;
      quotedDate?: string | null;
      note?: string | null;
    }) => {
      const { error } = await (supabase as any).from('pipeline_quotes').insert({
        item_id: input.itemId,
        line: input.line,
        carrier_id: input.carrierId ?? null,
        carrier_text: input.carrierId ? null : input.carrierText ?? null,
        premium: input.premium ?? null,
        term: input.term ?? null,
        quoted_date: input.quotedDate ?? null,
        note: input.note ?? null,
        status: 'quoted',
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      return input.itemId;
    },
    onSuccess: (itemId) => {
      invalidate(itemId);
      toast.success('Quote added');
    },
    onError: (error: Error) => {
      logger.error('quote insert failed', error);
      toast.error(error.message || 'Could not add that quote');
    },
  });
}

export function useUpdatePipelineQuote() {
  const invalidate = useInvalidatePipeline();

  return useMutation({
    mutationFn: async (input: { id: string; itemId: string; status?: QuoteStatus; premium?: number | null }) => {
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.premium !== undefined) patch.premium = input.premium;
      const { error } = await (supabase as any).from('pipeline_quotes').update(patch).eq('id', input.id);
      if (error) throw error;
      return input.itemId;
    },
    onSuccess: (itemId) => invalidate(itemId),
    onError: (error: Error) => toast.error(error.message || 'Could not update that quote'),
  });
}

export function useAddPipelineNote() {
  const invalidate = useInvalidatePipeline();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { itemId: string; body: string }) => {
      const body = input.body.trim();
      if (!body) throw new Error('A note needs something in it');
      const { error } = await (supabase as any).from('pipeline_notes').insert({
        item_id: input.itemId,
        body,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      return input.itemId;
    },
    onSuccess: (itemId) => invalidate(itemId),
    onError: (error: Error) => toast.error(error.message || 'Could not save that note'),
  });
}

export function usePromoteLead() {
  const invalidate = useInvalidatePipeline();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { leadId: string; mode: 'create' | 'attach'; accountId?: string | null }) => {
      const { data, error } = await (supabase as any).rpc('lead_promote', {
        p_lead_id: input.leadId,
        p_mode: input.mode,
        p_account_id: input.accountId ?? null,
      });
      if (error) throw error;
      return data as { account_id: string; created: boolean; already_promoted: boolean };
    },
    onSuccess: (result) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(
        result.already_promoted
          ? 'That prospect already has a customer file'
          : result.created
            ? 'Customer file created'
            : 'Attached to the existing customer',
      );
    },
    onError: (error: Error) => {
      logger.error('lead_promote failed', error);
      toast.error(error.message || 'Could not create the customer file');
    },
  });
}

/** The staff on this workspace, for the Who is on it picker and card initials. */
export function useWorkspaceStaff() {
  return useQuery({
    queryKey: ['workspace-staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('is_staff', true)
        .is('deleted_at', null)
        .order('full_name');
      if (error) throw new Error(`Could not load the team: ${error.message}`);
      return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Used by the New Lead page's quiet duplicate line. */
export function useOpenItemForLead(leadId?: string) {
  return useQuery({
    queryKey: [...pipelineKeys.all, 'open-for-lead', leadId ?? 'none'],
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await (supabase as any)
        .from('pipeline_items')
        .select('id, stage')
        .eq('lead_id', leadId)
        .is('deleted_at', null)
        .not('stage', 'in', '("bound","lost")')
        .maybeSingle();
      if (error) return null;
      return data as { id: string; stage: PipelineStage } | null;
    },
    enabled: !!leadId,
  });
}
