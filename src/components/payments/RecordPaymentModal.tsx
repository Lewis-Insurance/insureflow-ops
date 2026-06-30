import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DollarSign } from 'lucide-react';
import { RecordPaymentForm } from './RecordPaymentForm';

interface RecordPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId?: string;
  accountId?: string;
  customerName?: string;
  onSuccess?: () => void;
}

/**
 * Shared "Record Payment" popup. Used by the Policies module, the Payments
 * page, and the Day Sheets pages. When no accountId is supplied the form
 * shows a customer search first.
 */
export function RecordPaymentModal({
  open,
  onOpenChange,
  policyId,
  accountId,
  customerName,
  onSuccess,
}: RecordPaymentModalProps) {
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

export default RecordPaymentModal;
