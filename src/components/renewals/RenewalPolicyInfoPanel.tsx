import { Link } from 'react-router-dom';
import { Chip, SectionLabel } from '@/components/cc';
import { humanizeCarrier, humanizeLine } from '@/lib/format';
import { termLabel, normalizePolicyTerm } from '@/lib/renewals/renewalTerm';
import { formatMoney as money, formatShortDate as shortDate } from '@/lib/renewals/format';
import type { Renewal } from '@/hooks/useRenewalWorkflow';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1 text-sm text-cc-text-primary">{children}</div>
    </div>
  );
}

/** Region 3 — read-only policy facts + last-saved values to compare against the hero edits. */
export function RenewalPolicyInfoPanel({ renewal }: { renewal: Renewal }) {
  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-6 shadow-card">
      <SectionLabel>Policy</SectionLabel>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Fact label="Account">
          <Link to={`/customers/${renewal.account_id}`} className="text-cc-text-primary underline-offset-2 hover:underline">
            {renewal.account?.name || 'View account'}
          </Link>
        </Fact>
        <Fact label="Carrier">
          {renewal.carrier ? <Chip>{humanizeCarrier(renewal.carrier)}</Chip> : <span className="text-cc-text-muted">--</span>}
        </Fact>
        <Fact label="Line of business">{humanizeLine(renewal.policy_type) || '--'}</Fact>
        <Fact label="Term">
          {renewal.policy_term ? termLabel(normalizePolicyTerm(renewal.policy_term)) : <span className="text-cc-text-muted">Not set</span>}
        </Fact>
      </div>

      <div className="mt-5 border-t border-cc-border-subtle pt-4">
        <SectionLabel>Last saved</SectionLabel>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Fact label="Current premium"><span className="cc-num">{money(renewal.current_premium)}</span></Fact>
          <Fact label="Renewal premium"><span className="cc-num">{money(renewal.renewal_premium)}</span></Fact>
          <Fact label="New effective"><span className="cc-num">{shortDate(renewal.new_effective_date)}</span></Fact>
          <Fact label="New expiration"><span className="cc-num">{shortDate(renewal.new_expiration_date)}</span></Fact>
        </div>
      </div>
    </div>
  );
}
