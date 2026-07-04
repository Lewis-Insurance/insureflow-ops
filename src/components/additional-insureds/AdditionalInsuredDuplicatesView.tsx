import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusPill, Chip, SectionLabel } from '@/components/cc';
import {
  GitMerge,
  RefreshCw,
  CheckCircle2,
  Building2,
  User,
  Undo2,
  History,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import {
  useAdditionalInsuredDuplicateGroups,
  unmergeAdditionalInsured,
  type AdditionalInsuredDuplicateGroup,
  type AdditionalInsuredDuplicateMember,
} from '@/hooks/useAdditionalInsureds';
import {
  AdditionalInsuredMergeDrawer,
  type AdditionalInsuredMergeMember,
} from './AdditionalInsuredMergeDrawer';

/**
 * Dedup review surface for additional insureds, forked from the accounts
 * DuplicatesReviewPage GroupCard. Rendered INSIDE the /additional-insureds page
 * when the "Possible duplicates" triage tile is active (not a separate route).
 *
 * Per group: a card with the first-member name, a record count, an optional
 * match% chip, a "Review & merge" primary, a "Not a match" dismiss, and the
 * member sub-cards. A "Recently merged" footer reads merge_history directly
 * (entity_type = 'additional_insureds', not yet un-merged) and offers Undo.
 */

function kindIcon(kind: string) {
  return /individual|person/i.test(kind) ? User : Building2;
}

function kindLabel(kind: string) {
  if (!kind) return 'Business';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function GroupCard({
  group,
  onReview,
  onDismiss,
  dismissing,
}: {
  group: AdditionalInsuredDuplicateGroup;
  onReview: (g: AdditionalInsuredDuplicateGroup) => void;
  onDismiss: (g: AdditionalInsuredDuplicateGroup) => void;
  dismissing: boolean;
}) {
  const members = group.members || [];
  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel>{members[0] ? members[0].name : 'Duplicate group'}</SectionLabel>
          <Chip>
            <span className="cc-num">{group.member_count}</span>&nbsp;records
          </Chip>
          {group.match_score != null && (
            <Chip>
              match&nbsp;<span className="cc-num">{Math.round(group.match_score * 100)}%</span>
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={dismissing}
            onClick={() => onDismiss(group)}
            className="gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
          >
            <XCircle className="h-4 w-4" />
            Not a match
          </Button>
          <Button
            data-primary
            size="sm"
            onClick={() => onReview(group)}
            className="gap-1.5 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
          >
            <GitMerge className="h-4 w-4" />
            Review &amp; merge
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {members.map((m: AdditionalInsuredDuplicateMember) => {
          const Icon = kindIcon(m.kind);
          return (
            <div
              key={m.additional_insured_id}
              className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-cc-text-muted" />
                  <span className="text-sm font-medium text-cc-text-primary">{m.name}</span>
                </div>
                {m.deleted_at ? <Chip>Deleted</Chip> : <Chip>{kindLabel(m.kind)}</Chip>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-cc-text-muted">
                <span className="cc-num">{m.usage_count} certs</span>
                {(m.city || m.state) && <span>{[m.city, m.state].filter(Boolean).join(', ')}</span>}
                {m.email && <span className="truncate">{m.email}</span>}
                {m.phone && <span className="cc-num">{m.phone}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recently merged (reads merge_history directly; staff RLS permits SELECT)
// ---------------------------------------------------------------------------

interface RecentAiMerge {
  merge_history_id: string;
  survivor_name: string;
  loser_name: string;
  reparent_total: number;
  merged_at: string;
}

function useRecentAdditionalInsuredMerges() {
  const [merges, setMerges] = useState<RecentAiMerge[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('merge_history')
      .select('id, merged_ids, merge_data, created_at, unmerged_at, entity_type')
      .eq('entity_type', 'additional_insureds')
      .is('unmerged_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      logger.error('additional insured recent merges error', error);
      setMerges([]);
      setLoading(false);
      return;
    }
    const rows = (data || [])
      // Single-loser merges only are reversible via unmerge.
      .filter((h) => Array.isArray(h.merged_ids) && h.merged_ids.length === 1)
      .map((h) => {
        const md = (h.merge_data ?? {}) as Record<string, unknown>;
        const survivorBefore = (md.survivor_before ?? {}) as Record<string, unknown>;
        const losersBefore = (md.losers_before ?? []) as Array<Record<string, unknown>>;
        return {
          merge_history_id: h.id as string,
          survivor_name: (survivorBefore.name as string) ?? 'Survivor',
          loser_name: (losersBefore[0]?.name as string) ?? 'A record',
          reparent_total: Number(md.reparent_total ?? 0),
          merged_at: h.created_at as string,
        };
      });
    setMerges(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { merges, loading, refetch };
}

function RecentlyMerged({ refreshKey, onUndone }: { refreshKey: number; onUndone: () => void }) {
  const { merges, loading, refetch } = useRecentAdditionalInsuredMerges();
  const [undoing, setUndoing] = useState<string | null>(null);

  // Re-read whenever a merge lands upstream.
  useEffect(() => {
    if (refreshKey > 0) refetch();
  }, [refreshKey, refetch]);

  const handleUndo = async (id: string) => {
    setUndoing(id);
    const ok = await unmergeAdditionalInsured(id);
    setUndoing(null);
    if (ok) {
      await refetch();
      onUndone();
    }
  };

  if (loading) {
    return <div className="h-24 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />;
  }
  if (merges.length === 0) {
    return (
      <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-8 text-center text-sm text-cc-text-muted shadow-card">
        No reversible merges yet.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {merges.map((m) => (
        <div
          key={m.merge_history_id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface px-4 py-3 shadow-card"
        >
          <div className="min-w-0 text-sm">
            <span className="text-cc-text-primary">{m.loser_name}</span>
            <span className="text-cc-text-muted"> merged into </span>
            <span className="text-cc-text-primary">{m.survivor_name}</span>
            <div className="mt-0.5 text-xs text-cc-text-muted">
              <span className="cc-num">{m.reparent_total}</span> records moved ·{' '}
              {formatLocalDateDisplay(m.merged_at)}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={undoing === m.merge_history_id}
            onClick={() => handleUndo(m.merge_history_id)}
            aria-label={`Undo merge into ${m.survivor_name}`}
            className="gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            <Undo2 className="h-4 w-4" />
            Undo
          </Button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The review view
// ---------------------------------------------------------------------------

export function AdditionalInsuredDuplicatesView({ onChanged }: { onChanged?: () => void }) {
  const { groups, total, loading, refetch, merge, dismiss } = useAdditionalInsuredDuplicateGroups();
  const [activeGroup, setActiveGroup] = useState<AdditionalInsuredDuplicateGroup | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const bumpHistory = () => setHistoryKey((k) => k + 1);
  const notifyChanged = () => onChanged?.();

  const drawerMembers: AdditionalInsuredMergeMember[] = (activeGroup?.members ?? []).map((m) => ({
    additional_insured_id: m.additional_insured_id,
    name: m.name,
    kind: m.kind,
    deleted_at: m.deleted_at,
    usage_count: m.usage_count,
    created_at: m.created_at,
  }));

  const handleDismiss = async (g: AdditionalInsuredDuplicateGroup) => {
    setDismissingId(g.group_id);
    const ok = await dismiss(g.group_id);
    setDismissingId(null);
    if (ok) notifyChanged();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-cc-text-muted">
          <span className="cc-num">{total}</span> group{total === 1 ? '' : 's'} to review. Preview the
          blast radius, pick the record to keep, then merge.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={refetch}
          className="gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
          <div className="h-40 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-16 text-center shadow-card">
          <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-cc-success" />
          <p className="text-sm text-cc-text-secondary">No groups to review. The book is clean.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <GroupCard
              key={g.group_id}
              group={g}
              onReview={setActiveGroup}
              onDismiss={handleDismiss}
              dismissing={dismissingId === g.group_id}
            />
          ))}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-cc-text-muted" />
          <SectionLabel>Recently merged</SectionLabel>
        </div>
        <RecentlyMerged refreshKey={historyKey} onUndone={notifyChanged} />
      </section>

      <AdditionalInsuredMergeDrawer
        open={!!activeGroup}
        onOpenChange={(o) => !o && setActiveGroup(null)}
        members={drawerMembers}
        onConfirm={async (survivorId) => {
          if (!activeGroup) return false;
          const ok = await merge(activeGroup.group_id, survivorId);
          if (ok) {
            bumpHistory();
            notifyChanged();
          }
          return ok;
        }}
      />
    </div>
  );
}
