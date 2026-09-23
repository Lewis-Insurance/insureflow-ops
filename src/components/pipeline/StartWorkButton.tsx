/**
 * StartWorkButton. The four doors into the pipeline, as one component.
 *
 * Whatever the office is looking at, starting work on it is the same move: create the
 * pipeline item if there is not one already, then open it. That is why there is one
 * button and not four.
 *
 * Intended call sites, one line each (wired in a later pass, NOT here):
 *   1. src/pages/RenewalsPage.tsx   renewal row      kind="renewal"      sourceRenewalId + accountId
 *   2. src/pages/CustomerDetail.tsx customer header  kind="cross_sell"   accountId
 *   3. src/pages/PolicyDetail.tsx   policy card      kind="rewrite"      accountId + sourcePolicyId
 *   4. src/pages/LeadDetail.tsx     prospect record  kind="new_business" leadId
 *
 * pipeline_start is idempotent: when an open item already exists it returns that same
 * item with created:false, so pressing this twice can never make two of anything. When
 * the caller already knows an item exists it passes `existingItemId` and the component
 * stops being an action at all: it renders a neutral "In pipeline" chip that opens it.
 * A lead call site can get that id from `useLeadPipelineItemId` below.
 *
 * This is never the lime action on its surface. It is ghost or outline, because the
 * surface it sits on has its own primary.
 */

import { useNavigate } from 'react-router-dom';
import { Chip } from '@/components/cc';
import { useOpenItemForLead, useStartPipelineItem } from '@/hooks/usePipeline';
import type { PipelineKind } from '@/lib/pipeline/stages';
import { cn } from '@/lib/utils';

const DEFAULT_LABELS: Record<PipelineKind, string> = {
  renewal: 'Work this',
  rewrite: 'Remarket',
  cross_sell: 'Start a sale',
  new_business: 'Work this',
};

/** The open pipeline item for a prospect, if there is one. Thin wrapper over the data layer. */
export function useLeadPipelineItemId(leadId?: string): string | null {
  const { data } = useOpenItemForLead(leadId);
  return data?.id ?? null;
}

export interface StartWorkButtonProps {
  kind: PipelineKind;
  leadId?: string;
  accountId?: string;
  sourceRenewalId?: string;
  sourcePolicyId?: string;
  lines?: string[];
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'ghost' | 'outline';
  /** Pass the id when the caller already knows this is in the pipeline. Renders a chip. */
  existingItemId?: string | null;
  className?: string;
}

export function StartWorkButton({
  kind,
  leadId,
  accountId,
  sourceRenewalId,
  sourcePolicyId,
  lines,
  label,
  size = 'default',
  variant = 'outline',
  existingItemId,
  className,
}: StartWorkButtonProps) {
  const navigate = useNavigate();
  const start = useStartPipelineItem();

  const open = (itemId: string) => navigate(`/pipeline?item=${itemId}`);

  const sizeCls = size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm';

  // Already in the pipeline: this stops being an action and becomes a fact you can open.
  if (existingItemId) {
    return (
      <button
        type="button"
        onClick={() => open(existingItemId)}
        aria-label="Open this in the pipeline"
        className={cn('inline-flex rounded-pill align-middle', className)}
      >
        <Chip>In pipeline</Chip>
      </button>
    );
  }

  const handleClick = async () => {
    if (start.isPending) return;
    try {
      const result = await start.mutateAsync({
        kind,
        leadId: leadId ?? null,
        accountId: accountId ?? null,
        sourceRenewalId: sourceRenewalId ?? null,
        sourcePolicyId: sourcePolicyId ?? null,
        lines: lines ?? [],
        assignSelf: true,
      });
      // created:false means it was already open. Either way the id is the one to open.
      if (result?.item_id) open(result.item_id);
    } catch {
      // useStartPipelineItem already surfaces the failure. Stay on the page.
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={start.isPending}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-cc-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        sizeCls,
        variant === 'outline'
          ? 'border border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay'
          : 'bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary',
        className,
      )}
    >
      {start.isPending ? 'Opening...' : (label ?? DEFAULT_LABELS[kind])}
    </button>
  );
}
