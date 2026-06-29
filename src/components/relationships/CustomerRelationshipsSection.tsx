import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { StatusPill, Chip, AccentSpine, SectionLabel } from '@/components/cc';
import {
  Users,
  Link2,
  Plus,
  Eye,
  MoreVertical,
  Trash2,
  Pencil,
  Building2,
  User,
  Home,
  Sparkles,
  Check,
  X,
  Calendar,
} from 'lucide-react';
import { LinkAccountDrawer } from './LinkAccountDrawer';
import { EditRelationshipDrawer } from './EditRelationshipDrawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useAccountLinkSuggestions,
  useHouseholdSummary,
  unlinkRelationship,
  displayWithGoesBy,
  formatPremium,
  accountTypeLabel,
  type AccountRelationship,
} from '@/hooks/useRelationshipGraph';
import { formatLocalDateDisplay } from '@/lib/date/localDate';

interface Props {
  accountId: string;
  accountName: string;
  householdId?: string | null;
  relationships: AccountRelationship[];
  loading: boolean;
  onRelationshipsChange: () => void;
}

function typeIcon(type?: string | null) {
  return /business|commercial|organization|org/i.test(type ?? '') ? Building2 : User;
}

export function CustomerRelationshipsSection({
  accountId,
  accountName,
  householdId,
  relationships,
  loading,
  onRelationshipsChange,
}: Props) {
  const navigate = useNavigate();
  const [linkOpen, setLinkOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountRelationship | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<AccountRelationship | null>(null);
  const { suggestions, confirm, dismiss, refetch: refetchSuggestions } = useAccountLinkSuggestions(accountId);
  const household = useHouseholdSummary(householdId);

  const handleRemove = async (relationshipId: string) => {
    const ok = await unlinkRelationship(relationshipId);
    if (ok) onRelationshipsChange();
  };

  const handleConfirm = async (suggestionId: string) => {
    const ok = await confirm(suggestionId);
    if (ok) onRelationshipsChange();
  };

  const showHousehold = !!household && household.member_count > 1;
  const isEmpty = !loading && relationships.length === 0 && !showHousehold && suggestions.length === 0;

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-cc-text-muted" />
          <SectionLabel>Relationships</SectionLabel>
          {relationships.length > 0 && (
            <span className="cc-num text-xs text-cc-text-muted">({relationships.length})</span>
          )}
        </div>
        <Button
          data-primary
          size="sm"
          onClick={() => setLinkOpen(true)}
          className="gap-1.5 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
        >
          <Plus className="h-4 w-4" />
          Link account
        </Button>
      </div>

      {/* Suggested links (never auto-committed) */}
      {suggestions.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-cc-accent" />
            <SectionLabel>Suggested links ({suggestions.length})</SectionLabel>
          </div>
          {suggestions.map((s) => (
            <div
              key={s.suggestion_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-cc-text-primary">
                  <Chip className="mr-1.5">{s.suggested_label}</Chip>
                  {displayWithGoesBy(s.other_name, s.other_goes_by)}
                </p>
                {s.reason && <p className="mt-0.5 text-xs text-cc-text-muted">{s.reason}</p>}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleConfirm(s.suggestion_id)}
                  className="h-8 gap-1 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  <Check className="h-3.5 w-3.5" />
                  Confirm
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Dismiss suggestion"
                  onClick={() => dismiss(s.suggestion_id).then(refetchSuggestions)}
                  className="h-8 w-8 rounded-cc-md text-cc-text-muted hover:text-cc-text-primary"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Household roll-up (the set-grouping container; edges carry pairwise facts) */}
      {showHousehold && household && (
        <AccentSpine active className="mb-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-cc-accent" />
              <div>
                <p className="text-sm font-medium text-cc-text-primary">
                  {household.household_name || 'Household'}
                </p>
                <p className="text-xs text-cc-text-muted">
                  <span className="cc-num">{household.member_count}</span> members ·{' '}
                  <span className="cc-num">{household.active_policies}</span> policies
                  {household.is_mixed_line ? ' · mixed line' : ''}
                </p>
              </div>
            </div>
            <span className="cc-num font-mono text-lg font-semibold text-cc-text-primary">
              {formatPremium(household.household_premium)}
            </span>
          </div>
        </AccentSpine>
      )}

      {/* Relationship rows */}
      {loading ? (
        <div className="space-y-2">
          <div className="h-16 animate-pulse rounded-cc-md bg-cc-skeleton-base" />
          <div className="h-16 animate-pulse rounded-cc-md bg-cc-skeleton-base" />
        </div>
      ) : isEmpty ? (
        <div className="rounded-cc-md border border-dashed border-cc-border-subtle px-4 py-10 text-center">
          <Link2 className="mx-auto mb-3 h-8 w-8 text-cc-text-muted" />
          <p className="text-sm text-cc-text-secondary">No linked accounts yet.</p>
          <p className="mt-1 text-xs text-cc-text-muted">
            Link a business this person owns, a spouse, or a related account.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLinkOpen(true)}
            className="mt-4 gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            <Plus className="h-4 w-4" />
            Link account
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {relationships.map((r) => {
            const Icon = typeIcon(r.other_type);
            const open = () => navigate(`/customers/${r.other_account_id}`);
            return (
              <AccentSpine
                key={r.relationship_id}
                role="button"
                tabIndex={0}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open();
                  }
                }}
                className="cursor-pointer p-4 hover:bg-cc-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus-ring focus-visible:ring-offset-2"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  {/* Identity + relationship label */}
                  <div className="md:col-span-2">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Chip>{r.display_label}</Chip>
                      <h4 className="font-semibold text-cc-text-primary">
                        {displayWithGoesBy(r.other_name, r.other_goes_by)}
                      </h4>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-cc-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Icon className="h-3.5 w-3.5" />
                        {accountTypeLabel(r.other_type)}
                      </span>
                      {r.other_status && <StatusPill status={r.other_status} />}
                      {r.role && <Chip>{r.role}</Chip>}
                    </div>
                  </div>

                  {/* Policies + next renewal */}
                  <div className="text-sm">
                    <span className="text-xs text-cc-text-muted">Policies</span>
                    <div className="cc-num text-cc-text-primary">{r.other_policies_count}</div>
                    {r.other_next_expiration && (
                      <div className="mt-1 inline-flex items-center gap-1 text-xs text-cc-text-muted">
                        <Calendar className="h-3 w-3" />
                        <span className="cc-num">{formatLocalDateDisplay(r.other_next_expiration)}</span>
                      </div>
                    )}
                  </div>

                  {/* Premium anchor */}
                  <div>
                    <span className="text-xs text-cc-text-muted">Active premium</span>
                    <div className="cc-num mt-0.5 font-mono text-lg font-semibold text-cc-text-primary">
                      {formatPremium(r.other_active_premium)}
                    </div>
                  </div>
                </div>

                <div
                  className="mt-3 flex items-center gap-2 border-t border-cc-border-subtle pt-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={open}
                    className="gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Relationship actions"
                        className="h-9 w-9 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-cc-lg">
                      <DropdownMenuItem
                        onClick={() => setEditTarget(r)}
                        className="gap-2 text-cc-text-secondary"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit link
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setUnlinkTarget(r)}
                        className="gap-2 text-cc-text-secondary"
                      >
                        <Trash2 className="h-4 w-4" />
                        Unlink
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {r.source === 'suggested' && <Chip className="ml-auto">From suggestion</Chip>}
                </div>
              </AccentSpine>
            );
          })}
        </div>
      )}

      <LinkAccountDrawer
        accountId={accountId}
        accountName={accountName}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLinked={onRelationshipsChange}
      />

      <EditRelationshipDrawer
        relationship={editTarget}
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onUpdated={onRelationshipsChange}
      />

      <AlertDialog open={!!unlinkTarget} onOpenChange={(o) => !o && setUnlinkTarget(null)}>
        <AlertDialogContent className="rounded-cc-xl border-cc-border-subtle bg-cc-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-cc-text-primary">
              Unlink {accountName} from {unlinkTarget?.other_name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-cc-text-muted">
              This removes the link only. Both accounts stay, and you can re-link them any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unlinkTarget) handleRemove(unlinkTarget.relationship_id);
                setUnlinkTarget(null);
              }}
              className="rounded-cc-md bg-cc-surface-overlay text-cc-text-primary hover:bg-cc-surface-raised"
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
