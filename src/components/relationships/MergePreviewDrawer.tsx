import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
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
import { Button } from '@/components/ui/button';
import { StatusPill, Chip, AccentSpine, SectionLabel } from '@/components/cc';
import { GitMerge, Loader2, ShieldAlert, Link2, Building2, User, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  previewMerge,
  displayWithGoesBy,
  formatPremium,
  accountTypeLabel,
  maskField,
  type MergePreview,
} from '@/hooks/useRelationshipGraph';

export interface MergeMember {
  account_id: string;
  name: string;
  goes_by?: string | null;
  type: string;
  status?: string | null;
  deleted_at?: string | null;
  policies_count?: number;
  active_premium?: number | null;
}

interface MergePreviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: MergeMember[];
  /** Commit the merge. Receives the chosen survivor + the other ids (losers). */
  onConfirm: (survivorId: string, loserIds: string[]) => Promise<boolean>;
  /** Blocked groups offer Link-instead between the first two members. */
  onLinkInstead?: (fromId: string, toId: string) => Promise<boolean>;
}

const HEADLINE_TABLES: { key: string; label: string }[] = [
  { key: 'policies.account_id', label: 'Policies' },
  { key: 'premium_payments.account_id', label: 'Payments' },
  { key: 'documents.account_id', label: 'Documents' },
  { key: 'renewals.account_id', label: 'Renewals' },
  { key: 'tasks.account_id', label: 'Tasks' },
  { key: 'communications.account_id', label: 'Communications' },
];

function typeIcon(type: string) {
  return /business|commercial|organization|org/i.test(type) ? Building2 : User;
}

