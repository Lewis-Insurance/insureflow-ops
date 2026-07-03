// Master COI canonical cell renderer (blueprint Section 2.4).
//
// One place renders every scalar (label + value + provenance) so all ~40 cells
// look identical. Consumes a COICell from src/types/master-coi.ts. Honest by
// contract: a null/missing value renders "Missing" in warning tone (never
// fabricated); provenance is small MUTED text, never a success pill (constitution
// rule 4). Undefined-safe: absent lines omit line-specific cells, so `cell` may
// be undefined and is treated exactly like a missing value.

import { CircleAlert } from 'lucide-react';
import { formatCurrency } from './lineDisplay';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import type { COICell, COICellSource } from '@/types/master-coi';

/**
 * Provenance copy for each source. There is no 'legacy' source anywhere in the
 * module. 'missing' never reaches the provenance chip (the chip only renders
 * when a value is present).
 */
const SOURCE_LABEL: Record<Exclude<COICellSource, 'missing'>, string> = {
  extracted: 'extracted',
  manual: 'manual',
  account: 'account',
  workspace: 'workspace',
  reference: 'reference',
};

export interface CellProps {
  /** Field label, e.g. "Each occurrence". */
  label: string;
  /** The read-model cell; undefined when a line-specific cell is absent. */
  cell: COICell<string | number | boolean> | undefined;
  /** How to format a present value. Defaults to currency. */
  format?: 'currency' | 'text' | 'date';
}

function formatValue(
  value: string | number | boolean,
  format: 'currency' | 'text' | 'date',
): string {
  if (format === 'currency') {
    return typeof value === 'number' ? formatCurrency(value) : String(value);
  }
  if (format === 'date') {
    return formatLocalDateDisplay(String(value));
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

export function Cell({ label, cell, format = 'currency' }: CellProps) {
  const value = cell?.v;
  const isMissing = value == null || cell?.src === 'missing';

  return (
    <div className="space-y-0.5">
      <div className="text-xs text-cc-text-muted">{label}</div>

      {isMissing ? (
        <div
          className="inline-flex items-center gap-1 text-sm text-cc-warning"
          aria-label={`${label} missing`}
        >
          <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Missing</span>
        </div>
      ) : (
        <>
          <div className="cc-num text-sm font-medium text-cc-text-primary break-words">
            {formatValue(value, format)}
          </div>
          {cell?.src && cell.src !== 'missing' && (
            <div className="text-[10px] uppercase tracking-wide text-cc-text-muted">
              {SOURCE_LABEL[cell.src]}
            </div>
          )}
          {cell?.flag === 'overwritten_manual' && (
            <div className="text-[10px] uppercase tracking-wide text-cc-warning">
              manual overwritten
            </div>
          )}
          {cell?.flag === 'mismatch' && (
            <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-cc-warning">
              <CircleAlert className="h-3 w-3" aria-hidden="true" />
              <span>sources disagree</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
