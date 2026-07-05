// ============================================================================
// ReissueQueue - renewal reissue cascade BATCH queue (07 §3.5)
// ============================================================================
// The batch surface for the renewal reissue cascade. Lists active certificates
// whose printed dates went stale when a policy renewed (or passed), each row
// showing per-line date changes as SEPARATE labeled tokens ("was" / "now",
// never a range dash), a readiness pill (Ready / Blocked), and a select
// checkbox. ONE primary lime action ("Reissue selected") batch-calls
// useIssueCertificate in mode:'reissue'; per-row 422 failures are caught,
// collected, and summarized ("M reissued, K blocked") without aborting the
// batch. Blocked rows deep-link to the customer's Master COI panel.
//
// Data: useCertificatesNeedingReissue (list + count RPCs). Reissue: the server
// derives holder/lines/print-intent/DOO/remarks from the superseded cert's
// snapshot (07 §3.4), so the request passes empty placeholders for the fields
// the request type requires but reissue mode ignores.
//
// Calm Command (doc 06 §11): cc-* tokens both themes, ONE lime fill per view
// (this view's lime is "Reissue selected"), StatusPill / Chip / cc-num tabular
// figures, content-shaped skeletons (never spinners), no em or en dashes.
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { StatusPill, TriageTile, Skeleton } from '@/components/cc';
import {
  useCertificatesNeedingReissue,
  type CertificateNeedingReissue,
  type ReissueStaleLine,
} from '@/hooks/useCertificatesNeedingReissue';
import { useIssueCertificate, IssueCertificateError } from '@/hooks/useIssueCertificate';
import type { GenerateCertificateRequest } from '@/types/certificates';

interface ReissueQueueProps {
  accountId?: string | null;
  onDone?: () => void;
}

// ---------------------------------------------------------------------------
// Formatting helpers.
// ---------------------------------------------------------------------------

/** ISO YYYY-MM-DD -> display MM/DD/YYYY. Empty string for a non-ISO / null value. */
function isoToUs(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
}

/** The canonical line-key display label (02 Section 2.3 vocabulary). */
const LINE_LABEL: Record<string, string> = {
  gl: 'General liability',
  auto: 'Automobile',
  umbrella: 'Umbrella',
  wc: 'Workers comp',
  property: 'Property',
  other: 'Other',
};

function lineLabel(key: string): string {
  return LINE_LABEL[key] ?? key.toUpperCase();
}

/** Human label for a readiness blocker code (02 Section 2.7 vocabulary). */
const BLOCKER_LABEL: Record<string, string> = {
  no_lines: 'No lines',
  policy_core_missing: 'Policy details missing',
  limit_missing: 'Limit missing',
  insurer_unresolved: 'Insurer unresolved',
  policy_expired: 'Policy expired',
  insurer_overflow: 'Too many insurers',
};

function blockerLabel(code: string | undefined): string {
  if (!code) return 'Blocked';
  return BLOCKER_LABEL[code] ?? code.replace(/_/g, ' ');
}

/** The first blocker code for a row (07 §3.5: show the first blocker name). */
function firstBlockerCode(row: CertificateNeedingReissue): string | undefined {
  return row.readiness?.blockers?.[0]?.code;
}

// ---------------------------------------------------------------------------
// Result of a batch reissue pass.
// ---------------------------------------------------------------------------

interface BatchBlocked {
  cert: CertificateNeedingReissue;
  reason: string;
}

interface BatchResult {
  reissued: CertificateNeedingReissue[];
  blocked: BatchBlocked[];
}

// ---------------------------------------------------------------------------
// A single stale line's date change, as two separate labeled tokens.
// ---------------------------------------------------------------------------

