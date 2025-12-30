import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PaymentEntryForm } from './PaymentEntryForm';

interface RecordPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId?: string;
  accountId?: string;
  onSuccess?: () => void;
}

export function RecordPaymentModal({
  open,
  onOpenChange,
  policyId,
  accountId,
  onSuccess,
}: RecordPaymentModalProps) {
  const handleSuccess = () => {
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record New Payment</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          <PaymentEntryForm
            defaultPolicyId={policyId}
            defaultAccountId={accountId}
            onSuccess={handleSuccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default RecordPaymentModal;
