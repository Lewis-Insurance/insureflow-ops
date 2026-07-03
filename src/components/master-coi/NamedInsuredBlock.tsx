// Master COI named-insured tile (blueprint Section 2.9).
//
// Read-only. Renders the account's certificate holder identity (name, DBA,
// address) exactly as get_master_coi returns it, and links out to the customer
// edit page. No field editing here. Honest by contract: an absent name renders
// "Missing", an absent address renders a warning note rather than a fabricated
// line, and a policy-vs-account name mismatch renders a warning. Consumes
// COINamedInsured from src/types/master-coi.ts verbatim.

import { CircleAlert, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SectionLabel } from '@/components/cc';
import type { COINamedInsured } from '@/types/master-coi';

export interface NamedInsuredBlockProps {
  named: COINamedInsured;
  accountId: string;
}

/** A cell value is present when it is a non-empty, non-missing string. */
function cellText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function NamedInsuredBlock({ named, accountId }: NamedInsuredBlockProps) {
  const navigate = useNavigate();

  const name = cellText(named.name?.v);
  const dba = cellText(named.dba?.v);
  const line1 = cellText(named.address_line1?.v);
  const line2 = cellText(named.address_line2?.v);
  const city = cellText(named.city?.v);
  const state = cellText(named.state?.v);
  const zip = cellText(named.zip?.v);

  // City / state / zip on one honest line: "O Brien, FL 32071". Any part may be
  // absent; we join only what is present rather than printing empty separators.
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ').trim() || null]
    .filter(Boolean)
    .join(', ');

  const hasAddress = Boolean(line1 || cityStateZip);

  return (
    <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <SectionLabel>Named insured</SectionLabel>

          {name ? (
            <div className="break-words text-base font-semibold text-cc-text-primary">
              {name}
            </div>
          ) : (
            <div
              className="inline-flex items-center gap-1 text-sm text-cc-warning"
              aria-label="Named insured name missing"
            >
              <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Missing</span>
            </div>
          )}

          {dba && (
            <div className="break-words text-sm text-cc-text-secondary">
              DBA {dba}
            </div>
          )}

          {hasAddress ? (
            <div className="space-y-0.5 text-sm text-cc-text-secondary">
              {line1 && <div className="break-words">{line1}</div>}
              {line2 && <div className="break-words">{line2}</div>}
              {cityStateZip && <div className="cc-num break-words">{cityStateZip}</div>}
            </div>
          ) : (
            <div
              className="inline-flex items-center gap-1 text-sm text-cc-warning"
              aria-label="Named insured address not on file"
            >
              <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Address not on file</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate(`/customers/${accountId}/edit`)}
          className="inline-flex shrink-0 items-center gap-1 rounded-cc-sm px-1.5 py-0.5 text-sm text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit customer
        </button>
      </div>

      {named.policy_named_insured_mismatch && (
        <div
          className="mt-2 inline-flex items-start gap-1 text-xs text-cc-warning"
          role="note"
        >
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Policy named insured does not match the account name.</span>
        </div>
      )}
    </div>
  );
}
