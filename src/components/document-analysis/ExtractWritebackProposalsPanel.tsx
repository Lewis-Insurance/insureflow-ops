import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, Skeleton, StatusPill } from '@/components/cc';
import { QuoteVsIncumbentComparison } from '@/components/quotes/QuoteVsIncumbentComparison';
import { ClientEnglishPackPanel } from '@/components/document-analysis/ClientEnglishPackPanel';
import { useExtractWritebackProposals } from '@/hooks/useExtractWritebackProposals';
import {
  proposalCoverageCount,
  proposalPremiumFromPayload,
  type ProposedQuotePayload,
} from '@/lib/extractWritebackProposal';
import type { LineCategory } from '@/lib/extractAccountMatch';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import { formatCurrency } from '@/lib/utils';

interface ExtractWritebackProposalsPanelProps {
  analysisId: string;
  accountId: string;
  snapshot: ExtractSnapshotV1;
  lineCategory: LineCategory;
}

function formatPremium(payload: ProposedQuotePayload): string {
  const premium = proposalPremiumFromPayload(payload);
  if (premium === null) return 'Premium not extracted';
  return formatCurrency(premium);
}

function ProposalRowSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-cc-lg border border-cc-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16 rounded-pill" />
          <Skeleton className="h-5 w-20 rounded-pill" />
        </div>
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex shrink-0 gap-2">
        <Skeleton className="h-9 w-20 rounded-cc-md" />
        <Skeleton className="h-9 w-36 rounded-cc-md" />
      </div>
    </div>
  );
}

export function ExtractWritebackProposalsPanel({
  analysisId,
  accountId,
  snapshot,
  lineCategory,
}: ExtractWritebackProposalsPanelProps) {
  const {
    proposals,
    appliedProposals,
    proposalsLoading,
    proposalsFetching,
    appliedProposalsLoading,
    proposalsError,
    ensuring,
    rejecting,
    confirming,
    rejectProposal,
    confirmProposal,
  } = useExtractWritebackProposals({
    analysisId,
    accountId,
    snapshot,
    lineCategory,
  });

  const isLoadingEmpty =
    (proposalsLoading || proposalsFetching || ensuring) && proposals.length === 0;

  if (
    !proposalsLoading &&
    !proposalsFetching &&
    !ensuring &&
    !appliedProposalsLoading &&
    proposals.length === 0 &&
    appliedProposals.length === 0 &&
    !proposalsError
  ) {
    return null;
  }

  const appliedWithQuote = (appliedProposals ?? []).filter((p) => p.quote_id);

  return (
    <Card className="border-cc-border bg-cc-surface" data-testid="writeback-proposals-panel">
      <CardHeader>
        <CardTitle className="text-cc-text">Write-back proposals</CardTitle>
        <p className="text-sm text-cc-text-muted">
          Review extracted quote data before it is written to the account. Reject dismisses a
          proposal. Confirm books a real quote on the linked account.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {proposalsError ? (
          <p className="text-sm text-destructive">
            {proposalsError instanceof Error
              ? proposalsError.message
              : 'Could not load write-back proposals.'}
          </p>
        ) : null}

        {isLoadingEmpty ? (
          <>
            <ProposalRowSkeleton />
            <ProposalRowSkeleton />
          </>
        ) : null}

        {proposals.map((proposal) => {
          const payload = proposal.proposed_quote;
          const coverageCount = proposalCoverageCount(payload);

          return (
            <div
              key={proposal.id}
              className="flex flex-col gap-3 rounded-cc-lg border border-cc-border p-4 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`writeback-proposal-${proposal.id}`}
            >
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-cc-text">{proposal.carrier_name}</p>
                  <StatusPill
                    override={{
                      label: 'Pending',
                      tone: 'neutral',
                    }}
                  />
                  <Chip>{proposal.line_class}</Chip>
                </div>
                <p className="text-sm text-cc-text-muted">
                  {formatPremium(payload)}
                  {' · '}
                  {coverageCount} coverage{coverageCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rejecting || confirming || proposal.status !== 'pending'}
                  onClick={() => rejectProposal(proposal.id)}
                >
                  {rejecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  data-primary
                  disabled={rejecting || confirming || proposal.status !== 'pending'}
                  onClick={() => confirmProposal(proposal.id)}
                >
                  {confirming ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Booking...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Confirm to book
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>

      {appliedWithQuote.length > 0 ? (
        <CardContent className="space-y-4 border-t border-cc-border pt-4">
          <div>
            <p className="text-sm font-medium text-cc-text">Booked quote comparison</p>
            <p className="text-sm text-cc-text-muted">
              Structured delta vs the incumbent policy on this account. No second OCR.
            </p>
          </div>
          {appliedWithQuote.map((proposal) => {
            const payload = proposal.proposed_quote;
            if (!proposal.quote_id) return null;
            return (
              <div key={proposal.id} className="space-y-3">
                <p className="text-sm text-cc-text-muted">
                  {proposal.carrier_name} · booked quote
                </p>
                <QuoteVsIncumbentComparison
                  accountId={accountId}
                  quoteId={proposal.quote_id}
                  quoteLineOfBusiness={payload.quote.line_of_business}
                  policyNumberHint={snapshot.policy_number}
                  carrierHint={proposal.carrier_name}
                  claimsMade={snapshot.claims_made}
                  defenseInsideLimits={snapshot.defense_inside_limits}
                />
                <ClientEnglishPackPanel
                  snapshot={snapshot}
                  confirmedSnapshotHash={proposal.snapshot_hash}
                  accountId={accountId}
                  quoteId={proposal.quote_id}
                  quoteLineOfBusiness={payload.quote.line_of_business}
                  carrierHint={proposal.carrier_name}
                />
              </div>
            );
          })}
        </CardContent>
      ) : null}
    </Card>
  );
}
