// Master COI coverage-line tile (blueprint Section 2.3).
//
// One certificate line rendered as a read-only tile with an edit affordance. The
// whole tile is NOT clickable (text stays selectable); editing goes through the
// overflow menu or, for an absent line, the single "Edit line" item. Two
// variants:
//   - present:false -> a single muted "Not on file" row (never fabricated data).
//   - present:true  -> line-1 identity strip (insurer letter, label, carrier
//     Chip, policy number, Eff/Exp date tokens, completeness indicator, overflow
//     menu) plus a line-2 limits strip rendered through the shared Cell so every
//     scalar looks identical and a missing limit reads "Missing" in warning tone.
//
// Zero lime here (the panel's one lime primary is the drawer Save). Carriers are
// name Chips, never colored. Dates render through formatLocalDateDisplay with
// cc-num, never a native date input. No truncation: labels and names wrap.
// Consumes the read-model contract in src/types/master-coi.ts verbatim.

import { Check, CircleAlert, MoreHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Chip, StatusPill } from '@/components/cc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import { Cell } from './Cell';
import { ADDL_PILL, SUBR_PILL } from './endorsementPills';
import { LINE_LABEL, limitCellsFor } from './lineDisplay';
import type {
  COIAdditionalInsuredRow,
  COIEndorsementStatus,
  COIInsurer,
  COILineAuto,
  COILineGL,
  COILineKey,
  COILineProperty,
  COILineUmbrella,
  COILineWC,
  COIReadinessBlocker,
  COIWCSubroWaiverRow,
} from '@/types/master-coi';

/** The five present-or-absent certificate lines this tile can render. */
type AnyLine =
  | COILineGL
  | COILineAuto
  | COILineUmbrella
  | COILineWC
  | COILineProperty;

export interface CoverageLineRowProps {
  lineKey: Exclude<COILineKey, 'other'>;
  line: AnyLine;
  insurers: COIInsurer[];
  /** Parent passes the already-filtered blockers for this line only. */
  blockers: COIReadinessBlocker[];
  onEdit: (lineKey: COILineKey) => void;
}

/** A cell string value is present only when non-empty and not missing. */
function cellText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Rank the AI-row endorsement summary across a line's rows: 'endorsed' wins over
 * 'requested' wins over 'none'. WC rows use the same three-state field, so one
 * helper serves both additional-insured and subrogation-waiver lists.
 */
function summarizeEndorsement(
  rows: Array<{ endorsement_status: COIEndorsementStatus }>,
): COIEndorsementStatus {
  if (rows.some((r) => r.endorsement_status === 'endorsed')) return 'endorsed';
  if (rows.some((r) => r.endorsement_status === 'requested')) return 'requested';
  return 'none';
}

