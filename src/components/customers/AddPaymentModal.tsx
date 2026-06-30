import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DollarSign } from 'lucide-react';
import { RecordPaymentForm } from '@/components/payments/RecordPaymentForm';

interface AddPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  customerName?: string;
  policyId?: string;
  onSuccess?: () => void;
}

/**
 * Customer-page "Record Payment" popup. Thin wrapper around the shared
 * RecordPaymentForm so every entry point looks and behaves identically.
 */
export function AddPaymentModal({
  open,
  onOpenChange,
  accountId,
  customerName,
  policyId,
  onSuccess,
}: AddPaymentModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-700" />
            Record Payment
          </DialogTitle>
        </DialogHeader>
        <RecordPaymentForm
          accountId={accountId}
          customerName={customerName}
          policyId={policyId}
          onCancel={() => onOpenChange(false)}
          onSuccess={() => {
            onOpenChange(false);
            onSuccess?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export default AddPaymentModal;
