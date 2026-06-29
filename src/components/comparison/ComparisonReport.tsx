import { Button } from '@/components/ui/button';
import { TrendingDown, AlertCircle, Check, X, AlertTriangle, Download } from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { PDFReport } from './PDFReport';
import type { ComparisonResult } from '@/types/insurance-comparison';
import { GapAnalysisCard } from './GapAnalysisCard';
import { SectionLabel, AccentSpine } from '@/components/cc';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ComparisonReportProps {
  comparison: ComparisonResult;
}

export const ComparisonReport = ({ comparison }: ComparisonReportProps) => {
  const { option1, option2, differences } = comparison;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const getCoverageStatus = (diff: any) => {
    if (diff.option1Value === 'Not Included' || diff.option2Value === 'Not Included') return 'gap';
    if (diff.advantage === 'neutral') return 'identical';
    return 'different';
  };

  const displayValue = (val?: string) => {
    if (!val) return 'N/A';
    const v = String(val).trim();
    if (/^yes$/i.test(v)) return 'Included';
    if (/^no$/i.test(v)) return 'Not Included';
    return v;
  };

  const hasGaps = differences.gaps && differences.gaps.length > 0;
  const criticalGaps = differences.gaps?.filter((g) => g.severity === 'critical') || [];

  // The single decision-positive signal on this surface: which option costs less.
  // That row carries the one lime accent; the download action stays a neutral
  // button so the surface keeps exactly one lime (matches the quote comparison grid).
  const premiums = [option1.totalPremium || 0, option2.totalPremium || 0];
  const cheaperIdx = premiums[0] === premiums[1] ? -1 : premiums[0] < premiums[1] ? 0 : 1;
  const options = [option1, option2];

  const eoConcerns =
    criticalGaps.length > 0
      ? `CRITICAL: ${criticalGaps.length} coverage gap${criticalGaps.length > 1 ? 's' : ''} identified that could expose the insured to significant financial risk. ${criticalGaps.map((g) => g.coverageType).join(', ')} missing.`
      : null;

  const topDifferences = differences.coverageDifferences
    .filter((d) => d.advantage !== 'neutral')
    .slice(0, 3)
    .map((d) => `${d.coverageType}: ${d.description}`);

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-cc-text-primary">Comparison report</h2>
          <p className="text-sm text-cc-text-muted">
            {option1.carrier} vs {option2.carrier}
          </p>
        </div>

        <PDFDownloadLink
          document={<PDFReport comparison={comparison} clientName={option1.insuredName} />}
          fileName={`insurance-comparison-${format(comparison.analysisDate, 'yyyy-MM-dd')}.pdf`}
        >
          {({ loading }) => (
            <Button
              disabled={loading}
              variant="outline"
              className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              <Download className="h-4 w-4" />
              {loading ? 'Generating PDF' : 'Download PDF report'}
            </Button>
          )}
        </PDFDownloadLink>
      </div>

      {/* Executive summary */}
      <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
        <div className="flex items-center justify-between border-b border-cc-border-subtle px-5 py-3">
          <SectionLabel>Executive summary</SectionLabel>
          <span className="text-xs text-cc-text-muted">Generated {format(comparison.analysisDate, 'PPP')}</span>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-cc-text-secondary">
            <span className="font-semibold text-cc-text-primary">{option1.carrier}</span> vs{' '}
            <span className="font-semibold text-cc-text-primary">{option2.carrier}</span>:{' '}
            {differences.premiumDifference < 0 ? 'Option 1' : 'Option 2'} is{' '}
            <span className="cc-num font-semibold text-cc-text-primary">
              {Math.abs(differences.premiumPercentage).toFixed(1)}%
            </span>{' '}
            more expensive ({formatCurrency(Math.abs(differences.premiumDifference))} difference).{' '}
            {hasGaps && (
              <span className="font-semibold text-cc-danger">
                {differences.gaps?.length} coverage gap{differences.gaps && differences.gaps.length > 1 ? 's' : ''}{' '}
                identified.
              </span>
            )}
          </p>

          {topDifferences.length > 0 && (
            <div>
              <SectionLabel>Top differences</SectionLabel>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                {topDifferences.map((diff, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="cc-num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-cc-surface-raised text-xs font-semibold text-cc-text-secondary">
                      {i + 1}
                    </span>
                    <span className="text-sm text-cc-text-secondary">{diff}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {eoConcerns && (
            <div className="rounded-cc-lg border border-cc-border-subtle bg-cc-surface-raised p-3">
              <div className="flex items-center gap-2 text-cc-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="text-sm font-semibold">E&O concerns</span>
              </div>
              <p className="mt-1 text-sm text-cc-text-secondary">{eoConcerns}</p>
            </div>
          )}
        </div>
      </section>

      {/* Gap analysis */}
      {differences.gaps && <GapAnalysisCard gaps={differences.gaps} />}

      {/* Coverage analysis table */}
      <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
        <div className="border-b border-cc-border-subtle px-5 py-3">
          <SectionLabel>Coverage analysis</SectionLabel>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-cc-border-subtle">
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-cc-text-muted">
                  Coverage
                </th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-cc-text-muted">
                  {option1.carrier}
                </th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-cc-text-muted">
                  {option2.carrier}
                </th>
                <th className="px-5 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-cc-text-muted">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {differences.coverageDifferences.map((diff, idx) => {
                const status = getCoverageStatus(diff);
                return (
                  <tr key={idx} className="border-b border-cc-border-subtle last:border-b-0">
                    <td className="px-5 py-3 text-sm font-medium text-cc-text-primary">{diff.coverageType}</td>
                    <td className="cc-num px-5 py-3 text-sm text-cc-text-secondary">{displayValue(diff.option1Value)}</td>
                    <td className="cc-num px-5 py-3 text-sm text-cc-text-secondary">{displayValue(diff.option2Value)}</td>
                    <td className="px-5 py-3">
                      {status === 'identical' && (
                        <div className="flex items-center justify-center gap-1 text-cc-success">
                          <Check className="h-4 w-4" aria-hidden="true" />
                          <span className="text-xs">Match</span>
                        </div>
                      )}
                      {status === 'different' && (
                        <div className="flex items-center justify-center gap-1 text-cc-warning">
                          <AlertCircle className="h-4 w-4" aria-hidden="true" />
                          <span className="text-xs">Differs</span>
                        </div>
                      )}
                      {status === 'gap' && (
                        <div className="flex items-center justify-center gap-1 text-cc-danger">
                          <X className="h-4 w-4" aria-hidden="true" />
                          <span className="text-xs font-medium">Gap</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Premium analysis: the cheaper option carries the single lime accent. */}
      <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
        <div className="border-b border-cc-border-subtle px-5 py-3">
          <SectionLabel>Premium analysis</SectionLabel>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((opt, idx) => (
              <AccentSpine key={idx} active={idx === cheaperIdx} className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-cc-text-primary">{opt.carrier}</div>
                  <div className="text-xs text-cc-text-muted">Annual premium</div>
                </div>
                <div className="flex items-center gap-2">
                  {idx === cheaperIdx && (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-cc-accent px-2 py-0.5 text-[11px] font-semibold text-cc-surface">
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                      Lower
                    </span>
                  )}
                  <span className="cc-num whitespace-nowrap text-lg font-bold text-cc-text-primary">
                    {formatCurrency(opt.totalPremium || 0)}
                  </span>
                </div>
              </AccentSpine>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-cc-lg bg-cc-surface-raised p-4">
            <div>
              <div className="text-xs text-cc-text-muted">Absolute difference</div>
              <div className="cc-num mt-0.5 text-lg font-bold text-cc-text-primary">
                {formatCurrency(Math.abs(differences.premiumDifference))}
              </div>
            </div>
            <div>
              <div className="text-xs text-cc-text-muted">Percentage difference</div>
              <div className="cc-num mt-0.5 text-lg font-bold text-cc-text-primary">
                {Math.abs(differences.premiumPercentage).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recommendation */}
      {comparison.recommendation && (
        <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-cc-border-subtle px-5 py-3">
            <AlertCircle className="h-4 w-4 text-cc-text-secondary" aria-hidden="true" />
            <SectionLabel>Recommendation</SectionLabel>
          </div>
          <p className="p-5 text-sm leading-relaxed text-cc-text-secondary">{comparison.recommendation}</p>
        </section>
      )}
    </div>
  );
};
