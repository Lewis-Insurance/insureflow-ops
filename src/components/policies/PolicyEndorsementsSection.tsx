// Policy endorsement editor: the human write surface for additional-insured and
// waiver-of-subrogation endorsements on ONE policy line. Lives on the policy page
// (PolicyCoveragePanel) and is reused, unchanged, on the Generate COI screen.
//
// Two ways a party gets coverage, matching how the certificate resolver reads it:
//   * BLANKET (two checkboxes) - the policy carries a blanket endorsement that
//     covers anyone a written contract requires; no names. On AI-bearing lines a
//     blanket waiver rides the blanket AI row, so the waiver box depends on the AI
//     box. Workers' Comp is waiver-only (no additional insured).
//   * SCHEDULED (the widget) - specific parties, searched from the Additional
//     Insureds directory or created via the same drawer, then attached here.
//
// Every write goes straight through the new endorsement RPCs (usePolicyEndorse-
// ments), which write the exact rows resolve_holder_endorsements reads, so a
// change here flows into what a certificate prints. Rows written here are stamped
// "manual"; when a policy has no document backing an endorsement we still let it
// be added, with a bold warning (an honest E&O trail).
//
// Calm Command: cc-* tokens, zero lime (the panel's single lime stays the Save
// button), tabular figures, names never truncate, no em or en dashes.

import * as React from 'react';
import {
  ShieldCheck,
  Plus,
  X,
  Search,
  Loader2,
  UserPlus,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdditionalInsuredSearch,
  type AdditionalInsuredSavedRow,
} from '@/hooks/useAdditionalInsureds';
import { AdditionalInsuredDrawer } from '@/components/additional-insureds/AdditionalInsuredDrawer';
import {
  usePolicyLineEndorsements,
  usePolicyEndorsementActions,
  type EndorsementLineKey,
  type EndorsementStatus,
  type ScheduledEndorsement,
} from '@/hooks/usePolicyEndorsements';

export interface PolicyEndorsementsSectionProps {
  accountId: string;
  policyId: string;
  lineKey: EndorsementLineKey;
}

const STATUS_LABEL: Record<EndorsementStatus, string> = {
  endorsed: 'Endorsed',
  requested: 'Requested',
  none: 'Not endorsed',
};

