// Master COI per-row endorsement editor (blueprint Section 2.6).
//
// One tile per additional-insured row (GL / umbrella / auto / property) or WC
// subrogation-waiver row. The endorsement state is edited through a THREE-OPTION
// RADIO group, never a checkbox and never defaulting to endorsed: only an
// explicit "Endorsed" choice, backed by a form number, can ever let a
// certificate print Y for that holder. Each confirm calls set_line_ai_endorsement
// immediately (it is never batched into the drawer's field Save, which targets
// save_master_coi_fields).
//
// Zero lime here. StatusPill carries the resolved state (ADDL_PILL for
// additional insureds, SUBR_PILL for WC waivers). The effective date is edited
// through DateField, never a native date input. No em/en dashes.

import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import { DateField, StatusPill } from '@/components/cc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useSetLineAiEndorsement } from '@/hooks/useMasterCoi';
import { ADDL_PILL, SUBR_PILL } from './endorsementPills';
import type {
  COIAdditionalInsuredRow,
  COIEndorsementStatus,
  COILineKey,
  COIWCSubroWaiverRow,
} from '@/types/master-coi';

/** Fixed, binding microcopy under every endorsement editor (blueprint 2.6). */
const ENDORSEMENT_HELP =
  'Endorsed means the endorsement is on file with the carrier. Certificates can only print Y for holders this endorsement actually covers.';

/** Error shown when Endorsed is chosen with no form number on an unproven row. */
const ENDORSED_NEEDS_FORM =
  'Enter the endorsement form number to mark this row endorsed';

/** The three radio options, in fixed order. */
const STATUS_OPTIONS: Array<{ value: COIEndorsementStatus; label: string }> = [
  { value: 'none', label: 'Not endorsed' },
  { value: 'requested', label: 'Requested' },
  { value: 'endorsed', label: 'Endorsed' },
];

/** A row is one of the two shapes; both share id + endorsement_status. */
type EndorsementRow = COIAdditionalInsuredRow | COIWCSubroWaiverRow;

export interface EndorsementRowListProps {
  accountId: string;
  /** 'gl' | 'umbrella' | 'auto' | 'property' | 'wc'. */
  line: COILineKey;
  rows: EndorsementRow[];
}

function isWcRow(row: EndorsementRow): row is COIWCSubroWaiverRow {
  return 'waiver_scope' in row;
}

/**
 * Normalize a stored date to the strict ISO YYYY-MM-DD that DateField's value
 * contract requires: the read-model may return a full timestamp
 * (2026-06-29T00:00:00Z), which DateField would otherwise fail to parse and
 * render blank while a value exists.
 */
function toIsoDate(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  return s ? s.slice(0, 10) : '';
}

/** Read the effective date a row carries, across the union's field names. */
function rowEffectiveDate(row: EndorsementRow): string {
  if (isWcRow(row)) return toIsoDate(row.endorsement_effective_date);
  return toIsoDate(row.endorsement_effective_date ?? row.effective_date);
}

/** True when a row already has document evidence (a confirmed endorsement). */
function isDocumentEvidenced(row: EndorsementRow): boolean {
  return Boolean(row.endorsement_confirmed_at);
}

export function EndorsementRowList({
  accountId,
  line,
  rows,
}: EndorsementRowListProps) {
  const isWc = line === 'wc';
  const pillMap = isWc ? SUBR_PILL : ADDL_PILL;

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-cc-text-muted">
          {isWc
            ? 'No subrogation waivers on this line yet.'
            : 'No additional insureds on this line yet.'}
        </p>
      ) : (
        rows.map((row) => (
          <EndorsementRowTile
            key={row.id}
            accountId={accountId}
            line={line}
            row={row}
            pillMap={pillMap}
          />
        ))
      )}

      <p className="text-xs text-cc-text-muted">{ENDORSEMENT_HELP}</p>

      {/*
        Add-row affordance. Appending a real row requires the directory write
        path (03), not yet wired here; this ghost action is the placeholder for
        that flow and stays disabled so nothing writes an unbacked row.
      */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled
        className="rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
      >
        {isWc ? 'Add subrogation waiver' : 'Add additional insured'}
      </Button>
    </div>
  );
}

interface EndorsementRowTileProps {
  accountId: string;
  line: COILineKey;
  row: EndorsementRow;
  pillMap: typeof ADDL_PILL | typeof SUBR_PILL;
}

