import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Printer,
  Plus,
  Banknote,
  Receipt,
  CreditCard,
  Building2,
  AlertCircle,
  Download,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { useDaySheet } from '@/hooks/useDaySheets';
import { usePayments } from '@/hooks/usePayments';
import { PaymentTable } from '@/components/payments/PaymentTable';
import { RecordPaymentForm } from '@/components/payments/RecordPaymentForm';
import { RecordPaymentModal } from '@/components/payments/RecordPaymentModal';
import { downloadDaySheetPDF, printDaySheetPDF } from '@/components/payments/DaySheetPDF';
import { DailyCashDialog } from '@/components/payments/DailyCashDialog';
import { useToast } from '@/hooks/use-toast';
import type { PremiumPayment } from '@/types/payments';

export default function DaySheetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const [showNewPaymentDialog, setShowNewPaymentDialog] = useState(false);
  const [showDailyCashDialog, setShowDailyCashDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PremiumPayment | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const { data: daySheet, isLoading: isLoadingSheet } = useDaySheet(id!);
  const {
    data: payments = [],
    isLoading: isLoadingPayments,
    isSuccess: paymentsLoaded,
  } = usePayments({
    day_sheet_id: id,
  });

  // Stored day-sheet totals only count recorded payments; keep the list, PDF
  // and cash sheet consistent with that.
  const recordedPayments = payments.filter((p) => p.status === 'recorded');

  // Auto-trigger print from URL params: exactly once, and only after the
  // payments query has actually resolved (printing on the default [] produced
  // an empty PDF, and re-renders/mutations kept opening new print tabs).
  const autoPrintedRef = useRef(false);
  useEffect(() => {
    const action = searchParams.get('action');
    if (action !== 'print' || autoPrintedRef.current) return;
    if (!daySheet || !paymentsLoaded) return;
    autoPrintedRef.current = true;
    // Drop the param so payment mutations on this page can't re-trigger printing.
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
    handlePrintDaySheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, daySheet, paymentsLoaded]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handlePrintDaySheet = async () => {
    if (!daySheet) return;
    setIsPrinting(true);
    try {
      await printDaySheetPDF(
        {
          id: daySheet.id,
          sheet_date: daySheet.sheet_date,
          sheet_number: daySheet.sheet_number || undefined,
          status: daySheet.status,
          total_cash: daySheet.total_cash || 0,
          total_checks: daySheet.total_checks || 0,
          total_credit_cards: daySheet.total_credit_cards || 0,
          total_debit_cards: daySheet.total_debit_cards || 0,
          total_ach: daySheet.total_ach || 0,
          total_agency_bill: daySheet.total_agency_bill || 0,
          total_other: daySheet.total_other || 0,
          grand_total: daySheet.grand_total || 0,
          payment_count: daySheet.payment_count || 0,
          check_count: daySheet.check_count || 0,
          notes: daySheet.notes || undefined,
        },
        recordedPayments,
        'Lewis Insurance Agency'
      );
    } catch (error) {
      console.error('Failed to print PDF:', error);
      toast({
        title: 'Could not generate the PDF',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadDaySheet = async () => {
    if (!daySheet) return;
    setIsPrinting(true);
    try {
      await downloadDaySheetPDF(
        {
          id: daySheet.id,
          sheet_date: daySheet.sheet_date,
          sheet_number: daySheet.sheet_number || undefined,
          status: daySheet.status,
          total_cash: daySheet.total_cash || 0,
          total_checks: daySheet.total_checks || 0,
          total_credit_cards: daySheet.total_credit_cards || 0,
          total_debit_cards: daySheet.total_debit_cards || 0,
          total_ach: daySheet.total_ach || 0,
          total_agency_bill: daySheet.total_agency_bill || 0,
          total_other: daySheet.total_other || 0,
          grand_total: daySheet.grand_total || 0,
          payment_count: daySheet.payment_count || 0,
          check_count: daySheet.check_count || 0,
          notes: daySheet.notes || undefined,
        },
        recordedPayments,
        'Lewis Insurance Agency'
      );
    } catch (error) {
      console.error('Failed to download PDF:', error);
    } finally {
      setIsPrinting(false);
    }
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
                {format(parseISO(daySheet.sheet_date), 'EEEE, MMMM d, yyyy')}
              </h1>
            </div>
            {daySheet.sheet_number && (
              <p className="text-muted-foreground font-mono">{daySheet.sheet_number}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadDaySheet} disabled={isPrinting}>
            {isPrinting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download PDF
          </Button>
          <Button variant="outline" onClick={handlePrintDaySheet} disabled={isPrinting}>
            {isPrinting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            Print
          </Button>
          <Button variant="outline" onClick={() => setShowDailyCashDialog(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Daily Cash
          </Button>
          <Button
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
            onClick={() => setShowNewPaymentDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Payment
          </Button>
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
              <Banknote className="h-4 w-4 text-success" />
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
              <Receipt className="h-4 w-4 text-info" />
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
              <CreditCard className="h-4 w-4 text-info" />
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
      {depositableAmount > 0 && (
        <Card className="bg-warning/10 border-warning/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="font-medium">Depositable Amount</p>
                  <p className="text-sm text-muted-foreground">
                    Cash + Checks ready for bank deposit
                  </p>
                </div>
              </div>
              <div className="text-2xl font-bold text-warning">
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
            payments={recordedPayments}
            isLoading={isLoadingPayments}
            onViewPayment={handleViewPayment}
            onEditPayment={handleEditPayment}
            onPrintReceipt={handlePrintReceipt}
          />
        </CardContent>
      </Card>

      {/* New Payment Dialog */}
      <Dialog open={showNewPaymentDialog} onOpenChange={setShowNewPaymentDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Search for a customer, then record their payment.
            </DialogDescription>
          </DialogHeader>
          <RecordPaymentForm
            defaultDaySheetDate={daySheet?.sheet_date}
            onCancel={() => setShowNewPaymentDialog(false)}
            onSuccess={() => setShowNewPaymentDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Payment — same single form, in edit mode */}
      <RecordPaymentModal
        open={!!editingPayment}
        onOpenChange={(open) => !open && setEditingPayment(null)}
        payment={editingPayment}
        onSuccess={() => setEditingPayment(null)}
      />

      {/* Daily Cash Sheet Dialog */}
      <DailyCashDialog
        open={showDailyCashDialog}
        onOpenChange={setShowDailyCashDialog}
        sheetDate={daySheet.sheet_date}
        payments={recordedPayments}
      />
    </div>
    </AppLayout>
  );
}
