import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Check, Loader2, Plus, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, StatusPill } from '@/components/cc';
import { AddCustomerModal } from '@/components/customers/AddCustomerModal';
import { ExtractWritebackProposalsPanel } from '@/components/document-analysis/ExtractWritebackProposalsPanel';
import { useExtractAccountMatch } from '@/hooks/useExtractAccountMatch';
import { readExtractSnapshot, type ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import {
  confidenceLabel,
  lineCategoryLabel,
  type LineCategory,
} from '@/lib/extractAccountMatch';

type DocumentAnalysisMatchRecord = {
  id: string;
  account_id?: string | null;
  document_id?: string | null;
  extracted_data?: unknown;
  analysis_result?: unknown;
};

interface ExtractAccountMatchPanelProps {
  analysis: DocumentAnalysisMatchRecord;
}

export function ExtractAccountMatchPanel({ analysis }: ExtractAccountMatchPanelProps) {
  const snapshot = useMemo(
    () => readExtractSnapshot(analysis.analysis_result ?? analysis.extracted_data),
    [analysis.analysis_result, analysis.extracted_data],
  );

  const {
    candidates,
    proposing,
    proposeError,
    booking,
    defaultLineCategory,
    linkedAccount,
    linkedAccountLoading,
    persistPick,
    persisting,
  } = useExtractAccountMatch({
    analysisId: analysis.id,
    snapshot,
    accountId: analysis.account_id,
    documentId: analysis.document_id,
    extractedData: analysis.extracted_data,
  });

  const [lineCategory, setLineCategory] = useState<LineCategory>(booking.line_category);
  const [lineOverridden, setLineOverridden] = useState(booking.line_category_source === 'override');
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  useEffect(() => {
    setLineCategory(booking.line_category);
    setLineOverridden(booking.line_category_source === 'override');
  }, [booking.line_category, booking.line_category_source]);

  const handleLineCategoryChange = (next: LineCategory) => {
    setLineCategory(next);
    setLineOverridden(next !== defaultLineCategory);
  };

  const handleUseAccount = (accountId: string) => {
    persistPick(accountId, lineCategory, lineOverridden);
  };

  const handleAccountCreated = (accountId?: string) => {
    if (accountId) {
      handleUseAccount(accountId);
    }
  };

  if (analysis.account_id) {
    return (
      <div className="space-y-4">
        <Card className="border-cc-border bg-cc-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-cc-text">
              <Check className="h-5 w-5 text-success" />
              Linked account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {linkedAccountLoading ? (
              <div className="flex items-center gap-2 text-sm text-cc-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading linked account...
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-cc-lg border border-cc-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-cc-text">
                    {linkedAccount?.name ?? 'Linked account'}
                  </p>
                  <p className="text-sm text-cc-text-muted">
                    Line: {lineCategoryLabel(booking.line_category)}
                    {booking.line_category_source === 'override' ? ' (overridden)' : ' (from snapshot)'}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/customers/${analysis.account_id}`}>Open customer record</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <ExtractWritebackProposalsPanel
          analysisId={analysis.id}
          accountId={analysis.account_id}
          snapshot={snapshot}
          lineCategory={booking.line_category}
        />
      </div>
    );
  }

  return (
    <>
      <Card className="border-cc-border bg-cc-surface">
        <CardHeader>
          <CardTitle className="text-cc-text">Match to account</CardTitle>
          <p className="text-sm text-cc-text-muted">
            Choose an existing account for this extract, or create a new one.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
              Line category
            </p>
            <div className="flex flex-wrap gap-2">
              {(['personal', 'commercial'] as const).map((option) => {
                const selected = lineCategory === option;
                const Icon = option === 'commercial' ? Building2 : UserRound;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleLineCategoryChange(option)}
                    className={
                      'inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-sm transition-colors ' +
                      (selected
                        ? 'border-l-2 border-cc-border-subtle border-l-cc-accent bg-cc-surface-raised text-cc-text-primary'
                        : 'border-cc-border-subtle bg-cc-surface text-cc-text-secondary hover:bg-cc-surface-overlay')
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {lineCategoryLabel(option)}
                  </button>
                );
              })}
            </div>
            {snapshot.insured_name && (
              <p className="text-sm text-cc-text-muted">
                Insured from extract: <span className="text-cc-text-secondary">{snapshot.insured_name}</span>
              </p>
            )}
          </div>

          {proposing && (
            <div className="flex items-center gap-2 text-sm text-cc-text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-cc-accent" />
              Finding account matches...
            </div>
          )}

          {proposeError && (
            <p className="text-sm text-destructive">{proposeError}</p>
          )}

          {!proposing && !proposeError && candidates.length === 0 && (
            <p className="text-sm text-cc-text-muted">
              No account matches found. Create a new account to continue.
            </p>
          )}

          {!proposing && candidates.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                Suggested matches
              </p>
              <div className="space-y-2">
                {candidates.map((candidate) => (
                  <div
                    key={candidate.accountId}
                    className="flex flex-col gap-3 rounded-cc-lg border border-cc-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate font-medium text-cc-text">{candidate.name}</p>
                      <p className="text-sm text-cc-text-muted">{candidate.matchReason}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          override={{
                            label: confidenceLabel(candidate.confidence),
                            tone: candidate.confidence === 'high' ? 'success' : 'neutral',
                          }}
                        />
                        <Chip>{candidate.source.replace(/_/g, ' ')}</Chip>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0 bg-cc-accent text-white hover:bg-cc-accent/90"
                      disabled={persisting}
                      onClick={() => handleUseAccount(candidate.accountId)}
                    >
                      {persisting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Use this account'
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-cc-border-subtle pt-4">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setAddCustomerOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create new account
            </Button>
          </div>
        </CardContent>
      </Card>

      <AddCustomerModal
        open={addCustomerOpen}
        onOpenChange={setAddCustomerOpen}
        onSuccess={handleAccountCreated}
      />
    </>
  );
}
