// ValidationStrip (blueprint D Section 3.6, doc 06 Section 4.9).
//
// The single, deduped list of everything blocking or warning about the current
// generate request: client validateAcord25 issues, readiness blockers for the
// SELECTED lines, page-level checks (no lines / no holder), and after a failed
// Generate the server's 422 issue list. role="alert"; the strip IS the reason
// Generate is disabled (no hover-only info). Generate is blocked while any
// error-severity issue exists; warnings never block.
//
// Calm Command: cc-* tokens both themes, danger/warning icon per item, tertiary
// "Go to line" that scrolls the offending row into view, no em or en dashes.

import { AlertTriangle, AlertCircle } from 'lucide-react';

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  lineKey?: string;
}

interface ValidationStripProps {
  issues: ValidationIssue[];
}

/** Dedupe by code + lineKey; the first-seen severity/message wins. */
function dedupe(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}::${issue.lineKey ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

function scrollToLine(lineKey: string) {
  const el = document.getElementById(`cert-line-${lineKey}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const check = document.getElementById(`cert-line-check-${lineKey}`);
    if (check instanceof HTMLElement) check.focus();
  }
}

export function ValidationStrip({ issues }: ValidationStripProps) {
  const deduped = dedupe(issues);
  if (deduped.length === 0) return null;

  // Errors first, warnings second; stable within a severity.
  const ordered = [
    ...deduped.filter((i) => i.severity === 'error'),
    ...deduped.filter((i) => i.severity === 'warning'),
  ];

  return (
    <div
      id="cert-validation"
      role="alert"
      className="space-y-1.5 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3"
    >
      {ordered.map((issue) => {
        const isError = issue.severity === 'error';
        const Icon = isError ? AlertCircle : AlertTriangle;
        const toneClass = isError ? 'text-cc-danger' : 'text-cc-warning';
        return (
          <div
            key={`${issue.code}::${issue.lineKey ?? ''}`}
            className="flex items-start gap-2 text-sm"
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${toneClass}`} aria-hidden="true" />
            <span className="text-cc-text-secondary">
              {issue.message}
              {issue.lineKey && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => scrollToLine(issue.lineKey as string)}
                    className="underline underline-offset-2 hover:text-cc-text-primary"
                  >
                    Go to line
                  </button>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
