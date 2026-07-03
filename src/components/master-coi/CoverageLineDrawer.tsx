// Master COI coverage-line edit drawer (blueprint Section 2.5).
//
// The one place a coverage line's fields are edited. Field writes accumulate into
// a local `updates` map keyed by each cell's registry `.path` and are committed
// through save_master_coi_fields(p_policy_id, p_updates) on Save. A field is
// editable IFF its cell carries a non-null `path`. The drawer also hosts the
// per-row endorsement editor (EndorsementRowList), which commits independently
// through set_line_ai_endorsement and is NEVER part of the field `updates`.
//
// Absent-line case: an absent line (present:false) has no policy_id, so there is
// nothing to save against. The drawer stays usable but guides the operator to add
// a policy first, and the field Save is hidden (endorsement rows are also absent
// on an absent line, so the endorsement editor simply shows its empty state).
//
// This drawer is its own overlay surface (shadcn Sheet), so it is allowed the
// ONLY lime primary in the whole feature: the Save button. Every other control
// is outline or ghost. Dates use DateField; currency inputs are cc-num and
// right-aligned. No em/en dashes.

import * as React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/cc';
import { useSaveMasterCoiFields } from '@/hooks/useMasterCoi';
import { EndorsementRowList } from './EndorsementRowList';
import { LINE_LABEL, formatCurrency, limitCellsFor } from './lineDisplay';
import type {
  COIAdditionalInsuredRow,
  COICell,
  COIInsurer,
  COILineAuto,
  COILineBase,
  COILineGL,
  COILineKey,
  COILineProperty,
  COILineUmbrella,
  COILineWC,
  COIWCSubroWaiverRow,
  MasterCOI,
} from '@/types/master-coi';

type AnyLine =
  | COILineGL
  | COILineAuto
  | COILineUmbrella
  | COILineWC
  | COILineProperty;

export interface CoverageLineDrawerProps {
  accountId: string;
  open: boolean;
  lineKey: COILineKey | null;
  masterCoi: MasterCOI | undefined;
  onClose: () => void;
}

