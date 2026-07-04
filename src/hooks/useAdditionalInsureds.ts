import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

/**
 * Data layer for the Additional Insureds directory (the shared book of
 * certificate holders / additional insureds keyed to additional_insureds.id).
 *
 * Hand-rolled useState/useEffect/useCallback over SECURITY DEFINER RPCs, exactly
 * like useRelationshipGraph.ts. Deliberately NOT React Query: the useCallback
 * stability of `search`/`clear` below is load-bearing for the Add drawer's 250ms
 * debounce effect deps, and this file mirrors the accounts implementation so the
 * two directories behave identically.
 *
 * The merge drawer reuses MergeMember + displayWithGoesBy/formatPremium/maskField
 * straight from useRelationshipGraph (already exported there); this file only owns
 * the AI-specific reads/mutations.
 */

// ---------------------------------------------------------------------------
// Typeahead search (drawer dup-warning + /certificates holder picker share it)
// ---------------------------------------------------------------------------

export interface AdditionalInsuredSearchResult {
  additional_insured_id: string;
  name: string;
  kind: string;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  usage_count: number;
  last_used_at: string | null;
  match_reason: string;
  score: number;
}

/** Trigram/alias-free typeahead over live holders (returns the match reason). */
export function useAdditionalInsuredSearch() {
  const [results, setResults] = useState<AdditionalInsuredSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q || !q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('search_additional_insureds', {
      p_q: q.trim(),
      p_limit: 20,
    });
    if (error) {
      logger.error('additional insured search error', error);
      setResults([]);
    } else {
      setResults((data || []) as unknown as AdditionalInsuredSearchResult[]);
    }
    setLoading(false);
  }, []);

  // Memoized so consumers (the Add drawer's debounce effect) get a stable
  // reference and don't re-run / loop when the drawer is mounted closed.
  const clear = useCallback(() => setResults([]), []);

  return { results, loading, search, clear };
}

// ---------------------------------------------------------------------------
// Resolve-or-create (the drawer Save; never a raw insert)
// ---------------------------------------------------------------------------

export interface ResolveAdditionalInsuredInput {
  name: string;
  kind?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
}

/**
 * Resolve an existing holder or create one, race-safe. From the authenticated
 * staff client we OMIT p_agency_workspace_id so the function derives the caller's
 * active workspace server-side. Returns the resolved id plus whether it matched
 * an existing record (match_basis === 'created' means a fresh row was written).
 */
