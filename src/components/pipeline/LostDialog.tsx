/**
 * Lost. Closing a sale that did not happen.
 *
 * A reason is required because the reasons are the only thing that makes a lost sale
 * useful later. The note is optional.
 *
 * The renewal checkbox only appears when it can actually be true: the item came from a
 * renewal AND the reason is "went elsewhere". A price loss on a renewal still leaves the
 * renewal open, because the office may still save it. Closing the renewal is a separate,
 * deliberate answer to a separate question, never a side effect of marking a sale lost.
 *
 * Closing as lost is destructive, so the confirm is an outline button. There is no lime
 * fill on this surface.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SectionLabel } from '@/components/cc';
import { useMarkPipelineItemLost, type PipelineItem } from '@/hooks/usePipeline';
import { LOST_REASONS, LOST_REASON_LABELS, type LostReason } from '@/lib/pipeline/stages';
import { cn } from '@/lib/utils';

interface LostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PipelineItem;
}

export function LostDialog({ open, onOpenChange, item }: LostDialogProps) {
  const markLost = useMarkPipelineItemLost();
  const [reason, setReason] = useState<LostReason | null>(null);
  const [note, setNote] = useState('');
  const [closeRenewal, setCloseRenewal] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const fromRenewal = item.kind === 'renewal' || !!item.source_renewal_id;
  const canCloseRenewal = fromRenewal && reason === 'went_elsewhere';

  useEffect(() => {
    if (!open) return;
    setReason(null);
    setNote('');
    setCloseRenewal(false);
    setErrorText(null);
  }, [open, item.id]);

  // The checkbox is meaningless once the reason moves off "went elsewhere", so the
  // answer resets with it rather than travelling along silently.
  useEffect(() => {
    if (!canCloseRenewal && closeRenewal) setCloseRenewal(false);
  }, [canCloseRenewal, closeRenewal]);

  const handleConfirm = async () => {
    if (!reason || markLost.isPending) return;
    setErrorText(null);
    try {
      await markLost.mutateAsync({
        itemId: item.id,
        reason,
        note: note.trim() || null,
        closeRenewal: canCloseRenewal && closeRenewal,
      });
      onOpenChange(false);
    } catch (err) {
      const e = err as { message?: string };
      setErrorText(e?.message?.trim() || 'Could not close that item.');
    }
  };

  const partyName = item.party?.name ?? 'this sale';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-cc-xl border-cc-border-subtle bg-cc-surface-overlay shadow-lift">
        <DialogHeader>
          <DialogTitle className="text-cc-text-primary">Close as lost</DialogTitle>
          <DialogDescription className="text-cc-text-secondary">
            Closing {partyName}. Pick what happened so the reason is on the record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <SectionLabel>Reason</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {LOST_REASONS.map((value) => {
                const selected = reason === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setReason(value)}
                    className={cn(
                      'h-8 rounded-cc-md border px-3 text-xs transition-colors',
                      selected
                        ? 'border-cc-accent bg-cc-surface-overlay text-cc-text-primary'
                        : 'border-transparent bg-cc-surface-overlay text-cc-text-secondary hover:text-cc-text-primary',
                    )}
                  >
                    {LOST_REASON_LABELS[value]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lost-note" className="text-cc-text-muted">
              Note (optional)
            </Label>
            <Textarea
              id="lost-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Anything worth knowing next time around"
              className="rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted"
            />
          </div>

          {canCloseRenewal && (
            <div className="flex items-start gap-3 rounded-cc-md border border-cc-border-subtle bg-cc-surface p-3">
              <Checkbox
                id="lost-close-renewal"
                checked={closeRenewal}
                onCheckedChange={(v) => setCloseRenewal(v === true)}
                className="mt-0.5 border-cc-border-interactive data-[state=checked]:border-cc-accent data-[state=checked]:bg-transparent data-[state=checked]:text-cc-accent"
              />
              <div className="min-w-0">
                <label
                  htmlFor="lost-close-renewal"
                  className="cursor-pointer text-sm text-cc-text-primary"
                >
                  The customer left, close the renewal too
                </label>
                <p className="mt-1 text-xs text-cc-text-muted">
                  Leave this off if the policy is still with us and only the remarket failed.
                </p>
              </div>
            </div>
          )}

          {errorText && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-cc-md border border-cc-danger/40 bg-cc-surface p-3"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-cc-danger"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-cc-danger">Not closed</p>
                <p className="mt-1 break-words text-sm text-cc-text-primary">{errorText}</p>
                <p className="mt-2 text-xs text-cc-text-muted">Nothing was saved.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-cc-md text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!reason || markLost.isPending}
            onClick={handleConfirm}
            className="h-10 rounded-cc-md border-cc-danger bg-transparent text-cc-danger hover:bg-cc-surface-raised hover:text-cc-danger"
          >
            {markLost.isPending ? 'Closing...' : 'Close as lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