function EndorsementRowTile({
  accountId,
  line,
  row,
  pillMap,
}: EndorsementRowTileProps) {
  const setEndorsement = useSetLineAiEndorsement();

  const [editing, setEditing] = React.useState(false);
  const [status, setStatus] = React.useState<COIEndorsementStatus>(
    row.endorsement_status,
  );
  const [endorsementForm, setEndorsementForm] = React.useState(
    row.endorsement_form ?? '',
  );
  const [effectiveDate, setEffectiveDate] = React.useState(
    rowEffectiveDate(row),
  );
  const [showError, setShowError] = React.useState(false);

  const wc = isWcRow(row);
  const name = (row.name ?? '').trim();
  const formRef = row.endorsement_form?.trim();
  const errorId = `endorsement-form-error-${row.id}`;

  // Endorsed requires a form number unless the row is already document-evidenced.
  const endorsedNeedsForm =
    status === 'endorsed' &&
    !endorsementForm.trim() &&
    !isDocumentEvidenced(row);

  const beginEdit = () => {
    setStatus(row.endorsement_status);
    setEndorsementForm(row.endorsement_form ?? '');
    setEffectiveDate(rowEffectiveDate(row));
    setShowError(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setShowError(false);
    setEditing(false);
  };

  const confirm = () => {
    if (endorsedNeedsForm) {
      setShowError(true);
      return;
    }
    setShowError(false);
    setEndorsement.mutate(
      {
        accountId,
        line,
        rowId: row.id,
        status,
        endorsementForm:
          status === 'endorsed' ? endorsementForm.trim() || null : null,
        effectiveDate:
          status === 'endorsed' ? effectiveDate || null : null,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <div className="space-y-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          {name ? (
            <div className="break-words text-sm font-semibold text-cc-text-primary">
              {name}
            </div>
          ) : (
            <div className="text-sm text-cc-text-muted">Unnamed holder</div>
          )}

          {/* Muted facts line: per-row scope and flags. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-cc-text-muted">
            {wc ? (
              <span>
                {row.waiver_scope === 'blanket'
                  ? 'Blanket waiver'
                  : 'Specific waiver'}
              </span>
            ) : (
              <>
                {(row as COIAdditionalInsuredRow).ai_type && (
                  <span className="break-words">
                    {String((row as COIAdditionalInsuredRow).ai_type).replace(
                      /_/g,
                      ' ',
                    )}
                  </span>
                )}
                {(row as COIAdditionalInsuredRow).primary_noncontributory && (
                  <span>Primary and non contributory</span>
                )}
                {(row as COIAdditionalInsuredRow).waiver_of_subrogation && (
                  <span>Waiver of subrogation</span>
                )}
              </>
            )}
            {formRef && (
              <span className="font-mono text-cc-text-secondary">{formRef}</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <StatusPill override={pillMap[row.endorsement_status]} />
          {!editing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={beginEdit}
              className="rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
            >
              Edit status
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="space-y-3 border-t border-cc-border-subtle pt-3">
          <RadioGroup
            value={status}
            onValueChange={(v) => {
              setStatus(v as COIEndorsementStatus);
              setShowError(false);
            }}
            className="gap-2"
          >
            {STATUS_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <RadioGroupItem
                  value={opt.value}
                  id={`endorsement-${row.id}-${opt.value}`}
                />
                <Label
                  htmlFor={`endorsement-${row.id}-${opt.value}`}
                  className="text-sm text-cc-text-primary"
                >
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {/* Endorsed branch: required form + optional effective date. */}
          {status === 'endorsed' && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label
                  htmlFor={`endorsement-form-${row.id}`}
                  className="text-xs text-cc-text-muted"
                >
                  Endorsement form number
                </Label>
                <Input
                  id={`endorsement-form-${row.id}`}
                  value={endorsementForm}
                  onChange={(e) => {
                    setEndorsementForm(e.target.value);
                    if (e.target.value.trim()) setShowError(false);
                  }}
                  placeholder="CG 20 10"
                  aria-invalid={showError && endorsedNeedsForm}
                  aria-describedby={
                    showError && endorsedNeedsForm ? errorId : undefined
                  }
                  className={
                    showError && endorsedNeedsForm
                      ? 'cc-num border-cc-danger'
                      : 'cc-num'
                  }
                />
                {showError && endorsedNeedsForm && (
                  <div
                    id={errorId}
                    role="alert"
                    className="inline-flex items-start gap-1 text-xs text-cc-danger"
                  >
                    <CircleAlert
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{ENDORSED_NEEDS_FORM}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor={`endorsement-eff-${row.id}`}
                  className="text-xs text-cc-text-muted"
                >
                  Endorsement effective date
                </Label>
                <DateField
                  id={`endorsement-eff-${row.id}`}
                  value={effectiveDate}
                  onChange={setEffectiveDate}
                  className="cc-num"
                />
              </div>
            </div>
          )}

          {/*
            No "Requested" note field: set_line_ai_endorsement has no note
            parameter, so there is nowhere to persist one. Rather than show a
            control that silently drops its input, Requested simply records the
            status.
          */}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={setEndorsement.isPending}
              onClick={confirm}
              className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              {setEndorsement.isPending ? 'Saving...' : 'Confirm status'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={setEndorsement.isPending}
              onClick={cancelEdit}
              className="rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
