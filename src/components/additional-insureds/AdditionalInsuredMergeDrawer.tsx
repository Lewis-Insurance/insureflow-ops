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
import { GitMerge, Loader2, ShieldAlert, Building2, User, CheckCircle2 } from 'lucide-react';
import { maskField } from '@/hooks/useRelationshipGraph';
import {
  previewAdditionalInsuredMerge,
  type AdditionalInsuredMergePreview,
} from '@/hooks/useAdditionalInsureds';

/**
 * Merge-confirm drawer for additional insureds. Forked from MergePreviewDrawer
 * with the account specifics stripped:
 *  - no onLinkInstead (the directory has no link-instead concept),
 *  - no computed_survivor recommendation and no policies_dedup_count,
 *  - preview shape is { mergeable, block_reason, reparent_counts, reparent_total, field_diff }.
 * The survivor radio, the read-only preview on open, and the confirm dialog are
 * the account version's patterns kept intact.
 */

export interface AdditionalInsuredMergeMember {
  additional_insured_id: string;
  name: string;
  kind: string;
  status?: string | null;
  deleted_at?: string | null;
  usage_count?: number | null;
  created_at?: string | null;
}

interface AdditionalInsuredMergeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: AdditionalInsuredMergeMember[];
  /** Commit the merge. Receives the chosen survivor + the other ids (losers). */
  onConfirm: (survivorId: string, loserIds: string[]) => Promise<boolean>;
}

/** The reparent-count keys worth surfacing as headline tiles. */
const HEADLINE_TABLES: { key: string; label: string }[] = [
  { key: 'certificates.holder_id', label: 'Certificates' },
  { key: 'policy_cgl_additional_insureds.additional_insured_id', label: 'GL endorsements' },
  { key: 'policy_umbrella_additional_insureds.additional_insured_id', label: 'Umbrella' },
  { key: 'policy_bap_interests.additional_insured_id', label: 'Auto' },
  { key: 'policy_property_interests.additional_insured_id', label: 'Property' },
  { key: 'policy_wc_subrogation_waivers.additional_insured_id', label: 'WC waivers' },
];

function kindIcon(kind: string) {
  return /individual|person/i.test(kind) ? User : Building2;
}

