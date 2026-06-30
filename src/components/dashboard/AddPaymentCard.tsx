import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';
import { RecordPaymentForm } from '@/components/payments/RecordPaymentForm';

/**
 * Dashboard widget that mirrors the "Record Payment" popup but starts with a
 * customer search so a payment can be entered without leaving My Dashboard.
 */
export function AddPaymentCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-700" />
          Add Payment
        </CardTitle>
        <CardDescription>
          Search for a customer, then record their payment.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RecordPaymentForm />
      </CardContent>
    </Card>
  );
}

export default AddPaymentCard;