function StaleLineChange({ line }: { line: ReissueStaleLine }) {
  const was = isoToUs(line.printed_expiration);
  const now = isoToUs(line.current_expiration);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="font-medium text-cc-text-primary">{lineLabel(line.line_key)}</span>
      {was && (
        <span className="text-cc-text-muted">
          was{' '}
          <span className="cc-num [font-variant-numeric:tabular-nums] text-cc-text-secondary">
            {was}
          </span>
        </span>
      )}
      {now && (
        <span className="text-cc-text-muted">
          now{' '}
          <span className="cc-num [font-variant-numeric:tabular-nums] text-cc-text-secondary">
            {now}
          </span>
        </span>
      )}
      {line.reason === 'expired' && (
        <span className="text-xs text-cc-text-muted">(printed date passed)</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The queue.
// ---------------------------------------------------------------------------

export function ReissueQueue({ accountId, onDone }: ReissueQueueProps) {
  const queryClient = useQueryClient();
  const { rows, count, isLoading, refetch } = useCertificatesNeedingReissue(accountId);
  const issueMutation = useIssueCertificate();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  // 07 §3.4: the batch MUST show the diff and take one explicit confirm before it
  // supersedes anything. "Reissue selected" opens this dialog; only its confirm runs.
  const [confirmOpen, setConfirmOpen] = useState(false);

  const readyRows = useMemo(() => rows.filter((r) => r.is_ready), [rows]);
  const readyIds = useMemo(() => new Set(readyRows.map((r) => r.certificate_id)), [readyRows]);

  const selectedReadyCount = useMemo(
    () => [...selected].filter((id) => readyIds.has(id)).length,
    [selected, readyIds],
  );

  const allReadySelected =
    readyRows.length > 0 && readyRows.every((r) => selected.has(r.certificate_id));

  const toggleRow = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllReady = useCallback(
    (checked: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of readyRows) {
          if (checked) next.add(r.certificate_id);
          else next.delete(r.certificate_id);
        }
        return next;
      });
    },
    [readyRows],
  );

  // -------------------------------------------------------------------------
  // Batch reissue: one mutateAsync per selected READY cert. Per-row 422 (or any
  // failure) is caught and collected so the batch never aborts (07 §3.5).
  // -------------------------------------------------------------------------
  const reissueSelected = useCallback(async () => {
    const targets = readyRows.filter((r) => selected.has(r.certificate_id));
    if (targets.length === 0) return;

    setRunning(true);
    setResult(null);

    const reissued: CertificateNeedingReissue[] = [];
    const blocked: BatchBlocked[] = [];

    for (const cert of targets) {
      // Reissue mode: the server derives holder/lines/print-intent/DOO/remarks
      // from the superseded cert's snapshot (07 §3.4). The request type still
      // requires these fields, so pass empty placeholders; the server ignores
      // them in reissue mode.
      const body: GenerateCertificateRequest = {
        mode: 'reissue',
        reissue_of: cert.certificate_id,
        account_id: cert.account_id,
        holder_id: '',
        lines: [],
        description_of_operations: '',
      };
      try {
        // Sequential on purpose: a per-row failure must not abort the batch
        // (07 §3.5); each result is collected and summarized below.
        await issueMutation.mutateAsync(body);
        reissued.push(cert);
      } catch (err) {
        let reason = 'Could not reissue.';
        if (err instanceof IssueCertificateError) {
          if (err.status === 422 && err.issues.length > 0) {
            reason = err.issues.map((i) => i.message).join(' ');
          } else if (err.message) {
            reason = err.message;
          }
        } else if (err instanceof Error && err.message) {
          reason = err.message;
        }
        blocked.push({ cert, reason });
      }
    }

    // Invalidate the certificate log, the reissue queue, and the Documents tab
    // (07 §3.5). Do it once after the pass, not per row.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['certificates', accountId ?? null] }),
      queryClient.invalidateQueries({ queryKey: ['certificates', accountId] }),
      queryClient.invalidateQueries({ queryKey: ['certificates-needing-reissue', accountId ?? null] }),
      queryClient.invalidateQueries({
        queryKey: ['certificates-needing-reissue-count', accountId ?? null],
      }),
      queryClient.invalidateQueries({ queryKey: ['documents'] }),
    ]);
    await refetch();

    setSelected(new Set());
    setRunning(false);
    setResult({ reissued, blocked });

    if (blocked.length === 0) {
      toast.success(
        `${reissued.length} ${reissued.length === 1 ? 'certificate' : 'certificates'} reissued`,
      );
    } else {
      toast.warning(`${reissued.length} reissued, ${blocked.length} blocked`);
    }
  }, [readyRows, selected, issueMutation, queryClient, accountId, refetch]);

  // -------------------------------------------------------------------------
  // Master COI deep link (blocked rows link there to fix the named blocker).
  // -------------------------------------------------------------------------
  const masterCoiHref = useCallback(
    (row: CertificateNeedingReissue) => `/customers/${row.account_id}?tab=master-coi`,
    [],
  );

  // -------------------------------------------------------------------------
  // Loading: content-shaped skeleton rows (never a spinner).
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[92px] w-full max-w-[220px] rounded-cc-xl" />
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised px-4 py-3"
            >
              <Skeleton className="h-4 w-4 rounded-cc-sm" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16 rounded-pill" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-cc-text-primary">Renewal reissue queue</h2>
        <p className="text-sm text-cc-text-muted">
          Certificates whose printed policy dates went stale after a renewal. Select the ready
          ones and reissue them in a batch. Each reissue supersedes the original and writes a
          fresh certificate from current policy data. "Ready" means the policy data is current;
          endorsement and template checks still run at reissue, so a row can occasionally be
          blocked and reported below.
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-3">
        <TriageTile label="Needs reissue" count={count} tone="warning" />
        {readyRows.length > 0 && (
          <TriageTile label="Ready to reissue" count={readyRows.length} tone="success" />
        )}
      </div>

      {/* Batch results summary (07 §3.5). */}
      {result && (
        <div
          role="status"
          className="space-y-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3"
        >
          <div className="flex items-center gap-2 text-sm text-cc-text-secondary">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-cc-success" aria-hidden="true" />
            <span>
              <span className="[font-variant-numeric:tabular-nums] font-medium text-cc-text-primary">
                {result.reissued.length}
              </span>{' '}
              reissued
              {result.blocked.length > 0 && (
                <>
                  {', '}
                  <span className="[font-variant-numeric:tabular-nums] font-medium text-cc-text-primary">
                    {result.blocked.length}
                  </span>{' '}
                  blocked
                </>
              )}
              .
            </span>
          </div>
          {result.blocked.length > 0 && (
            <ul className="space-y-1.5">
              {result.blocked.map(({ cert, reason }) => (
                <li key={cert.certificate_id} className="flex flex-wrap items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 text-cc-danger" aria-hidden="true" />
                  <span className="cc-num font-mono [font-variant-numeric:tabular-nums] text-cc-text-primary">
                    {cert.certificate_number}
                  </span>
                  <StatusPill override={{ label: reason, tone: 'danger' }} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Empty state. */}
      {rows.length === 0 ? (
        <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised px-4 py-8 text-center">
          <p className="text-sm text-cc-text-muted">No certificates need reissue.</p>
          {onDone && (
            <div className="mt-3">
              <Button
                variant="ghost"
                onClick={onDone}
                className="text-cc-text-secondary hover:text-cc-text-primary"
              >
                Back to generator
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-cc-border-subtle text-left text-xs font-medium text-cc-text-muted">
                  <th className="w-10 px-4 py-2.5">
                    <Checkbox
                      checked={allReadySelected}
                      disabled={readyRows.length === 0 || running}
                      onCheckedChange={(v) => toggleAllReady(v === true)}
                      aria-label="Select all ready certificates"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Certificate</th>
                  <th className="px-4 py-2.5 font-medium">Holder</th>
                  <th className="px-4 py-2.5 font-medium">Stale lines</th>
                  <th className="px-4 py-2.5 font-medium">Readiness</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ready = row.is_ready;
                  const isChecked = selected.has(row.certificate_id);
                  const blocker = firstBlockerCode(row);
                  return (
                    <tr
                      key={row.certificate_id}
                      className="border-b border-cc-border-subtle align-top last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={isChecked}
                          disabled={!ready || running}
                          onCheckedChange={(v) => toggleRow(row.certificate_id, v === true)}
                          aria-label={`Select certificate ${row.certificate_number}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="cc-num whitespace-nowrap font-mono font-medium text-cc-text-primary [font-variant-numeric:tabular-nums]">
                          {row.certificate_number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="break-words text-cc-text-primary">{row.holder_name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {row.stale_lines.map((line) => (
                            <StaleLineChange key={`${line.line_key}:${line.policy_id}`} line={line} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {ready ? (
                          <StatusPill override={{ label: 'Ready', tone: 'success' }} />
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            <StatusPill
                              override={{ label: blockerLabel(blocker), tone: 'danger', critical: true }}
                            />
                            <Link
                              to={masterCoiHref(row)}
                              className="text-xs text-cc-text-muted underline-offset-4 hover:text-cc-text-secondary hover:underline"
                            >
                              Open Master COI
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              data-primary
              onClick={() => setConfirmOpen(true)}
              disabled={selectedReadyCount === 0 || running}
              className="font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              {running
                ? 'Reissuing'
                : selectedReadyCount > 0
                  ? `Reissue selected (${selectedReadyCount})`
                  : 'Reissue selected'}
            </Button>
            {onDone && (
              <Button
                variant="ghost"
                onClick={onDone}
                disabled={running}
                className="text-cc-text-secondary hover:text-cc-text-primary"
              >
                Back to generator
              </Button>
            )}
            {selectedReadyCount === 0 && readyRows.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-cc-text-muted">
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Select at least one ready certificate.
              </span>
            )}
          </div>

          {/* 07 §3.4: display the diff and take one explicit confirm before executing. */}
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent className="max-w-lg">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Reissue {selectedReadyCount} certificate{selectedReadyCount === 1 ? '' : 's'}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Each selected certificate is reissued with current coverage and the original is
                  marked superseded. Review the changes below, then confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="max-h-72 space-y-3 overflow-y-auto">
                {readyRows
                  .filter((r) => selected.has(r.certificate_id))
                  .map((cert) => (
                    <div
                      key={cert.certificate_id}
                      className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3"
                    >
                      <div className="cc-num [font-variant-numeric:tabular-nums] text-sm font-semibold text-cc-text-primary">
                        {cert.certificate_number}
                      </div>
                      <div className="text-xs text-cc-text-muted">{cert.holder_name}</div>
                      <div className="mt-1.5 space-y-1">
                        {cert.stale_lines.map((line) => (
                          <StaleLineChange key={`${line.line_key}:${line.policy_id}`} line={line} />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  data-primary
                  onClick={() => {
                    setConfirmOpen(false);
                    void reissueSelected();
                  }}
                  className="font-semibold"
                >
                  Reissue {selectedReadyCount} certificate{selectedReadyCount === 1 ? '' : 's'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