function kindLabel(kind: string) {
  if (!kind) return 'Business';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Default survivor: highest usage, then oldest, among live members. */
function defaultSurvivor(members: AdditionalInsuredMergeMember[]): string {
  const live = members.filter((m) => !m.deleted_at);
  if (live.length === 0) return members[0]?.additional_insured_id ?? '';
  const ranked = [...live].sort((a, b) => {
    const usageDiff = (b.usage_count ?? 0) - (a.usage_count ?? 0);
    if (usageDiff !== 0) return usageDiff;
    const at = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
    const bt = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
    return at - bt;
  });
  return ranked[0].additional_insured_id;
}

export function AdditionalInsuredMergeDrawer({
  open,
  onOpenChange,
  members,
  onConfirm,
}: AdditionalInsuredMergeDrawerProps) {
  const liveMembers = useMemo(() => members.filter((m) => !m.deleted_at), [members]);
  const [survivor, setSurvivor] = useState<string>('');
  const [preview, setPreview] = useState<AdditionalInsuredMergePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Default the survivor when the drawer opens; clear on close.
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setSurvivor('');
      return;
    }
    if (!survivor && liveMembers.length > 0) setSurvivor(defaultSurvivor(members));
  }, [open, liveMembers, members, survivor]);

  // (Re)run the read-only preview whenever the survivor changes.
  useEffect(() => {
    if (!open || !survivor || members.length < 2) return;
    let active = true;
    setPreviewing(true);
    const losers = members
      .filter((m) => m.additional_insured_id !== survivor)
      .map((m) => m.additional_insured_id);
    previewAdditionalInsuredMerge(survivor, losers).then((p) => {
      if (!active) return;
      setPreview(p);
      setPreviewing(false);
    });
    return () => {
      active = false;
    };
  }, [open, survivor, members]);

  const survivorMember = members.find((m) => m.additional_insured_id === survivor);
  const loserIds = members
    .filter((m) => m.additional_insured_id !== survivor)
    .map((m) => m.additional_insured_id);

  // Every member of the group is already soft-deleted elsewhere: there is nothing
  // live to keep, so no survivor defaults and no preview can run. Show an explicit
  // blocked panel instead of an inert, unexplained picker.
  const allRemoved = members.length > 0 && liveMembers.length === 0;

  const counts = preview?.reparent_counts ?? {};
  const headline = HEADLINE_TABLES.map((t) => ({ label: t.label, n: counts[t.key] ?? 0 })).filter(
    (x) => x.n > 0,
  );
  const fieldDiffEntries = preview ? Object.entries(preview.field_diff || {}) : [];

  const handleConfirm = async () => {
    if (!survivor) return;
    setSaving(true);
    const ok = await onConfirm(survivor, loserIds);
    setSaving(false);
    setConfirmOpen(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-cc-border-subtle bg-cc-surface p-0 sm:max-w-[480px]"
      >
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
              <div className="space-y-2" role="radiogroup" aria-label="Keep which record">
                {members.map((m) => {
                  const Icon = kindIcon(m.kind);
                  const isSurvivor = survivor === m.additional_insured_id;
                  return (
                    <AccentSpine
                      key={m.additional_insured_id}
                      active={isSurvivor}
                      role="radio"
                      aria-checked={isSurvivor}
                      aria-label={`Keep ${m.name}`}
                      tabIndex={0}
                      onClick={() => setSurvivor(m.additional_insured_id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSurvivor(m.additional_insured_id);
                        }
                      }}
                      className="cursor-pointer p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus-ring"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-cc-text-muted" />
                          <span className="text-sm font-medium text-cc-text-primary">{m.name}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {isSurvivor && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-cc-accent">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Survivor
                            </span>
                          )}
                          {m.deleted_at && <Chip>Deleted</Chip>}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-cc-text-muted">
                        <Chip>{kindLabel(m.kind)}</Chip>
                        {m.status && <StatusPill status={m.status} />}
                        <span className="cc-num">{m.usage_count ?? 0} certs</span>
                      </div>
                    </AccentSpine>
                  );
                })}
              </div>
            </div>

            {/* Preview / blocked */}
            {allRemoved ? (
              <div className="rounded-cc-md border border-l-2 border-cc-border-subtle border-l-cc-danger bg-cc-surface-raised p-4">
                <p
                  className="flex items-center gap-2 text-sm font-medium"
                  style={{ color: 'var(--cc-danger-pill-text)' }}
                >
                  <ShieldAlert className="h-4 w-4" /> Nothing to merge
                </p>
                <p className="mt-1 text-sm text-cc-text-secondary">
                  Every record in this group is already removed. There is nothing left to keep.
                </p>
              </div>
            ) : previewing ? (
              <div className="flex items-center gap-2 text-sm text-cc-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculating blast radius
              </div>
            ) : preview && !preview.mergeable ? (
              <div className="rounded-cc-md border border-l-2 border-cc-border-subtle border-l-cc-danger bg-cc-surface-raised p-4">
                <p
                  className="flex items-center gap-2 text-sm font-medium"
                  style={{ color: 'var(--cc-danger-pill-text)' }}
                >
                  <ShieldAlert className="h-4 w-4" /> These records cannot be merged
                </p>
                <p className="mt-1 text-sm text-cc-text-secondary">{preview.block_reason}</p>
              </div>
            ) : preview ? (
              <div className="space-y-4">
                <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-4">
                  <SectionLabel>
                    {survivorMember ? `${survivorMember.name} gains` : 'Survivor gains'}
                  </SectionLabel>
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    {(headline.length > 0
                      ? headline
                      : [{ label: 'Records', n: preview.reparent_total }]
                    ).map((h) => (
                      <div key={h.label}>
                        <div className="cc-num text-xl font-semibold text-cc-text-primary">{h.n}</div>
                        <div className="text-xs text-cc-text-muted">{h.label}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 border-t border-cc-border-subtle pt-2 text-xs text-cc-text-muted">
                    <span className="cc-num text-cc-text-secondary">{preview.reparent_total}</span> records
                    move in total
                  </p>
                </div>

                {fieldDiffEntries.length > 0 && (
                  <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface p-4">
                    <SectionLabel>Fields filled on the survivor</SectionLabel>
                    <dl className="mt-2 space-y-1.5">
                      {fieldDiffEntries.map(([field, diff]) => {
                        const value = maskField(field, (diff as { incoming: unknown }).incoming);
                        return (
                          <div key={field} className="flex items-start justify-between gap-3 text-sm">
                            <dt className="shrink-0 text-cc-text-muted">{field.replace(/_/g, ' ')}</dt>
                            <dd
                              className="min-w-0 break-words text-right text-cc-text-primary"
                              title={typeof value === 'string' ? value : undefined}
                            >
                              {value}
                            </dd>
                          </div>
                        );
                      })}
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
              Merge records
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
              <span className="cc-num">{loserIds.length}</span> other record
              {loserIds.length === 1 ? '' : 's'} will be soft-deleted and{' '}
              <span className="cc-num">{preview?.reparent_total ?? 0}</span> records reassigned to{' '}
              {survivorMember?.name ?? 'the survivor'}. Reversible from Recently merged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction data-primary onClick={handleConfirm} className="rounded-cc-md font-semibold">
              Merge records
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
