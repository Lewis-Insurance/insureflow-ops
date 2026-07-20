// Per-line policy coverage panel for the policy detail page.
//
// Read-only by default, with an Edit toggle that turns the coverage fields into
// inline inputs and one Save. Every edit is written ONLY through the
// save_master_coi_fields path (useSaveMasterCoiFields), which is the certificate
// source of truth, so a save here propagates everywhere the COI reads. This panel
// is a sibling of the Master COI CoverageLineDrawer and deliberately mirrors its
// field-row styling, currency parsing, and Save-button treatment.
//
// Scope: the ACORD-25 coverage fields for ONE line (from policyCoverageFields)
// plus a read-only context strip (carrier, NAIC, policy number, dates). Carrier,
// dates, and policy number are edited in Edit Policy, never here. Additional
// insureds and endorsements stay in the Master COI panel and are out of scope.
//
// Calm Command binding: cc-* tokens only; tabular figures via cc-num on every
// number; currency right-aligned; the ONE lime primary in this whole feature is
// the Save button (rendered exactly like the drawer's Save: data-primary). Every
// other control is outline or ghost. Missing values render honestly as "Missing"
// / "Not on file", never fabricated. No em or en dashes.

import * as React from 'react';
import { ShieldCheck, FileUp, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePolicyAdditionalCoverages } from '@/hooks/usePolicyAdditionalCoverages';
import { PolicyEndorsementsSection } from '@/components/policies/PolicyEndorsementsSection';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import { useMasterCoi, useSaveMasterCoiFields } from '@/hooks/useMasterCoi';
import { LINE_LABEL, formatCurrency } from '@/components/master-coi/lineDisplay';
import {
  policyCoverageFields,
  type CoverageField,
} from '@/components/policies/policyCoverageFields';
import type {
  COIInsurer,
  COILineAuto,
  COILineBase,
  COILineGL,
  COILineProperty,
  COILineUmbrella,
  COILineWC,
} from '@/types/master-coi';

type AnyCoverageLine =
  | COILineGL
  | COILineAuto
  | COILineUmbrella
  | COILineWC
  | COILineProperty;

export interface PolicyCoveragePanelProps {
  accountId: string;
  policyId: string;
  lineKey: 'gl' | 'auto' | 'umbrella' | 'wc' | 'property';
  /** Opens the upload/extract flow; the button renders only when provided. */
  onFillFromDocument?: () => void;
}

// ---------------------------------------------------------------------------
// Currency parsing (copied from CoverageLineDrawer for identical behavior)
// ---------------------------------------------------------------------------

/** Parse a currency-ish input into a number, or null when blank/unparseable. */
function parseCurrencyInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format a raw edit value with thousands separators for display in a money input
 * (e.g. "1000000" -> "1,000,000"). Blank/unparseable -> "". Limits are whole
 * dollars, so we keep at most two fraction digits and never force any.
 */
function formatMoneyInput(raw: string): string {
  const n = parseCurrencyInput(raw);
  if (n == null) return '';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * A money input that shows live thousands separators while the operator types and
 * emits the parsed number (or null when cleared). Right-aligned, tabular figures,
 * matching every money field across GL / Auto / Umbrella / WC.
 */
function MoneyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <Input
      value={formatMoneyInput(value)}
      inputMode="numeric"
      placeholder="0"
      onChange={(e) => onChange(parseCurrencyInput(e.target.value))}
      className="cc-num text-right"
    />
  );
}

// ---------------------------------------------------------------------------
// Shell + header
// ---------------------------------------------------------------------------

/** Calm Command PanelShell recipe, matching the Master COI panels verbatim. */
function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Value formatting for VIEW mode
// ---------------------------------------------------------------------------

/** The option label for an enum cell value, or "Missing" when unmatched/null. */
function enumLabel(field: CoverageField): string {
  const raw = field.cell?.v;
  if (raw == null || raw === '') return 'Missing';
  const match = field.enumOptions?.find((o) => o.value === String(raw));
  return match ? match.label : String(raw);
}

