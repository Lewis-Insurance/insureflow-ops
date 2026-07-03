import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, ListChecks, UserPlus, FileCheck2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { CustomerPickerEmptyState } from '@/components/certificates/CustomerPickerEmptyState';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Certificates page (ACORD 25 Certificate of Liability Insurance).
 *
 * Phase 1 scaffold (COI Module, docs/coi-module/06-ui-surfaces.md Sec 4.4 / Sec 5):
 * the route and its entry points are live and wrapped in ProtectedRoute, but live
 * generation is deferred to Phase 5. This shell renders:
 *  - no ?accountId: a customer picker (CustomerPickerEmptyState);
 *  - ?accountId present: an honest "coming online" empty state naming what the
 *    generator will do (pick coverage lines, add a certificate holder, issue an
 *    ACORD 25), with the customer name for a designed feel when it resolves.
 *
 * Calm Command: cc-* tokens (light + dark), tabular figures, one sentence + one
 * action on the empty state, ZERO lime (the page's single lime is the Phase 5
 * Generate button, not present yet), no em or en dashes.
 */
export default function Certificates() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId');

  const [accountName, setAccountName] = useState<string | null>(null);

  // Lightweight name fetch for a designed feel. Degrades gracefully: any failure
  // just leaves the generic copy in place (no throw, no error surface).
  useEffect(() => {
    let active = true;
    setAccountName(null);
    if (!accountId) return;
    (async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('name')
        .eq('id', accountId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        logger.warn('certificates: account name lookup failed', error);
        return;
      }
      setAccountName((data?.name as string | undefined) ?? null);
    })();
    return () => {
      active = false;
    };
  }, [accountId]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1400px] space-y-6 p-6">
        <header className="space-y-2">
          {accountId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/customers/${accountId}`)}
              className="gap-2 text-cc-text-secondary hover:text-cc-text-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to customer
            </Button>
          )}
          <h1 className="text-2xl font-semibold text-cc-text-primary">Certificates</h1>
          <p className="text-cc-text-muted">
            ACORD 25 Certificate of Liability Insurance
            {accountName ? (
              <>
                {' for '}
                <span className="font-medium text-cc-text-primary">{accountName}</span>
              </>
            ) : null}
          </p>
        </header>

        {!accountId ? <CustomerPickerEmptyState /> : <ComingOnlineState />}
      </div>
    </AppLayout>
  );
}

/**
 * The account-scoped empty state. Honest about the phased rollout: the generator
 * is not wired yet, and this says so while naming what it will do. One sentence of
 * primary copy plus a short read-only capability list; no live generation control.
 */
function ComingOnlineState() {
  const steps: { icon: typeof ListChecks; text: string }[] = [
    { icon: ListChecks, text: 'Pick the coverage lines to include.' },
    { icon: UserPlus, text: 'Add the certificate holder.' },
    { icon: FileCheck2, text: 'Issue the ACORD 25 and send it.' },
  ];

  return (
    <div className="mx-auto max-w-xl rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-8 shadow-card">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-cc-md bg-cc-surface-raised text-cc-text-secondary">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold text-cc-text-primary">Certificate generation is coming online here</h2>
        <p className="max-w-md text-sm text-cc-text-secondary">
          This is where you will build and issue this customer's certificate. It is being wired up now.
        </p>
      </div>

      <ul className="mt-6 space-y-2">
        {steps.map(({ icon: Icon, text }) => (
          <li
            key={text}
            className="flex items-center gap-3 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised px-3 py-2.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-cc-sm bg-cc-surface-overlay text-cc-text-secondary">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-sm text-cc-text-secondary">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
