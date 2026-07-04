// ============================================================================
// CancellationHolderList - cancellation notice holder list (07 §5.2)
// ============================================================================
// When a policy is cancelled or non-renewed, staff must know which active
// certificate holders were promised notice. This section renders the output of
// `list_active_cert_holders_for_policy` (via useCancellationHolders): one row
// per active cert referencing the policy, showing the holder's snapshot
// identity (the promised-notice name and mailing address), the certificate
// number, the issue date, and the holder's notice_days when set.
//
// Per-row actions:
//   - "Send notice" opens the existing SendCertificateDialog for that
//     certificate, so the holder receives the cert PDF and send-coi-email logs
//     the 'emailed' certificate_events row (email is NOT rebuilt here).
//   - "Mark notified" is a manual acknowledgment. The certificate_events action
//     taxonomy must NOT be extended beyond 07 Section 1, so the manual path
//     records the acknowledgment as a NOTE via the existing account-scoped
//     notes system (useAddAccountNote), tagged to this policy for context. It
//     needs an accountId to write; when accountId is absent the button is not
//     rendered (Send notice still works, since the edge function owns delivery).
//
// Calm Command (design-system): cc-* tokens both themes, ONE lime primary is
// owned by the page (this section uses secondary/ghost actions only),
// StatusPill / Chip / cc-num tabular figures, content-shaped skeletons (never a
// spinner), no em or en dashes; addresses render as separate labeled lines,
// never a range dash.
// ============================================================================

import { useState } from 'react';
import { Mail, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip, Skeleton } from '@/components/cc';
import { useToast } from '@/hooks/use-toast';
import { useAddAccountNote } from '@/hooks/useAccountNotes';
import {
  useCancellationHolders,
  type CancellationHolder,
  type CancellationHolderAddress,
} from '@/hooks/useCancellationHolders';
import { SendCertificateDialog } from './SendCertificateDialog';
import type { CertificateListItem } from '@/types/certificates';

interface CancellationHolderListProps {
  policyId: string;
  /**
   * The account (customer) the policy belongs to. Required to record the
   * "Mark notified" acknowledgment as an account-scoped note. When omitted, the
   * "Mark notified" action is hidden (Send notice still works).
   */
  accountId?: string;
}

// ---------------------------------------------------------------------------
// Formatting helpers.
// ---------------------------------------------------------------------------

/** ISO / date string -> display MM/DD/YYYY. Empty string when unparseable. */
function toUsDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

/** Trim to a value or null (so blank strings do not render empty lines). */
function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Build the minimal CertificateListItem the SendCertificateDialog reads. The
 * dialog only dereferences id, certificate_number, holder_name, and sent_to,
 * and sends only ids and the free-text note; the send-coi-email edge function
 * is authoritative for the attachment, holder name, and delivery. The remaining
 * fields are not read by the dialog, so a narrow cast is safe and honest here.
 */
function toSendTarget(holder: CancellationHolder): CertificateListItem {
  return {
    id: holder.certificate_id,
    certificate_number: holder.certificate_number,
    holder_id: holder.holder_id,
    holder_name: holder.holder_name,
    issued_at: holder.issued_at,
    sent_to: null,
  } as unknown as CertificateListItem;
}

// ---------------------------------------------------------------------------
// The promised-notice mailing address, rendered as separate labeled lines.
// Never a range dash: each address component is its own labeled line.
// ---------------------------------------------------------------------------

function HolderAddress({ address }: { address: CancellationHolderAddress | null }) {
  const line1 = clean(address?.line1);
  const city = clean(address?.city);
  const state = clean(address?.state);
  const zip = clean(address?.zip);

  if (!line1 && !city && !state && !zip) {
    return (
      <p className="text-sm text-cc-text-muted">
        No mailing address on the certificate snapshot.
      </p>
    );
  }

  return (
    <dl className="space-y-1 text-sm">
      {line1 && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-cc-text-muted">Street</dt>
          <dd className="text-cc-text-secondary">{line1}</dd>
        </div>
      )}
      {city && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-cc-text-muted">City</dt>
          <dd className="text-cc-text-secondary">{city}</dd>
        </div>
      )}
      {state && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-cc-text-muted">State</dt>
          <dd className="text-cc-text-secondary">{state}</dd>
        </div>
      )}
      {zip && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-cc-text-muted">ZIP</dt>
          <dd className="cc-num text-cc-text-secondary [font-variant-numeric:tabular-nums]">
            {zip}
          </dd>
        </div>
      )}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// A single holder row.