/** Parse a currency-ish input into a number, or null when blank/unparseable. */
function parseCurrencyInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function CoverageLineDrawer({
  accountId,
  open,
  lineKey,
  masterCoi,
  onClose,
}: CoverageLineDrawerProps) {
  // A dismissal request (ESC, overlay click, the X, or Cancel) routes through
  // the body's guard when there are unsaved field edits. DrawerBody registers a
  // handler here; when it returns false the close is intercepted (the body shows
  // its "Discard changes" prompt) instead of silently dropping the edits.
  const requestCloseRef = React.useRef<(() => boolean) | null>(null);

  const attemptClose = () => {
    const guard = requestCloseRef.current;
    // No guard registered (empty state) or guard allows it: close for real.
    if (!guard || guard()) onClose();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) attemptClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto bg-cc-surface p-0 sm:max-w-lg"
        onEscapeKeyDown={(event) => {
          if (requestCloseRef.current && !requestCloseRef.current()) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (requestCloseRef.current && !requestCloseRef.current()) {
            event.preventDefault();
          }
        }}
      >
        {open && lineKey && lineKey !== 'other' && masterCoi ? (
          <DrawerBody
            accountId={accountId}
            lineKey={lineKey}
            masterCoi={masterCoi}
            onClose={onClose}
            requestCloseRef={requestCloseRef}
          />
        ) : (
          <div className="p-6">
            <SheetHeader>
              <SheetTitle className="text-cc-text-primary">
                Coverage line
              </SheetTitle>
              <SheetDescription className="text-cc-text-muted">
                Select a coverage line to edit.
              </SheetDescription>
            </SheetHeader>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface DrawerBodyProps {
  accountId: string;
  lineKey: Exclude<COILineKey, 'other'>;
  masterCoi: MasterCOI;
  onClose: () => void;
  /** Parent-owned handle: returns true when it is safe to close, else shows the
   * discard prompt and returns false so the dismissal is intercepted. */
  requestCloseRef: React.MutableRefObject<(() => boolean) | null>;
}

function DrawerBody({
  accountId,
  lineKey,
  masterCoi,
  onClose,
  requestCloseRef,
}: DrawerBodyProps) {
  const saveFields = useSaveMasterCoiFields();
  const line = masterCoi.lines[lineKey] as AnyLine;
  const insurers = masterCoi.insurers;
  const label = LINE_LABEL[lineKey];

  // Local field edits keyed by registry path. Endorsement edits never land here.
  const [updates, setUpdates] = React.useState<Record<string, unknown>>({});
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);
  // Local override of the selected policy (multi-candidate picker). Blueprint
  // 2.5(2): candidates are returned so the picker can override without a second
  // read; the field Save then targets this policy_id.
  const [selectedPolicyId, setSelectedPolicyId] = React.useState<string | null>(
    null,
  );
  const isDirty = Object.keys(updates).length > 0;

  // Reset local edits whenever the drawer switches to a different line.
  React.useEffect(() => {
    setUpdates({});
    setConfirmingDiscard(false);
    setSelectedPolicyId(null);
  }, [lineKey]);

  const setField = (path: string | null, value: unknown) => {
    if (!path) return; // not editable here
    setUpdates((prev) => ({ ...prev, [path]: value }));
  };

  const requestClose = React.useCallback((): boolean => {
    if (isDirty) {
      setConfirmingDiscard(true);
      return false;
    }
    return true;
  }, [isDirty]);

  // Register the guard so ESC / overlay / the X / Cancel all route through it.
  React.useEffect(() => {
    requestCloseRef.current = requestClose;
    return () => {
      requestCloseRef.current = null;
    };
  }, [requestClose, requestCloseRef]);

  // The policy the field Save targets: the operator's picked candidate wins,
  // else the line's own policy.
  const effectivePolicyId = selectedPolicyId ?? line.policy_id;

  const handleSave = () => {
    if (!effectivePolicyId || !isDirty) return;
    saveFields.mutate(
      { accountId, policyId: effectivePolicyId, updates },
      {
        onSuccess: () => {
          setUpdates({});
          onClose();
        },
      },
    );
  };

  // The current edited value for a cell: local edit wins, else the read-model.
  function currentValue(cell: COICell | undefined): string {
    if (!cell) return '';
    if (cell.path && cell.path in updates) {
      const v = updates[cell.path];
      return v == null ? '' : String(v);
    }
    return cell.v == null ? '' : String(cell.v);
  }

  const isAbsent = !line.present;

  // The endorsement rows for this line (empty on WC's non-AI lines / absent lines).
  let endorsementRows:
    | COIAdditionalInsuredRow[]
    | COIWCSubroWaiverRow[] = [];
  if (lineKey === 'wc') {
    endorsementRows = (line as COILineWC).subrogation_waivers ?? [];
  } else if ('additional_insureds' in line) {
    endorsementRows = (line as { additional_insureds: COIAdditionalInsuredRow[] })
      .additional_insureds ?? [];
  }

  const limitCells = limitCellsFor(lineKey, line);
  const candidates = line.candidates ?? [];
  const showPolicyPicker = candidates.length > 1 || isAbsent;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-cc-border-subtle p-6 pb-4">
        <SheetHeader>
          <SheetTitle className="break-words text-cc-text-primary">
            {label}
          </SheetTitle>
          {isAbsent && (
            <SheetDescription className="text-cc-text-muted">
              This line is not on file for this customer.
            </SheetDescription>
          )}
        </SheetHeader>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {/* Absent-line guidance: no policy_id means no field save is possible. */}
        {isAbsent && (
          <div
            className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3 text-sm text-cc-text-secondary"
            role="note"
          >
            Add a {label} policy to this customer before you can edit its
            certificate fields. Coverage details are read from the policy record.
          </div>
        )}

        {/* Policy selection */}
        {showPolicyPicker && (
          <div className="space-y-1.5">
            <Label className="text-sm text-cc-text-primary">Policy</Label>
            {candidates.length === 0 ? (
              <p className="text-sm text-cc-text-muted">
                No policy on file for this line.
              </p>
            ) : (
              <Select
                value={effectivePolicyId ?? undefined}
                onValueChange={(next) => setSelectedPolicyId(next)}
              >
                <SelectTrigger className="cc-num">
                  <SelectValue placeholder="Select a policy" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((candidate) => (
                    <SelectItem
                      key={candidate.policy_id}
                      value={candidate.policy_id}
                      disabled={candidate.expired}
                    >
                      <span className="cc-num">
                        {candidate.policy_number ?? 'Unnumbered policy'}
                      </span>
                      {candidate.expired ? ' (expired)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Present-line editable fields. */}
        {!isAbsent && (
          <>
            {/* Carrier (read-only name) + NAIC (read-only). */}
            <CarrierBlock line={line} insurers={insurers} />

            {/* Effective / Expiration dates. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DateFieldRow
                label="Effective date"
                cell={line.effective_date}
                value={currentValue(line.effective_date)}
                onChange={(iso) => setField(line.effective_date?.path, iso || null)}
              />
              <DateFieldRow
                label="Expiration date"
                cell={line.expiration_date}
                value={currentValue(line.expiration_date)}
                onChange={(iso) =>
                  setField(line.expiration_date?.path, iso || null)
                }
              />
            </div>

            {/* Policy number. */}
            <TextFieldRow
              label="Policy number"
              cell={line.policy_number}
              value={currentValue(line.policy_number)}
              onChange={(v) => setField(line.policy_number?.path, v || null)}
            />

            {/* Limits, line-type specific ordering. */}
            {limitCells.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium text-cc-text-primary">
                  Limits
                </div>
                {limitCells.map((limit) => (
                  <CurrencyFieldRow
                    key={limit.label}
                    label={limit.label}
                    cell={limit.cell}
                    format={limit.format}
                    value={currentValue(limit.cell)}
                    isEdited={Boolean(
                      limit.cell?.path && limit.cell.path in updates,
                    )}
                    onChange={(v) => {
                      const path = limit.cell?.path ?? null;
                      if (limit.format === 'currency') {
                        setField(path, parseCurrencyInput(v));
                      } else {
                        setField(path, v || null);
                      }
                    }}
                    onRestore={
                      limit.cell?.flag === 'overwritten_manual'
                        ? () => {
                            // Restore drops any local edit for this path so the
                            // ledger-tracked manual value re-surfaces on refetch.
                            const path = limit.cell?.path;
                            if (!path) return;
                            setUpdates((prev) => {
                              const next = { ...prev };
                              delete next[path];
                              return next;
                            });
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Endorsement editor: independent commits, never in `updates`. */}
        {lineKey !== 'wc' || endorsementRows.length > 0 || !isAbsent ? (
          <div className="space-y-2 border-t border-cc-border-subtle pt-4">
            <div className="text-sm font-medium text-cc-text-primary">
              {lineKey === 'wc'
                ? 'Subrogation waivers'
                : 'Additional insureds'}
            </div>
            <EndorsementRowList
              accountId={accountId}
              line={lineKey}
              rows={endorsementRows}
            />
          </div>
        ) : null}
      </div>

      {/* Footer: the ONE lime primary in the whole feature (Save). */}
      <div className="border-t border-cc-border-subtle p-6 pt-4">
        {confirmingDiscard ? (
          <div className="space-y-3">
            <p className="text-sm text-cc-text-primary">
              Discard changes to this coverage line?
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDiscard(false)}
                className="rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
              >
                Keep editing
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setUpdates({});
                  setConfirmingDiscard(false);
                  onClose();
                }}
                className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
              >
                Discard
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (requestClose()) onClose();
              }}
              className="rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
            >
              Cancel
            </Button>
            {/* Field Save only exists for a present line (needs a policy_id). */}
            {!isAbsent && (
              <Button
                data-primary
                size="sm"
                disabled={!isDirty || saveFields.isPending}
                onClick={handleSave}
                className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
              >
                {saveFields.isPending ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only carrier + NAIC block
// ---------------------------------------------------------------------------

function CarrierBlock({
  line,
  insurers,
}: {
  line: COILineBase;
  insurers: COIInsurer[];
}) {
  const carrier =
    insurers.find((i) => i.letter === line.insurer_letter) ?? null;
  const carrierName = (carrier?.name?.v ?? '').trim();
  const naic = (carrier?.naic?.v ?? '').trim();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-xs text-cc-text-muted">Carrier</Label>
        {carrierName ? (
          <div className="break-words text-sm text-cc-text-primary">
            {carrierName}
          </div>
        ) : (
          <div className="text-sm text-cc-warning">Unresolved</div>
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-cc-text-muted">NAIC</Label>
        {naic ? (
          <div className="cc-num text-sm text-cc-text-primary">{naic}</div>
        ) : (
          <div className="text-sm text-cc-warning">Missing</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable field rows. Each is editable iff cell.path is non-null.
// ---------------------------------------------------------------------------

/** Muted provenance line under a field, matching the panel's Cell chip. */
function ProvenanceChip({ cell }: { cell: COICell | undefined }) {
  if (!cell || cell.v == null || cell.src === 'missing') return null;
  return (
    <span className="text-[10px] uppercase tracking-wide text-cc-text-muted">
      {cell.src}
    </span>
  );
}

function DateFieldRow({
  label,
  cell,
  value,
  onChange,
}: {
  label: string;
  cell: COICell | undefined;
  value: string;
  onChange: (iso: string) => void;
}) {
  const editable = Boolean(cell?.path);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-cc-text-muted">{label}</Label>
      <DateField
        value={value ? value.slice(0, 10) : ''}
        onChange={onChange}
        disabled={!editable}
        className="cc-num"
      />
      <ProvenanceChip cell={cell} />
    </div>
  );
}

function TextFieldRow({
  label,
  cell,
  value,
  onChange,
}: {
  label: string;
  cell: COICell | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  const editable = Boolean(cell?.path);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-cc-text-muted">{label}</Label>
      <Input
        value={value}
        disabled={!editable}
        onChange={(e) => onChange(e.target.value)}
        className="cc-num font-mono"
      />
      <ProvenanceChip cell={cell} />
    </div>
  );
}

function CurrencyFieldRow({
  label,
  cell,
  format,
  value,
  isEdited,
  onChange,
  onRestore,
}: {
  label: string;
  cell: COICell | undefined;
  format: 'currency' | 'text';
  value: string;
  isEdited: boolean;
  onChange: (v: string) => void;
  onRestore?: () => void;
}) {
  const editable = Boolean(cell?.path);
  // Show a thousands-separated hint when the field holds a committed number and
  // is not being actively re-typed.
  const numeric = format === 'currency';
  const display =
    numeric && !isEdited && value
      ? formatCurrency(Number(value.replace(/[^0-9.]/g, '')) || null) || value
      : value;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-cc-text-muted">{label}</Label>
        {onRestore && (
          <button
            type="button"
            onClick={onRestore}
            className="text-xs text-cc-text-secondary underline-offset-2 hover:text-cc-text-primary hover:underline"
          >
            Restore my value
          </button>
        )}
      </div>
      <Input
        value={display}
        disabled={!editable}
        inputMode={numeric ? 'numeric' : 'text'}
        onChange={(e) => onChange(e.target.value)}
        className="cc-num text-right"
      />
      <ProvenanceChip cell={cell} />
    </div>
  );
}
