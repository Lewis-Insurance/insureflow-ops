// Full Master COI page (route /master-coi/:accountId).
//
// The dedicated home for a customer's certificate profile: the complete,
// editable Master COI panel (named insured, all five coverage lines with the
// coverage-line drawer, insurer table, certificate defaults, review stamp). The
// customer record shows only MasterCOISummaryCard and links here via "Open full
// Master COI", mirroring the "View full policy" pattern. This page reuses
// MasterCOISection verbatim so there is a single source of truth for the panel.

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { MasterCOISection } from '@/components/customers/MasterCOISection';

export default function MasterCOIPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();

  const { data: account } = useQuery({
    queryKey: ['account-min', accountId],
    enabled: Boolean(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('id', accountId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!accountId) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <p className="text-sm text-cc-text-muted">No customer specified.</p>
        </div>
      </AppLayout>
    );
  }

  const accountName = account?.name ?? undefined;

  return (
    <AppLayout>
      <div className="container mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/customers/${accountId}`)}
            className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to customer
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-cc-text-primary">
              Master COI
            </h1>
            {accountName && (
              <p className="break-words text-sm text-cc-text-muted">
                {accountName}
              </p>
            )}
          </div>
        </div>

        <MasterCOISection accountId={accountId} accountName={accountName} />
      </div>
    </AppLayout>
  );
}
