import { useState } from 'react';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/date/localDate';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MoreHorizontal,
  Eye,
  Printer,
  XCircle,
  Search,
  Filter,
  Download,
  Banknote,
  CreditCard,
  Building2,
  Receipt,
  Pencil
} from 'lucide-react';
import type { PremiumPayment, PaymentMethodType } from '@/types/payments';

interface PaymentTableProps {
  payments: PremiumPayment[];
  isLoading?: boolean;
  onViewPayment?: (payment: PremiumPayment) => void;
  onEditPayment?: (payment: PremiumPayment) => void;
  onPrintReceipt?: (payment: PremiumPayment) => void;
  onVoidPayment?: (payment: PremiumPayment) => void;
}

const paymentMethodIcons: Record<PaymentMethodType, React.ElementType> = {
  cash: Banknote,
  check: Receipt,
  credit_card: CreditCard,
  debit_card: CreditCard,
  ach: Building2,
  agency_bill: Building2,
  finance_company: Building2,
  other: Receipt,
};

const statusColors: Record<string, string> = {
  recorded: 'bg-blue-100 text-blue-800',
  deposited: 'bg-green-100 text-green-800',
  cleared: 'bg-emerald-100 text-emerald-800',
  voided: 'bg-red-100 text-red-800',
  nsf: 'bg-orange-100 text-orange-800',
};

export function PaymentTable({
  payments,
  isLoading,
  onViewPayment,
  onEditPayment,
  onPrintReceipt,
  onVoidPayment,
}: PaymentTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  const filteredPayments = payments.filter((payment) => {
    const matchesSearch =
      !searchTerm ||
      payment.receipt_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.payer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (payment as any).account?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.policy?.carrier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.check_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.reference_number?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesMethod = methodFilter === 'all' || payment.payment_method?.type === methodFilter;

    return matchesSearch && matchesMethod;
  });

  const formatPaidTo = (paidTo: string | null | undefined) => {
    if (paidTo === 'company') return 'Company';
    if (paidTo === 'escrow') return 'Escrow';
    return '-';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by receipt #, payer, check #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="check">Check</SelectItem>
              <SelectItem value="credit_card">Credit Card</SelectItem>
              <SelectItem value="ach">ACH/EFT</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Paid To</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPayments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No payments found
                </TableCell>
              </TableRow>
            ) : (
              filteredPayments.map((payment) => {
                const MethodIcon = payment.payment_method?.type
                  ? paymentMethodIcons[payment.payment_method.type as PaymentMethodType]
                  : Receipt;

                return (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <div className="font-medium">
                        {(payment as any).account?.name || 'Unknown'}
                      </div>
                      {payment.receipt_number && (
                        <div className="text-xs text-muted-foreground font-mono">
                          #{payment.receipt_number}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(parseLocalDate(payment.received_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{payment.policy?.carrier || '-'}</div>
                        {payment.policy?.policy_number && (
                          <div className="text-sm text-muted-foreground font-mono">
                            {payment.policy.policy_number}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MethodIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="capitalize">
                          {payment.payment_method?.name || payment.payment_method?.type?.replace('_', ' ')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{formatPaidTo(payment.paid_to)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onViewPayment?.(payment)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {payment.status === 'recorded' && (
                            <DropdownMenuItem onClick={() => onEditPayment?.(payment)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit Payment
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => onPrintReceipt?.(payment)}>
                            <Printer className="h-4 w-4 mr-2" />
                            Print Receipt
                          </DropdownMenuItem>
                          {payment.status === 'recorded' && (
                            <DropdownMenuItem
                              onClick={() => onVoidPayment?.(payment)}
                              className="text-red-600"
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Void Payment
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary Footer */}
      {filteredPayments.length > 0 && (
        <div className="flex justify-between items-center text-sm text-muted-foreground px-2">
          <span>Showing {filteredPayments.length} of {payments.length} payments</span>
          <span className="font-medium">
            Total: {formatCurrency(filteredPayments.reduce((sum, p) => sum + p.amount, 0))}
          </span>
        </div>
      )}
    </div>
  );
}
