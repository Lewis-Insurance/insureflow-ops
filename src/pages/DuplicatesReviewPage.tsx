import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { StatusPill, Chip, SectionLabel } from '@/components/cc';
import { GitMerge, RefreshCw, CheckCircle2, Building2, User, ExternalLink, Undo2, ShieldAlert, History } from 'lucide-react';
import { MergePreviewDrawer, type MergeMember } from '@/components/relationships/MergePreviewDrawer';
import {
  useDuplicateGroups,
  useRecentMerges,
  unmergeAccount,
  invalidateAccountDataCaches,
  displayWithGoesBy,
  formatPremium,
  accountTypeLabel,
  type DuplicateGroup,
} from '@/hooks/useRelationshipGraph';
import { formatLocalDateDisplay } from '@/lib/date/localDate';

function typeIcon(type: string) {
  return /business|commercial|organization|org/i.test(type) ? Building2 : User;
}

function GroupCard({ group, onReview }: { group: DuplicateGroup; onReview: (g: DuplicateGroup) => void }) {
  const members = group.members || [];
  const isBlocked = group.status === 'link_candidate';
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
          {isBlocked && (
            <span className="inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs"
              style={{ backgroundColor: 'color-mix(in srgb, var(--cc-danger) 14%, transparent)', color: 'var(--cc-danger-pill-text)' }}>
              <ShieldAlert className="h-3 w-3" /> Likely not a merge
            </span>
          )}
        </div>
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

      <div className="grid gap-2 md:grid-cols-2">
        {members.map((m) => {
          const Icon = typeIcon(m.type);
          return (
            <div key={m.account_id} className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-cc-text-muted" />
                  <span className="truncate text-sm font-medium text-cc-text-primary">
                    {displayWithGoesBy(m.name, m.goes_by)}
                  </span>
                </div>
                {m.deleted_at ? <Chip>Deleted</Chip> : m.status ? <StatusPill status={m.status} /> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-cc-text-muted">
                <span>{accountTypeLabel(m.type)}</span>
                <span className="cc-num">
                  {m.policies_count} polic{m.policies_count === 1 ? 'y' : 'ies'}
                </span>
                <span className="cc-num">{formatPremium(m.active_premium)}</span>
                {(m.city || m.state) && <span>{[m.city, m.state].filter(Boolean).join(', ')}</span>}
                <Link
                  to={`/customers/${m.account_id}`}
                  className="inline-flex items-center gap-1 text-cc-link hover:text-cc-link-hover"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentlyMerged({ refreshKey, onUndone }: { refreshKey: number; onUndone: () => void }) {
  const queryClient = useQueryClient();
  const { merges, loading, refetch } = useRecentMerges();
  const [undoing, setUndoing] = useState<string | null>(null);

  // A merge on this page must appear here immediately so it can be undone
  // without a full reload.
  useEffect(() => {
    if (refreshKey > 0) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleUndo = async (id: string) => {
    setUndoing(id);
    const ok = await unmergeAccount(id);
    setUndoing(null);
    if (ok) {
      // Un-merge moves records back; both the queue and account caches are stale.
      invalidateAccountDataCaches(queryClient);
      refetch();
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
            <span className="text-cc-text-primary">{m.loser_name ?? 'A record'}</span>
            <span className="text-cc-text-muted"> merged into </span>
            <span className="text-cc-text-primary">{m.survivor_name ?? 'survivor'}</span>
            <div className="mt-0.5 text-xs text-cc-text-muted">
              <span className="cc-num">{m.reparent_total}</span> records moved · {formatLocalDateDisplay(m.merged_at)}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={undoing === m.merge_history_id}
            onClick={() => handleUndo(m.merge_history_id)}
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

export default function DuplicatesReviewPage() {
  const { groups, total, loading, loadingMore, hasMore, loadMore, refetch, merge, linkInstead } = useDuplicateGroups();
  const [activeGroup, setActiveGroup] = useState<DuplicateGroup | null>(null);
  const [mergesVersion, setMergesVersion] = useState(0);

  const drawerMembers: MergeMember[] = (activeGroup?.members ?? []).map((m) => ({
    account_id: m.account_id,
    name: m.name,
    goes_by: m.goes_by,
    type: m.type,
    status: m.status,
    deleted_at: m.deleted_at,
    policies_count: m.policies_count,
    active_premium: m.active_premium,
  }));

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1100px] space-y-6 p-6">
        <section className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-cc-text-primary">
                <GitMerge className="h-5 w-5 text-cc-accent" />
                Duplicate review
              </h1>
              <p className="mt-1 text-sm text-cc-text-muted">
                <span className="cc-num">{total}</span> group{total === 1 ? '' : 's'} to review. Preview the blast radius,
                pick the record to keep, then merge. Blocked pairs can be linked instead.
              </p>
            </div>
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
        </section>

        {loading ? (
          <div className="space-y-4">
            <div className="h-40 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
            <div className="h-40 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-16 text-center shadow-card">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-cc-success" />
            <p className="text-sm text-cc-text-secondary">No groups to review. The book is clean.</p>
            <Button
              asChild
              variant="outline"
              className="mt-4 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              <Link to="/customers">Back to customers</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <GroupCard key={g.group_id} group={g} onReview={setActiveGroup} />
            ))}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  disabled={loadingMore}
                  onClick={loadMore}
                  className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  {loadingMore ? 'Loading…' : `Load more (${groups.length} of ${total})`}
                </Button>
              </div>
            )}
          </div>
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-cc-text-muted" />
            <SectionLabel>Recently merged</SectionLabel>
          </div>
          <RecentlyMerged refreshKey={mergesVersion} onUndone={refetch} />
        </section>
      </div>

      <MergePreviewDrawer
        open={!!activeGroup}
        onOpenChange={(o) => !o && setActiveGroup(null)}
        members={drawerMembers}
        onConfirm={async (survivorId) => {
          if (!activeGroup) return false;
          const ok = await merge(activeGroup.group_id, survivorId);
          if (ok) setMergesVersion((v) => v + 1);
          return ok;
        }}
        onLinkInstead={async (fromId, toId) => {
          if (!activeGroup) return false;
          return linkInstead(fromId, toId, activeGroup.group_id);
        }}
      />
    </AppLayout>
  );
}
