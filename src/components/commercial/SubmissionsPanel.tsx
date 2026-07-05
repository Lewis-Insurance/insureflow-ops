// ============================================================================
// SUBMISSIONS PANEL (Commercial Lines SOW v3 Phase 1, Path B spine UI)
// ============================================================================
// The account's E&S submissions: create (target lines, effective date,
// wholesaler free text - NO market registry by design), status flow, the
// diligent-effort declination log (append-only, with a copyable summary),
// and the offer-and-rejection E&O log.
// Packet generation / e-sign / universal send arrive with the 125+126 form
// engines (Phase 1b, blank-dependent); this panel is the workflow they mount on.
//
// Calm Command: cc-* tokens both themes, NO lime in this panel, tabular
// figures on dates/numbers, no em or en dashes, content-shaped loading.
// ============================================================================

import { useMemo, useState } from 'react';
import { Copy, FileText, Plus, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  SUBMISSION_STATUSES,
  useAddDeclination,
  useCommercialSubmissions,
  useCreateSubmission,
  useOfferRejections,
  useRecordOffer,
  useSubmissionDeclinations,
  useUpdateSubmission,
} from '@/hooks/useCommercialSubmissions';
import type {
  CommercialLineKey, CommercialSubmission, OfferCoverage, SubmissionStatus,
} from '@/types/commercial';

const LINE_OPTIONS: { key: CommercialLineKey; label: string }[] = [
  { key: 'gl', label: 'General liability' },
  { key: 'property', label: 'Property' },
  { key: 'wc', label: 'Workers comp' },
  { key: 'umbrella', label: 'Excess / umbrella' },
  { key: 'auto', label: 'Business auto' },
];
const lineLabel = (k: string) => LINE_OPTIONS.find((l) => l.key === k)?.label ?? k.toUpperCase();

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  draft: 'Draft', intake: 'Intake', packet_ready: 'Packet ready', signing: 'Signing',
  submitted: 'Submitted', quoted: 'Quoted', proposed: 'Proposed', bound: 'Bound',
  lost: 'Lost', abandoned: 'Abandoned',
};