export function MergePreviewDrawer({ open, onOpenChange, members, onConfirm, onLinkInstead }: MergePreviewDrawerProps) {
  const liveMembers = useMemo(() => members.filter((m) => !m.deleted_at), [members]);
  const [survivor, setSurvivor] = useState<string>('');
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);

  // Default the survivor to the oldest live member when the drawer opens.
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setSurvivor('');
      return;
    }
    if (!survivor && liveMembers.length > 0) setSurvivor(liveMembers[0].account_id);
  }, [open, liveMembers, survivor]);

  // (Re)run the read-only preview whenever the survivor changes.
  useEffect(() => {
    if (!open || !survivor || members.length < 2) return;
    let active = true;
    setPreviewing(true);
    const losers = members.filter((m) => m.account_id !== survivor).map((m) => m.account_id);
    previewMerge(survivor, losers).then((p) => {
      if (!active) return;
      setPreview(p);
      setPreviewing(false);
    });
    return () => {
      active = false;
    };
  }, [open, survivor, members]);

  const survivorMember = members.find((m) => m.account_id === survivor);
  const loserIds = members.filter((m) => m.account_id !== survivor).map((m) => m.account_id);
  const recommended = preview?.computed_survivor ?? null;

  const counts = preview?.reparent_counts ?? {};
  const headline = HEADLINE_TABLES.map((t) => ({ label: t.label, n: counts[t.key] ?? 0 })).filter((x) => x.n > 0);
  const fieldDiffEntries = preview ? Object.entries(preview.field_diff || {}) : [];

  const handleConfirm = async () => {
    if (!survivor) return;
    setSaving(true);
    const ok = await onConfirm(survivor, loserIds);
    setSaving(false);
    setConfirmOpen(false);
    if (ok) onOpenChange(false);
  };

  const handleLink = async () => {
    if (!onLinkInstead || members.length < 2) return;
    setLinking(true);
    // Link every other member to the first (anchor): a 3+ member group used
    // to link only the first pair and silently drop the rest from review.
    let ok = true;
    for (const other of members.slice(1)) {
      ok = (await onLinkInstead(members[0].account_id, other.account_id)) && ok;
    }
    setLinking(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-cc-border-subtle bg-cc-surface p-0 sm:max-w-[520px]">
        <div className="flex min-h-full flex-col">
          <SheetHeader className="space-y-1 border-b border-cc-border-subtle p-6 text-left">
            <SheetTitle className="flex items-center gap-2 text-cc-text-primary">
              <GitMerge className="h-4 w-4 text-cc-accent" />
              Review merge
            </SheetTitle>
            <SheetDescription className="text-cc-text-muted">
              Pick the record to keep, see exactly what moves, then confirm. Nothing changes until you do.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 p-6">
            {/* Survivor picker */}
            <div className="space-y-2">
              <SectionLabel>Keep which record?</SectionLabel>
              <div className="space-y-2">
                {members.map((m) => {
                  const Icon = typeIcon(m.type);
                  const isRec = recommended === m.account_id;
                  // Tombstoned members can't survive a merge (the server raises);
                  // render them, but not as selectable survivors.
                  const selectable = !m.deleted_at;
                  return (
                    <AccentSpine
                      key={m.account_id}
                      active={survivor === m.account_id}
                      role="radio"
                      aria-checked={survivor === m.account_id}
                      aria-disabled={!selectable}
                      tabIndex={selectable ? 0 : -1}
                      onClick={() => selectable && setSurvivor(m.account_id)}
                      onKeyDown={(e) => {
                        if (selectable && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setSurvivor(m.account_id);
                        }
                      }}
                      className={
                        selectable
                          ? 'cursor-pointer p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus-ring'
                          : 'cursor-not-allowed p-3 opacity-50'
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-cc-text-muted" />
                          <span className="truncate text-sm font-medium text-cc-text-primary">
                            {displayWithGoesBy(m.name, m.goes_by)}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {isRec && <Chip>Recommended</Chip>}
                          {survivor === m.account_id && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-cc-accent">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Survivor
                            </span>
                          )}
                          {m.deleted_at && <Chip>Deleted</Chip>}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-cc-text-muted">
                        <span>{accountTypeLabel(m.type)}</span>
                        {m.status && <StatusPill status={m.status} />}
                        {m.policies_count != null && (
                          <span className="cc-num">
                            {m.policies_count} polic{m.policies_count === 1 ? 'y' : 'ies'}
                          </span>
                        )}
                        <span className="cc-num">{formatPremium(m.active_premium)}</span>
                      </div>
                    </AccentSpine>
                  );
                })}
              </div>
            </div>

            {/* Preview / blocked */}
            {previewing ? (
              <div className="flex items-center gap-2 text-sm text-cc-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculating blast radius…
              </div>
            ) : preview && !preview.mergeable ? (
              <div className="rounded-cc-md border border-l-2 border-cc-border-subtle border-l-cc-danger bg-cc-surface-raised p-4">
                <p className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--cc-danger-pill-text)' }}>
                  <ShieldAlert className="h-4 w-4" /> This pair cannot be merged
                </p>
                <p className="mt-1 text-sm text-cc-text-secondary">{preview.block_reason}</p>
                {onLinkInstead && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={linking}
                    onClick={handleLink}
                    className="mt-3 gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                  >
                    {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Link instead
                  </Button>
                )}
              </div>
            ) : preview ? (
              <div className="space-y-4">
                <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-4">
                  <SectionLabel>{survivorMember ? `${survivorMember.name} gains` : 'Survivor gains'}</SectionLabel>
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    {(headline.length > 0 ? headline : [{ label: 'Records', n: preview.reparent_total }]).map((h) => (
                      <div key={h.label}>
                        <div className="cc-num text-xl font-semibold text-cc-text-primary">{h.n}</div>
                        <div className="text-xs text-cc-text-muted">{h.label}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 border-t border-cc-border-subtle pt-2 text-xs text-cc-text-muted">
                    <span className="cc-num text-cc-text-secondary">{preview.reparent_total}</span> records move in total
                    {preview.policies_dedup_count > 0 && (
                      <>
                        {' · '}
                        <span className="inline-flex items-center gap-1 text-cc-text-secondary">
                          <AlertTriangle className="h-3 w-3" />
                          <span className="cc-num">{preview.policies_dedup_count}</span> duplicate polic
                          {preview.policies_dedup_count === 1 ? 'y' : 'ies'} dropped
                        </span>
                      </>
                    )}
                  </p>
                </div>

                {fieldDiffEntries.length > 0 && (
                  <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface p-4">
                    <SectionLabel>Fields filled on the survivor</SectionLabel>
                    <dl className="mt-2 space-y-1.5">
                      {fieldDiffEntries.map(([field, diff]) => (
                        <div key={field} className="flex items-center justify-between gap-3 text-sm">
                          <dt className="text-cc-text-muted">{field.replace(/_/g, ' ')}</dt>
                          <dd className="truncate text-cc-text-primary">{maskField(field, diff.incoming)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-cc-border-subtle p-6">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              Cancel
            </Button>
            <Button
              data-primary
              disabled={!survivor || previewing || saving || !preview?.mergeable}
              onClick={() => setConfirmOpen(true)}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              Merge
            </Button>
          </div>
        </div>
      </SheetContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-cc-xl border-cc-border-subtle bg-cc-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-cc-text-primary">
              Merge into {survivorMember?.name ?? 'this record'}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-cc-text-muted">
              {loserIds.length} other record{loserIds.length === 1 ? '' : 's'} will be soft-deleted and{' '}
              {preview?.reparent_total ?? 0} records reassigned to {survivorMember?.name ?? 'the survivor'}. Reversible
              from Recently merged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-primary
              onClick={handleConfirm}
              className="rounded-cc-md font-semibold"
            >
              Merge records
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
