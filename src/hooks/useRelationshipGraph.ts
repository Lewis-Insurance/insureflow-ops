import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

/**
 * Data layer for the account relationship graph (account_relationships +
 * account_aliases + account_relationship_suggestions + the dedup queue).
 * Everything keys to accounts.id; reads go through SECURITY DEFINER RPCs that
 * resolve the other account and roll up its policies/premium server-side.
 */

export interface AccountRelationship {
  relationship_id: string;
  direction: 'outgoing' | 'incoming';
  rel_type: string;
  display_label: string;
  role: string | null;
  is_primary: boolean;
  source: string;
  note: string | null;
  other_account_id: string;
  other_name: string;
  other_goes_by: string | null;
  other_type: string;
  other_status: string | null;
  other_policies_count: number;
  other_active_premium: number | null;
  other_next_expiration: string | null;
}

export interface LinkSuggestion {
  suggestion_id: string;
  direction: string;
  rel_type: string;
  suggested_label: string;
  signal: string;
  reason: string | null;
  confidence: number;
  other_account_id: string;
  other_name: string;
  other_goes_by: string | null;
  other_type: string;
  other_policies_count: number;
  other_active_premium: number | null;
}

export interface HouseholdSummary {
  household_id: string;
  household_name: string | null;
  tier: string | null;
  member_count: number;
  active_policies: number;
  is_mixed_line: boolean | null;
  household_premium: number | null;
}

export interface AccountSearchResult {
  account_id: string;
  name: string;
  goes_by: string | null;
  type: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  policies_count: number;
  match_reason: string;
  score: number;
}

/** Relationship type vocabulary surfaced for manual linking (enforced, small). */
export const REL_TYPE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'owns', label: 'Owns', hint: 'This person owns the other account (e.g. a business).' },
  { value: 'spouse', label: 'Spouse', hint: 'Married / domestic partner.' },
  { value: 'parent_company', label: 'Parent company', hint: 'This account is the parent of the other.' },
  { value: 'related', label: 'Related', hint: 'Any other connection (family, referral, guarantor).' },
];

export function useAccountRelationships(accountId?: string) {
  const [relationships, setRelationships] = useState<AccountRelationship[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!accountId) {
      setRelationships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('get_account_relationships', { p_account_id: accountId });
    if (error) {
      logger.error('relationships fetch error', error);
      setRelationships([]);
    } else {
      setRelationships((data || []) as AccountRelationship[]);
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { relationships, loading, refetch };
}

export function useAccountLinkSuggestions(accountId?: string) {
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!accountId) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('get_account_link_suggestions', { p_account_id: accountId });
    if (error) {
      logger.error('suggestions fetch error', error);
      setSuggestions([]);
    } else {
      setSuggestions((data || []) as LinkSuggestion[]);
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const confirm = useCallback(
    async (suggestionId: string, role?: string | null) => {
      const { error } = await supabase.rpc('confirm_relationship_suggestion', {
        p_suggestion_id: suggestionId,
        p_role: role ?? null,
      });
      if (error) {
        toast({ title: 'Could not confirm link', description: error.message, variant: 'destructive' });
        return false;
      }
      toast({ title: 'Link confirmed' });
      await refetch();
      return true;
    },
    [refetch],
  );

  const dismiss = useCallback(
    async (suggestionId: string) => {
      const { error } = await supabase
        .from('account_relationship_suggestions')
        .update({ status: 'dismissed', reviewed_at: new Date().toISOString() })
        .eq('id', suggestionId);
      if (error) {
        toast({ title: 'Could not dismiss', description: error.message, variant: 'destructive' });
        return false;
      }
      await refetch();
      return true;
    },
    [refetch],
  );

  return { suggestions, loading, refetch, confirm, dismiss };
}

export function useHouseholdSummary(householdId?: string | null) {
  const [summary, setSummary] = useState<HouseholdSummary | null>(null);

  useEffect(() => {
    let active = true;
    if (!householdId) {
      setSummary(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('household_rollup')
        .select('*')
        .eq('household_id', householdId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        logger.error('household summary error', error);
        setSummary(null);
      } else {
        setSummary((data as HouseholdSummary) ?? null);
      }
    })();
    return () => {
      active = false;
    };
  }, [householdId]);

  return summary;
}

/** Alias-aware typeahead over live accounts (returns the match reason). */
export function useAccountSearch() {
  const [results, setResults] = useState<AccountSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q || !q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('search_accounts', { p_q: q.trim(), p_limit: 20 });
    if (error) {
      logger.error('account search error', error);
      setResults([]);
    } else {
      setResults((data || []) as AccountSearchResult[]);
    }
    setLoading(false);
  }, []);

  // Memoized so consumers (LinkAccountDrawer's debounce effect) get a stable
  // reference and don't re-run / loop when the drawer is mounted closed.
  const clear = useCallback(() => setResults([]), []);

  return { results, loading, search, clear };
}

export async function linkAccounts(params: {
  fromAccount: string;
  toAccount: string;
  relType: string;
  role?: string | null;
  note?: string | null;
}): Promise<boolean> {
  const { error } = await supabase.from('account_relationships').insert({
    from_account: params.fromAccount,
    to_account: params.toAccount,
    rel_type: params.relType,
    role: params.role ?? null,
    note: params.note ?? null,
    source: 'manual',
  });
  if (error) {
    toast({ title: 'Could not link account', description: error.message, variant: 'destructive' });
    return false;
  }
  return true;
}

