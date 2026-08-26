import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SectionLabel, DateField } from '@/components/cc';
import {
  ArrowRightLeft, Check, CheckCircle2, FileUp, Loader2, Trash2, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  type Renewal,
  type MovePolicyOption,
  type MovedConflictCode,
  useSaveRenewalDraft,
  useMarkRenewed,
  useMarkMoved,
  useMarkLost,
  useRenewalDocuments,
  useUploadRenewalDocument,
  useDeleteRenewalDocument,
  useAccountPolicyOptions,
} from '@/hooks/useRenewalWorkflow';
import {
  deriveExpiration,
  normalizePolicyTerm,
  renewalDraftSchema,
  POLICY_TERM_OPTIONS,
  LOST_REASON_OPTIONS,
  termOfExistingPolicy,
  type PolicyTerm,
  type LostReasonCategory,
} from '@/lib/renewals/renewalTerm';
import { extractLocalDate } from '@/lib/date/localDate';
import { useCarriers } from '@/hooks/useLookupData';
import { formatMoney as formatCurrency, formatShortDate } from '@/lib/renewals/format';

type Outcome = 'renewed' | 'moved' | 'lost';

/** A conflict the commit hit, resolved in place by the dialog instead of a dead end. */
interface MoveConflict {
  code: MovedConflictCode;
  policyId: string | null;
  accountId: string | null;
}

const TERMINAL = new Set([
  'renewed', 'moved', 'lost', 'cancelled', 'non_renewed', 'lapsed', 'completed',
]);

function toNumber(v: string): number {
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

interface Props {
  renewal: Renewal;
}

/** Quiet autosave state for the editor header: Saving -> Saved, or Unsaved while dirty. */
function AutosaveStatus({ pending, dirty, savedAt }: { pending: boolean; dirty: boolean; savedAt: number | null }) {
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-cc-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
      </span>
    );
  }
  if (dirty) return <span className="text-xs text-cc-text-muted">Unsaved changes</span>;
  if (savedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-cc-text-muted">
        <Check className="h-3.5 w-3.5 text-cc-success" /> Saved
      </span>
    );
  }
  return null;
}

/**
 * Hero "Update Renewal" widget — the always-on inline editor.
 *
 * Two tiers:
 *  - Working Save -> persists the draft to the renewal row only (never the policy).
 *  - Outcome commit (Renewed / Moved / Lost) -> the single lime action that writes through
 *    to the policy and customer page via the dedicated hooks.
 */