export async function resolveAdditionalInsured(
  input: ResolveAdditionalInsuredInput,
): Promise<{ id: string; matched: boolean } | null> {
  const { data, error } = await supabase.rpc('resolve_additional_insured', {
    p_name: input.name,
    p_kind: input.kind ?? 'business',
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
    p_address_line1: input.address_line1 ?? null,
    p_address_line2: input.address_line2 ?? null,
    p_city: input.city ?? null,
    p_state: input.state ?? null,
    p_zip: input.zip ?? null,
    p_notes: input.notes ?? null,
    // p_agency_workspace_id intentionally omitted: derived server-side from the
    // caller's active membership. Only service-role callers pass it explicitly.
  });
  if (error) {
    toast({ title: 'Could not save additional insured', description: error.message, variant: 'destructive' });
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as unknown as
    | { id?: string; additional_insured_id?: string; matched?: boolean; match_basis?: string }
    | null;
  if (!row) return null;
  const id = row.id ?? row.additional_insured_id ?? null;
  if (!id) return null;
  const matched =
    typeof row.matched === 'boolean'
      ? row.matched
      : (row.match_basis ?? 'created') !== 'created';
  return { id, matched };
}

// ---------------------------------------------------------------------------
// Directory list + cohort counts
// ---------------------------------------------------------------------------

/** The minimal saved-row shape the drawer hands back to callers on save. */
export interface AdditionalInsuredSavedRow {
  id: string;
  name: string;
  kind: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

export interface AdditionalInsuredListRow {
  additional_insured_id: string;
  name: string;
  kind: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  usage_count: number;
  last_used_at: string | null;
  has_pending_duplicate: boolean;
  created_at: string;
}

export interface AdditionalInsuredCohorts {
  total: number;
  pending_duplicate_groups: number;
  missing_address: number;
  never_used: number;
}

export interface AdditionalInsuredsListFilters {
  q?: string | null;
  kind?: string | null;
  cohort?: string | null;
  limit?: number;
  offset?: number;
}

const EMPTY_COHORTS: AdditionalInsuredCohorts = {
  total: 0,
  pending_duplicate_groups: 0,
  missing_address: 0,
  never_used: 0,
};

export function useAdditionalInsuredsList(filters: AdditionalInsuredsListFilters = {}) {
  const { q = null, kind = null, cohort = null, limit = 100, offset = 0 } = filters;
  const [rows, setRows] = useState<AdditionalInsuredListRow[]>([]);
  const [cohorts, setCohorts] = useState<AdditionalInsuredCohorts>(EMPTY_COHORTS);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const [listRes, cohortRes] = await Promise.all([
      supabase.rpc('list_additional_insureds', {
        p_q: q && q.trim() ? q.trim() : null,
        p_kind: kind || null,
        p_cohort: cohort || null,
        p_limit: limit,
        p_offset: offset,
      }),
      supabase.rpc('count_additional_insured_cohorts'),
    ]);
    if (listRes.error) {
      logger.error('additional insureds list error', listRes.error);
      setRows([]);
    } else {
      setRows((listRes.data || []) as unknown as AdditionalInsuredListRow[]);
    }
    if (cohortRes.error) {
      logger.error('additional insured cohorts error', cohortRes.error);
      setCohorts(EMPTY_COHORTS);
    } else {
      const c = (Array.isArray(cohortRes.data) ? cohortRes.data[0] : cohortRes.data) as
        | unknown as (AdditionalInsuredCohorts | null);
      setCohorts(c ?? EMPTY_COHORTS);
    }
    setLoading(false);
  }, [q, kind, cohort, limit, offset]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { rows, cohorts, loading, refetch };
}

// ---------------------------------------------------------------------------
// Duplicate review queue (reuses duplicate_groups with entity_type='additional_insureds')
// ---------------------------------------------------------------------------

export interface AdditionalInsuredDuplicateMember {
  additional_insured_id: string;
  name: string;
  kind: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  deleted_at: string | null;
  usage_count: number;
}

export interface AdditionalInsuredDuplicateGroup {
  group_id: string;
  match_score: number;
  status: string;
  created_at: string;
  member_count: number;
  members: AdditionalInsuredDuplicateMember[];
}

export function useAdditionalInsuredDuplicateGroups() {
  const [groups, setGroups] = useState<AdditionalInsuredDuplicateGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_additional_insured_duplicate_groups', {
      p_limit: 200,
      p_offset: 0,
    });
    if (error) {
      logger.error('additional insured duplicate groups error', error);
      setGroups([]);
      setTotal(0);
    } else {
      const list = (data || []) as unknown as AdditionalInsuredDuplicateGroup[];
      setGroups(list);
      setTotal(list.length);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const merge = useCallback(
    async (groupId: string, survivorId: string) => {
      const { error } = await supabase.rpc('merge_additional_insured_duplicate_group', {
        p_group_id: groupId,
        p_survivor_id: survivorId,
      });
      if (error) {
        toast({ title: 'Merge failed', description: error.message, variant: 'destructive' });
        return false;
      }
      toast({ title: 'Records merged', description: 'History preserved for undo.' });
      await refetch();
      return true;
    },
    [refetch],
  );

  const dismiss = useCallback(
    async (groupId: string) => {
      const { error } = await supabase.rpc('dismiss_additional_insured_duplicate_group', {
        p_group_id: groupId,
      });
      if (error) {
        toast({ title: 'Could not dismiss', description: error.message, variant: 'destructive' });
        return false;
      }
      await refetch();
      return true;
    },
    [refetch],
  );

  return { groups, total, loading, refetch, merge, dismiss };
}

// ---------------------------------------------------------------------------
// Merge preview / manual merge / un-merge
// Every merge path routes through the DB shared internal
// (_do_additional_insured_merge) reached via staff-gated SECURITY DEFINER wrappers.
// ---------------------------------------------------------------------------

export interface AdditionalInsuredMergeFieldDiff {
  [field: string]: { current: unknown; incoming: unknown };
}

export interface AdditionalInsuredMergePreview {
  mergeable: boolean;
  block_reason: string | null;
  reparent_counts: Record<string, number>;
  reparent_total: number;
  field_diff: AdditionalInsuredMergeFieldDiff;
}

/** Read-only blast-radius preview. Mutates nothing. */
export async function previewAdditionalInsuredMerge(
  survivorId: string,
  loserIds: string[],
): Promise<AdditionalInsuredMergePreview | null> {
  const { data, error } = await supabase.rpc('preview_additional_insured_merge', {
    p_survivor: survivorId,
    p_losers: loserIds,
  });
  if (error) {
    toast({ title: 'Could not preview merge', description: error.message, variant: 'destructive' });
    return null;
  }
  return data as unknown as AdditionalInsuredMergePreview;
}

/** Manual merge through the shared engine (same guards / reparent / tombstone). */
export async function mergeAdditionalInsuredsManual(
  survivorId: string,
  loserIds: string[],
): Promise<boolean> {
  const { error } = await supabase.rpc('merge_additional_insureds_manual', {
    p_survivor: survivorId,
    p_losers: loserIds,
  });
  if (error) {
    toast({ title: 'Merge failed', description: error.message, variant: 'destructive' });
    return false;
  }
  toast({ title: 'Records merged', description: 'History preserved for undo.' });
  return true;
}

/** Reverse a single-loser merge (moves reparented children back, restores scalars). */
export async function unmergeAdditionalInsured(mergeHistoryId: string): Promise<boolean> {
  const { error } = await supabase.rpc('unmerge_additional_insured', {
    p_merge_history_id: mergeHistoryId,
  });
  if (error) {
    toast({ title: 'Un-merge failed', description: error.message, variant: 'destructive' });
    return false;
  }
  toast({ title: 'Merge reversed', description: 'The record was restored.' });
  return true;
}