/** Fetch the editable attributes of a single edge (for the Edit drawer prefill). */
export async function getRelationshipDetail(
  relationshipId: string,
): Promise<{ rel_type: string; role: string | null; ownership_pct: number | null } | null> {
  const { data, error } = await supabase
    .from('account_relationships')
    .select('rel_type, role, ownership_pct')
    .eq('id', relationshipId)
    .maybeSingle();
  if (error) {
    logger.error('relationship detail error', error);
    return null;
  }
  return data ?? null;
}

export async function updateRelationship(
  relationshipId: string,
  fields: { relType?: string; role?: string | null; ownershipPct?: number | null },
): Promise<boolean> {
  const patch: { rel_type?: string; role?: string | null; ownership_pct?: number | null } = {};
  if (fields.relType !== undefined) patch.rel_type = fields.relType;
  if (fields.role !== undefined) patch.role = fields.role;
  if (fields.ownershipPct !== undefined) patch.ownership_pct = fields.ownershipPct;
  const { error } = await supabase.from('account_relationships').update(patch).eq('id', relationshipId);
  if (error) {
    toast({ title: 'Could not update link', description: error.message, variant: 'destructive' });
    return false;
  }
  return true;
}

export async function unlinkRelationship(relationshipId: string): Promise<boolean> {
  const { error } = await supabase.from('account_relationships').delete().eq('id', relationshipId);
  if (error) {
    toast({ title: 'Could not remove link', description: error.message, variant: 'destructive' });
    return false;
  }
  return true;
}

/**
 * Set, change, or clear the "goes by" name. Keeps the searchable nickname alias
 * in sync: a changed/cleared value removes the prior nickname alias, a set value
 * seeds a new one. Pass the previous value so the stale alias can be removed.
 */
export async function setGoesBy(accountId: string, goesBy: string, previous?: string | null): Promise<boolean> {
  const trimmed = goesBy.trim();
  const prev = (previous ?? '').trim();

  const { error } = await supabase
    .from('accounts')
    .update({ goes_by: trimmed || null })
    .eq('id', accountId);
  if (error) {
    toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    return false;
  }

  // Remove the prior nickname alias when the value changed or was cleared.
  if (prev && prev.toLowerCase() !== trimmed.toLowerCase()) {
    const { error: delError } = await supabase
      .from('account_aliases')
      .delete()
      .eq('account_id', accountId)
      .eq('alias_type', 'nickname')
      .ilike('alias', prev);
    if (delError) logger.warn('alias remove non-fatal error', delError);
  }

  // Feed the alias index for the new value. A duplicate is fine (unique index).
  if (trimmed) {
    const { error: aliasError } = await supabase
      .from('account_aliases')
      .insert({ account_id: accountId, alias: trimmed, alias_type: 'nickname', source: 'staff_entry' });
    if (aliasError && !/duplicate|unique/i.test(aliasError.message)) {
      logger.warn('alias insert non-fatal error', aliasError);
    }
  }
  return true;
}

export interface DuplicateMember {
  account_id: string;
  name: string;
  goes_by: string | null;
  type: string;
  status: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  deleted_at: string | null;
  policies_count: number;
  active_premium: number | null;
}

export interface DuplicateGroup {
  group_id: string;
  entity_type: string;
  match_score: number;
  status: string;
  created_at: string;
  member_count: number;
  members: DuplicateMember[];
}

export function useDuplicateGroups() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, countRes] = await Promise.all([
      supabase.rpc('list_duplicate_groups_for_review', { p_limit: 200, p_offset: 0 }),
      supabase
        .from('duplicate_groups')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'accounts')
        .eq('status', 'pending'),
    ]);
    if (error) {
      logger.error('duplicate groups error', error);
      setGroups([]);
    } else {
      setGroups((data || []) as unknown as DuplicateGroup[]);
    }
    setTotal(countRes.count || 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const merge = useCallback(
    async (groupId: string, survivorId: string) => {
      const { error } = await supabase.rpc('relgraph_merge_duplicate_group', {
        p_group_id: groupId,
        p_survivor_id: survivorId,
      });
      if (error) {
        toast({ title: 'Merge failed', description: error.message, variant: 'destructive' });
        return false;
      }
      toast({ title: 'Records merged', description: 'History preserved with a same-as link.' });
      await refetch();
      return true;
    },
    [refetch],
  );

  return { groups, total, loading, refetch, merge };
}

/** Display "David \"Lance\" McDonald" when a goes_by is present. */
export function displayWithGoesBy(name: string, goesBy?: string | null): string {
  if (goesBy && goesBy.trim() && goesBy.trim().toLowerCase() !== name.trim().toLowerCase()) {
    return `${name} "${goesBy.trim()}"`;
  }
  return name;
}

/** Premium roll-up formatting. Unknown premium shows "—", never "$0" (DATA-REALITY.md). */
export function formatPremium(amount?: number | null): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Friendly account-type label: household => Individual, *_business => Business. */
export function accountTypeLabel(type?: string | null): string {
  if (!type) return 'Account';
  if (/business|commercial|organization|org/i.test(type)) return 'Business';
  return 'Individual';
}
