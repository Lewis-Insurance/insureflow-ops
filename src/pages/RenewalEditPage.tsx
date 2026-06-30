import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton } from '@/components/cc';
import { useRenewal } from '@/hooks/useRenewalWorkflow';
import { RenewalTopBar } from '@/components/renewals/RenewalTopBar';
import { UpdateRenewalWidget } from '@/components/renewals/UpdateRenewalWidget';
import { RenewalPolicyInfoPanel } from '@/components/renewals/RenewalPolicyInfoPanel';
import { RenewalQuotesPanel } from '@/components/renewals/RenewalQuotesPanel';
import { RenewalContactPanel } from '@/components/renewals/RenewalContactPanel';

/**
 * Renewal detail — three regions only: Top Bar (identity), Hero (Update Renewal), and the
 * read-only Policy Info rail (durable facts + shared quotes/contact). Editing a renewal here
 * writes through to the policy + customer page via the hero's terminal commits.
 */
export default function RenewalEditPage() {
  const { id } = useParams<{ id: string }>();
  const { data: renewal, isLoading } = useRenewal(id);

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-28 w-full rounded-cc-xl" />
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Skeleton className="h-[30rem] w-full rounded-cc-xl" />
              <Skeleton className="h-80 w-full rounded-cc-xl" />
            </div>
          </div>
        ) : !renewal ? (
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-10 text-center shadow-card">
            <p className="font-semibold text-cc-text-primary">Renewal not found</p>
            <p className="mt-1 text-sm text-cc-text-muted">
              It may have been removed, or the link is out of date.
            </p>
          </div>
        ) : (
          <>
            <RenewalTopBar renewal={renewal} />
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <UpdateRenewalWidget key={renewal.id} renewal={renewal} />
              <div className="space-y-6">
                <RenewalPolicyInfoPanel renewal={renewal} />
                <RenewalQuotesPanel renewal={renewal} />
                <RenewalContactPanel renewal={renewal} />
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
