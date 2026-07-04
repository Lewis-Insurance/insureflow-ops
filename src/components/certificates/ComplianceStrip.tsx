// ComplianceStrip (07-supplemental-enhancements.md Section 4.4).
//
// The holder-requirements advisory strip in the generator. Given the shared pure
// evaluation (evaluateHolderRequirements), it renders one labeled pill per rule:
// a passing rule is success-toned, a failing rule warning/danger-toned, and the
// informational notice_days row is neutral. The header states the failure count.
// It is ADVISORY: it never disables Generate (that gate lives on the Generate
// button + the failing-requirements confirm dialog in the page).
//
// Renders nothing when the holder has no requirements (evaluation.has_requirements
// false), so a holder with no profile shows no strip at all.
//
// Calm Command: cc-* tokens both themes, StatusPill for the tone-carrying pills,
// tabular figures on the count, no em or en dashes.

import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { StatusPill } from '@/components/cc';
import type { RequirementsEvaluation, RequirementResult } from '@/lib/acord/acord25/requirements';

interface ComplianceStripProps {
  evaluation: RequirementsEvaluation;
}

/** The StatusPill override for one result: pass = success, info = neutral, fail = danger. */
function pillOverride(result: RequirementResult): { label: string; tone: 'success' | 'neutral' | 'danger' } {
  if (result.severity === 'info') {
    return { label: 'Note', tone: 'neutral' };
  }
  return result.pass ? { label: 'Meets', tone: 'success' } : { label: 'Fails', tone: 'danger' };
}

export function ComplianceStrip({ evaluation }: ComplianceStripProps) {
  if (!evaluation.has_requirements) return null;

  const { results, failure_count } = evaluation;
  const clean = failure_count === 0;

  return (
    <div
      className="space-y-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3"
      aria-label="Holder requirements"
    >
      <div className="flex items-center gap-2">
        {clean ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-cc-success" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-cc-warning" aria-hidden="true" />
        )}
        <span className="text-sm font-medium text-cc-text-primary">Holder requirements</span>
        <span className="text-sm text-cc-text-muted">
          {clean ? (
            'all requirements met'
          ) : (
            <>
              <span className="cc-num font-medium text-cc-text-secondary">{failure_count}</span>
              {failure_count === 1 ? ' requirement not met' : ' requirements not met'}
            </>
          )}
        </span>
      </div>

      <ul className="space-y-1.5">
        {results.map((result, i) => {
          const override = pillOverride(result);
          return (
            <li
              key={`${result.kind}-${result.line_key ?? ''}-${result.field ?? i}`}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <span className="text-cc-text-secondary">{result.label}</span>
                <p className="text-xs text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  {result.message}
                </p>
              </div>
              <StatusPill override={override} className="mt-0.5 shrink-0" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