/** Neutral chip; bound/lost get semantic tints. No lime anywhere. */
function StatusChip({ status }: { status: SubmissionStatus }) {
  const tone =
    status === 'bound'
      ? 'bg-success/10 text-success'
      : status === 'lost' || status === 'abandoned'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-cc-surface-overlay text-cc-text-secondary';
  return (
    <span className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const isoToUs = (iso: string | null): string => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
};

const OFFER_COVERAGES: { key: OfferCoverage; label: string }[] = [
  { key: 'umbrella', label: 'Umbrella / excess' },
  { key: 'um_uim', label: 'UM / UIM' },
  { key: 'higher_limits', label: 'Higher limits' },
  { key: 'wc_exemption', label: 'WC exemption' },
  { key: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------

export function SubmissionsPanel({ accountId, accountName }: { accountId: string; accountName: string }) {
  const { data: submissions = [], isLoading } = useCommercialSubmissions(accountId);
  const createMutation = useCreateSubmission();
  const updateMutation = useUpdateSubmission();

  const [newOpen, setNewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => submissions.find((s) => s.id === selectedId) ?? null,
    [submissions, selectedId],
  );

  // New-submission form state.
  const [newLines, setNewLines] = useState<CommercialLineKey[]>(['gl']);
  const [newEffective, setNewEffective] = useState('');
  const [newWholesaler, setNewWholesaler] = useState('');
  const [newWholesalerEmail, setNewWholesalerEmail] = useState('');

  const handleCreate = () => {
    if (newLines.length === 0) {
      toast.error('Pick at least one line.');
      return;
    }
    createMutation.mutate(
      {
        accountId,
        targetLines: newLines,
        effectiveDate: newEffective || null,
        wholesalerName: newWholesaler,
        wholesalerEmail: newWholesalerEmail,
      },
      {
        onSuccess: (created) => {
          setNewOpen(false);
          setNewLines(['gl']); setNewEffective(''); setNewWholesaler(''); setNewWholesalerEmail('');
          setSelectedId(created.id);
        },
      },
    );
  };

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-cc-text-primary">Commercial submissions</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setNewOpen(true)}
          className="text-cc-text-secondary hover:text-cc-text-primary">
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> New submission
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-cc-md bg-cc-surface-raised" />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <p className="py-4 text-center text-sm text-cc-text-muted">
          No submissions yet. Start one to market this account to a wholesaler.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {submissions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                className={`flex w-full flex-wrap items-center gap-2.5 rounded-cc-md border px-3 py-2.5 text-left transition-colors duration-fast ${
                  s.id === selectedId
                    ? 'border-cc-border-interactive bg-cc-surface-raised'
                    : 'border-cc-border-subtle hover:border-cc-border-interactive'
                }`}
              >
                <StatusChip status={s.status} />
                <span className="text-sm text-cc-text-primary">
                  {s.target_lines.map(lineLabel).join(', ') || 'No lines'}
                </span>
                {s.effective_date && (
                  <span className="cc-num text-sm text-cc-text-muted [font-variant-numeric:tabular-nums]">
                    eff {isoToUs(s.effective_date)}
                  </span>
                )}
                {s.wholesaler_name && (
                  <span className="text-sm text-cc-text-muted">via {s.wholesaler_name}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <SubmissionDetail
          key={selected.id}
          accountId={accountId}
          accountName={accountName}
          submission={selected}
          onStatusChange={(status) =>
            updateMutation.mutate({ accountId, submissionId: selected.id, changes: { status } })
          }
        />
      )}

      {/* New submission dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="bg-cc-surface-raised">
          <DialogHeader>
            <DialogTitle className="text-cc-text-primary">New submission</DialogTitle>
            <DialogDescription className="text-cc-text-muted">
              Market {accountName} for new or remarketed coverage. The packet and send
              come later; this opens the file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-cc-text-secondary">Lines</Label>
              <div className="flex flex-wrap gap-3">
                {LINE_OPTIONS.map((l) => (
                  <label key={l.key} className="flex items-center gap-1.5 text-sm text-cc-text-primary">
                    <Checkbox
                      checked={newLines.includes(l.key)}
                      onCheckedChange={(v) =>
                        setNewLines((prev) =>
                          v === true ? [...prev, l.key] : prev.filter((k) => k !== l.key),
                        )
                      }
                    />
                    {l.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sub-eff" className="text-cc-text-secondary">Target effective date</Label>
                <Input id="sub-eff" type="date" value={newEffective} onChange={(e) => setNewEffective(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-wh" className="text-cc-text-secondary">Wholesaler / market</Label>
                <Input id="sub-wh" placeholder="Bass Underwriting" value={newWholesaler} onChange={(e) => setNewWholesaler(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-whe" className="text-cc-text-secondary">Wholesaler email <span className="text-cc-text-muted">(for the one-click send later)</span></Label>
              <Input id="sub-whe" type="email" inputMode="email" autoComplete="off" value={newWholesalerEmail} onChange={(e) => setNewWholesalerEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || newLines.length === 0}>
              {createMutation.isPending ? 'Creating' : 'Create submission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selected-submission detail: status, declination log, offer/rejection log.
// ---------------------------------------------------------------------------

function SubmissionDetail({
  accountId, accountName, submission, onStatusChange,
}: {
  accountId: string;
  accountName: string;
  submission: CommercialSubmission;
  onStatusChange: (status: SubmissionStatus) => void;
}) {
  const { data: declinations = [] } = useSubmissionDeclinations(submission.id);
  const addDeclination = useAddDeclination();
  const { data: offers = [] } = useOfferRejections(accountId);
  const recordOffer = useRecordOffer();

  const [decCarrier, setDecCarrier] = useState('');
  const [decDate, setDecDate] = useState('');
  const [decReason, setDecReason] = useState('');
  const [offerCoverage, setOfferCoverage] = useState<OfferCoverage>('umbrella');

  const submissionOffers = offers.filter((o) => o.submission_id === submission.id);

  const diligentEffortText = useMemo(() => {
    if (declinations.length === 0) return '';
    const lines = declinations.map(
      (d) => `- ${d.carrier_name}, declined ${isoToUs(d.declined_at)}${d.reason ? `: ${d.reason}` : ''}`,
    );
    return [
      `Diligent effort record - ${accountName}`,
      `Submission: ${submission.target_lines.map(lineLabel).join(', ')}${submission.effective_date ? `, effective ${isoToUs(submission.effective_date)}` : ''}`,
      `Admitted market declinations (${declinations.length}):`,
      ...lines,
      submission.wholesaler_name ? `Placed through: ${submission.wholesaler_name} (surplus lines agent of record)` : '',
    ].filter(Boolean).join('\n');
  }, [declinations, accountName, submission]);

  const handleAddDeclination = () => {
    if (!decCarrier.trim()) {
      toast.error('Enter the carrier name.');
      return;
    }
    addDeclination.mutate(
      {
        submissionId: submission.id,
        carrierName: decCarrier,
        declinedAt: decDate || new Date().toISOString().slice(0, 10),
        reason: decReason,
      },
      { onSuccess: () => { setDecCarrier(''); setDecDate(''); setDecReason(''); } },
    );
  };

  return (
    <div className="mt-4 space-y-5 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-4">
      {/* Status row */}
      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-cc-text-secondary">Status</Label>
        <Select value={submission.status} onValueChange={(v) => onStatusChange(v as SubmissionStatus)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SUBMISSION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {submission.wholesaler_email && (
          <span className="text-sm text-cc-text-muted">{submission.wholesaler_email}</span>
        )}
      </div>

      {/* Diligent effort: declination log */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-cc-text-primary">
              Diligent effort <span className="font-normal text-cc-text-muted">(admitted declinations)</span>
            </h4>
          </div>
          {diligentEffortText && (
            <Button
              variant="ghost" size="sm"
              onClick={() => { void navigator.clipboard.writeText(diligentEffortText); toast.success('Diligent effort record copied'); }}
              className="text-cc-text-secondary hover:text-cc-text-primary"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Copy record
            </Button>
          )}
        </div>
        {declinations.length > 0 && (
          <ul className="space-y-1">
            {declinations.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="text-cc-text-primary">{d.carrier_name}</span>
                <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">{isoToUs(d.declined_at)}</span>
                {d.reason && <span className="text-cc-text-muted">{d.reason}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_10rem_1fr_auto]">
          <Input placeholder="Carrier declined" value={decCarrier} onChange={(e) => setDecCarrier(e.target.value)} />
          <Input type="date" value={decDate} onChange={(e) => setDecDate(e.target.value)} aria-label="Declination date" />
          <Input placeholder="Reason (optional)" value={decReason} onChange={(e) => setDecReason(e.target.value)} />
          <Button variant="ghost" onClick={handleAddDeclination} disabled={addDeclination.isPending}
            className="text-cc-text-secondary hover:text-cc-text-primary">
            Record
          </Button>
        </div>
        <p className="text-xs text-cc-text-muted">
          Append-only evidence. Record each admitted market that declined before an E&S placement.
        </p>
      </div>

      {/* Offer / rejection log */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-cc-text-primary">
          Offers <span className="font-normal text-cc-text-muted">(coverage offered and the client's decision)</span>
        </h4>
        {submissionOffers.length > 0 && (
          <ul className="space-y-1">
            {submissionOffers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="text-cc-text-primary">
                  {OFFER_COVERAGES.find((c) => c.key === o.coverage)?.label ?? o.coverage}
                </span>
                <span className={
                  o.decision === 'rejected' ? 'text-destructive' :
                  o.decision === 'accepted' ? 'text-success' : 'text-cc-text-muted'
                }>
                  {o.decision}
                </span>
                {o.decided_at && (
                  <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">{isoToUs(o.decided_at)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={offerCoverage} onValueChange={(v) => setOfferCoverage(v as OfferCoverage)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OFFER_COVERAGES.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" disabled={recordOffer.isPending}
            onClick={() => recordOffer.mutate({ accountId, submissionId: submission.id, coverage: offerCoverage, decision: 'accepted' })}
            className="text-cc-text-secondary hover:text-cc-text-primary">
            Offered + accepted
          </Button>
          <Button variant="ghost" size="sm" disabled={recordOffer.isPending}
            onClick={() => recordOffer.mutate({ accountId, submissionId: submission.id, coverage: offerCoverage, decision: 'rejected' })}
            className="text-cc-text-secondary hover:text-cc-text-primary">
            Offered + rejected
          </Button>
        </div>
        <p className="text-xs text-cc-text-muted">
          The E&O record. A rejected umbrella or UM offer here is what proves it was offered.
        </p>
      </div>

      {/* Notes */}
      {submission.notes && (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-cc-text-primary">Notes</h4>
          <Textarea readOnly rows={2} value={submission.notes} className="text-sm" />
        </div>
      )}
    </div>
  );
}
