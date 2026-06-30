import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { parseLocalDate } from '@/lib/date/localDate';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  CalendarDays,
  DollarSign,
  Receipt,
  TrendingUp,
  CreditCard,
  Banknote,
  Building2,
  Printer,
  XCircle,
} from 'lucide-react';
import { PaymentTable } from '@/components/payments/PaymentTable';
import { RecordPaymentForm } from '@/components/payments/RecordPaymentForm';
import { RecordPaymentModal } from '@/components/payments/RecordPaymentModal';
import { usePayments, useVoidPayment } from '@/hooks/usePayments';
import { useCurrentDaySheet } from '@/hooks/useDaySheets';
import type { PremiumPayment } from '@/types/payments';
import { cn } from '@/lib/utils';

type DateRange = {
  from: Date;
  to: Date;
};

export default function PaymentList() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(),
    to: new Date(),
  });
  const [showNewPaymentDialog, setShowNewPaymentDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PremiumPayment | null>(null);
  const [editingPayment, setEditingPayment] = useState<PremiumPayment | null>(null);

  const { data: allPayments = [], isLoading } = usePayments({
    date_from: format(dateRange.from, 'yyyy-MM-dd'),
    date_to: format(dateRange.to, 'yyyy-MM-dd'),
  });

  // Only ever show payments that were actually taken (no voided rows).
  const payments = allPayments.filter((p) => p.status !== 'voided');

  const { data: currentDaySheet } = useCurrentDaySheet();
  const voidPayment = useVoidPayment();

  // Calculate summary stats
  const stats = {
    totalAmount: payments.reduce((sum, p) => sum + (p.status !== 'voided' ? p.amount : 0), 0),
    paymentCount: payments.filter((p) => p.status !== 'voided').length,
    cashTotal: payments
      .filter((p) => p.payment_method?.type === 'cash' && p.status !== 'voided')
      .reduce((sum, p) => sum + p.amount, 0),
    checkTotal: payments
      .filter((p) => p.payment_method?.type === 'check' && p.status !== 'voided')
      .reduce((sum, p) => sum + p.amount, 0),
    cardTotal: payments
      .filter(
        (p) =>
          (p.payment_method?.type === 'credit_card' || p.payment_method?.type === 'debit_card') &&
          p.status !== 'voided'
      )
      .reduce((sum, p) => sum + p.amount, 0),
    achTotal: payments
      .filter((p) => p.payment_method?.type === 'ach' && p.status !== 'voided')
      .reduce((sum, p) => sum + p.amount, 0),
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleViewPayment = (payment: PremiumPayment) => {
    setSelectedPayment(payment);
  };

  const handleEditPayment = (payment: PremiumPayment) => {
    setEditingPayment(payment);
  };

  const handlePrintReceipt = (payment: PremiumPayment) => {
    // TODO: Implement receipt printing
    console.log('Print receipt for:', payment.receipt_number);
  };

  const handleVoidPayment = async (payment: PremiumPayment) => {
    if (window.confirm(`Are you sure you want to void payment ${payment.receipt_number}?`)) {
      try {
        await voidPayment.mutateAsync({
          payment_id: payment.id,
          void_reason: 'Voided by user',
        });
      } catch (error) {
        console.error('Failed to void payment:', error);
      }
    }
  };

  const handlePaymentSuccess = () => {
    setShowNewPaymentDialog(false);
  };

  const quickDateRanges = [
    { label: 'Today', from: new Date(), to: new Date() },
    { label: 'Last 7 Days', from: subDays(new Date(), 7), to: new Date() },
    { label: 'This Month', from: startOfMonth(new Date()), to: endOfMonth(new Date()) },
    {
      label: 'Last Month',
      from: startOfMonth(subDays(startOfMonth(new Date()), 1)),
      to: endOfMonth(subDays(startOfMonth(new Date()), 1)),
    },
  ];

  return (
    <AppLayout>
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Payments</h1>
          <p className="text-muted-foreground">
            Track and manage premium payments
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="bg-emerald-800 hover:bg-emerald-900 text-white"
            onClick={() => navigate('/day-sheets')}
          >
            <Receipt className="h-4 w-4 mr-2" />
            Day Sheets
          </Button>
          <Button onClick={() => setShowNewPaymentDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Record Payment
          </Button>
        </div>
      </div>

      {/* Current Day Sheet Banner */}
      {currentDaySheet && currentDaySheet.status === 'open' && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Receipt className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Today&apos;s Day Sheet is Open</p>
                  <p className="text-sm text-muted-foreground">
                    {currentDaySheet.payment_count} payments totaling{' '}
                    {formatCurrency(currentDaySheet.grand_total)}
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => navigate(`/day-sheets/${currentDaySheet.id}`)}>
                View Day Sheet
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.paymentCount} payments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash</CardTitle>
            <Banknote className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.cashTotal)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checks</CardTitle>
            <Receipt className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.checkTotal)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cards</CardTitle>
            <CreditCard className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.cardTotal)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ACH/EFT</CardTitle>
            <Building2 className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.achTotal)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Date Range Selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Payment History</CardTitle>
            <div className="flex items-center gap-2">
              {quickDateRanges.map((range) => (
                <Button
                  key={range.label}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'text-sm',
                    format(dateRange.from, 'yyyy-MM-dd') === format(range.from, 'yyyy-MM-dd') &&
                      format(dateRange.to, 'yyyy-MM-dd') === format(range.to, 'yyyy-MM-dd')
                      ? 'bg-muted'
                      : ''
                  )}
                  onClick={() => setDateRange({ from: range.from, to: range.to })}
                >
                  {range.label}
                </Button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <CalendarDays className="h-4 w-4 mr-2" />
                    {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => {
                      if (range?.from && range?.to) {
                        setDateRange({ from: range.from, to: range.to });
                      }
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <PaymentTable
            payments={payments}
            isLoading={isLoading}
            onViewPayment={handleViewPayment}
            onEditPayment={handleEditPayment}
            onPrintReceipt={handlePrintReceipt}
            onVoidPayment={handleVoidPayment}
          />
        </CardContent>
      </Card>

      {/* New Payment Dialog */}
      <Dialog open={showNewPaymentDialog} onOpenChange={setShowNewPaymentDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record New Payment</DialogTitle>
            <DialogDescription>
              Search for a customer, then record their payment.
            </DialogDescription>
          </DialogHeader>
          <RecordPaymentForm
            onCancel={() => setShowNewPaymentDialog(false)}
            onSuccess={handlePaymentSuccess}
          />
        </DialogContent>
      </Dialog>

      {/* Payment Details Dialog */}
      <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Receipt Number</p>
                  <p className="font-mono font-medium">{selectedPayment.receipt_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="capitalize">{selectedPayment.status}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="text-xl font-bold">{formatCurrency(selectedPayment.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date Received</p>
                  <p>{format(parseLocalDate(selectedPayment.received_date), 'MMMM d, yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Payment Method</p>
                  <p className="capitalize">
                    {selectedPayment.payment_method?.name || selectedPayment.payment_method?.type}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Payer</p>
                  <p>{selectedPayment.payer_name || 'N/A'}</p>
                </div>
                {selectedPayment.check_number && (
                  <div>
                    <p className="text-sm text-muted-foreground">Check Number</p>
                    <p className="font-mono">{selectedPayment.check_number}</p>
                  </div>
                )}
                {selectedPayment.reference_number && (
                  <div>
                    <p className="text-sm text-muted-foreground">Reference</p>
                    <p className="font-mono">{selectedPayment.reference_number}</p>
                  </div>
                )}
                {selectedPayment.policy?.policy_number && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Policy</p>
                    <p>
                      {selectedPayment.policy.policy_number} ({selectedPayment.policy.line_of_business})
                    </p>
                  </div>
                )}
                {selectedPayment.notes && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p>{selectedPayment.notes}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => handlePrintReceipt(selectedPayment)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Receipt
                </Button>
                {selectedPayment.status === 'recorded' && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      handleVoidPayment(selectedPayment);
                      setSelectedPayment(null);
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Void Payment
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Payment — same single form, in edit mode */}
      <RecordPaymentModal
        open={!!editingPayment}
        onOpenChange={(open) => !open && setEditingPayment(null)}
        payment={editingPayment}
        onSuccess={() => setEditingPayment(null)}
      />
    </div>
    </AppLayout>
  );
}
