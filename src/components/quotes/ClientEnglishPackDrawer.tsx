import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ClientEnglishPackPanel } from '@/components/document-analysis/ClientEnglishPackPanel';
import { Skeleton } from '@/components/cc';
import { supabase } from '@/integrations/supabase/client';
import { readExtractSnapshot } from '@/lib/extractSnapshot';
import { useQuoteIncumbentComparison } from '@/hooks/useQuoteIncumbentComparison';

interface ClientEnglishPackDrawerProps {
  accountId: string;
  quoteId: string;
  quoteLineOfBusiness: string;
  carrierHint?: string | null;
}

interface AppliedExtractProposalRow {
  document_analysis_id: string;
  snapshot_hash: string;
}

function isAppliedExtractProposalRow(value: unknown): value is AppliedExtractProposalRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.document_analysis_id === 'string' && typeof row.snapshot_hash === 'string';
}

export function ClientEnglishPackDrawer({ accountId, quoteId, quoteLineOfBusiness, carrierHint }: ClientEnglishPackDrawerProps) {
  const packQuery = useQuery({
    queryKey: ['client-english-pack-source', quoteId],
    queryFn: async () => {
      const { data: proposal, error } = await supabase
        // The generated database types predate this migration.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('extract_writeback_proposals' as any)
        .select('document_analysis_id, snapshot_hash')
        .eq('quote_id', quoteId)
        .eq('status', 'applied')
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!proposal) return null;
      if (!isAppliedExtractProposalRow(proposal)) throw new Error('Applied extract proposal is missing required fields.');
      const { data: analysis, error: analysisError } = await supabase.from('document_analysis').select('analysis_result, extracted_data, policy_id').eq('id', proposal.document_analysis_id).single();
      if (analysisError) throw analysisError;
      return { snapshot: readExtractSnapshot(analysis.analysis_result ?? analysis.extracted_data), snapshotHash: proposal.snapshot_hash, policyId: analysis.policy_id };
    },
  });
  const comparison = useQuoteIncumbentComparison({ accountId, quoteId, quoteLineOfBusiness, carrierHint, enabled: Boolean(packQuery.data) });

  return (
    <Sheet>
      <SheetTrigger asChild><Button type="button" size="sm" variant="outline" className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay">Client summary</Button></SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto border-cc-border-subtle bg-cc-surface-overlay sm:max-w-xl">
        <SheetHeader><SheetTitle className="text-cc-text-primary">Client coverage summary</SheetTitle><SheetDescription>Review the confirmed extract in plain English before release.</SheetDescription></SheetHeader>
        <div className="mt-5">
          {packQuery.isLoading ? <div className="space-y-4" aria-label="Loading client summary"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-24 w-full rounded-cc-lg" /><Skeleton className="h-40 w-full rounded-cc-lg" /></div> : null}
          {packQuery.error ? <p role="alert" className="text-sm text-cc-danger">Could not load the confirmed extract.</p> : null}
          {!packQuery.isLoading && !packQuery.data ? <p className="text-sm text-cc-text-muted">Confirm an extracted quote before creating a client summary.</p> : null}
          {packQuery.data ? <ClientEnglishPackPanel snapshot={packQuery.data.snapshot} confirmedSnapshotHash={packQuery.data.snapshotHash} accountId={accountId} policyId={packQuery.data.policyId} delta={comparison.diffResult} embedded /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