export function CoverageLineRow({
  lineKey,
  line,
  insurers,
  blockers,
  onEdit,
}: CoverageLineRowProps) {
  const navigate = useNavigate();
  const label = LINE_LABEL[lineKey];

  // -------------------------------------------------------------------------
  // Absent line: one honest muted row, edit-only overflow, no fabricated cells.
  // A missing line object (a partial read-model omitting this key) is treated
  // exactly like present:false so the tile never throws on undefined.
  // -------------------------------------------------------------------------
  if (!line || !line.present) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3">
        <div className="min-w-0">
          <span className="break-words text-sm font-medium text-cc-text-secondary">
            {label}
          </span>
          <span className="ml-2 text-sm text-cc-text-muted">Not on file</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Coverage line actions"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-cc-sm text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-primary"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(lineKey)}>
              Edit line
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Present line derivations.
  // -------------------------------------------------------------------------
  const carrier = insurers.find((i) => i.letter === line.insurer_letter) ?? null;
  const carrierName = cellText(carrier?.name?.v);

  const policyNumber = cellText(line.policy_number?.v);
  const effDisplay = formatLocalDateDisplay(line.effective_date?.v);
  const expDisplay = formatLocalDateDisplay(line.expiration_date?.v);

  const limitCells = limitCellsFor(lineKey, line);

  // GL / umbrella carry a coverage-form qualifier we surface as a label suffix.
  let labelSuffix: string | null = null;
  if (lineKey === 'gl') {
    const form = cellText((line as COILineGL).occurrence_or_claims_made?.v);
    if (form) labelSuffix = form;
  } else if (lineKey === 'umbrella') {
    const kind = cellText((line as COILineUmbrella).umbrella_or_excess?.v);
    if (kind) labelSuffix = kind;
  }

  // AI / subrogation-waiver summary for the line-2 tail.
  let endorsementRows:
    | COIAdditionalInsuredRow[]
    | COIWCSubroWaiverRow[]
    | undefined;
  let pillMap = ADDL_PILL;
  if (lineKey === 'wc') {
    endorsementRows = (line as COILineWC).subrogation_waivers ?? [];
    pillMap = SUBR_PILL;
  } else if ('additional_insureds' in line) {
    endorsementRows = line.additional_insureds ?? [];
  }
  const endorsementSummary = endorsementRows
    ? summarizeEndorsement(endorsementRows)
    : null;
  const rowCountLabel = lineKey === 'wc' ? 'waivers' : 'AIs';

  const isComplete = blockers.length === 0;

  return (
    <div className="space-y-3 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3">
      {/* Line 1: identity strip. Wraps; never a whole-tile click target. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Insurer letter badge, or a warning ? when none is assigned. */}
        {line.insurer_letter ? (
          <span className="cc-num inline-flex h-5 w-5 items-center justify-center rounded-cc-sm border border-cc-border-interactive text-xs text-cc-text-secondary">
            {line.insurer_letter}
          </span>
        ) : (
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-cc-sm border border-cc-warning text-xs text-cc-warning"
            aria-label="No insurer letter assigned"
          >
            ?
          </span>
        )}

        <span className="break-words text-sm font-semibold text-cc-text-primary">
          {label}
          {labelSuffix && (
            <span className="ml-1 font-normal text-cc-text-muted">
              ({labelSuffix})
            </span>
          )}
        </span>

        {carrierName ? (
          <Chip className="max-w-full whitespace-normal break-words">
            {carrierName}
          </Chip>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-cc-warning">
            <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Carrier unresolved
          </span>
        )}

        {policyNumber && (
          <span className="cc-num font-mono text-xs text-cc-text-secondary">
            {policyNumber}
          </span>
        )}

        {effDisplay && (
          <span className="text-xs text-cc-text-muted">
            Eff <span className="cc-num text-cc-text-secondary">{effDisplay}</span>
          </span>
        )}

        {expDisplay && (
          <span
            className={
              line.expired
                ? 'inline-flex items-center gap-1 text-xs text-cc-warning'
                : 'text-xs text-cc-text-muted'
            }
          >
            {line.expired && (
              <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Exp{' '}
            <span
              className={
                line.expired ? 'cc-num' : 'cc-num text-cc-text-secondary'
              }
            >
              {expDisplay}
            </span>
          </span>
        )}

        {/* Right cluster: completeness indicator + overflow menu. */}
        <div className="ml-auto flex items-center gap-2">
          {isComplete ? (
            <span className="text-cc-text-muted">
              <Check className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Complete</span>
            </span>
          ) : (
            <StatusPill
              override={{
                label: `${blockers.length} ${blockers.length === 1 ? 'blocker' : 'blockers'}`,
                tone: 'warning',
              }}
            />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Coverage line actions"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-cc-sm text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-primary"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(lineKey)}>
                Edit line
              </DropdownMenuItem>
              {line.policy_id && (
                <DropdownMenuItem
                  onSelect={() => navigate(`/policies/${line.policy_id}`)}
                >
                  View full policy
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Line 2: limits strip. Each scalar through the shared Cell. */}
      {limitCells.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4">
          {limitCells.map((limit) => (
            <Cell
              key={limit.label}
              label={limit.label}
              cell={limit.cell}
              format={limit.format}
            />
          ))}
        </div>
      )}

      {/* Line-2 tail: additional-insured / subrogation-waiver summary. */}
      {endorsementSummary && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill override={pillMap[endorsementSummary]} />
          {endorsementRows && endorsementRows.length > 0 && (
            <span className="cc-num text-xs text-cc-text-muted">
              {endorsementRows.length} {rowCountLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
