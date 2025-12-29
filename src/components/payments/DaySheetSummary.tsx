import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Banknote,
  Receipt,
  CreditCard,
  Building2,
  Clock,
  CheckCircle2,
  Archive,
} from 'lucide-react';
import type { DaySheet } from '@/types/payments';

interface DaySheetSummaryProps {
  daySheet: DaySheet;
  showDetailed?: boolean;
}

const statusIcons = {
  open: Clock,
  closed: CheckCircle2,
  deposited: Archive,
};

const statusColors = {
  open: 'bg-blue-100 text-blue-800',
  closed: 'bg-amber-100 text-amber-800',
  deposited: 'bg-green-100 text-green-800',
};

export function DaySheetSummary({ daySheet, showDetailed = false }: DaySheetSummaryProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const StatusIcon = statusIcons[daySheet.status] || Clock;

  // Calculate breakdown percentages
  const total = daySheet.grand_total || 0;
  const breakdown = [
    { label: 'Cash', amount: daySheet.total_cash || 0, icon: Banknote, color: 'bg-green-500' },
    { label: 'Checks', amount: daySheet.total_checks || 0, icon: Receipt, color: 'bg-blue-500' },
    {
      label: 'Cards',
      amount: (daySheet.total_credit_cards || 0) + (daySheet.total_debit_cards || 0),
      icon: CreditCard,
      color: 'bg-purple-500',
    },
    { label: 'ACH', amount: daySheet.total_ach || 0, icon: Building2, color: 'bg-orange-500' },
    {
      label: 'Agency Bill',
      amount: daySheet.total_agency_bill || 0,
      icon: Building2,
      color: 'bg-gray-500',
    },
  ].filter((item) => item.amount > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center ${
                daySheet.status === 'open'
                  ? 'bg-blue-100'
                  : daySheet.status === 'closed'
                  ? 'bg-amber-100'
                  : 'bg-green-100'
              }`}
            >
              <StatusIcon
                className={`h-5 w-5 ${
                  daySheet.status === 'open'
                    ? 'text-blue-600'
                    : daySheet.status === 'closed'
                    ? 'text-amber-600'
                    : 'text-green-600'
                }`}
              />
            </div>
            <div>
              <CardTitle className="text-lg">
                {format(new Date(daySheet.sheet_date), 'EEEE, MMMM d, yyyy')}
              </CardTitle>
              {daySheet.sheet_number && (
                <p className="text-sm text-muted-foreground font-mono">{daySheet.sheet_number}</p>
              )}
            </div>
          </div>
          <Badge className={statusColors[daySheet.status]}>
            {daySheet.status.charAt(0).toUpperCase() + daySheet.status.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Grand Total */}
          <div className="text-center py-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Total Collected</p>
            <p className="text-3xl font-bold">{formatCurrency(total)}</p>
            <p className="text-sm text-muted-foreground">
              {daySheet.payment_count || 0} payment{(daySheet.payment_count || 0) !== 1 ? 's' : ''}
              {daySheet.check_count && daySheet.check_count > 0 && (
                <> &bull; {daySheet.check_count} check{daySheet.check_count !== 1 ? 's' : ''}</>
              )}
            </p>
          </div>

          {/* Payment Method Breakdown */}
          {showDetailed && breakdown.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Payment Breakdown</p>
              {breakdown.map((item) => {
                const percentage = total > 0 ? (item.amount / total) * 100 : 0;
                const Icon = item.icon;
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span>{item.label}</span>
                      </div>
                      <span className="font-medium">{formatCurrency(item.amount)}</span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Stats Grid (non-detailed view) */}
          {!showDetailed && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded bg-green-50">
                <Banknote className="h-4 w-4 mx-auto text-green-600" />
                <p className="text-xs text-muted-foreground mt-1">Cash</p>
                <p className="font-medium text-sm">{formatCurrency(daySheet.total_cash || 0)}</p>
              </div>
              <div className="p-2 rounded bg-blue-50">
                <Receipt className="h-4 w-4 mx-auto text-blue-600" />
                <p className="text-xs text-muted-foreground mt-1">Checks</p>
                <p className="font-medium text-sm">{formatCurrency(daySheet.total_checks || 0)}</p>
              </div>
              <div className="p-2 rounded bg-purple-50">
                <CreditCard className="h-4 w-4 mx-auto text-purple-600" />
                <p className="text-xs text-muted-foreground mt-1">Cards</p>
                <p className="font-medium text-sm">
                  {formatCurrency((daySheet.total_credit_cards || 0) + (daySheet.total_debit_cards || 0))}
                </p>
              </div>
              <div className="p-2 rounded bg-orange-50">
                <Building2 className="h-4 w-4 mx-auto text-orange-600" />
                <p className="text-xs text-muted-foreground mt-1">ACH</p>
                <p className="font-medium text-sm">{formatCurrency(daySheet.total_ach || 0)}</p>
              </div>
            </div>
          )}

          {/* Timestamps */}
          {daySheet.status !== 'open' && (
            <div className="pt-3 border-t text-sm text-muted-foreground">
              {daySheet.closed_at && (
                <p>Closed: {format(new Date(daySheet.closed_at), 'MMM d, yyyy h:mm a')}</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
