import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Users, Plus } from 'lucide-react';
import { LinkAccountDrawer } from './LinkAccountDrawer';
import { displayWithGoesBy, type AccountRelationship } from '@/hooks/useRelationshipGraph';

interface Props {
  accountId: string;
  accountName: string;
  relationships: AccountRelationship[];
  loading: boolean;
  onRelationshipsChange: () => void;
}

/**
 * Compact relationship strip for the customer record's top panel. Each linked
 * account is a name bubble that navigates to that record; a Link account button
 * opens the same drawer the full Relationships section used. Renders as a single
 * wrapping row so it sits in the hero without a stacked section's vertical weight.
 */
export function RelationshipBubbles({
  accountId,
  accountName,
  relationships,
  loading,
  onRelationshipsChange,
}: Props) {
  const navigate = useNavigate();
  const [linkOpen, setLinkOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex shrink-0 items-center gap-1.5 text-cc-text-muted">
        <Users className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Relationships</span>
      </div>

      {loading ? (
        <div className="h-6 w-24 animate-pulse rounded-pill bg-cc-skeleton-base" />
      ) : relationships.length > 0 ? (
        relationships.map((r) => (
          <button
            key={r.relationship_id}
            type="button"
            onClick={() => navigate(`/customers/${r.other_account_id}`)}
            title={`${r.display_label} - ${r.other_name}`}
            className="inline-block max-w-[13rem] truncate rounded-pill border border-cc-border-interactive bg-cc-surface-raised px-2.5 py-1 text-xs font-medium text-cc-text-secondary transition-colors duration-fast hover:border-cc-accent hover:bg-cc-surface-overlay hover:text-cc-text-primary"
          >
            {displayWithGoesBy(r.other_name, r.other_goes_by)}
          </button>
        ))
      ) : (
        <span className="text-xs italic text-cc-text-muted">No linked accounts</span>
      )}

      <Button
        size="sm"
        variant="outline"
        onClick={() => setLinkOpen(true)}
        className="h-7 shrink-0 gap-1.5 rounded-pill border-cc-border-interactive bg-transparent px-3 text-xs text-cc-text-primary hover:bg-cc-surface-overlay"
      >
        <Plus className="h-3.5 w-3.5" />
        Link account
      </Button>

      <LinkAccountDrawer
        accountId={accountId}
        accountName={accountName}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLinked={onRelationshipsChange}
      />
    </div>
  );
}
