import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Check, Loader2 } from 'lucide-react';
import {
  getRelationshipDetail,
  updateRelationship,
  displayWithGoesBy,
  REL_TYPE_OPTIONS,
  type AccountRelationship,
} from '@/hooks/useRelationshipGraph';

interface EditRelationshipDrawerProps {
  relationship: AccountRelationship | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

/**
 * Edit an existing edge: relationship type, role, and (for ownership) the
 * ownership percentage. Reads the live row on open so the form is never stale.
 */
export function EditRelationshipDrawer({ relationship, open, onOpenChange, onUpdated }: EditRelationshipDrawerProps) {
  const [relType, setRelType] = useState('related');
  const [role, setRole] = useState('');
  const [ownershipPct, setOwnershipPct] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!open || !relationship) return;
    setLoading(true);
    getRelationshipDetail(relationship.relationship_id).then((detail) => {
      if (!active) return;
      setRelType(detail?.rel_type ?? relationship.rel_type ?? 'related');
      setRole(detail?.role ?? relationship.role ?? '');
      setOwnershipPct(detail?.ownership_pct != null ? String(detail.ownership_pct) : '');
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, relationship]);

  if (!relationship) return null;

  const otherName = displayWithGoesBy(relationship.other_name, relationship.other_goes_by);

  const handleSave = async () => {
    setSaving(true);
    const pctRaw = ownershipPct.trim();
    const pct = pctRaw === '' ? null : Number(pctRaw);
    const ok = await updateRelationship(relationship.relationship_id, {
      relType,
      role: role.trim() || null,
      ownershipPct: relType === 'owns' ? (Number.isNaN(pct as number) ? null : pct) : null,
    });
    setSaving(false);
    if (ok) {
      onUpdated();
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-cc-border-subtle bg-cc-surface p-0 sm:max-w-[480px]">
        <div className="flex h-full flex-col">
          <SheetHeader className="space-y-1 border-b border-cc-border-subtle p-6 text-left">
            <SheetTitle className="flex items-center gap-2 text-cc-text-primary">
              <Pencil className="h-4 w-4 text-cc-accent" />
              Edit link
            </SheetTitle>
            <SheetDescription className="text-cc-text-muted">
              Update the link to <span className="text-cc-text-secondary">{otherName}</span>.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-cc-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                    Relationship type
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {REL_TYPE_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setRelType(o.value)}
                        className={
                          'rounded-pill px-3 py-1 text-sm transition-colors ' +
                          (o.value === relType
                            ? 'border border-l-2 border-cc-border-subtle border-l-cc-accent bg-cc-surface-raised text-cc-text-primary'
                            : 'border border-cc-border-subtle bg-cc-surface text-cc-text-secondary hover:bg-cc-surface-overlay')
                        }
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                    Role <span className="normal-case text-cc-text-faint">(optional)</span>
                  </label>
                  <Input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Managing Member, Guarantor, Additional Insured…"
                    className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                  />
                </div>

                {relType === 'owns' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                      Ownership % <span className="normal-case text-cc-text-faint">(optional)</span>
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={ownershipPct}
                      onChange={(e) => setOwnershipPct(e.target.value)}
                      placeholder="e.g. 100"
                      className="cc-num rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                    />
                  </div>
                )}
              </>
            )}
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
              disabled={loading || saving}
              onClick={handleSave}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
