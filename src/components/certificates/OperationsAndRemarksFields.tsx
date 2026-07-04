// OperationsAndRemarksFields (blueprint D Section 3.5, doc 06 Section 4.8, R18).
//
// TWO labeled fields: Description of operations (seeded once from
// masterCoi.description_of_operations.v) and Remarks (seeded once from
// account_coi_profiles.default_remarks). ONE shared live counter bound to the
// fieldMap softCharLimit, computed over the COMPOSED printed text per 05's
// composition rule (remarks joined under the description with a blank line).
// Over the limit renders warning-toned AND 05's builder emits a blocking OVERFLOW
// error into the ValidationStrip; there is NO hard cap on the textareas.
//
// Calm Command: cc-* tokens both themes, tabular figures on the counter, no em or
// en dashes anywhere.

import { AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  OPERATIONS_SOFT_CHAR_LIMIT as SOFT_CHAR_LIMIT,
  composePrintedOperations,
} from './holderUtils';

interface OperationsAndRemarksFieldsProps {
  descriptionOfOperations: string;
  remarks: string;
  onChangeDescription: (value: string) => void;
  onChangeRemarks: (value: string) => void;
}

export function OperationsAndRemarksFields({
  descriptionOfOperations,
  remarks,
  onChangeDescription,
  onChangeRemarks,
}: OperationsAndRemarksFieldsProps) {
  const composed = composePrintedOperations(descriptionOfOperations, remarks);
  const length = composed.length;
  const over = length > SOFT_CHAR_LIMIT;
  const overflow = length - SOFT_CHAR_LIMIT;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cert-description" className="text-cc-text-secondary">
          Description of operations
        </Label>
        <Textarea
          id="cert-description"
          rows={4}
          value={descriptionOfOperations}
          onChange={(e) => onChangeDescription(e.target.value)}
          placeholder="Describe the operations, project, or certificate purpose."
          className="bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cert-remarks" className="text-cc-text-secondary">
          Remarks
        </Label>
        <Textarea
          id="cert-remarks"
          rows={3}
          value={remarks}
          onChange={(e) => onChangeRemarks(e.target.value)}
          placeholder="Optional. Prints with the description of operations."
          className="bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted"
        />
        <p className="text-xs text-cc-text-muted">
          Optional. Prints with the description of operations.
        </p>
      </div>

      {over ? (
        <p className="flex items-center gap-1.5 text-xs text-cc-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="cc-num [font-variant-numeric:tabular-nums]">
            Shorten by {overflow} characters.
          </span>
        </p>
      ) : (
        <p className="cc-num text-xs text-cc-text-muted [font-variant-numeric:tabular-nums]">
          {length} of {SOFT_CHAR_LIMIT} form characters
        </p>
      )}
    </div>
  );
}
