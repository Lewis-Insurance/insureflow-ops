import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Chip, SectionLabel, StatusPill } from '@/components/cc';
import { supabase } from '@/integrations/supabase/client';
import { buildClientEnglishPack } from '@/lib/clientEnglishPack';
import { renderClientEnglishPackPdf } from '@/lib/clientEnglishPackPdf';
import { hashExtractSnapshot } from '@/lib/extractWritebackProposal';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import type { QuoteIncumbentDiffResult } from '@/lib/quoteIncumbent/diffQuoteIncumbent';
import {
  STALE_EXTRACT_MESSAGE,
  ClientEnglishPackDeliveryError,
  useClientEnglishPackSend,
  type StagedClientEnglishPackSend,
} from '@/hooks/useClientEnglishPackSend';
import { useQuoteIncumbentComparison } from '@/hooks/useQuoteIncumbentComparison';

interface DeliveryContext {
  accountEmail: string | null;
  portalEmail: string | null;
  firstName: string | null;
  agencyName: string;
  agencyPhone: string;
}

export interface ClientEnglishPackPanelProps {
  snapshot: ExtractSnapshotV1;
  confirmedSnapshotHash: string;
  accountId: string;
  policyId?: string | null;
  delta?: QuoteIncumbentDiffResult | null;
  quoteId?: string | null;
  quoteLineOfBusiness?: string | null;
  carrierHint?: string | null;
  embedded?: boolean;
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function PackPreview({ snapshot, delta, delivery }: Pick<ClientEnglishPackPanelProps, 'snapshot' | 'delta'> & { delivery: DeliveryContext }) {
  const pack = useMemo(() => buildClientEnglishPack(snapshot, delta ?? undefined, {
    agencyName: delivery.agencyName,
    agencyPhone: delivery.agencyPhone,
  }), [snapshot, delta, delivery.agencyName, delivery.agencyPhone]);

  return (
    <div className="space-y-5 rounded-cc-lg border border-cc-border-subtle bg-cc-surface p-5" data-testid="client-english-pack-preview">
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-cc-text-primary">{pack.insuredName ?? 'Insured name not listed'}</h3>
        <div className="flex flex-wrap gap-2">{pack.carriers.map((carrier) => <Chip key={carrier}>{carrier}</Chip>)}</div>
        <p className="font-mono text-sm text-cc-text-secondary cc-num">{pack.policyNumber ?? 'Policy number not listed'}</p>
        {(pack.effectiveDate || pack.expirationDate) ? <p className="text-sm text-cc-text-muted">Effective {pack.effectiveDate ?? 'not listed'} to {pack.expirationDate ?? 'not listed'}</p> : null}
      </div>

      <section className="space-y-2">
        <SectionLabel>What you have</SectionLabel>
        {pack.coverages.map((coverage, index) => (
          <div key={`${coverage.name}-${index}`} className={coverage.includedWith ? 'ml-4 border-l border-cc-border-subtle pl-3' : ''}>
            <p className="font-medium text-cc-text-primary">{coverage.name}</p>
            {coverage.includedWith ? <p className="text-xs text-cc-text-muted">Included with {coverage.includedWith}</p> : null}
            <p className="text-sm text-cc-text-secondary">
              {[coverage.limit && `Limit ${coverage.limit}`, coverage.deductible && `Deductible ${coverage.deductible}`, coverage.premium && `${coverage.premium} of your total`].filter(Boolean).join(' | ') || 'No limit or deductible listed'}
            </p>
          </div>
        ))}
        {pack.vehicles.map((vehicle, index) => <p key={index} className="text-sm text-cc-text-secondary">Vehicle: {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}</p>)}
      </section>

      <section className="space-y-2">
        <SectionLabel>What it costs</SectionLabel>
        {pack.premium.total !== null ? <p className="font-mono text-lg font-semibold text-cc-text-primary cc-num">{money(pack.premium.total)} {pack.premium.frequency ?? ''}</p> : null}
        {pack.fees.length ? pack.fees.map((fee, index) => <p key={`${fee.label}-${index}`} className="text-sm text-cc-text-secondary">{fee.label}: {fee.amount === null ? 'Not listed' : money(fee.amount)}</p>) : <p className="text-sm text-cc-text-secondary">No separate fees are listed on the documents we reviewed.</p>}
        {pack.computedTotal !== null ? <p className="font-mono text-sm font-semibold text-cc-text-primary cc-num">Premium and listed fees: {money(pack.computedTotal)}</p> : null}
        {pack.flags.map((flag) => <p key={flag} className="text-sm text-cc-text-secondary">{flag}</p>)}
      </section>

      {pack.changes.length ? <section className="space-y-2"><SectionLabel>What changed from your current policy</SectionLabel>{pack.changes.map((change) => <p key={`${change.label}-${change.oldValue}`} className="text-sm text-cc-text-secondary">{change.label}: {change.oldValue} to {change.newValue}</p>)}</section> : null}
      {pack.keyDetails.length ? <section className="space-y-2"><SectionLabel>Worth knowing</SectionLabel>{pack.keyDetails.map((detail) => <p key={detail} className="text-sm text-cc-text-secondary">{detail}</p>)}</section> : null}
      <footer className="border-t border-cc-border-subtle pt-3 text-xs text-cc-text-muted"><p className="font-medium text-cc-text-secondary">{pack.agency.name}{pack.agency.phone ? ` | ${pack.agency.phone}` : ''}</p><p>{pack.disclaimer}</p></footer>
    </div>
  );
}

export function ClientEnglishPackPanel(props: ClientEnglishPackPanelProps) {
  const { snapshot, confirmedSnapshotHash, accountId, policyId = null, embedded = false } = props;
  const comparison = useQuoteIncumbentComparison({
    accountId,
    quoteId: props.quoteId ?? '',
    quoteLineOfBusiness: props.quoteLineOfBusiness ?? '',
    carrierHint: props.carrierHint,
    claimsMade: snapshot.claims_made,
    defenseInsideLimits: snapshot.defense_inside_limits,
    enabled: Boolean(props.quoteId && props.quoteLineOfBusiness),
  });
  const delta = props.delta ?? comparison.diffResult;
  const [open, setOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedClientEnglishPackSend | null>(null);
  const [sent, setSent] = useState<{ recipient: string; sentAt: string } | null>(null);
  const [retainedPublication, setRetainedPublication] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const discardInFlight = useRef(false);
  const approvalInFlight = useRef(false);
  const { stageSend, approveAndSend, discardStaged, isStaging, isApproving } = useClientEnglishPackSend();
  const stagedOnUnmount = useRef<StagedClientEnglishPackSend | null>(null);
  stagedOnUnmount.current = staged;

  useEffect(() => () => {
    const pending = stagedOnUnmount.current;
    if (pending && !discardInFlight.current && !approvalInFlight.current) {
      discardInFlight.current = true;
      void discardStaged(pending).finally(() => { discardInFlight.current = false; });
    }
  }, [discardStaged]);

  useEffect(() => { void hashExtractSnapshot(snapshot).then(setCurrentHash); }, [snapshot]);

  const deliveryQuery = useQuery({
    queryKey: ['client-english-pack-delivery', accountId],
    queryFn: async (): Promise<DeliveryContext> => {
      const { data, error } = await (supabase.rpc as any)('resolve_client_english_pack_delivery', { p_account_id: accountId });
      if (error || !data) throw error ?? new Error('Delivery details unavailable');
      const delivery = data as Record<string, string | null>;
      return {
        accountEmail: delivery.account_email,
        portalEmail: delivery.portal_email,
        firstName: delivery.first_name,
        agencyName: delivery.agency_name ?? 'Lewis Insurance',
        agencyPhone: delivery.agency_phone ?? '(386) 755-0050',
      };
    },
    enabled: !!accountId,
  });

  const delivery = deliveryQuery.data ?? { accountEmail: null, portalEmail: null, firstName: null, agencyName: 'Lewis Insurance', agencyPhone: '(386) 755-0050' };
  const stale = currentHash !== null && currentHash !== confirmedSnapshotHash;
  const hasRecipient = Boolean(delivery.portalEmail || delivery.accountEmail);

  const queue = async () => {
    if (!currentHash) return;
    setError(null);
    try {
      const pack = buildClientEnglishPack(snapshot, delta ?? undefined, { agencyName: delivery.agencyName, agencyPhone: delivery.agencyPhone });
      const generatedOn = new Date().toISOString();
      const pdfBytes = await renderClientEnglishPackPdf(pack, { generatedOn });
      setStaged(await stageSend({
        pdfBytes, currentSnapshotHash: currentHash, confirmedSnapshotHash, accountId, policyId,
        portalEmail: delivery.portalEmail, accountEmail: delivery.accountEmail,
        recipientFirstName: delivery.firstName, agencyName: delivery.agencyName,
        agencyPhone: delivery.agencyPhone, portalUrl: `${window.location.origin}/portal`,
      }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not queue the client summary.'); }
  };

  const approve = async () => {
    if (!staged || approvalInFlight.current) return;
    approvalInFlight.current = true;
    setError(null);
    try {
      const result = await approveAndSend(staged);
      setSent({ recipient: result.recipient, sentAt: result.sentAt });
      setStaged(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the client summary.');
      if (cause instanceof ClientEnglishPackDeliveryError) {
        setStaged(null);
        if (cause.outcome === 'unknown') setRetainedPublication(true);
      }
    }
    finally { approvalInFlight.current = false; }
  };

  const cancelStaged = async () => {
    if (!staged || discardInFlight.current || approvalInFlight.current) return;
    discardInFlight.current = true;
    setError(null);
    try { await discardStaged(staged); setStaged(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not discard the queued summary.'); }
    finally { discardInFlight.current = false; }
  };

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && approvalInFlight.current) return;
    if (!nextOpen && staged) void cancelStaged();
    setOpen(nextOpen);
  };

  const content = (
    <div className="space-y-5">
      {staged ? (
        <div className="space-y-4">
          <div><h3 className="text-lg font-semibold text-cc-text-primary">Review before it goes out</h3><p className="text-sm text-cc-text-muted">Preview only. Nothing is sent until you approve this exact email.</p></div>
          <div className="rounded-cc-lg border border-cc-border-subtle bg-cc-surface p-4 text-sm"><p className="text-cc-text-muted">To</p><p className="text-cc-text-primary">{staged.recipient}</p><p className="mt-3 text-cc-text-muted">Subject</p><p className="text-cc-text-primary">{staged.subject}</p><p className="mt-3 whitespace-pre-wrap text-cc-text-secondary">{staged.body}</p></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => void cancelStaged()} disabled={isApproving}>Not yet</Button><Button variant="outline" onClick={() => void approve()} disabled={isApproving}>{isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Approve and send</Button></div>
        </div>
      ) : (
        <>
          {sent ? <StatusPill override={{ label: `Sent to ${sent.recipient} on ${new Date(sent.sentAt).toLocaleDateString()}`, tone: 'success' }} /> : null}
          {retainedPublication ? <StatusPill override={{ label: 'Delivery unconfirmed. Summary remains available in the client portal. Do not retry.', tone: 'warning' }} /> : null}
          <PackPreview snapshot={snapshot} delta={delta} delivery={delivery} />
          {stale ? <p role="alert" className="text-sm text-cc-danger">{STALE_EXTRACT_MESSAGE}</p> : null}
          {deliveryQuery.error ? <p role="alert" className="text-sm text-cc-danger">Could not load the client email and agency details. Try again before sending.</p> : null}
          {error ? <p role="alert" className="text-sm text-cc-danger">{error}</p> : null}
          {!stale && !deliveryQuery.error && hasRecipient && !sent && !retainedPublication ? <div className="flex justify-end"><Button data-primary onClick={() => void queue()} disabled={isStaging || deliveryQuery.isLoading}>{isStaging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Queue send to client</Button></div> : null}
        </>
      )}
    </div>
  );

  if (embedded) return content;
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-cc-text-primary">Client coverage summary</p>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild><Button type="button" variant="outline">Preview client summary</Button></DialogTrigger>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-cc-border-subtle bg-cc-surface-overlay">
          <DialogHeader><DialogTitle>Client coverage summary</DialogTitle><DialogDescription>Review the confirmed extract in plain English before release.</DialogDescription></DialogHeader>
          {content}
          <DialogFooter className="sr-only">Client summary preview</DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
