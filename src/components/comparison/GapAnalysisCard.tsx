import { AlertTriangle, AlertOctagon, Info, CheckCircle2 } from 'lucide-react';
import { SectionLabel } from '@/components/cc';
import { cn } from '@/lib/utils';

interface GapAnalysis {
  coverageType: string;
  missingIn: 'option1' | 'option2';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

interface GapAnalysisCardProps {
  gaps: GapAnalysis[];
}

// Severity drives a semantic state tone, never the lime accent.
const severityTone = (severity: string): string => {
  switch (severity) {
    case 'critical':
      return 'text-cc-danger';
    case 'high':
    case 'medium':
      return 'text-cc-warning';
    default:
      return 'text-cc-text-muted';
  }
};

const SeverityIcon = ({ severity }: { severity: string }) => {
  if (severity === 'critical') return <AlertOctagon className={cn('h-5 w-5 shrink-0', severityTone(severity))} aria-hidden="true" />;
  if (severity === 'high' || severity === 'medium')
    return <AlertTriangle className={cn('h-5 w-5 shrink-0', severityTone(severity))} aria-hidden="true" />;
  return <Info className={cn('h-5 w-5 shrink-0', severityTone(severity))} aria-hidden="true" />;
};

export const GapAnalysisCard = ({ gaps }: GapAnalysisCardProps) => {
  if (gaps.length === 0) {
    return (
      <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-cc-border-subtle px-5 py-3">
          <CheckCircle2 className="h-4 w-4 text-cc-success" aria-hidden="true" />
          <SectionLabel>Gap analysis</SectionLabel>
        </div>
        <p className="p-5 text-sm text-cc-text-secondary">
          Both options provide comprehensive coverage with no major gaps detected.
        </p>
      </section>
    );
  }

  const criticalGaps = gaps.filter((g) => g.severity === 'critical');
  const otherGaps = gaps.filter((g) => g.severity !== 'critical');

  return (
    <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-cc-border-subtle px-5 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-cc-text-secondary" aria-hidden="true" />
          <SectionLabel>Gap analysis</SectionLabel>
        </div>
        {criticalGaps.length > 0 ? (
          <span className="cc-num text-xs font-medium text-cc-danger">
            {criticalGaps.length} critical gap{criticalGaps.length > 1 ? 's' : ''}
          </span>
        ) : (
          otherGaps.length > 0 && (
            <span className="cc-num text-xs text-cc-text-muted">
              {otherGaps.length} potential improvement{otherGaps.length > 1 ? 's' : ''}
            </span>
          )
        )}
      </div>

      <div className="space-y-4 p-5">
        {criticalGaps.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-cc-danger">Critical issues</h4>
            {criticalGaps.map((gap, idx) => (
              <div key={idx} className="rounded-cc-lg border border-cc-border-subtle bg-cc-surface-raised p-3">
                <div className="flex items-start gap-3">
                  <SeverityIcon severity={gap.severity} />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-cc-text-primary">{gap.coverageType}</p>
                      <span className="rounded-pill bg-cc-surface-overlay px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-cc-danger">
                        {gap.severity}
                      </span>
                    </div>
                    <p className="text-sm text-cc-text-secondary">{gap.description}</p>
                    <p className="mt-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface p-2 text-xs text-cc-text-secondary">
                      <span className="font-semibold text-cc-text-primary">Recommendation:</span> {gap.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {otherGaps.length > 0 && (
          <div className="space-y-3">
            {criticalGaps.length > 0 && <div className="border-t border-cc-border-subtle pt-4" />}
            <h4 className="text-sm font-medium text-cc-text-primary">Additional considerations</h4>
            {otherGaps.map((gap, idx) => (
              <div key={idx} className="space-y-2 rounded-cc-lg border border-cc-border-subtle p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SeverityIcon severity={gap.severity} />
                    <p className="text-sm font-medium text-cc-text-primary">{gap.coverageType}</p>
                  </div>
                  <span className={cn('rounded-pill bg-cc-surface-overlay px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', severityTone(gap.severity))}>
                    {gap.severity}
                  </span>
                </div>
                <p className="text-sm text-cc-text-secondary">{gap.description}</p>
                <p className="rounded-cc-md bg-cc-surface-raised p-2 text-xs text-cc-text-secondary">
                  <span className="font-semibold text-cc-text-primary">Recommendation:</span> {gap.recommendation}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
