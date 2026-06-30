import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DollarSign } from 'lucide-react';
import { RecordPaymentForm } from './RecordPaymentForm';
import type { PremiumPayment } from '@/types/payments';

interface RecordPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId?: string;
  accountId?: string;
  customerName?: string;
  /** When provided, the modal edits this payment (customer + policy locked). */
  payment?: PremiumPayment | null;
  onSuccess?: () => void;
}

/**
 * Shared "Record Payment" popup — the single payment format used everywhere
 * (Policies, Payments page, Day Sheets, edit). When no accountId/payment is
 * supplied the form shows a customer search first; when a payment is supplied
 * it edits that payment.
 */
export function RecordPaymentModal({
  open,
  onOpenChange,
  policyId,
  accountId,
  customerName,
  payment,
  onSuccess,
}: RecordPaymentModalProps) {
  const isEdit = !!payment;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-700" />
            {isEdit ? 'Edit Payment' : 'Record Payment'}
          </DialogTitle>
        </DialogHeader>
        <RecordPaymentForm
          accountId={accountId}
          customerName={customerName}
          policyId={policyId}
          payment={payment}
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
