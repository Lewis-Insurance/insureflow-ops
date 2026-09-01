import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface PolicyAlreadyOnFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The policy number that collided, shown so the CSR can confirm it is theirs. */
  policyNumber: string;
  /** Label of the status-only escape hatch, e.g. "Only change status". */
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
}

/**
 * Shown when the policy number being added already exists.
 *
 * Deliberately narrower than `DuplicatePolicyDialog`: no compare panel and no
 * Merge Clients shortcut, because on this path the policy is already on the
 * customer the CSR picked. The only two ways out are back to the form, or the
 * status-only write that skips the insert entirely.
 */
export function PolicyAlreadyOnFileDialog({
  open,
  onOpenChange,
  policyNumber,
  confirmLabel,
  onConfirm,
  loading = false,
}: PolicyAlreadyOnFileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            This policy is already on file
          </DialogTitle>
          <DialogDescription>
            Policy {policyNumber || 'this number'} is already added, so it was not added again. You
            can still change the status without adding a second policy.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading} className="bg-green-600 hover:bg-green-700">
            {loading ? 'Saving...' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