export function UpdateRenewalWidget({ renewal }: Props) {
  const isTerminal = TERMINAL.has(renewal.status);
  const canCommit = !!renewal.policy_id;
  const navigate = useNavigate();

  const saveDraft = useSaveRenewalDraft();
  const markRenewed = useMarkRenewed();
  const markMoved = useMarkMoved();
  const markLost = useMarkLost();
  const uploadDoc = useUploadRenewalDocument();
  const deleteDoc = useDeleteRenewalDocument();
  const { data: documents = [] } = useRenewalDocuments(renewal.id);
  const { data: carriers = [] } = useCarriers();

  // ---- working draft state (seeded from the renewal, prior expiration = no off-by-one) ----
  const seededEffective = renewal.new_effective_date || renewal.expiration_date || '';
  const seededTerm = normalizePolicyTerm(renewal.policy_term);
  const [workingStatus, setWorkingStatus] = useState<'pending' | 'contacted' | 'quoted'>(
    renewal.status === 'quoted' ? 'quoted' : renewal.status === 'contacted' ? 'contacted' : 'pending',
  );
  const [policyNumber, setPolicyNumber] = useState(renewal.policy_number || '');
  const [premium, setPremium] = useState(
    (renewal.renewal_premium ?? renewal.current_premium ?? '').toString(),
  );
  const [term, setTerm] = useState<PolicyTerm>(seededTerm);
  const [effectiveDate, setEffectiveDate] = useState(seededEffective);
  const [expirationDate, setExpirationDate] = useState(
    renewal.new_expiration_date || deriveExpiration(seededEffective, seededTerm) || '',
  );

  // ---- outcome state ----
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [movedCarrier, setMovedCarrier] = useState('');
  const [lostCategory, setLostCategory] = useState<LostReasonCategory>('cancelled');
  const [lostReason, setLostReason] = useState('');
  const [terminationDate, setTerminationDate] = useState(renewal.expiration_date || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Set when a Move hits a policy number that is already live somewhere.
  const [conflict, setConflict] = useState<MoveConflict | null>(null);
  // The already-on-file policy the agent picked as the replacement, if any.
  const [linkPolicyId, setLinkPolicyId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<'dec_page' | 'application'>('dec_page');

  // The customer's other in-force policies, so a replacement the office already added by hand
  // can be linked instead of duplicated. Only loaded while the Moved outcome is open.
  const { data: policyOptions = [] } = useAccountPolicyOptions(
    outcome === 'moved' ? renewal.account_id : null,
    renewal.policy_id,
  );
  const linkedPolicy = policyOptions.find((p) => p.id === linkPolicyId) || null;
  // The policy a blocked commit collided with, when it is one this customer can actually link.
  const conflictPolicy = policyOptions.find((p) => p.id === conflict?.policyId) || null;
  // Fields as they were before a link was picked, so deselecting puts the draft back.
  const preLinkRef = useRef<{
    policyNumber: string; premium: string; term: PolicyTerm;
    effectiveDate: string; expirationDate: string; movedCarrier: string;
  } | null>(null);

  /**
   * Pick (or clear) the already-on-file replacement. Picking mirrors that policy's details into
   * the form so the agent commits exactly what they see; the RPC reads them from the policy
   * itself and never edits it.
   */
  function selectLinkedPolicy(p: MovePolicyOption | null) {
    setErrors({});
    if (!p) {
      const prev = preLinkRef.current;
      if (prev) {
        setPolicyNumber(prev.policyNumber);
        setPremium(prev.premium);
        setTerm(prev.term);
        setEffectiveDate(prev.effectiveDate);
        setExpirationDate(prev.expirationDate);
        setMovedCarrier(prev.movedCarrier);
      }
      preLinkRef.current = null;
      setLinkPolicyId(null);
      return;
    }
    if (!preLinkRef.current) {
      preLinkRef.current = {
        policyNumber, premium, term, effectiveDate, expirationDate, movedCarrier,
      };
    }
    setLinkPolicyId(p.id);
    setPolicyNumber(p.policy_number || '');
    setPremium(p.premium != null ? String(p.premium) : '');
    setTerm(termOfExistingPolicy(p));
    setEffectiveDate(extractLocalDate(p.effective_date));
    setExpirationDate(extractLocalDate(p.expiration_date));
    setMovedCarrier(p.carrier || '');
  }

  const priorPremium = renewal.current_premium ?? null;
  const premiumNum = toNumber(premium);
  const delta = useMemo(() => {
    if (!priorPremium || Number.isNaN(premiumNum) || priorPremium === 0) return null;
    return ((premiumNum - priorPremium) / priorPremium) * 100;
  }, [priorPremium, premiumNum]);

  function applyEffective(next: string) {
    setEffectiveDate(next);
    const derived = deriveExpiration(next, term);
    if (derived) setExpirationDate(derived);
  }
  function applyTerm(next: PolicyTerm) {
    setTerm(next);
    const derived = deriveExpiration(effectiveDate, next);
    if (derived) setExpirationDate(derived);
  }

  // ---- autosave (replaces the manual Save button) --------------------------------------
  // Persist the working draft to the RENEWAL row (never the policy) shortly after the agent
  // stops editing. Seeds silently on mount and never runs on a terminal renewal. A terminal
  // commit (Renewed/Moved/Lost) sets committingRef so an in-flight debounce can't overwrite
  // the just-committed status.
  const committingRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const draftSnapshot = JSON.stringify({
    workingStatus, policyNumber, premium, term, effectiveDate, expirationDate,
  });
  useEffect(() => {
    if (isTerminal) return;
    if (lastSavedRef.current === null) {
      lastSavedRef.current = draftSnapshot; // seed from the loaded renewal; don't save on mount
      return;
    }
    if (draftSnapshot === lastSavedRef.current) return;
    const pending = draftSnapshot;
    const t = setTimeout(() => {
      if (committingRef.current) return;
      saveDraft.mutate(
        {
          renewalId: renewal.id,
          status: workingStatus === 'quoted' ? 'quoted' : workingStatus === 'contacted' ? 'contacted' : 'upcoming',
          policy_number: policyNumber || null,
          renewal_premium: Number.isNaN(premiumNum) ? null : premiumNum,
          policy_term: term,
          new_effective_date: effectiveDate || null,
          new_expiration_date: expirationDate || null,
          silent: true,
        },
        {
          onSuccess: () => {
            lastSavedRef.current = pending;
            setLastSavedAt(Date.now());
          },
        },
      );
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSnapshot, isTerminal]);

  const isDirty = lastSavedRef.current !== null && draftSnapshot !== lastSavedRef.current;

  function validateDraft(): boolean {
    const result = renewalDraftSchema.safeParse({
      policy_number: policyNumber,
      premium: premiumNum,
      policy_term: term,
      effective_date: effectiveDate,
      expiration_date: expirationDate,
    });
    if (result.success) {
      setErrors({});
      return true;
    }
    const next: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (key) next[String(key)] = issue.message;
    }
    setErrors(next);
    return false;
  }

  // ---- actions ----
  function handleRenewed() {
    if (!validateDraft() || !renewal.policy_id) return;
    committingRef.current = true;
    markRenewed.mutate({
      renewalId: renewal.id,
      policyId: renewal.policy_id,
      accountId: renewal.account_id,
      policy_number: policyNumber.trim(),
      premium: premiumNum,
      policy_term: term,
      effective_date: effectiveDate,
      expiration_date: expirationDate,
    }, { onError: () => { committingRef.current = false; } });
  }

  /**
   * Commit the move. With `existingPolicyId` the already-on-file policy is linked as the
   * replacement; without it a new policy is created. A blocked commit lands in the conflict
   * dialog, which can retry as a link.
   */
  function commitMove(existingPolicyId: string | null) {
    if (!renewal.policy_id) return;
    committingRef.current = true;
    markMoved.mutate(
      {
        renewalId: renewal.id,
        policyId: renewal.policy_id,
        accountId: renewal.account_id,
        carrier: movedCarrier.trim(),
        policy_number: policyNumber.trim(),
        premium: premiumNum,
        policy_term: term,
        effective_date: effectiveDate,
        expiration_date: expirationDate,
        existingPolicyId,
      },
      {
        onError: (err: any) => {
          committingRef.current = false;
          if (err?.code === 'DUPLICATE_POLICY' || err?.code === 'POLICY_ON_ACCOUNT' || err?.code === 'SAME_POLICY_NUMBER') {
            setConflict({
              code: err.code,
              policyId: err.existingPolicyId || null,
              accountId: err.existingAccountId || null,
            });
          }
        },
      },
    );
  }

  function handleMoved() {
    if (!validateDraft() || !renewal.policy_id) return;
    if (!movedCarrier.trim()) {
      setErrors((e) => ({ ...e, movedCarrier: 'New carrier is required' }));
      return;
    }
    commitMove(linkPolicyId);
  }

  function handleLost() {
    if (!lostReason.trim()) {
      setErrors((e) => ({ ...e, lostReason: 'Please add a reason' }));
      return;
    }
    if (!renewal.policy_id) return;
    committingRef.current = true;
    markLost.mutate({
      renewalId: renewal.id,
      policyId: renewal.policy_id,
      accountId: renewal.account_id,
      category: lostCategory,
      reason: lostReason.trim(),
      terminationDate: terminationDate || undefined,
    }, { onError: () => { committingRef.current = false; } });
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadDoc.mutate({
      renewalId: renewal.id,
      file,
      document_type: docType,
      accountId: renewal.account_id,
      policyId: renewal.policy_id,
    });
    if (fileRef.current) fileRef.current.value = '';
  }

  const committing = markRenewed.isPending || markMoved.isPending || markLost.isPending;

  if (isTerminal) {
    return (
      <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-6 shadow-card">
        <SectionLabel>Update Renewal</SectionLabel>
        <div className="mt-4 flex items-center gap-3 rounded-cc-md bg-cc-surface-raised p-4">
          <CheckCircle2 className="h-5 w-5 text-cc-text-muted" />
          <div>
            <p className="font-semibold text-cc-text-primary">This renewal is closed.</p>
            <p className="text-sm text-cc-text-muted">
              Final outcome recorded as <span className="font-medium text-cc-text-secondary">{renewal.status}</span>.
              The policy and customer record reflect the change.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const inputCls =
    'h-10 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted';
  const errCls = 'border-cc-danger';

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-6 shadow-card">
      <div className="flex items-center justify-between">
        <SectionLabel>Update Renewal</SectionLabel>
        <AutosaveStatus pending={saveDraft.isPending} dirty={isDirty} savedAt={lastSavedAt} />
      </div>

      {/* Working status (Pending / Quoted) */}
      <div className="mt-4">
        <Label className="text-cc-text-muted">Status</Label>
        <div role="group" className="mt-1.5 inline-flex rounded-cc-md bg-cc-surface-raised p-0.5">
          {(['pending', 'contacted', 'quoted'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setWorkingStatus(s)}
              className={cn(
                'rounded-[10px] px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                workingStatus === s
                  ? 'bg-cc-surface-overlay text-cc-text-primary'
                  : 'text-cc-text-muted hover:text-cc-text-secondary',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Editable fields */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="r-policy-number" className="text-cc-text-muted">Policy number</Label>
          <Input
            id="r-policy-number"
            value={policyNumber}
            onChange={(e) => setPolicyNumber(e.target.value)}
            className={cn(inputCls, 'mt-1.5 cc-num', errors.policy_number && errCls)}
            aria-invalid={!!errors.policy_number}
          />
          {errors.policy_number && <p className="mt-1 text-xs text-cc-danger">{errors.policy_number}</p>}
        </div>

        <div>
          <Label htmlFor="r-premium" className="text-cc-text-muted">Premium</Label>
          <div className="relative mt-1.5">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cc-text-muted">$</span>
            <Input
              id="r-premium"
              inputMode="decimal"
              value={premium}
              onChange={(e) => setPremium(e.target.value)}
              className={cn(inputCls, 'cc-num pl-7', errors.premium && errCls)}
              aria-invalid={!!errors.premium}
            />
          </div>
          {errors.premium ? (
            <p className="mt-1 text-xs text-cc-danger">{errors.premium}</p>
          ) : priorPremium != null && (
            <p className="mt-1 text-xs text-cc-text-muted">
              Prior <span className="cc-num">{formatCurrency(priorPremium)}</span>
              {delta != null && (
                <span className={cn('ml-1', delta > 0 ? 'text-cc-warning' : 'text-cc-success')}>
                  ({delta > 0 ? '+' : ''}{delta.toFixed(1)}%)
                </span>
              )}
            </p>
          )}
        </div>

        <div>
          <Label className="text-cc-text-muted">Policy term</Label>
          <Select value={term} onValueChange={(v) => applyTerm(v as PolicyTerm)}>
            <SelectTrigger className={cn(inputCls, 'mt-1.5')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POLICY_TERM_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="r-effective" className="text-cc-text-muted">Effective</Label>
            <DateField
              id="r-effective"
              value={effectiveDate}
              onChange={applyEffective}
              aria-label="Effective date"
              aria-invalid={!!errors.effective_date}
              containerClassName="mt-1.5"
              className={cn(inputCls, 'cc-num', errors.effective_date && errCls)}
            />
          </div>
          <div>
            <Label htmlFor="r-expiration" className="text-cc-text-muted">Expiration</Label>
            <DateField
              id="r-expiration"
              value={expirationDate}
              onChange={setExpirationDate}
              aria-label="Expiration date"
              aria-invalid={!!errors.expiration_date}
              containerClassName="mt-1.5"
              className={cn(inputCls, 'cc-num', errors.expiration_date && errCls)}
            />
            {errors.expiration_date && <p className="mt-1 text-xs text-cc-danger">{errors.expiration_date}</p>}
          </div>
        </div>
      </div>

      {/* Document upload + existing docs */}
      <div className="mt-5">
        <Label className="text-cc-text-muted">Dec page / application</Label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Select value={docType} onValueChange={(v) => setDocType(v as 'dec_page' | 'application')}>
            <SelectTrigger className={cn(inputCls, 'w-40')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dec_page">Dec page</SelectItem>
              <SelectItem value="application">Application</SelectItem>
            </SelectContent>
          </Select>
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploadDoc.isPending}
            className="gap-2 rounded-cc-md"
          >
            <FileUp className="h-4 w-4" />
            {uploadDoc.isPending ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
        {documents.length > 0 && (
          <ul className="mt-2 space-y-1">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-cc-md bg-cc-surface-raised px-3 py-1.5 text-sm">
                <span className="truncate text-cc-text-secondary">{d.name}</span>
                <button
                  type="button"
                  aria-label={`Delete ${d.name}`}
                  onClick={() => deleteDoc.mutate({ documentId: d.id, renewalId: renewal.id, filePath: d.file_path })}
                  className="ml-2 text-cc-text-muted hover:text-cc-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Outcome (terminal commit) */}
      <div className="mt-5 border-t border-cc-border-subtle pt-5">
        <SectionLabel>Finalize outcome</SectionLabel>
        {!canCommit && (
          <p className="mt-2 text-xs text-cc-warning">
            This renewal is not linked to a policy, so it cannot be finalized. Save still keeps your edits.
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {([
            { key: 'renewed', label: 'Renewed', icon: CheckCircle2 },
            { key: 'moved', label: 'Moved', icon: ArrowRightLeft },
            { key: 'lost', label: 'Lost', icon: XCircle },
          ] as const).map((o) => {
            const Icon = o.icon;
            const active = outcome === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  const next = active ? null : o.key;
                  // Leaving Moved drops any linked replacement and puts the draft back.
                  if (outcome === 'moved' && next !== 'moved') selectLinkedPolicy(null);
                  setOutcome(next);
                  setErrors({});
                }}
                disabled={!canCommit}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-cc-md border px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  active
                    ? 'border-cc-border-interactive bg-cc-surface-overlay text-cc-text-primary'
                    : 'border-cc-border-subtle bg-cc-surface-raised text-cc-text-muted hover:text-cc-text-secondary',
                )}
              >
                <Icon className="h-4 w-4" />
                {o.label}
              </button>
            );
          })}
        </div>

        {outcome === 'moved' && (
          <div className="mt-4">
            <Label htmlFor="r-moved-carrier" className="text-cc-text-muted">New carrier</Label>
            <Input
              id="r-moved-carrier"
              list="r-carrier-options"
              value={movedCarrier}
              onChange={(e) => setMovedCarrier(e.target.value)}
              placeholder="Carrier the customer moved to"
              readOnly={!!linkedPolicy}
              className={cn(inputCls, 'mt-1.5', errors.movedCarrier && errCls, linkedPolicy && 'text-cc-text-secondary')}
            />
            <datalist id="r-carrier-options">
              {carriers.map((c: any) => <option key={c.id} value={c.name} />)}
            </datalist>
            {errors.movedCarrier && <p className="mt-1 text-xs text-cc-danger">{errors.movedCarrier}</p>}

            {policyOptions.length > 0 && (
              <div className="mt-4">
                <Label className="text-cc-text-muted">New policy already on the file</Label>
                <p className="mt-1 text-xs text-cc-text-muted">
                  If the office already added the replacement, pick it here. It is linked as the new
                  policy and nothing on it changes.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {policyOptions.map((p) => {
                    const picked = p.id === linkPolicyId;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          aria-pressed={picked}
                          onClick={() => selectLinkedPolicy(picked ? null : p)}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 rounded-cc-md border px-3 py-2.5 text-left transition-colors',
                            picked
                              ? 'border-cc-accent bg-cc-surface-overlay'
                              : 'border-cc-border-subtle bg-cc-surface-raised hover:border-cc-border-interactive',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="rounded-cc-sm bg-cc-surface-overlay px-2 py-0.5 text-xs text-cc-text-secondary">
                                {p.carrier || 'No carrier'}
                              </span>
                              <span className="cc-num text-sm font-semibold text-cc-text-primary">
                                {p.policy_number}
                              </span>
                              {p.line_of_business && (
                                <span className="text-xs text-cc-text-muted">{p.line_of_business}</span>
                              )}
                            </span>
                            <span className="mt-1 block text-xs text-cc-text-muted">
                              <span className="cc-num">{formatCurrency(p.premium)}</span>
                              {' · '}
                              <span className="cc-num">{formatShortDate(p.effective_date)}</span>
                              {' to '}
                              <span className="cc-num">{formatShortDate(p.expiration_date)}</span>
                            </span>
                          </span>
                          {picked && <Check className="h-4 w-4 shrink-0 text-cc-accent" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <p className="mt-3 text-xs text-cc-text-muted">
              {linkedPolicy ? (
                <>
                  The current policy is retired and this renewal closes against policy{' '}
                  <span className="cc-num text-cc-text-secondary">{linkedPolicy.policy_number}</span>.
                  No new policy is created, and the details recorded come from that policy.
                </>
              ) : (
                <>
                  Uses the policy number, premium, term and dates above as the new policy details. The
                  current policy is retired and a new policy is created.
                </>
              )}
            </p>
          </div>
        )}

        {outcome === 'lost' && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-cc-text-muted">Reason</Label>
              <Select value={lostCategory} onValueChange={(v) => setLostCategory(v as LostReasonCategory)}>
                <SelectTrigger className={cn(inputCls, 'mt-1.5')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOST_REASON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="r-termination" className="text-cc-text-muted">Effective date</Label>
              <DateField
                id="r-termination"
                value={terminationDate}
                onChange={setTerminationDate}
                aria-label="Termination effective date"
                containerClassName="mt-1.5"
                className={cn(inputCls, 'cc-num')}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="r-lost-reason" className="text-cc-text-muted">Details</Label>
              <Textarea
                id="r-lost-reason"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                rows={2}
                placeholder="What happened?"
                className={cn('mt-1.5 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary', errors.lostReason && errCls)}
              />
              {errors.lostReason && <p className="mt-1 text-xs text-cc-danger">{errors.lostReason}</p>}
            </div>
          </div>
        )}

        {outcome && (
          <div className="mt-5 flex justify-end">
            <Button
              type="button"
              data-primary
              disabled={committing}
              onClick={outcome === 'renewed' ? handleRenewed : outcome === 'moved' ? handleMoved : handleLost}
              className="h-11 gap-2 rounded-cc-md bg-cc-accent text-cc-on-accent hover:bg-cc-accent-hover"
            >
              {committing
                ? 'Saving...'
                : outcome === 'renewed' ? 'Mark renewed'
                : outcome === 'moved' ? 'Record move'
                : 'Mark not renewed'}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!conflict} onOpenChange={(o) => { if (!o) setConflict(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {conflict?.code === 'SAME_POLICY_NUMBER'
                ? 'That is the current policy number'
                : conflict?.code === 'POLICY_ON_ACCOUNT'
                ? 'This policy is already on the file'
                : 'Policy number belongs to another customer'}
            </DialogTitle>
            <DialogDescription>
              {conflict?.code === 'SAME_POLICY_NUMBER' ? (
                <>
                  The policy number is still the one being renewed. Enter the new carrier's policy
                  number, or pick the policy already on the file under New carrier.
                </>
              ) : conflict?.code === 'POLICY_ON_ACCOUNT' && conflictPolicy ? (
                <>
                  Policy <span className="cc-num">{conflictPolicy.policy_number}</span> with{' '}
                  {conflictPolicy.carrier || 'this carrier'} is already added on this customer. Use
                  it as the new policy to finish the move. Nothing on it changes.
                </>
              ) : conflict?.code === 'POLICY_ON_ACCOUNT' ? (
                <>
                  This policy number is already added on this customer, on a policy that is no
                  longer in force. Check the number before recording the move.
                </>
              ) : (
                <>
                  This policy number is already added on a different customer. Policy numbers are
                  unique, so check the number before recording the move.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {conflict?.accountId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const id = conflict.accountId;
                  setConflict(null);
                  if (id) navigate(`/customers/${id}?tab=policies`);
                }}
                className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
              >
                View in Policies
              </Button>
            )}
            {conflict?.code === 'POLICY_ON_ACCOUNT' && conflictPolicy ? (
              <Button
                type="button"
                data-primary
                disabled={committing}
                onClick={() => {
                  const picked = conflictPolicy;
                  setConflict(null);
                  selectLinkedPolicy(picked);
                  commitMove(picked.id);
                }}
                className="gap-2 rounded-cc-md bg-cc-accent text-cc-on-accent hover:bg-cc-accent-hover"
              >
                {committing ? 'Saving...' : 'Use this policy'}
              </Button>
            ) : (
              <Button
                type="button"
                data-primary
                onClick={() => setConflict(null)}
                className="gap-2 rounded-cc-md bg-cc-accent text-cc-on-accent hover:bg-cc-accent-hover"
              >
                Back to the form
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
