import { useNavigate } from 'react-router-dom';
import { Building2, User, Home, Network, Calendar, TrendingUp } from 'lucide-react';
import { AccentSpine, Chip, SectionLabel } from '@/components/cc';
import {
  displayWithGoesBy,
  formatPremium,
  type ClusterNode,
  type ClusterRollup,
} from '@/hooks/useRelationshipGraph';
import { formatLocalDateDisplay } from '@/lib/date/localDate';

interface Props {
  /** The account whose detail page we are on (the node not to re-link to itself). */
  accountId: string;
  cluster: ClusterNode[];
  rollup: ClusterRollup | null;
  loading: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  owned_business: 'Owned company',
  sibling_business: 'Sibling company',
  affiliated_business: 'Affiliated company',
  parent_company: 'Parent company',
  household: 'Household',
  spouse: 'Spouse',
  dependent: 'Dependent',
  member: 'Member',
  related: 'Related',
};

/**
 * The relationship Hub: the owner at the center, every business they own (one
 * click opens any sibling), the household block, and a cross-sell line driven by
 * the cluster roll-up. Renders only when there is an actual cluster (>1 node).
 */
export function ClusterHub({ accountId, cluster, rollup, loading }: Props) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
        <div className="h-20 animate-pulse rounded-cc-md bg-cc-skeleton-base" />
      </div>
    );
  }

  // Nothing to show unless the recursive walk found more than the seed itself.
  if (!rollup || rollup.size <= 1) return null;

  const owner = cluster.find((n) => n.node_role === 'owner') ?? null;
  const businesses = cluster.filter((n) => n.is_business);
  const members = cluster.filter((n) => !n.is_business && n.node_role !== 'owner');

  const open = (id: string) => {
    if (id !== accountId) navigate(`/customers/${id}`);
  };
  const onKey = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(id);
    }
  };

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <Network className="h-4 w-4 text-cc-text-muted" />
        <SectionLabel>Relationship hub</SectionLabel>
        <span className="cc-num text-xs text-cc-text-muted">
          ({rollup.business_count} {rollup.business_count === 1 ? 'company' : 'companies'})
        </span>
      </div>

      {/* Owner at the center + cross-sell roll-up line */}
      {owner && (
        <AccentSpine
          active
          role="button"
          tabIndex={0}
          onClick={() => open(owner.account_id)}
          onKeyDown={onKey(owner.account_id)}
          className={`mb-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus-ring focus-visible:ring-offset-2 ${
            owner.account_id === accountId ? '' : 'cursor-pointer hover:bg-cc-surface-overlay'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <User className="h-5 w-5 text-cc-accent" />
              <div>
                <div className="flex items-center gap-2">
                  <Chip>Owner</Chip>
                  <h4 className="font-semibold text-cc-text-primary">
                    {displayWithGoesBy(owner.name, owner.goes_by)}
                  </h4>
                  {owner.account_id === accountId && (
                    <span className="text-xs text-cc-text-muted">(this record)</span>
                  )}
                </div>
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-cc-text-muted">
                  <TrendingUp className="h-3.5 w-3.5 text-cc-accent" />
                  Cross-sell book: <span className="cc-num">{rollup.business_count}</span>{' '}
                  {rollup.business_count === 1 ? 'company' : 'companies'} ·{' '}
                  <span className="cc-num">{rollup.total_policies}</span> policies in the cluster
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-cc-text-muted">Cluster premium</span>
              <div className="cc-num font-mono text-lg font-semibold text-cc-text-primary">
                {formatPremium(rollup.active_premium)}
              </div>
            </div>
          </div>
        </AccentSpine>
      )}

      {/* Owned / affiliated businesses — one click opens any sibling */}
      {businesses.length > 0 && (
        <div className="mb-4">
          <div className="mb-2">
            <SectionLabel>Companies</SectionLabel>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {businesses.map((b) => {
              const isCurrent = b.account_id === accountId;
              return (
                <AccentSpine
                  key={b.account_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => open(b.account_id)}
                  onKeyDown={onKey(b.account_id)}
                  className={`p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus-ring focus-visible:ring-offset-2 ${
                    isCurrent ? 'bg-cc-surface-overlay' : 'cursor-pointer hover:bg-cc-surface-overlay'
                  }`}
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-cc-text-muted" />
                    <h5 className="min-w-0 truncate font-medium text-cc-text-primary">
                      {displayWithGoesBy(b.name, b.goes_by)}
                    </h5>
                    {isCurrent && <span className="ml-auto text-xs text-cc-text-muted">(this record)</span>}
                  </div>
                  {rollup.owner_name && (
                    <p className="mb-2 text-xs text-cc-text-muted">{ROLE_LABEL[b.node_role] ?? 'Company'} · owner {rollup.owner_name}</p>
                  )}
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-sm">
                      <span className="text-xs text-cc-text-muted">Policies</span>
                      <div className="cc-num text-cc-text-primary">{b.policies_count}</div>
                      {b.next_expiration && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-cc-text-muted">
                          <Calendar className="h-3 w-3" />
                          <span className="cc-num">{formatLocalDateDisplay(b.next_expiration)}</span>
                        </div>
                      )}
                    </div>
                    <div className="cc-num font-mono text-base font-semibold text-cc-text-primary">
                      {formatPremium(b.active_premium)}
                    </div>
                  </div>
                </AccentSpine>
              );
            })}
          </div>
        </div>
      )}

      {/* Household / dependents */}
      {members.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5 text-cc-text-muted" />
            <SectionLabel>Household</SectionLabel>
          </div>
          <div className="space-y-2">
            {members.map((m) => {
              const isCurrent = m.account_id === accountId;
              return (
                <div
                  key={m.account_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => open(m.account_id)}
                  onKeyDown={onKey(m.account_id)}
                  className={`flex items-center justify-between gap-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus-ring ${
                    isCurrent ? '' : 'cursor-pointer hover:bg-cc-surface-overlay'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <User className="h-3.5 w-3.5 text-cc-text-muted" />
                    <span className="truncate text-sm text-cc-text-primary">
                      {displayWithGoesBy(m.name, m.goes_by)}
                    </span>
                    <Chip>{ROLE_LABEL[m.node_role] ?? 'Member'}</Chip>
                  </div>
                  <span className="cc-num shrink-0 text-xs text-cc-text-muted">
                    {m.policies_count} {m.policies_count === 1 ? 'policy' : 'policies'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
