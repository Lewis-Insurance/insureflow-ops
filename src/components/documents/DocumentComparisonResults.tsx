import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { SectionLabel } from '@/components/cc';
import { cn } from '@/lib/utils';

interface DocumentComparisonResultsProps {
  comparisonData: any;
}

interface ParsedDoc {
  label: string;
  data: any;
}

// Premiums arrive as numbers (preferred) or as strings off the extractor. Coerce
// so the lowest-price comparison and the tabular figures stay correct either way.
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function fmtMoney(v: unknown): string {
  const n = toNumber(v);
  if (n === null) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export const DocumentComparisonResults: React.FC<DocumentComparisonResultsProps> = ({
  comparisonData,
}) => {
  if (!comparisonData?.documents || comparisonData.documents.length < 2) {
    return (
      <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-12 text-center text-sm text-cc-text-secondary shadow-card">
        No comparison data available. Upload at least two documents to compare.
      </div>
    );
  }

  const parsedDocs: ParsedDoc[] = comparisonData.documents.map((doc: any) => ({
    label: doc.label,
    data: doc.analysis?.data || doc.analysis?.analysis?.parsed_data || {},
  }));

  const allCoverageTypes = new Set<string>();
  parsedDocs.forEach((doc) => {
    doc.data.coverages?.forEach((cov: any) => allCoverageTypes.add(cov.type));
  });
  const coverageTypes = Array.from(allCoverageTypes);

  // The single decision-positive signal on this surface: which option costs least.
  // That carrier column carries the one lime accent; every other figure stays
  // neutral so price is read by the eye, not by hue.
  const premiums = parsedDocs.map((d) => toNumber(d.data.total_premium));
  const valid = premiums.filter((p): p is number => p !== null);
  const minPremium = valid.length > 1 ? Math.min(...valid) : null;
  const lowestIdx = minPremium === null ? -1 : premiums.findIndex((p) => p === minPremium);

  // Column template: a label column then one equal column per document. Used by
  // the head, the basic-info rows and each coverage row so figures align exactly.
  const cols = {
    gridTemplateColumns: `minmax(140px,180px) repeat(${parsedDocs.length}, minmax(0,1fr))`,
  };

  const Row: React.FC<{
    label: React.ReactNode;
    emphasis?: boolean;
    children: (doc: ParsedDoc, idx: number) => React.ReactNode;
  }> = ({ label, emphasis, children }) => (
    <div
      className={cn(
        'grid items-center gap-4 border-b border-cc-border-subtle px-4 py-3 last:border-b-0',
        emphasis && 'bg-cc-surface-raised',
      )}
      style={cols}
    >
      <div className={cn('text-sm', emphasis ? 'font-semibold text-cc-text-primary' : 'text-cc-text-secondary')}>
        {label}
      </div>
      {parsedDocs.map((doc, idx) => (
        <div
          key={idx}
          className={cn(
            'min-w-0',
            idx === lowestIdx && emphasis && 'border-l-2 border-l-cc-accent pl-3 -ml-px',
          )}
        >
          {children(doc, idx)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Side-by-side comparison: one dense, aligned table. Carrier columns up top, */}
      {/* the lowest total premium carries the single lime accent. */}
      <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Column heads: document label + Best-price marker on the cheapest */}
            <div className="grid gap-4 border-b border-cc-border-subtle px-4 py-3" style={cols}>
              <SectionLabel>Field</SectionLabel>
              {parsedDocs.map((doc, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex flex-wrap items-center gap-2',
                    idx === lowestIdx && 'border-l-2 border-l-cc-accent pl-3 -ml-px',
                  )}
                >
                  <span className="truncate text-sm font-semibold text-cc-text-primary">{doc.label}</span>
                  {idx === lowestIdx && (
                    <span className="rounded-pill bg-cc-accent px-2 py-0.5 text-[11px] font-semibold text-cc-surface">
                      Best price
                    </span>
                  )}
                </div>
              ))}
            </div>

            <Row label="Carrier">
              {(doc) => (
                <span className="truncate text-sm text-cc-text-primary">{doc.data.carrier_name || 'N/A'}</span>
              )}
            </Row>
            <Row label="Policy number">
              {(doc) => (
                <span className="cc-num truncate text-sm text-cc-text-secondary">
                  {doc.data.policy_number || 'N/A'}
                </span>
              )}
            </Row>
            <Row label="Effective">
              {(doc) => <span className="text-sm text-cc-text-secondary">{doc.data.effective_date || 'N/A'}</span>}
            </Row>
            <Row label="Expiration">
              {(doc) => <span className="text-sm text-cc-text-secondary">{doc.data.expiration_date || 'N/A'}</span>}
            </Row>
            <Row label="Total premium" emphasis>
              {(doc, idx) => (
                <span
                  className={cn(
                    'cc-num whitespace-nowrap text-lg font-bold',
                    idx === lowestIdx ? 'text-cc-accent' : 'text-cc-text-primary',
                  )}
                >
                  {fmtMoney(doc.data.total_premium)}
                </span>
              )}
            </Row>
          </div>
        </div>
      </section>

      {/* Coverage comparison: each coverage type aligned across the same columns. */}
      {coverageTypes.length > 0 && (
        <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
          <div className="border-b border-cc-border-subtle px-4 py-3">
            <SectionLabel>Coverage comparison</SectionLabel>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              {coverageTypes.map((coverageType) => (
                <Row key={coverageType} label={coverageType}>
                  {(doc) => {
                    const coverage = doc.data.coverages?.find((c: any) => c.type === coverageType);
                    if (!coverage) {
                      return (
                        <span className="inline-flex items-center gap-1.5 text-sm text-cc-danger">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          Not covered
                        </span>
                      );
                    }
                    return (
                      <div className="space-y-0.5 text-sm">
                        {coverage.limit && (
                          <div className="text-cc-text-primary">
                            <span className="text-cc-text-muted">Limit </span>
                            <span className="cc-num">{coverage.limit}</span>
                          </div>
                        )}
                        {coverage.deductible && (
                          <div className="text-cc-text-secondary">
                            <span className="text-cc-text-muted">Deductible </span>
                            <span className="cc-num">{coverage.deductible}</span>
                          </div>
                        )}
                        {coverage.premium && (
                          <div className="cc-num whitespace-nowrap text-cc-text-secondary">
                            {fmtMoney(coverage.premium)}
                          </div>
                        )}
                      </div>
                    );
                  }}
                </Row>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Coverage gaps: a genuine warning state, so it uses the warning tone (not */}
      {/* the lime accent). Clean documents read calm with a quiet success check. */}
      {coverageTypes.length > 0 && (
        <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
          <div className="border-b border-cc-border-subtle px-4 py-3">
            <SectionLabel>Coverage gaps</SectionLabel>
          </div>
          <div className="space-y-2 p-4">
            {parsedDocs.map((doc, idx) => {
              const missing = coverageTypes.filter(
                (type) => !doc.data.coverages?.some((c: any) => c.type === type),
              );
              if (missing.length === 0) {
                return (
                  <div key={idx} className="flex items-center gap-2 rounded-cc-md bg-cc-surface-raised px-3 py-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-cc-success" aria-hidden="true" />
                    <span className="text-sm font-medium text-cc-text-primary">{doc.label}</span>
                    <span className="text-sm text-cc-text-muted">No coverage gaps</span>
                  </div>
                );
              }
              return (
                <div key={idx} className="rounded-cc-md bg-cc-surface-raised px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-cc-warning" aria-hidden="true" />
                    <span className="text-sm font-medium text-cc-text-primary">{doc.label}</span>
                    <span className="text-sm text-cc-text-muted">
                      {missing.length} missing
                    </span>
                  </div>
                  <ul className="ml-6 mt-1.5 space-y-0.5">
                    {missing.map((coverage, covIdx) => (
                      <li key={covIdx} className="text-sm text-cc-text-secondary">
                        {coverage}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