// ---------------------------------------------------------------------------

function HolderRow({
  holder,
  accountId,
  policyId,
  onSend,
}: {
  holder: CancellationHolder;
  accountId?: string;
  policyId: string;
  onSend: (holder: CancellationHolder) => void;
}) {
  const { toast } = useToast();
  const addNote = useAddAccountNote(accountId);
  const [notified, setNotified] = useState(false);

  const issued = toUsDate(holder.issued_at);

  const markNotified = () => {
    if (!accountId) return;
    const parts = [
      `Cancellation notice acknowledged for certificate ${holder.certificate_number}`,
      `holder ${holder.holder_name}`,
    ];
    if (holder.notice_days != null) {
      parts.push(`promised notice ${holder.notice_days} days`);
    }
    const noteText = `${parts.join('. ')}.`;
    addNote.mutate(
      { note_text: noteText, policyId, source: 'cancellation_notice' },
      {
        onSuccess: () => {
          setNotified(true);
          toast({
            title: 'Marked notified',
            description: `Recorded a note for ${holder.holder_name}.`,
          });
        },
        onError: (err: unknown) =>
          toast({
            title: 'Could not mark notified',
            description:
              err instanceof Error ? err.message : 'Please try again.',
            variant: 'destructive',
          }),
      },
    );
  };

  return (
    <li className="space-y-3 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-cc-text-primary">{holder.holder_name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-cc-text-muted">
            <span className="flex items-center gap-1.5">
              <span>Certificate</span>
              <span className="cc-num font-mono text-cc-text-secondary [font-variant-numeric:tabular-nums]">
                {holder.certificate_number}
              </span>
            </span>
            {issued && (
              <span className="flex items-center gap-1.5">
                <span>Issued</span>
                <span className="cc-num text-cc-text-secondary [font-variant-numeric:tabular-nums]">
                  {issued}
                </span>
              </span>
            )}
          </div>
        </div>
        {holder.notice_days != null && (
          <Chip className="[font-variant-numeric:tabular-nums]">
            Notice: {holder.notice_days} days
          </Chip>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-cc-text-muted">
          Promised notice address
        </p>
        <HolderAddress address={holder.holder_address} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onSend(holder)}>
          <Mail className="mr-1.5 h-3.5 w-3.5" />
          Send notice
        </Button>
        {accountId &&
          (notified ? (
            <span className="flex items-center gap-1.5 text-sm text-cc-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Notified
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={markNotified}
              disabled={addNote.isPending}
              className="text-cc-text-secondary hover:text-cc-text-primary"
            >
              {addNote.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Marking
                </>
              ) : (
                'Mark notified'
              )}
            </Button>
          ))}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The section.
// ---------------------------------------------------------------------------

export function CancellationHolderList({
  policyId,
  accountId,
}: CancellationHolderListProps) {
  const { holders, isLoading } = useCancellationHolders(policyId);
  const [sendTarget, setSendTarget] = useState<CancellationHolder | null>(null);

  // Loading: content-shaped skeleton rows (never a spinner).
  if (isLoading) {
    return (
      <ul className="space-y-3" aria-hidden="true">
        {Array.from({ length: 2 }).map((_, i) => (
          <li
            key={i}
            className="space-y-3 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-5 w-24 rounded-pill" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-28 rounded-cc-md" />
              <Skeleton className="h-8 w-28 rounded-cc-md" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (holders.length === 0) {
    return (
      <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised px-4 py-8 text-center">
        <p className="text-sm text-cc-text-muted">
          No active certificate holders reference this policy.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {holders.map((holder) => (
          <HolderRow
            key={holder.certificate_id}
            holder={holder}
            accountId={accountId}
            policyId={policyId}
            onSend={setSendTarget}
          />
        ))}
      </ul>

      {sendTarget && (
        <SendCertificateDialog
          certificate={toSendTarget(sendTarget)}
          open={sendTarget !== null}
          onOpenChange={(open) => {
            if (!open) setSendTarget(null);
          }}
        />
      )}
    </>
  );
}

export default CancellationHolderList;
