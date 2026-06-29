import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StatusPill, Chip, AccentSpine, SectionLabel } from '@/components/cc';
import { GitMerge, RefreshCw, CheckCircle2, Building2, User, ExternalLink } from 'lucide-react';
import {
  useDuplicateGroups,
  displayWithGoesBy,
  formatPremium,
  accountTypeLabel,
  type DuplicateGroup,
  type DuplicateMember,
} from '@/hooks/useRelationshipGraph';
import { formatLocalDateDisplay } from '@/lib/date/localDate';

function MemberTile({
  member,
  selected,
  onSelect,
}: {
  member: DuplicateMember;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = /business|commercial|organization|org/i.test(member.type) ? Building2 : User;
  return (
    <AccentSpine
      active={selected}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className="cursor-pointer p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus-ring"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-cc-text-muted" />
          <span className="truncate font-medium text-cc-text-primary">
            {displayWithGoesBy(member.name, member.goes_by)}
          </span>
        </div>
        {selected ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-cc-accent">
            <CheckCircle2 className="h-3.5 w-3.5" /> Survivor
          </span>
        ) : member.deleted_at ? (
          <Chip>Deleted</Chip>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-cc-text-muted">
        <span>{accountTypeLabel(member.type)}</span>
        {member.status && <StatusPill status={member.status} />}
        <span className="cc-num">
          {member.policies_count} polic{member.policies_count === 1 ? 'y' : 'ies'}
        </span>
        <span className="cc-num">{formatPremium(member.active_premium)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-cc-text-faint">
        {(member.city || member.state) && <span>{[member.city, member.state].filter(Boolean).join(', ')}</span>}
        {member.email && <span className="truncate">{member.email}</span>}
        {member.phone && <span className="cc-num">{member.phone}</span>}
        <span className="cc-num">Created {formatLocalDateDisplay(member.created_at)}</span>
        <Link
          to={`/customers/${member.account_id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-cc-link hover:text-cc-link-hover"
        >
          Open <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </AccentSpine>
  );
}

function GroupCard({
  group,
  onMerge,
}: {
  group: DuplicateGroup;
  onMerge: (groupId: string, survivorId: string) => void;
}) {
  const members = group.members || [];
  // Default survivor: the oldest live record (most established).
  const defaultSurvivor = useMemo(() => {
    const live = members.filter((m) => !m.deleted_at);
    return (live[0] || members[0])?.account_id ?? '';
  }, [members]);
  const [survivor, setSurvivor] = useState<string>(defaultSurvivor);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const survivorName = members.find((m) => m.account_id === survivor)?.name ?? 'this record';

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
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
      </div>

      <p className="mb-3 text-xs text-cc-text-muted">
        Pick the record to keep. Policies, contacts and history from the others move to it; the rest are
        soft-deleted and a same-as link preserves the trail.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {members.map((m) => (
          <MemberTile
            key={m.account_id}
            member={m}
            selected={survivor === m.account_id}
            onSelect={() => setSurvivor(m.account_id)}
          />
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          data-primary
          size="sm"
          disabled={!survivor}
          onClick={() => setConfirmOpen(true)}
          className="gap-1.5 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
        >
          <GitMerge className="h-4 w-4" />
          Merge into selected
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-cc-xl border-cc-border-subtle bg-cc-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-cc-text-primary">
              Merge {group.member_count} records into {survivorName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-cc-text-muted">
              The other records will be soft-deleted and their policies, contacts and history reassigned to{' '}
              {survivorName}. This is reversible and logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-primary
              onClick={() => onMerge(group.group_id, survivor)}
              className="rounded-cc-md font-semibold"
            >
              Merge records
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function DuplicatesReviewPage() {
  const { groups, total, loading, refetch, merge } = useDuplicateGroups();

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
                <span className="cc-num">{total}</span> pending group{total === 1 ? '' : 's'} flagged by the
                duplicate engine. Confirm a survivor to merge.
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
            <div className="h-44 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
            <div className="h-44 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-16 text-center shadow-card">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-cc-success" />
            <p className="text-sm text-cc-text-secondary">No pending duplicate groups. The book is clean.</p>
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
              <GroupCard key={g.group_id} group={g} onMerge={merge} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
