// The ONE certificate issuance-log component (04-issuance-and-snapshots.md
// Section 9.1, R17). Two variants:
//   - full    (default): a table beneath the generator on the /certificates
//     surface, with row actions, an inline activity timeline, the send dialog,
//     void, and Restore to Documents.
//   - compact (limit 5): the bottom block of the Master COI panel; rows plus a
//     tertiary "View all certificates" link.
//
// Re-exports CERT_PILL (the single status-pill map, R11) from the shared types
// so consumers can import it from either place.
//
// Calm Command: cc-* tokens, both themes, tabular figures on the certificate
// number / dates (cc-num), StatusPill for status, NO lime anywhere in the log
// (the surface's single lime is the generator's Generate button), no em/en
// dashes, content-shaped skeletons (never spinners).

import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusPill, Skeleton } from '@/components/cc';
import { useCertificates } from '@/hooks/useCertificates';
import { CERT_PILL } from '@/types/certificates';
import type { CertificateListItem, CertificateStatus } from '@/types/certificates';
import { CertificateEventsList } from './CertificateEventsList';
import { SendCertificateDialog } from './SendCertificateDialog';

// Re-export the single status-pill map next to the component (R11, R17).
export { CERT_PILL };

interface CertificateIssuanceLogProps {
  accountId: string;
  variant?: 'full' | 'compact';
  limit?: number;
  onReissue?: (certificate: CertificateListItem) => void;
  className?: string;
}

// CERT_PILL tone 'muted' has no direct StatusPill tone; it maps to 'neutral'
// (the muted gray pill). The other three map one to one.
const PILL_TONE_TO_STATUSPILL: Record<
  (typeof CERT_PILL)[CertificateStatus]['tone'],
  'success' | 'danger' | 'neutral'
> = {
  neutral: 'neutral',
  success: 'success',
  muted: 'neutral',
  danger: 'danger',
};

function CertStatusPill({ status }: { status: CertificateStatus }) {
  const entry = CERT_PILL[status];
  return (
    <StatusPill
      override={{ label: entry.label, tone: PILL_TONE_TO_STATUSPILL[entry.tone] }}
    />
  );
}

function formatIssuedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDistanceToNow(d)} ago`;
}

/**
 * Restore-to-Documents is offered when the certificate has no live pointer row:
 * document_id is null (hard-deleted / never linked). The list reader does not
 * carry the joined documents row's deleted_at/storage_path, so the finer
 * "soft-deleted or replaced" detection is deferred to the RPC, which itself
 * refuses when a live matching pointer already exists.
 */
function canRestore(cert: CertificateListItem): boolean {
  return cert.document_id === null;
}

export function CertificateIssuanceLog({
  accountId,
  variant = 'full',
  limit,
  onReissue,
  className,
}: CertificateIssuanceLogProps) {
  const {
    certificates,
    isLoading,
    downloadCertificate,
    previewCertificate,
    voidCertificate,
    restoreDocument,
  } = useCertificates(accountId);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<CertificateListItem | null>(null);
  const [voidTarget, setVoidTarget] = useState<CertificateListItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const isCompact = variant === 'compact';
  const effectiveLimit = isCompact ? (limit ?? 5) : limit;
  const rows =
    typeof effectiveLimit === 'number' ? certificates.slice(0, effectiveLimit) : certificates;

  const openVoid = (cert: CertificateListItem) => {
    setVoidTarget(cert);
    setVoidReason('');
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    const ok = await voidCertificate(voidTarget.id, voidReason.trim());
    setVoiding(false);
    if (ok) {
      setVoidTarget(null);
      setVoidReason('');
    }
  };

  // -------------------------------------------------------------------------
  // Loading + empty
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className={className}>
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: isCompact ? 3 : 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised px-4 py-3"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16 rounded-pill" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (certificates.length === 0) {
    return (
      <div className={className}>
        <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised px-4 py-8 text-center">
          <p className="text-sm text-cc-text-muted">No certificates issued yet.</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Rows
  // -------------------------------------------------------------------------
  return (
    <div className={className}>
      <div className="overflow-x-auto rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-cc-border-subtle text-left text-xs font-medium text-cc-text-muted">
              <th className="px-4 py-2.5 font-medium">Certificate</th>
              <th className="px-4 py-2.5 font-medium">Holder</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Issued</th>
              {!isCompact && <th className="px-4 py-2.5 font-medium">Sent</th>}
              <th className="w-10 px-4 py-2.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((cert) => {
              const expanded = expandedId === cert.id;
              const terminal = cert.status === 'voided' || cert.status === 'superseded';
              const reissuable = cert.status === 'issued' || cert.status === 'sent';
              const colSpan = isCompact ? 5 : 6;
              return (
                <Fragment key={cert.id}>
                  <tr className="border-b border-cc-border-subtle align-top last:border-b-0">
                    <td className="px-4 py-3">
                      <span className="cc-num whitespace-nowrap font-mono font-medium text-cc-text-primary [font-variant-numeric:tabular-nums]">
                        {cert.certificate_number}
                      </span>
                      {cert.revision > 0 && (
                        <span className="ml-2 text-xs text-cc-text-muted">
                          Rev {cert.revision}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="break-words text-cc-text-primary">{cert.holder_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <CertStatusPill status={cert.status} />
                        {cert.status === 'superseded' && cert.superseded_by_number && (
                          <span className="text-xs text-cc-text-muted">
                            Replaced by{' '}
                            <span className="[font-variant-numeric:tabular-nums]">
                              {cert.superseded_by_number}
                            </span>
                          </span>
                        )}
                        {cert.status === 'voided' && cert.void_reason && (
                          <span
                            className="max-w-[16rem] truncate text-xs text-cc-text-muted"
                            title={cert.void_reason}
                          >
                            {cert.void_reason}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="[font-variant-numeric:tabular-nums] whitespace-nowrap text-cc-text-primary">
                          {formatIssuedDate(cert.issued_at)}
                        </span>
                        {cert.issued_by_name && (
                          <span className="text-xs text-cc-text-muted">
                            {cert.issued_by_name}
                          </span>
                        )}
                      </div>
                    </td>
                    {!isCompact && (
                      <td className="px-4 py-3">
                        {cert.sent_to ? (
                          <div className="flex flex-col">
                            <span className="break-words text-cc-text-primary">
                              {cert.sent_to}
                            </span>
                            <span className="[font-variant-numeric:tabular-nums] text-xs text-cc-text-muted">
                              {relativeTime(cert.sent_at)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-cc-text-muted">Not sent</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-cc-text-muted hover:text-cc-text-primary"
                            aria-label={`Actions for ${cert.certificate_number}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onSelect={() => void downloadCertificate(cert)}>
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void previewCertificate(cert)}>
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={terminal}
                            onSelect={() => setSendTarget(cert)}
                          >
                            Send by email
                          </DropdownMenuItem>
                          {onReissue && (
                            <DropdownMenuItem
                              disabled={!reissuable}
                              onSelect={() => onReissue(cert)}
                            >
                              Reissue corrected
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={!reissuable}
                            onSelect={() => openVoid(cert)}
                          >
                            Void
                          </DropdownMenuItem>
                          {canRestore(cert) && (
                            <DropdownMenuItem onSelect={() => void restoreDocument(cert.id)}>
                              Restore to Documents
                            </DropdownMenuItem>
                          )}
                          {!isCompact && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() =>
                                  setExpandedId((prev) => (prev === cert.id ? null : cert.id))
                                }
                              >
                                {expanded ? 'Hide activity' : 'View activity'}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                  {!isCompact && expanded && (
                    <tr className="border-b border-cc-border-subtle last:border-b-0">
                      <td colSpan={colSpan} className="bg-cc-surface px-4 py-2">
                        <CertificateEventsList certificateId={cert.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {isCompact && (
        <div className="mt-2 text-right">
          <Link
            to={`/certificates?accountId=${accountId}#issuance-log`}
            className="text-sm text-cc-text-muted underline-offset-4 hover:text-cc-text-secondary hover:underline"
          >
            View all certificates
          </Link>
        </div>
      )}

      {/* Send email */}
      {sendTarget && (
        <SendCertificateDialog
          certificate={sendTarget}
          open={sendTarget !== null}
          onOpenChange={(open) => {
            if (!open) setSendTarget(null);
          }}
        />
      )}

      {/* Void reason */}
      <Dialog
        open={voidTarget !== null}
        onOpenChange={(open) => {
          if (!open && !voiding) {
            setVoidTarget(null);
            setVoidReason('');
          }
        }}
      >
        <DialogContent className="bg-cc-surface-raised">
          <DialogHeader>
            <DialogTitle className="text-cc-text-primary">Void certificate</DialogTitle>
            <DialogDescription className="text-cc-text-muted">
              {voidTarget && (
                <>
                  Voiding{' '}
                  <span className="[font-variant-numeric:tabular-nums] font-medium text-cc-text-secondary">
                    {voidTarget.certificate_number}
                  </span>{' '}
                  marks it as issued in error. The PDF stays on file for audit and
                  cannot be emailed after voiding.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cert-void-reason" className="text-cc-text-secondary">
              Reason
            </Label>
            <Textarea
              id="cert-void-reason"
              rows={3}
              placeholder="Why is this certificate being voided?"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              disabled={voiding}
            />
            <p className="text-xs text-cc-text-muted">A reason of at least 3 characters is required.</p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setVoidTarget(null);
                setVoidReason('');
              }}
              disabled={voiding}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmVoid()}
              disabled={voiding || voidReason.trim().length < 3}
            >
              {voiding ? 'Voiding' : 'Void certificate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