/** Small resolved-state chip; endorsed reads as active, requested as pending. */
function StatusChip({ status }: { status: EndorsementStatus }) {
  const tone =
    status === 'endorsed'
      ? 'border-cc-success/40 bg-cc-success/10 text-cc-success'
      : status === 'requested'
        ? 'border-cc-warning/40 bg-cc-warning/10 text-cc-warning'
        : 'border-cc-border-subtle bg-cc-surface-raised text-cc-text-muted';
  return (
    <span
      className={`inline-flex items-center rounded-cc-sm border px-1.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PolicyEndorsementsSection({
  accountId,
  policyId,
  lineKey,
}: PolicyEndorsementsSectionProps) {
  const { data, isLoading } = usePolicyLineEndorsements(policyId, lineKey);
  const { setBlanket, attachScheduled, setRow, removeRow } =
    usePolicyEndorsementActions(accountId, policyId, lineKey);

  const isWc = lineKey === 'wc';
  const blanket = data?.blanket ?? null;
  const scheduled = data?.scheduled ?? [];

  const blanketAiOn = !isWc && !!blanket; // a blanket row on a non-WC line carries the AI signature
  const blanketWaiverOn = !!blanket && blanket.subr_wvd;
  const blanketWcOn = isWc && !!blanket;
  const blanketStatus: EndorsementStatus =
    blanket && blanket.status !== 'none' ? blanket.status : 'endorsed';

  const busy =
    setBlanket.isPending ||
    attachScheduled.isPending ||
    setRow.isPending ||
    removeRow.isPending;

  // Bold warning when any endorsement here is manually asserted (not backed by a
  // policy document on file). Blanket rows written here are always manual.
  const hasUnverified =
    (!!blanket && blanket.is_manual) ||
    scheduled.some((r) => r.is_manual && !r.has_evidence);

  // ---- blanket handlers -------------------------------------------------
  const onToggleBlanketAi = (checked: boolean) => {
    // Unchecking AI clears the whole blanket row (waiver rides it).
    setBlanket.mutate({
      addlInsd: checked,
      subrWvd: checked ? blanketWaiverOn : false,
      status: blanketStatus,
      form: blanket?.endorsement_form ?? null,
    });
  };
  const onToggleBlanketWaiver = (checked: boolean) => {
    if (isWc) {
      setBlanket.mutate({ addlInsd: false, subrWvd: checked, status: blanketStatus });
    } else {
      // Only reachable when AI is on (the control is disabled otherwise).
      setBlanket.mutate({
        addlInsd: true,
        subrWvd: checked,
        status: blanketStatus,
        form: blanket?.endorsement_form ?? null,
      });
    }
  };
  const onBlanketStatus = (status: EndorsementStatus) => {
    if (!blanket) return;
    setRow.mutate({ rowId: blanket.row_id, status });
  };
  const onBlanketForm = (form: string) => {
    if (!blanket) return;
    const next = form.trim() || null;
    // Route through setBlanket, not setRow: GL requires a CG2033/CG2038 form to
    // resolve as blanket, and setBlanket coalesces an empty/invalid GL form to
    // the default. setRow would let a cleared form silently break resolution.
    if (isWc) {
      setBlanket.mutate({ addlInsd: false, subrWvd: true, status: blanketStatus, form: next });
    } else {
      setBlanket.mutate({
        addlInsd: true,
        subrWvd: blanketWaiverOn,
        status: blanketStatus,
        form: next,
      });
    }
  };

  const title = isWc ? 'Subrogation waivers' : 'Additional insureds and waivers';

  return (
    <section className="space-y-3 border-t border-cc-border-subtle pt-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
        <h4 className="text-sm font-medium text-cc-text-primary">{title}</h4>
      </div>

      {isLoading ? (
        <p className="text-sm text-cc-text-muted">Loading endorsements...</p>
      ) : (
        <>
          {hasUnverified && (
            <div
              role="note"
              className="flex items-start gap-2 rounded-cc-md border border-cc-warning/40 bg-cc-warning/10 p-3 text-sm text-cc-warning"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-semibold">Manually added.</span> One or more
                of these endorsements is not verified against a policy document on
                file. Confirm the policy actually carries them before issuing a
                certificate.
              </span>
            </div>
          )}

          {/* ---- Blanket ---- */}
          <div className="space-y-3 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3">
            <div className="text-xs uppercase tracking-wide text-cc-text-muted">
              Blanket
            </div>

            {!isWc && (
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={blanketAiOn}
                  disabled={busy}
                  onCheckedChange={(v) => onToggleBlanketAi(v === true)}
                  className="mt-0.5"
                  aria-label="Blanket additional insured"
                />
                <span className="text-sm text-cc-text-primary">
                  Blanket additional insured
                  <span className="block text-xs text-cc-text-muted">
                    Covers anyone a written contract requires; no names listed.
                  </span>
                </span>
              </label>
            )}

            <label className="flex items-start gap-2">
              <Checkbox
                checked={isWc ? blanketWcOn : blanketWaiverOn}
                disabled={busy || (!isWc && !blanketAiOn)}
                onCheckedChange={(v) => onToggleBlanketWaiver(v === true)}
                className="mt-0.5"
                aria-label="Blanket waiver of subrogation"
              />
              <span className="text-sm text-cc-text-primary">
                Blanket waiver of subrogation
                {!isWc && (
                  <span className="block text-xs text-cc-text-muted">
                    Recorded on the blanket additional insured endorsement.
                  </span>
                )}
              </span>
            </label>

            {/* Status + form for the active blanket row. */}
            {blanket && (
              <div className="flex flex-wrap items-center gap-2 border-t border-cc-border-subtle pt-3">
                <Select
                  value={blanketStatus}
                  onValueChange={(v) => onBlanketStatus(v as EndorsementStatus)}
                  disabled={busy}
                >
                  <SelectTrigger className="h-8 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="endorsed">Endorsed</SelectItem>
                    <SelectItem value="requested">Requested (pending)</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  defaultValue={blanket.endorsement_form ?? ''}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next !== (blanket.endorsement_form ?? '').trim()) {
                      onBlanketForm(next);
                    }
                  }}
                  placeholder={isWc ? 'WC 00 03 13' : 'CG 20 33'}
                  aria-label="Endorsement form number"
                  className="h-8 w-32 cc-num"
                />
                <span className="text-xs text-cc-text-muted">
                  Only Endorsed prints Y on a certificate.
                </span>
              </div>
            )}
          </div>

          {/* ---- Scheduled / specific ---- */}
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-cc-text-muted">
              {isWc ? 'Specific waiver holders' : 'Specific additional insureds'}
            </div>

            {scheduled.length > 0 && (
              <ul className="space-y-2">
                {scheduled.map((row) => (
                  <ScheduledRow
                    key={row.row_id}
                    row={row}
                    isWc={isWc}
                    busy={busy}
                    onStatus={(status) => setRow.mutate({ rowId: row.row_id, status })}
                    onWaiver={(subrWvd) => setRow.mutate({ rowId: row.row_id, subrWvd })}
                    onRemove={() => removeRow.mutate({ rowId: row.row_id })}
                  />
                ))}
              </ul>
            )}

            <ScheduledAddControl
              isWc={isWc}
              busy={busy}
              onPick={(additionalInsuredId) =>
                attachScheduled.mutate({ additionalInsuredId })
              }
            />
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// One scheduled/specific row tile.
// ---------------------------------------------------------------------------

function ScheduledRow({
  row,
  isWc,
  busy,
  onStatus,
  onWaiver,
  onRemove,
}: {
  row: ScheduledEndorsement;
  isWc: boolean;
  busy: boolean;
  onStatus: (status: EndorsementStatus) => void;
  onWaiver: (subrWvd: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-cc-md border border-cc-border-subtle bg-cc-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="break-words text-sm font-medium text-cc-text-primary">
              {row.name}
            </span>
            <StatusChip status={row.status} />
            {row.is_manual && !row.has_evidence && (
              <span className="rounded-cc-sm border border-cc-warning/40 bg-cc-warning/10 px-1.5 py-0.5 text-xs text-cc-warning">
                Manual
              </span>
            )}
          </div>
          {!isWc && (
            <label className="flex items-center gap-2 text-xs text-cc-text-secondary">
              <Checkbox
                checked={row.subr_wvd}
                disabled={busy}
                onCheckedChange={(v) => onWaiver(v === true)}
                aria-label="Waiver of subrogation"
              />
              Waiver of subrogation
            </label>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select
            value={row.status === 'none' ? 'requested' : row.status}
            onValueChange={(v) => onStatus(v as EndorsementStatus)}
            disabled={busy}
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="endorsed">Endorsed</SelectItem>
              <SelectItem value="requested">Requested (pending)</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label={`Remove ${row.name}`}
            className="text-cc-text-muted transition-colors hover:text-cc-danger disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Search-the-directory + Add-new control (mirrors HolderField's UX). Picking a
// result or saving a new holder attaches it to this policy line.
// ---------------------------------------------------------------------------

function ScheduledAddControl({
  isWc,
  busy,
  onPick,
}: {
  isWc: boolean;
  busy: boolean;
  onPick: (additionalInsuredId: string) => void;
}) {
  const { results, loading, search, clear } = useAdditionalInsuredSearch();
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (query.trim()) search(query);
      else clear();
    }, 250);
    return () => clearTimeout(handle);
  }, [query, search, clear]);

  const pick = (additionalInsuredId: string) => {
    onPick(additionalInsuredId);
    setQuery('');
    clear();
    setOpen(false);
  };

  const onSaved = (saved: AdditionalInsuredSavedRow) => {
    onPick(saved.id);
    setDrawerOpen(false);
    setQuery('');
    clear();
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted"
          aria-hidden="true"
        />
        <Input
          value={query}
          disabled={busy}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={
            isWc
              ? 'Search a waiver holder by name'
              : 'Search an additional insured by name'
          }
          aria-label="Search additional insureds"
          className="rounded-cc-md pl-9"
        />
      </div>

      {open && (query.trim() || results.length > 0) && (
        <div className="max-h-60 overflow-y-auto rounded-cc-md border border-cc-border-subtle bg-cc-surface">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-cc-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-cc-text-muted">No matching holders.</p>
          ) : (
            <ul className="divide-y divide-cc-border-subtle">
              {results.map((r) => {
                const addr = [r.city, r.state].filter(Boolean).join(', ');
                return (
                  <li key={r.additional_insured_id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => pick(r.additional_insured_id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-cc-surface-overlay disabled:opacity-60"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm text-cc-text-primary">{r.name}</p>
                        <p className="truncate text-xs text-cc-text-muted">
                          {addr || 'No address on file'}
                        </p>
                      </div>
                      <Plus className="h-4 w-4 shrink-0 text-cc-text-muted" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-cc-border-subtle p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setDrawerOpen(true)}
              className="w-full justify-start gap-2 text-cc-text-secondary hover:text-cc-text-primary"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add new
            </Button>
          </div>
        </div>
      )}

      <AdditionalInsuredDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        initial={null}
        initialName={query.trim()}
        onSaved={onSaved}
      />
    </div>
  );
}
