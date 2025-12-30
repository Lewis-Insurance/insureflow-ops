import { forwardRef } from 'react';
import { format, parseISO } from 'date-fns';
import type { PremiumPayment } from '@/types/payments';

interface DaySheetData {
  id: string;
  sheet_date: string;
  sheet_number?: string;
  status: 'open' | 'closed' | 'deposited';
  total_cash: number;
  total_checks: number;
  total_credit_cards: number;
  total_debit_cards: number;
  total_ach: number;
  total_agency_bill: number;
  total_other: number;
  grand_total: number;
  payment_count: number;
  check_count: number;
  notes?: string;
  opened_at?: string;
  closed_at?: string;
}

interface DaySheetPrintViewProps {
  daySheet: DaySheetData;
  payments: PremiumPayment[];
  agencyName?: string;
}

const formatCurrency = (amount: number | null | undefined) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount || 0);
};

export const DaySheetPrintView = forwardRef<HTMLDivElement, DaySheetPrintViewProps>(
  ({ daySheet, payments, agencyName = 'Lewis Insurance Agency' }, ref) => {
    const paymentsByMethod = payments.reduce((acc, payment) => {
      const methodName = payment.payment_method?.name || 'Other';
      if (!acc[methodName]) {
        acc[methodName] = [];
      }
      acc[methodName].push(payment);
      return acc;
    }, {} as Record<string, PremiumPayment[]>);

    return (
      <div ref={ref} className="print-view p-8 bg-white text-black max-w-[800px] mx-auto">
        <style>{`
          @media print {
            @page {
              size: letter;
              margin: 0.5in;
            }
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            .print-view {
              font-size: 11pt;
              line-height: 1.4;
            }
            .no-print {
              display: none !important;
            }
            .page-break {
              page-break-before: always;
            }
          }
        `}</style>

        {/* Header */}
        <div className="text-center mb-6 border-b-2 border-black pb-4">
          <h1 className="text-2xl font-bold">{agencyName}</h1>
          <h2 className="text-xl font-semibold mt-2">Daily Payment Sheet</h2>
          <p className="text-lg mt-1">
            {format(parseISO(daySheet.sheet_date), 'EEEE, MMMM d, yyyy')}
          </p>
          {daySheet.sheet_number && (
            <p className="text-sm text-gray-600 mt-1">Sheet #: {daySheet.sheet_number}</p>
          )}
        </div>

        {/* Summary Section */}
        <div className="mb-6 border border-gray-300 p-4">
          <h3 className="font-bold text-lg mb-3 border-b pb-2">Daily Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1">Cash:</td>
                    <td className="text-right font-medium">{formatCurrency(daySheet.total_cash)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Checks ({daySheet.check_count || 0}):</td>
                    <td className="text-right font-medium">{formatCurrency(daySheet.total_checks)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Credit Cards:</td>
                    <td className="text-right font-medium">{formatCurrency(daySheet.total_credit_cards)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Debit Cards:</td>
                    <td className="text-right font-medium">{formatCurrency(daySheet.total_debit_cards)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1">ACH/EFT:</td>
                    <td className="text-right font-medium">{formatCurrency(daySheet.total_ach)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Agency Bill:</td>
                    <td className="text-right font-medium">{formatCurrency(daySheet.total_agency_bill)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Other:</td>
                    <td className="text-right font-medium">{formatCurrency(daySheet.total_other)}</td>
                  </tr>
                  <tr className="border-t-2 border-black">
                    <td className="py-2 font-bold text-base">GRAND TOTAL:</td>
                    <td className="text-right font-bold text-base">{formatCurrency(daySheet.grand_total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t text-center">
            <span className="font-medium">Total Payments: {daySheet.payment_count || 0}</span>
            <span className="mx-4">|</span>
            <span className="font-medium">Status: {daySheet.status.toUpperCase()}</span>
          </div>
        </div>

        {/* Depositable Amount */}
        <div className="mb-6 border-2 border-gray-400 p-3 bg-gray-50">
          <div className="flex justify-between items-center">
            <span className="font-bold">Cash + Checks (Bank Deposit Amount):</span>
            <span className="font-bold text-lg">
              {formatCurrency((daySheet.total_cash || 0) + (daySheet.total_checks || 0))}
            </span>
          </div>
        </div>

        {/* Payment Details */}
        <div className="mb-6">
          <h3 className="font-bold text-lg mb-3 border-b-2 border-black pb-2">Payment Details</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-2 text-left">Receipt #</th>
                <th className="border border-gray-300 px-2 py-2 text-left">Customer</th>
                <th className="border border-gray-300 px-2 py-2 text-left">Policy #</th>
                <th className="border border-gray-300 px-2 py-2 text-left">Method</th>
                <th className="border border-gray-300 px-2 py-2 text-left">Ref/Check #</th>
                <th className="border border-gray-300 px-2 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border border-gray-300 px-2 py-4 text-center text-gray-500">
                    No payments recorded
                  </td>
                </tr>
              ) : (
                payments.map((payment, idx) => (
                  <tr key={payment.id} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                    <td className="border border-gray-300 px-2 py-1.5 font-mono text-xs">
                      {payment.receipt_number || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5">
                      {payment.payer_name || payment.account?.name || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 font-mono text-xs">
                      {payment.policy?.policy_number || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5">
                      {payment.payment_method?.name || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 font-mono text-xs">
                      {payment.check_number || payment.reference_number || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right font-medium">
                      {formatCurrency(payment.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {payments.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={5} className="border border-gray-300 px-2 py-2 text-right">
                    TOTAL:
                  </td>
                  <td className="border border-gray-300 px-2 py-2 text-right">
                    {formatCurrency(payments.reduce((sum, p) => sum + (p.amount || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Check Register (if any checks) */}
        {payments.filter(p => p.payment_method?.type === 'check').length > 0 && (
          <div className="mb-6">
            <h3 className="font-bold text-lg mb-3 border-b-2 border-black pb-2">Check Register</h3>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-2 text-left">Check #</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">Check Date</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">Payer Name</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">Customer/Policy</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments
                  .filter(p => p.payment_method?.type === 'check')
                  .map((payment, idx) => (
                    <tr key={payment.id} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="border border-gray-300 px-2 py-1.5 font-mono">
                        {payment.check_number || '-'}
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5">
                        {payment.check_date ? format(new Date(payment.check_date), 'MM/dd/yyyy') : '-'}
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5">
                        {payment.payer_name || '-'}
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5">
                        {payment.account?.name || '-'}
                        {payment.policy?.policy_number && ` (${payment.policy.policy_number})`}
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right font-medium">
                        {formatCurrency(payment.amount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={4} className="border border-gray-300 px-2 py-2 text-right">
                    TOTAL CHECKS:
                  </td>
                  <td className="border border-gray-300 px-2 py-2 text-right">
                    {formatCurrency(daySheet.total_checks)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Notes */}
        {daySheet.notes && (
          <div className="mb-6">
            <h3 className="font-bold mb-2">Notes:</h3>
            <p className="text-sm p-2 border border-gray-300 bg-gray-50">{daySheet.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t-2 border-black">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-sm mb-4">Prepared By: _______________________</p>
              <p className="text-sm">Date: {format(new Date(), 'MM/dd/yyyy')}</p>
            </div>
            <div>
              <p className="text-sm mb-4">Verified By: _______________________</p>
              <p className="text-sm">Date: _____________</p>
            </div>
          </div>
        </div>

        {/* Print timestamp */}
        <div className="mt-6 text-center text-xs text-gray-400">
          Printed on {format(new Date(), 'MM/dd/yyyy h:mm a')}
        </div>
      </div>
    );
  }
);

DaySheetPrintView.displayName = 'DaySheetPrintView';

export default DaySheetPrintView;
