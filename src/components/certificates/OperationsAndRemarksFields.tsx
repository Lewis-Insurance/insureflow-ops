// OperationsAndRemarksFields (blueprint D Section 3.5, doc 06 Section 4.8, R18).
//
// ONE labeled field: Description of operations. It is the only free-text block on
// the ACORD 25, so the old separate Remarks field was removed (it printed to the
// same box); any account default remarks are folded onto the back of this field
// when the page seeds. The live counter is bound to the fieldMap softCharLimit
// over this text; over the limit renders warning-toned AND 05's builder emits a
// blocking OVERFLOW error into the ValidationStrip; there is NO hard cap.
//
// Calm Command: cc-* tokens both themes, tabular figures on the counter, no em or
// en dashes anywhere.

import { AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { OPERATIONS_SOFT_CHAR_LIMIT as SOFT_CHAR_LIMIT } from './holderUtils';

interface OperationsAndRemarksFieldsProps {
  descriptionOfOperations: string;
  onChangeDescription: (value: string) => void;
}

export function OperationsAndRemarksFields({
  descriptionOfOperations,
  onChangeDescription,
}: OperationsAndRemarksFieldsProps) {
  const length = descriptionOfOperations.trim().length;
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
          rows={6}
          value={descriptionOfOperations}
          onChange={(e) => onChangeDescription(e.target.value)}
          placeholder="Describe the operations, project, or certificate purpose."
          className="bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted"
        />
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
