import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Archive,
  Printer,
  Plus,
  Banknote,
  Receipt,
  CreditCard,
  Building2,
  AlertCircle,
} from 'lucide-react';
import { useDaySheet, useCloseDaySheet } from '@/hooks/useDaySheets';
import { usePayments } from '@/hooks/usePayments';
import { useBankAccounts } from '@/hooks/useBankAccounts';
import { PaymentTable } from '@/components/payments/PaymentTable';
import { PaymentEntryForm } from '@/components/payments/PaymentEntryForm';
import { DaySheetPrintView } from '@/components/payments/DaySheetPrintView';
import { EditPaymentModal } from '@/components/payments/EditPaymentModal';
import type { PremiumPayment } from '@/types/payments';

const statusColors = {
  open: 'bg-blue-100 text-blue-800',
  closed: 'bg-amber-100 text-amber-800',
  deposited: 'bg-green-100 text-green-800',
};

export default function DaySheetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showNewPaymentDialog, setShowNewPaymentDialog] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PremiumPayment | null>(null);
  const [closeNotes, setCloseNotes] = useState('');
  const [createDeposit, setCreateDeposit] = useState(true);
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>('');
  const printRef = useRef<HTMLDivElement>(null);

  const { data: daySheet, isLoading: isLoadingSheet } = useDaySheet(id!);
  const { data: payments = [], isLoading: isLoadingPayments } = usePayments({
    daySheetId: id,
  });
  const { data: bankAccounts = [] } = useBankAccounts();
  const closeDaySheet = useCloseDaySheet();

  // Check if we should open the close dialog or print dialog from URL params
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'close' && daySheet?.status === 'open') {
      setShowCloseDialog(true);
    } else if (action === 'print' && daySheet) {
      setShowPrintDialog(true);
      // Auto-trigger print after dialog renders
      setTimeout(() => {
        window.print();
      }, 100);
    }
  }, [searchParams, daySheet]);

  // Set default bank account
  useEffect(() => {
    if (bankAccounts.length > 0 && !selectedBankAccount) {
      const primary = bankAccounts.find((ba) => ba.is_primary);
      setSelectedBankAccount(primary?.id || bankAccounts[0].id);
    }
  }, [bankAccounts, selectedBankAccount]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleClose = async () => {
    if (!id) return;

    try {
      await closeDaySheet.mutateAsync({
        daySheetId: id,
        notes: closeNotes || undefined,
        createDeposit,
        bankAccountId: createDeposit ? selectedBankAccount : undefined,
      });
      setShowCloseDialog(false);
    } catch (error) {
      console.error('Failed to close day sheet:', error);
    }
  };

  const handlePrintDaySheet = () => {
    setShowPrintDialog(true);
    // Delay print to allow dialog to render
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleViewPayment = (payment: PremiumPayment) => {
    // Could navigate to payment detail or show modal
    console.log('View payment:', payment.id);
  };

  const handleEditPayment = (payment: PremiumPayment) => {
    setEditingPayment(payment);
  };

  const handlePrintReceipt = (payment: PremiumPayment) => {
    console.log('Print receipt:', payment.receipt_number);
  };

  if (isLoadingSheet) {
    return (
      <div className="container mx-auto py-12 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!daySheet) {
    return (
      <div className="container mx-auto py-12">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Day Sheet Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The day sheet you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
            </p>
            <Button onClick={() => navigate('/day-sheets')}>Back to Day Sheets</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const depositableAmount = (daySheet.total_cash || 0) + (daySheet.total_checks || 0);

  return (
    <AppLayout>
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/day-sheets')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">
                {format(new Date(daySheet.sheet_date), 'EEEE, MMMM d, yyyy')}
              </h1>
              <Badge className={statusColors[daySheet.status]}>
                {daySheet.status === 'open' && <Clock className="h-3 w-3 mr-1" />}
                {daySheet.status === 'closed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {daySheet.status === 'deposited' && <Archive className="h-3 w-3 mr-1" />}
                {daySheet.status}
              </Badge>
            </div>
            {daySheet.sheet_number && (
              <p className="text-muted-foreground font-mono">{daySheet.sheet_number}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrintDaySheet}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          {daySheet.status === 'open' && (
            <>
              <Button variant="outline" onClick={() => setShowNewPaymentDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Payment
              </Button>
              {payments.length > 0 && (
                <Button onClick={() => setShowCloseDialog(true)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Close Day Sheet
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Grand Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{formatCurrency(daySheet.grand_total || 0)}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {daySheet.payment_count || 0} payment{(daySheet.payment_count || 0) !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-green-600" />
              <CardTitle className="text-sm font-medium">Cash</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(daySheet.total_cash || 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-sm font-medium">Checks</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(daySheet.total_checks || 0)}</div>
            {(daySheet.check_count || 0) > 0 && (
              <p className="text-sm text-muted-foreground">
                {daySheet.check_count} check{daySheet.check_count !== 1 ? 's' : ''}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-purple-600" />
              <CardTitle className="text-sm font-medium">Cards & ACH</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                (daySheet.total_credit_cards || 0) +
                  (daySheet.total_debit_cards || 0) +
                  (daySheet.total_ach || 0)
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Depositable Amount Alert */}
      {daySheet.status === 'open' && depositableAmount > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium">Depositable Amount</p>
                  <p className="text-sm text-muted-foreground">
                    Cash + Checks ready for bank deposit
                  </p>
                </div>
              </div>
              <div className="text-2xl font-bold text-amber-700">
                {formatCurrency(depositableAmount)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>All payments recorded on this day sheet</CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentTable
            payments={payments}
            isLoading={isLoadingPayments}
            onViewPayment={handleViewPayment}
            onEditPayment={handleEditPayment}
            onPrintReceipt={handlePrintReceipt}
          />
        </CardContent>
      </Card>

      {/* Status Timeline */}
      {(daySheet.closed_at || daySheet.opened_at) && (
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {daySheet.opened_at && (
                <div className="flex items-start gap-4">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">Day Sheet Opened</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(daySheet.opened_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
              )}
              {daySheet.closed_at && (
                <div className="flex items-start gap-4">
                  <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium">Day Sheet Closed</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(daySheet.closed_at), 'MMM d, yyyy h:mm a')}
                    </p>
                    {daySheet.notes && (
                      <p className="text-sm mt-1 p-2 bg-muted rounded">{daySheet.notes}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Close Day Sheet Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Day Sheet</DialogTitle>
            <DialogDescription>
              Review the totals and close this day sheet. This will lock all payments.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary */}
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between">
                <span>Total Payments:</span>
                <span className="font-medium">{daySheet.payment_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Cash:</span>
                <span className="font-medium">{formatCurrency(daySheet.total_cash || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Checks ({daySheet.check_count || 0}):</span>
                <span className="font-medium">{formatCurrency(daySheet.total_checks || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cards:</span>
                <span className="font-medium">
                  {formatCurrency(
                    (daySheet.total_credit_cards || 0) + (daySheet.total_debit_cards || 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span>ACH/EFT:</span>
                <span className="font-medium">{formatCurrency(daySheet.total_ach || 0)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-lg">
                <span className="font-semibold">Grand Total:</span>
                <span className="font-bold">{formatCurrency(daySheet.grand_total || 0)}</span>
              </div>
            </div>

            {/* Deposit Option */}
            {depositableAmount > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="createDeposit"
                    checked={createDeposit}
                    onChange={(e) => setCreateDeposit(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="createDeposit">
                    Create escrow deposit ({formatCurrency(depositableAmount)})
                  </Label>
                </div>

                {createDeposit && bankAccounts.length > 0 && (
                  <div className="space-y-2">
                    <Label>Bank Account</Label>
                    <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select bank account" />
                      </SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.account_name} - {account.bank_name}
                            {account.is_primary && ' (Primary)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="Add any notes about this day sheet..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleClose} disabled={closeDaySheet.isPending}>
              {closeDaySheet.isPending ? 'Closing...' : 'Close Day Sheet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Payment Dialog */}
      <Dialog open={showNewPaymentDialog} onOpenChange={setShowNewPaymentDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Add a new payment to this day sheet.
            </DialogDescription>
          </DialogHeader>
          <PaymentEntryForm
            daySheetId={id}
            onSuccess={() => setShowNewPaymentDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible">
          <DialogHeader className="no-print">
            <DialogTitle>Print Preview</DialogTitle>
            <DialogDescription>
              Review the day sheet before printing.
            </DialogDescription>
          </DialogHeader>
          <DaySheetPrintView
            ref={printRef}
            daySheet={{
              id: daySheet?.id || '',
              sheet_date: daySheet?.sheet_date || '',
              sheet_number: daySheet?.sheet_number || undefined,
              status: daySheet?.status || 'open',
              total_cash: daySheet?.total_cash || 0,
              total_checks: daySheet?.total_checks || 0,
              total_credit_cards: daySheet?.total_credit_cards || 0,
              total_debit_cards: daySheet?.total_debit_cards || 0,
              total_ach: daySheet?.total_ach || 0,
              total_agency_bill: daySheet?.total_agency_bill || 0,
              total_other: daySheet?.total_other || 0,
              grand_total: daySheet?.grand_total || 0,
              payment_count: daySheet?.payment_count || 0,
              check_count: daySheet?.check_count || 0,
              notes: daySheet?.notes || undefined,
              opened_at: daySheet?.opened_at || undefined,
              closed_at: daySheet?.closed_at || undefined,
            }}
            payments={payments}
            agencyName="Lewis Insurance Agency"
          />
          <DialogFooter className="no-print">
            <Button variant="outline" onClick={() => setShowPrintDialog(false)}>
              Close
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Modal */}
      <EditPaymentModal
        open={!!editingPayment}
        onOpenChange={(open) => !open && setEditingPayment(null)}
        payment={editingPayment}
        onSuccess={() => setEditingPayment(null)}
      />
    </div>
    </AppLayout>
  );
}
