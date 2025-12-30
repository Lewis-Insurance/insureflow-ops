import { usePayments } from '@/hooks/usePayments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, CreditCard, FileText, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface PaymentHistoryWidgetProps {
  accountId?: string;
  policyId?: string;
  title?: string;
  maxItems?: number;
  showPolicyColumn?: boolean;
  showViewAllLink?: boolean;
}

const formatCurrency = (amount: number | null | undefined) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount || 0);
};

const getStatusVariant = (status: string | null | undefined) => {
  switch (status) {
    case 'completed':
    case 'cleared':
      return 'default';
    case 'pending':
      return 'secondary';
    case 'voided':
    case 'nsf':
      return 'destructive';
    default:
      return 'outline';
  }
};

export function PaymentHistoryWidget({
  accountId,
  policyId,
  title = 'Payment History',
  maxItems = 5,
  showPolicyColumn = true,
  showViewAllLink = true,
}: PaymentHistoryWidgetProps) {
  const navigate = useNavigate();

  const { data: payments, isLoading, error } = usePayments({
    account_id: accountId,
    policy_id: policyId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load payment history.</p>
        </CardContent>
      </Card>
    );
  }

  const displayPayments = payments?.slice(0, maxItems) || [];
  const totalPayments = payments?.length || 0;
  const totalAmount = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {title} ({totalPayments})
        </CardTitle>
        {showViewAllLink && totalPayments > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/payments')}
          >
            View All
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {displayPayments.length === 0 ? (
          <div className="text-center py-6">
            <DollarSign className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No payments recorded yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary Bar */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Total Payments</span>
              <span className="font-semibold text-green-600">{formatCurrency(totalAmount)}</span>
            </div>

            {/* Payment List */}
            <div className="space-y-2">
              {displayPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {payment.received_date
                          ? format(new Date(payment.received_date), 'MMM d, yyyy')
                          : 'No date'}
                      </span>
                      <Badge variant={getStatusVariant(payment.status)} className="text-xs">
                        {payment.status || 'pending'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      {showPolicyColumn && payment.policy?.policy_number && (
                        <>
                          <FileText className="h-3 w-3" />
                          <span className="font-mono">{payment.policy.policy_number}</span>
                          <span className="mx-1">|</span>
                        </>
                      )}
                      <span>{payment.payment_method?.name || 'Unknown method'}</span>
                      {payment.check_number && (
                        <span className="font-mono">#{payment.check_number}</span>
                      )}
                      {payment.receipt_number && (
                        <>
                          <span className="mx-1">|</span>
                          <span>Receipt: {payment.receipt_number}</span>
                        </>
                      )}
                    </div>
                    {payment.payer_name && payment.payer_name !== payment.account?.name && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Payer: {payment.payer_name}
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <span className="font-semibold">{formatCurrency(payment.amount)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Show more indicator */}
            {totalPayments > maxItems && (
              <div className="text-center pt-2">
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => navigate('/payments')}
                >
                  +{totalPayments - maxItems} more payments
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PaymentHistoryWidget;
