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
import {
  quoteCarrierName,
  useAddSubmissionQuote,
  useBindSubmissionQuote,
  useSubmissionQuotes,
  type SubmissionQuote,
} from '@/hooks/useSubmissionQuotes';
import { usePoliciesByAccount } from '@/hooks/usePoliciesByAccount';
import { LossRunRequestDialog } from './LossRunRequestDialog';
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
                          v === true
                            ? prev.includes(l.key) ? prev : [...prev, l.key]
                            : prev.filter((k) => k !== l.key),
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
  const [lossRunOpen, setLossRunOpen] = useState(false);
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
        // LOCAL calendar date, not UTC: an evening entry must not log
        // tomorrow's date on the E&O declination record (review fix).
        declinedAt:
          decDate ||
          `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
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
        <Button
          variant="ghost" size="sm"
          onClick={() => setLossRunOpen(true)}
          className="ml-auto text-cc-text-secondary hover:text-cc-text-primary"
        >
          Request loss runs
        </Button>
      </div>

      <LossRunRequestDialog
        open={lossRunOpen}
        onOpenChange={setLossRunOpen}
        accountId={accountId}
        submissionId={submission.id}
        insuredName={accountName}
      />

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

      {/* Quotes + bind */}
      <QuotesBlock accountId={accountId} submission={submission} />

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

// ---------------------------------------------------------------------------
// Quotes + bind (GL v1). Record carrier quotes with the two COI-required GL
// limits; bind picks the policy the win becomes and writes those limits to it
// through save_master_coi_fields, so the bound policy is COI-ready (Path A).
// ---------------------------------------------------------------------------

const money = (n: number | null | undefined): string =>
  n == null ? '' : `$${Number(n).toLocaleString('en-US')}`;

function QuotesBlock({ accountId, submission }: { accountId: string; submission: CommercialSubmission }) {
  // Quotable lines on this submission; when more than one, the user picks
  // which line this quote covers (review fix: a fixed priority locked
  // property+wc submissions out of property quotes).
  const quotableLines = useMemo(
    () => (['gl', 'wc', 'property', 'umbrella', 'auto'] as const).filter((l) => submission.target_lines.includes(l)),
    [submission.target_lines],
  );
  const [lineChoice, setLineChoice] = useState<'gl' | 'wc' | 'property' | 'umbrella' | 'auto' | null>(null);
  const lineMode: 'gl' | 'wc' | 'property' | 'umbrella' | 'auto' =
    lineChoice && quotableLines.includes(lineChoice) ? lineChoice : (quotableLines[0] ?? 'gl');
  const { data: quotes = [] } = useSubmissionQuotes(submission.id);
  const addQuote = useAddSubmissionQuote();
  const bindQuote = useBindSubmissionQuote();
  // Reuse the app-wide policies query (review fix: no duplicate cache entry).
  // usePoliciesByAccount does not filter soft-deleted rows; the bind server
  // check would reject one anyway - keep them out of the picker (review fix).
  const { data: allPolicies = [] } = usePoliciesByAccount(accountId);
  const policies = useMemo(
    () => allPolicies.filter((p: { deleted_at?: string | null }) => !p.deleted_at),
    [allPolicies],
  );

  const closed = ['bound', 'lost', 'abandoned'].includes(submission.status);

  const [qCarrier, setQCarrier] = useState('');
  const [qPremium, setQPremium] = useState('');
  const [qEachOcc, setQEachOcc] = useState('');
  const [qGenAgg, setQGenAgg] = useState('');
  const [qThird, setQThird] = useState('');

  const [bindTarget, setBindTarget] = useState<SubmissionQuote | null>(null);
  const [bindPolicyId, setBindPolicyId] = useState('');
  const [bindEachOcc, setBindEachOcc] = useState('');
  const [bindGenAgg, setBindGenAgg] = useState('');
  const [bindThird, setBindThird] = useState('');
  // The bind dialog keys off the QUOTE's own line, never the record-form
  // selector (review fix): on a multi-line submission, Bind on an auto quote
  // while the selector shows GL must still prefill the CSL, validate the
  // CSL rule, and send line 'auto'. The server derives the line from the
  // quote anyway - this keeps the client honest with it.
  const [bindLine, setBindLine] = useState<'gl' | 'wc' | 'property' | 'umbrella' | 'auto'>('gl');

  // Enum labels normalize to module keys EXACTLY like the server does:
  // 'workers_comp' -> 'wc', 'commercial_auto' -> 'auto', and the enum's
  // bare 'auto' (PERSONAL auto) -> 'personal_auto' so it can never route
  // into the commercial bind dialog (review fix). Anything unmappable
  // falls back to the selector with the server guard as the backstop.
  const quoteLineOf = (q: SubmissionQuote): 'gl' | 'wc' | 'property' | 'umbrella' | 'auto' | null => {
    const mapped = q.line_of_business === 'workers_comp' ? 'wc'
      : q.line_of_business === 'commercial_auto' ? 'auto'
      : q.line_of_business === 'auto' ? 'personal_auto'
      : q.line_of_business;
    return (['gl', 'wc', 'property', 'umbrella', 'auto'] as const).find((l) => l === mapped) ?? null;
  };

  const numOrNull = (raw: string): number | null => {
    const n = Number(raw.replace(/[$,\s]/g, ''));
    return raw.trim() !== '' && Number.isFinite(n) ? n : null;
  };

  const coverageLimit = (q: SubmissionQuote, type: string): number | null =>
    q.quote_coverages?.find((c) => c.coverage_type === type)?.limit_amount ?? null;

  const openBind = (q: SubmissionQuote) => {
    const line = quoteLineOf(q) ?? lineMode;
    setBindLine(line);
    setBindTarget(q);
    setBindPolicyId('');
    const eo = coverageLimit(
      q,
      line === 'gl' ? 'gl_each_occurrence'
        : line === 'wc' ? 'wc_el_each_accident'
        : line === 'umbrella' ? 'umbrella_per_occurrence'
        : line === 'auto' ? 'auto_csl'
        : 'property_limit',
    );
    const ga = coverageLimit(
      q,
      line === 'wc' ? 'wc_el_disease_each_employee'
        : line === 'umbrella' ? 'umbrella_aggregate'
        : 'gl_general_aggregate',
    );
    const th = coverageLimit(q, 'wc_el_disease_policy_limit');
    setBindEachOcc(eo != null ? String(eo) : '');
    setBindGenAgg(ga != null ? String(ga) : '');
    setBindThird(th != null ? String(th) : '');
  };

  const handleRecord = () => {
    if (!qCarrier.trim()) {
      toast.error('Enter the quoting carrier.');
      return;
    }
    addQuote.mutate(
      {
        accountId,
        submissionId: submission.id,
        carrierName: qCarrier,
        premium: numOrNull(qPremium),
        line: lineMode,
        eachOccurrence: lineMode === 'gl' ? numOrNull(qEachOcc) : null,
        generalAggregate: lineMode === 'gl' ? numOrNull(qGenAgg) : null,
        propertyLimit: lineMode === 'property' ? numOrNull(qEachOcc) : null,
        elEachAccident: lineMode === 'wc' ? numOrNull(qEachOcc) : null,
        elDiseaseEachEmployee: lineMode === 'wc' ? numOrNull(qGenAgg) : null,
        elDiseasePolicyLimit: lineMode === 'wc' ? numOrNull(qThird) : null,
        umbPerOccurrence: lineMode === 'umbrella' ? numOrNull(qEachOcc) : null,
        umbAggregate: lineMode === 'umbrella' ? numOrNull(qGenAgg) : null,
        autoCsl: lineMode === 'auto' ? numOrNull(qEachOcc) : null,
      },
      { onSuccess: () => { setQCarrier(''); setQPremium(''); setQEachOcc(''); setQGenAgg(''); setQThird(''); } },
    );
  };

  const bindEo = numOrNull(bindEachOcc);
  const bindGa = numOrNull(bindGenAgg);
  const bindTh = numOrNull(bindThird);

  const handleBind = () => {
    if (!bindTarget || !bindPolicyId) {
      toast.error('Pick the policy this bind becomes.');
      return;
    }
    // Line-required limits must be present (the server enforces this too).
    if (bindLine === 'gl' && (bindEo == null || bindGa == null)) {
      toast.error('Both GL limits are required to bind.');
      return;
    }
    if (bindLine === 'property' && bindEo == null) {
      toast.error('The property limit is required to bind.');
      return;
    }
    if (bindLine === 'wc' && (bindEo == null || bindGa == null || bindTh == null)) {
      toast.error('All three WC employers liability limits are required to bind.');
      return;
    }
    if (bindLine === 'umbrella' && bindEo == null) {
      toast.error('The umbrella per occurrence limit is required to bind.');
      return;
    }
    if (bindLine === 'auto' && bindEo == null) {
      toast.error('The combined single limit is required to bind.');
      return;
    }
    bindQuote.mutate(
      {
        accountId,
        submissionId: submission.id,
        quoteId: bindTarget.id,
        policyId: bindPolicyId,
        line: bindLine,
        eachOccurrence: bindLine === 'gl' ? bindEo : null,
        generalAggregate: bindLine === 'gl' ? bindGa : null,
        propertyLimit: bindLine === 'property' ? bindEo : null,
        elEachAccident: bindLine === 'wc' ? bindEo : null,
        elDiseaseEachEmployee: bindLine === 'wc' ? bindGa : null,
        elDiseasePolicyLimit: bindLine === 'wc' ? bindTh : null,
        umbPerOccurrence: bindLine === 'umbrella' ? bindEo : null,
        umbAggregate: bindLine === 'umbrella' ? bindGa : null,
        autoCsl: bindLine === 'auto' ? bindEo : null,
      },
      { onSuccess: () => setBindTarget(null) },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-cc-text-primary">
          Quotes{' '}
          <span className="font-normal text-cc-text-muted">
            {lineMode === 'gl'
              ? '(GL limits feed the COI on bind)'
              : lineMode === 'wc'
                ? '(EL limits feed the COI on bind)'
                : lineMode === 'umbrella'
                  ? '(the umbrella limits feed the COI on bind)'
                  : lineMode === 'auto'
                    ? '(the CSL feeds the COI on bind)'
                    : '(the property limit feeds the COI on bind)'}
          </span>
        </h4>
        {quotableLines.length > 1 && (
          <Select value={lineMode} onValueChange={(v) => setLineChoice(v as 'gl' | 'wc' | 'property' | 'umbrella' | 'auto')}>
            <SelectTrigger className="h-7 w-36" aria-label="Quote line">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {quotableLines.map((l) => (
                <SelectItem key={l} value={l}>{lineLabel(l)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {quotes.length > 0 && (
        <ul className="space-y-1.5">
          {quotes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-2.5 text-sm">
              <span
                className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium ${
                  q.status === 'won'
                    ? 'bg-success/10 text-success'
                    : q.status === 'lost'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-cc-surface-overlay text-cc-text-secondary'
                }`}
              >
                {q.status}
              </span>
              <span className="text-cc-text-primary">{quoteCarrierName(q)}</span>
              {q.premium != null && (
                <span className="cc-num text-cc-text-primary [font-variant-numeric:tabular-nums]">{money(q.premium)}</span>
              )}
              {coverageLimit(q, 'gl_each_occurrence') != null && (
                <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  occ {money(coverageLimit(q, 'gl_each_occurrence'))}
                </span>
              )}
              {coverageLimit(q, 'property_limit') != null && (
                <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  limit {money(coverageLimit(q, 'property_limit'))}
                </span>
              )}
              {coverageLimit(q, 'wc_el_each_accident') != null && (
                <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  EL {money(coverageLimit(q, 'wc_el_each_accident'))}
                </span>
              )}
              {coverageLimit(q, 'wc_el_disease_each_employee') != null && (
                <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  dis/empl {money(coverageLimit(q, 'wc_el_disease_each_employee'))}
                </span>
              )}
              {coverageLimit(q, 'wc_el_disease_policy_limit') != null && (
                <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  dis/policy {money(coverageLimit(q, 'wc_el_disease_policy_limit'))}
                </span>
              )}
              {coverageLimit(q, 'umbrella_per_occurrence') != null && (
                <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  occ {money(coverageLimit(q, 'umbrella_per_occurrence'))}
                </span>
              )}
              {coverageLimit(q, 'umbrella_aggregate') != null && (
                <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  agg {money(coverageLimit(q, 'umbrella_aggregate'))}
                </span>
              )}
              {coverageLimit(q, 'auto_csl') != null && (
                <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  CSL {money(coverageLimit(q, 'auto_csl'))}
                </span>
              )}
              {coverageLimit(q, 'gl_general_aggregate') != null && (
                <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  agg {money(coverageLimit(q, 'gl_general_aggregate'))}
                </span>
              )}
              {!closed && q.status === 'open' && (
                <Button variant="ghost" size="sm" onClick={() => openBind(q)}
                  className="text-cc-text-secondary hover:text-cc-text-primary">
                  Bind
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!closed && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_8rem_8rem_8rem_auto]">
          <Input placeholder="Quoting carrier" value={qCarrier} onChange={(e) => setQCarrier(e.target.value)} />
          <Input placeholder="Premium" inputMode="numeric" value={qPremium} onChange={(e) => setQPremium(e.target.value)} aria-label="Premium" />
          <Input
            placeholder={lineMode === 'gl' ? 'Each occ' : lineMode === 'wc' ? 'EL accident' : lineMode === 'umbrella' ? 'Per occ' : lineMode === 'auto' ? 'CSL' : 'Prop limit'}
            inputMode="numeric" value={qEachOcc} onChange={(e) => setQEachOcc(e.target.value)}
            aria-label={lineMode === 'gl' ? 'Each occurrence limit' : lineMode === 'wc' ? 'EL each accident limit' : lineMode === 'umbrella' ? 'Umbrella per occurrence limit' : lineMode === 'auto' ? 'Combined single limit' : 'Property limit'}
          />
          {lineMode === 'umbrella' && (
            <Input placeholder="Aggregate" inputMode="numeric" value={qGenAgg} onChange={(e) => setQGenAgg(e.target.value)} aria-label="Umbrella aggregate limit" />
          )}
          {lineMode === 'gl' && (
            <Input placeholder="Gen agg" inputMode="numeric" value={qGenAgg} onChange={(e) => setQGenAgg(e.target.value)} aria-label="General aggregate limit" />
          )}
          {lineMode === 'wc' && (
            <>
              <Input placeholder="EL disease/empl" inputMode="numeric" value={qGenAgg} onChange={(e) => setQGenAgg(e.target.value)} aria-label="EL disease each employee limit" />
              <Input placeholder="EL disease policy" inputMode="numeric" value={qThird} onChange={(e) => setQThird(e.target.value)} aria-label="EL disease policy limit" />
            </>
          )}
          <Button variant="ghost" onClick={handleRecord} disabled={addQuote.isPending}
            className="text-cc-text-secondary hover:text-cc-text-primary">
            Record
          </Button>
        </div>
      )}

      {/* Bind dialog: pick the policy, confirm the limits that flow to the COI. */}
      <Dialog open={!!bindTarget} onOpenChange={(open) => { if (!open) setBindTarget(null); }}>
        <DialogContent className="bg-cc-surface-raised">
          <DialogHeader>
            <DialogTitle className="text-cc-text-primary">Bind quote</DialogTitle>
            <DialogDescription className="text-cc-text-muted">
              {bindTarget ? `${quoteCarrierName(bindTarget)}${bindTarget.premium != null ? `, ${money(bindTarget.premium)}` : ''}. ` : ''}
              Pick the policy record this bind becomes. The {bindLine === 'gl' ? 'GL limits' : bindLine === 'wc' ? 'EL limits' : bindLine === 'umbrella' ? 'umbrella limits' : bindLine === 'auto' ? 'combined single limit' : 'property limit'} below
              {bindLine === 'property' || bindLine === 'auto' ? ' is' : ' are'} written to that policy through the Master COI write path,
              so it is certificate-ready immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-cc-text-secondary">Policy</Label>
              <Select value={bindPolicyId || undefined} onValueChange={setBindPolicyId}>
                <SelectTrigger>
                  <SelectValue placeholder={policies.length === 0 ? 'No policies on this account yet' : 'Select the policy'} />
                </SelectTrigger>
                <SelectContent>
                  {policies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.policy_number || '(no number)', p.carrier, p.line_of_business, p.status].filter(Boolean).join(' - ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {policies.length === 0 && (
                <p className="text-xs text-cc-text-muted">
                  Add the policy on this customer first (Policies section), then bind.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bind-eo" className="text-cc-text-secondary">
                  {bindLine === 'gl' ? 'Each occurrence' : bindLine === 'wc' ? 'EL each accident' : bindLine === 'umbrella' ? 'Per occurrence' : bindLine === 'auto' ? 'Combined single limit' : 'Property limit'}
                </Label>
                <Input id="bind-eo" inputMode="numeric" value={bindEachOcc} onChange={(e) => setBindEachOcc(e.target.value)} />
              </div>
              {bindLine === 'gl' && (
                <div className="space-y-1.5">
                  <Label htmlFor="bind-ga" className="text-cc-text-secondary">General aggregate</Label>
                  <Input id="bind-ga" inputMode="numeric" value={bindGenAgg} onChange={(e) => setBindGenAgg(e.target.value)} />
                </div>
              )}
              {bindLine === 'umbrella' && (
                <div className="space-y-1.5">
                  <Label htmlFor="bind-ga" className="text-cc-text-secondary">Aggregate (optional)</Label>
                  <Input id="bind-ga" inputMode="numeric" value={bindGenAgg} onChange={(e) => setBindGenAgg(e.target.value)} />
                </div>
              )}
              {bindLine === 'wc' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="bind-ga" className="text-cc-text-secondary">EL disease each employee</Label>
                    <Input id="bind-ga" inputMode="numeric" value={bindGenAgg} onChange={(e) => setBindGenAgg(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bind-th" className="text-cc-text-secondary">EL disease policy limit</Label>
                    <Input id="bind-th" inputMode="numeric" value={bindThird} onChange={(e) => setBindThird(e.target.value)} />
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBindTarget(null)} disabled={bindQuote.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleBind}
              disabled={bindQuote.isPending || !bindPolicyId || bindEo == null || (bindLine === 'gl' && bindGa == null) || (bindLine === 'wc' && (bindGa == null || bindTh == null))}
            >
              {bindQuote.isPending ? 'Binding' : 'Bind quote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