/** The read-only display string for one coverage field. */
function viewValue(field: CoverageField): string {
  const raw = field.cell?.v;
  switch (field.kind) {
    case 'money':
      return raw == null || raw === ''
        ? 'Missing'
        : formatCurrency(Number(raw)) || 'Missing';
    case 'enum':
      return enumLabel(field);
    case 'bool':
      if (raw == null || raw === '') return 'Missing';
      return raw === true || raw === 'true' ? 'Yes' : 'No';
    case 'text':
    default:
      return raw == null || String(raw).trim() === '' ? 'Missing' : String(raw);
  }
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export function PolicyCoveragePanel({
  accountId,
  policyId,
  lineKey,
  onFillFromDocument,
}: PolicyCoveragePanelProps) {
  const { data, isLoading, error } = useMasterCoi(accountId);
  const saveFields = useSaveMasterCoiFields();

  const [editing, setEditing] = React.useState(false);
  // Local field edits keyed by each cell's registry path, exactly like the drawer.
  const [updates, setUpdates] = React.useState<Record<string, unknown>>({});

  const line = data?.lines?.[lineKey] as AnyCoverageLine | undefined;
  const insurers: COIInsurer[] = data?.insurers ?? [];

  // Fields are recomputed from the live edit map so a field whose visible set
  // depends on another (Auto CSL vs Split) swaps immediately when its toggle
  // changes, before any save round-trip. Tolerates an absent/undefined line.
  const fields = policyCoverageFields(lineKey, line, updates);
  const basisFields = fields.filter((f) => f.zone === 'basis');
  const limitFields = fields.filter((f) => f.zone === 'limit');

  // Only paths that are currently visible get saved, so a value typed under one
  // branch (e.g. a CSL amount) never persists after switching to the other.
  const activePaths = new Set(
    fields.map((f) => f.path).filter((p): p is string => Boolean(p)),
  );
  const filteredUpdates = Object.fromEntries(
    Object.entries(updates).filter(([path]) => activePaths.has(path)),
  );
  const hasChanges = Object.keys(filteredUpdates).length > 0;

  const setField = (path: string | null, value: unknown) => {
    if (!path) return; // not editable here
    setUpdates((prev) => ({ ...prev, [path]: value }));
  };

  const enterEdit = () => {
    // Start from the read-model values: an empty updates map.
    setUpdates({});
    setEditing(true);
  };

  const cancelEdit = () => {
    setUpdates({});
    setEditing(false);
  };

  const handleSave = () => {
    if (!hasChanges || saveFields.isPending) return;
    saveFields.mutate(
      { accountId, policyId, updates: filteredUpdates },
      {
        onSuccess: () => {
          // The hook already invalidates caches + toasts.
          setUpdates({});
          setEditing(false);
        },
      },
    );
  };

  // The edited value for a field: a local edit (keyed by the static registry
  // path) wins, else the read-model cell value.
  const currentValue = (field: CoverageField): string => {
    if (field.path && field.path in updates) {
      const v = updates[field.path];
      return v == null ? '' : String(v);
    }
    return field.cell?.v == null ? '' : String(field.cell.v);
  };

  // A row renders as an input in edit mode when it has a registry write path; any
  // pathless (read-only) field would show its value plainly instead.
  const renderRow = (field: CoverageField) =>
    editing && field.path ? (
      <EditableFieldRow
        key={field.label}
        field={field}
        value={currentValue(field)}
        onChange={(value) => setField(field.path, value)}
      />
    ) : (
      <FieldRow key={field.label} field={field} />
    );

  const title = LINE_LABEL[lineKey];

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
        <h3 className="text-base font-semibold text-cc-text-primary">{title}</h3>
      </div>
      <div className="flex items-center gap-2">
        {!editing ? (
          <>
            {onFillFromDocument && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onFillFromDocument}
                className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
              >
                <FileUp className="h-4 w-4" aria-hidden="true" />
                Fill from document
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={enterEdit}
              disabled={isLoading || Boolean(error)}
              className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelEdit}
              className="rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
            >
              Cancel
            </Button>
            {/* The ONE lime primary in this whole feature. */}
            <Button
              data-primary
              size="sm"
              disabled={!hasChanges || saveFields.isPending}
              onClick={handleSave}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              {saveFields.isPending ? 'Saving...' : 'Save'}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  // Loading state.
  if (isLoading) {
    return (
      <PanelShell>
        <div className="space-y-3">
          {header}
          <p className="text-sm text-cc-text-muted">Loading coverage...</p>
        </div>
      </PanelShell>
    );
  }

  // Hard error state. A missing line is NOT an error: get_master_coi returns an
  // absent skeleton (or nothing) for a not-yet-classified policy, and we still
  // want the operator to enter coverage from scratch, so we render the editable
  // panel below rather than bailing out.
  if (error) {
    return (
      <PanelShell>
        <div className="space-y-3">
          {header}
          <p className="text-sm text-cc-text-muted">
            Coverage could not be loaded.
          </p>
        </div>
      </PanelShell>
    );
  }

  const isEmptyLine = !line || line.present === false;

  return (
    <PanelShell>
      <div className="space-y-4">
        {header}

        {/* Read-only context strip: carrier, NAIC, policy number, dates. Always
            read-only in both modes; these are edited in Edit Policy. */}
        <ContextStrip line={line} insurers={insurers} />
        <p className="text-xs text-cc-text-muted">
          Carrier, dates, and policy number are edited in Edit Policy.
        </p>

        {/* When the policy exists on the line but has no coverage details yet. */}
        {isEmptyLine && (
          <div
            className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3 text-sm text-cc-text-secondary"
            role="note"
          >
            No coverage details on file yet. Add them here or use Fill from
            document.
          </div>
        )}

        {/* Coverage basis: the form / type toggles - how the coverage is written
            (occurrence vs claims-made, CSL vs split, umbrella vs excess, per
            statute). Same treatment on every line. */}
        {basisFields.length > 0 && (
          <div className="space-y-2 border-t border-cc-border-subtle pt-4">
            <div className="text-sm font-medium text-cc-text-primary">
              Coverage basis
            </div>
            <dl className="divide-y divide-cc-border-subtle">
              {basisFields.map(renderRow)}
            </dl>
          </div>
        )}

        {/* Limits: the money amounts, then any custom write-in coverages. */}
        <div className="space-y-2 border-t border-cc-border-subtle pt-4">
          <div className="text-sm font-medium text-cc-text-primary">Limits</div>
          {limitFields.length > 0 && (
            <dl className="divide-y divide-cc-border-subtle">
              {limitFields.map(renderRow)}
            </dl>
          )}
          <AdditionalCoveragesSection policyId={policyId} lineKey={lineKey} />
        </div>

        <PolicyEndorsementsSection
          accountId={accountId}
          policyId={policyId}
          lineKey={lineKey}
        />
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Read-only context strip (carrier, NAIC, policy number, effective, expiration)
// ---------------------------------------------------------------------------

function ContextStrip({
  line,
  insurers,
}: {
  line: COILineBase | undefined;
  insurers: COIInsurer[];
}) {
  const carrier = line
    ? insurers.find((i) => i.letter === line.insurer_letter) ?? null
    : null;
  const carrierName = (carrier?.name?.v ?? '').trim();
  const naic = (carrier?.naic?.v ?? '').trim();
  const policyNumber = (line?.policy_number?.v ?? '').toString().trim();
  const effective = line?.effective_date?.v
    ? formatLocalDateDisplay(String(line.effective_date.v))
    : '';
  const expiration = line?.expiration_date?.v
    ? formatLocalDateDisplay(String(line.expiration_date.v))
    : '';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <ContextCell label="Carrier">
        {carrierName ? (
          <span className="break-words text-cc-text-primary">{carrierName}</span>
        ) : (
          <span className="text-cc-text-muted">Unresolved</span>
        )}
      </ContextCell>
      <ContextCell label="NAIC">
        {naic ? (
          <span className="cc-num text-cc-text-primary">{naic}</span>
        ) : (
          <span className="text-cc-text-muted">Missing</span>
        )}
      </ContextCell>
      <ContextCell label="Policy number">
        {policyNumber ? (
          <span className="cc-num break-words text-cc-text-primary">
            {policyNumber}
          </span>
        ) : (
          <span className="text-cc-text-muted">Not on file</span>
        )}
      </ContextCell>
      <ContextCell label="Effective">
        {effective ? (
          <span className="cc-num text-cc-text-primary">{effective}</span>
        ) : (
          <span className="text-cc-text-muted">Not on file</span>
        )}
      </ContextCell>
      <ContextCell label="Expiration">
        {expiration ? (
          <span className="cc-num text-cc-text-primary">{expiration}</span>
        ) : (
          <span className="text-cc-text-muted">Not on file</span>
        )}
      </ContextCell>
    </div>
  );
}

function ContextCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-cc-text-muted">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VIEW-mode field row
// ---------------------------------------------------------------------------

function FieldRow({ field }: { field: CoverageField }) {
  const value = viewValue(field);
  const isMissing = value === 'Missing';
  const rightAlignMoney = field.kind === 'money';
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-sm text-cc-text-secondary">{field.label}</dt>
      <dd
        className={[
          'text-sm',
          rightAlignMoney ? 'cc-num text-right' : '',
          isMissing ? 'text-cc-text-muted' : 'text-cc-text-primary',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EDIT-mode field row. Editable IFF cell.path is non-null.
// ---------------------------------------------------------------------------

function EditableFieldRow({
  field,
  value,
  onChange,
}: {
  field: CoverageField;
  value: string;
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 py-2 sm:grid-cols-2 sm:items-center sm:gap-4">
      <Label className="text-sm text-cc-text-secondary">{field.label}</Label>
      <div>
        {field.kind === 'enum' ? (
          <Select
            value={value || undefined}
            onValueChange={(next) => onChange(next)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Not selected" />
            </SelectTrigger>
            <SelectContent>
              {(field.enumOptions ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.kind === 'bool' ? (
          <Select
            value={value === '' ? undefined : boolToSelectValue(value)}
            onValueChange={(next) => onChange(next === 'yes')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Not selected" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        ) : field.kind === 'money' ? (
          <MoneyInput value={value} onChange={onChange} />
        ) : (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value || null)}
            className="cc-num"
          />
        )}
      </div>
    </div>
  );
}

/** Map a stored bool-ish value ("true"/"false"/boolean string) to the Select key. */
function boolToSelectValue(value: string): string {
  return value === 'true' || value === 'yes' ? 'yes' : 'no';
}

// ---------------------------------------------------------------------------
// Additional coverages: custom write-in rows (name + amount) for this policy
// line. These are the ACORD 25 blank coverage rows - the clean replacement for
// the old Manual Details modal. Add/remove commit immediately through
// usePolicyAdditionalCoverages (RLS-scoped table), independent of the panel's
// Edit toggle for the standard fields.
// ---------------------------------------------------------------------------

function AdditionalCoveragesSection({
  policyId,
  lineKey,
}: {
  policyId: string;
  lineKey: string;
}) {
  const { coverages, add, remove } = usePolicyAdditionalCoverages(
    policyId,
    lineKey,
  );
  const [addOpen, setAddOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [amount, setAmount] = React.useState('');

  const closeDialog = () => {
    setAddOpen(false);
    setName('');
    setAmount('');
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || add.isPending) return;
    add.mutate(
      { name: trimmed, amount: parseCurrencyInput(amount) },
      { onSuccess: closeDialog },
    );
  };

  // Rendered as a continuation of the coverage list (ACORD 25 blank rows): any
  // write-in coverages follow the standard limits, then the Add button sits under
  // the last coverage row.
  return (
    <>
      {coverages.length > 0 && (
        <dl className="divide-y divide-cc-border-subtle border-t border-cc-border-subtle">
          {coverages.map((coverage) => (
            <div
              key={coverage.id}
              className="flex items-center justify-between gap-4 py-2"
            >
              <dt className="break-words text-sm text-cc-text-primary">
                {coverage.name}
              </dt>
              <dd className="flex items-center gap-3">
                <span className="cc-num text-right text-sm text-cc-text-primary">
                  {coverage.amount == null ? '' : formatCurrency(coverage.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => remove.mutate(coverage.id)}
                  disabled={remove.isPending}
                  aria-label={`Remove ${coverage.name}`}
                  className="text-cc-text-muted transition-colors hover:text-cc-danger"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAddOpen(true)}
          className="gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(next) => (next ? setAddOpen(true) : closeDialog())}
      >
        <DialogContent className="bg-cc-surface">
          <DialogHeader>
            <DialogTitle className="text-cc-text-primary">
              Add coverage
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-cc-text-secondary">
                Coverage name
              </Label>
              <Input
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hired / Non-Owned Auto"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-cc-text-secondary">
                Coverage amount
              </Label>
              <Input
                value={amount}
                inputMode="numeric"
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1,000,000"
                className="cc-num text-right"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeDialog}
              className="rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
            >
              Cancel
            </Button>
            <Button
              data-primary
              size="sm"
              disabled={!name.trim() || add.isPending}
              onClick={submit}
              className="gap-2 rounded-cc-md font-semibold"
            >
              {add.isPending ? 'Adding...' : 'Add coverage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
