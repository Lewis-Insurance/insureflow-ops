import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SectionLabel } from '@/components/cc';
import {
  ArrowRightLeft, CheckCircle2, FileUp, Save, Trash2, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  type Renewal,
  useSaveRenewalDraft,
  useMarkRenewed,
  useMarkMoved,
  useMarkLost,
  useRenewalDocuments,
  useUploadRenewalDocument,
  useDeleteRenewalDocument,
} from '@/hooks/useRenewalWorkflow';
import {
  deriveExpiration,
  normalizePolicyTerm,
  renewalDraftSchema,
  POLICY_TERM_OPTIONS,
  LOST_REASON_OPTIONS,
  type PolicyTerm,
  type LostReasonCategory,
} from '@/lib/renewals/renewalTerm';
import { useCarriers } from '@/hooks/useLookupData';
import { formatMoney as formatCurrency } from '@/lib/renewals/format';

type Outcome = 'renewed' | 'moved' | 'lost';

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
  const [workingStatus, setWorkingStatus] = useState<'pending' | 'quoted'>(
    renewal.status === 'quoted' ? 'quoted' : 'pending',
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

  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<'dec_page' | 'application'>('dec_page');

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
  function handleSave() {
    saveDraft.mutate({
      renewalId: renewal.id,
      status: workingStatus === 'quoted' ? 'quoted' : 'upcoming',
      policy_number: policyNumber || null,
      renewal_premium: Number.isNaN(premiumNum) ? null : premiumNum,
      policy_term: term,
      new_effective_date: effectiveDate || null,
      new_expiration_date: expirationDate || null,
    });
  }

  function handleRenewed() {
    if (!validateDraft() || !renewal.policy_id) return;
    markRenewed.mutate({
      renewalId: renewal.id,
      policyId: renewal.policy_id,
      accountId: renewal.account_id,
      policy_number: policyNumber.trim(),
      premium: premiumNum,
      policy_term: term,
      effective_date: effectiveDate,
      expiration_date: expirationDate,
    });
  }

  function handleMoved() {
    if (!validateDraft() || !renewal.policy_id) return;
    if (!movedCarrier.trim()) {
      setErrors((e) => ({ ...e, movedCarrier: 'New carrier is required' }));
      return;
    }
    markMoved.mutate({
      renewalId: renewal.id,
      policyId: renewal.policy_id,
      accountId: renewal.account_id,
      carrier: movedCarrier.trim(),
      policy_number: policyNumber.trim(),
      premium: premiumNum,
      policy_term: term,
      effective_date: effectiveDate,
      expiration_date: expirationDate,
    });
  }

  function handleLost() {
    if (!lostReason.trim()) {
      setErrors((e) => ({ ...e, lostReason: 'Please add a reason' }));
      return;
    }
    if (!renewal.policy_id) return;
    markLost.mutate({
      renewalId: renewal.id,
      policyId: renewal.policy_id,
      accountId: renewal.account_id,
      category: lostCategory,
      reason: lostReason.trim(),
      terminationDate: terminationDate || undefined,
    });
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
      </div>

      {/* Working status (Pending / Quoted) */}
      <div className="mt-4">
        <Label className="text-cc-text-muted">Status</Label>
        <div role="group" className="mt-1.5 inline-flex rounded-cc-md bg-cc-surface-raised p-0.5">
          {(['pending', 'quoted'] as const).map((s) => (
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
            <Input
              id="r-effective"
              type="date"
              value={effectiveDate}
              onChange={(e) => applyEffective(e.target.value)}
              className={cn(inputCls, 'mt-1.5 cc-num', errors.effective_date && errCls)}
            />
          </div>
          <div>
            <Label htmlFor="r-expiration" className="text-cc-text-muted">Expiration</Label>
            <Input
              id="r-expiration"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              className={cn(inputCls, 'mt-1.5 cc-num', errors.expiration_date && errCls)}
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

      {/* Working save (secondary — no lime) */}
      <div className="mt-5 flex justify-end border-t border-cc-border-subtle pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={handleSave}
          disabled={saveDraft.isPending}
          className="gap-2 rounded-cc-md"
        >
          <Save className="h-4 w-4" />
          {saveDraft.isPending ? 'Saving...' : 'Save'}
        </Button>
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
                onClick={() => { setOutcome(active ? null : o.key); setErrors({}); }}
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
              className={cn(inputCls, 'mt-1.5', errors.movedCarrier && errCls)}
            />
            <datalist id="r-carrier-options">
              {carriers.map((c: any) => <option key={c.id} value={c.name} />)}
            </datalist>
            {errors.movedCarrier && <p className="mt-1 text-xs text-cc-danger">{errors.movedCarrier}</p>}
            <p className="mt-2 text-xs text-cc-text-muted">
              Uses the policy number, premium, term and dates above as the new policy details. The current
              policy is set to Inactive and a new policy is created.
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
              <Input
                id="r-termination"
                type="date"
                value={terminationDate}
                onChange={(e) => setTerminationDate(e.target.value)}
                className={cn(inputCls, 'mt-1.5 cc-num')}
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
    </div>
  );
}
