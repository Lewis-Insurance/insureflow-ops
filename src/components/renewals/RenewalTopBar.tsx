import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Chip, StatusPill, NextRenewal } from '@/components/cc';
import { humanizeCarrier, humanizeLine } from '@/lib/format';
import { termLabel, normalizePolicyTerm, renewalPillStatus } from '@/lib/renewals/renewalTerm';
import type { Renewal } from '@/hooks/useRenewalWorkflow';

/** Region 1 — top bar: identity, metadata chips, banded countdown, status pill. No lime here. */
export function RenewalTopBar({ renewal }: { renewal: Renewal }) {
  const navigate = useNavigate();
  const policyLabel = renewal.policy_number || 'Renewal';

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface-raised p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Back to renewals"
            onClick={() => navigate('/renewals')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cc-md text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-label uppercase tracking-label text-cc-text-muted">
              Renewals / {renewal.account?.name || 'Account'}
            </p>
            <h1 className="cc-num text-2xl font-bold uppercase tracking-tight text-cc-text-primary">
              {policyLabel}
            </h1>
          </div>
        </div>
        <Link
          to={`/customers/${renewal.account_id}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-cc-md px-2.5 py-1.5 text-sm text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-primary"
        >
          View account <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {renewal.carrier && <Chip>{humanizeCarrier(renewal.carrier)}</Chip>}
          {renewal.policy_type && <Chip>{humanizeLine(renewal.policy_type)}</Chip>}
          {renewal.policy_term && <Chip>{termLabel(normalizePolicyTerm(renewal.policy_term))}</Chip>}
        </div>
        <div className="flex items-center gap-4">
          <NextRenewal date={renewal.expiration_date} emptyLabel="No renewal date" />
          <StatusPill status={renewalPillStatus(renewal.status)} />
        </div>
      </div>
    </div>
  );
}
