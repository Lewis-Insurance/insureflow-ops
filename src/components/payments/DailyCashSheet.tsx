import { forwardRef } from 'react';
import { format, parseISO } from 'date-fns';
import type { PremiumPayment } from '@/types/payments';

interface DailyCashSheetProps {
  sheetDate: string;
  payments: PremiumPayment[];
}

// Helper to determine payment category
function getPaymentCategory(methodType: string | undefined): 'cash' | 'check' | 'company' {
  if (!methodType) return 'company';
  const type = methodType.toLowerCase();
  if (type === 'cash') return 'cash';
  if (type === 'check' || type === 'money_order') return 'check';
  return 'company'; // credit_card, debit_card, ach, etc.
}

// Helper to get payment type abbreviation
function getPaymentTypeAbbr(methodType: string | undefined): string {
  if (!methodType) return '';
  const type = methodType.toLowerCase();
  switch (type) {
    case 'cash': return 'cash';
    case 'check': return 'ck';
    case 'money_order': return 'm/o';
    case 'credit_card': return 'cc';
    case 'debit_card': return 'dc';
    case 'ach': return 'eft';
    default: return type.substring(0, 3);
  }
}

// Format currency
function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || amount === 0) return '';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const DailyCashSheet = forwardRef<HTMLDivElement, DailyCashSheetProps>(
  ({ sheetDate, payments }, ref) => {
    // Calculate totals by category
    const totals = payments.reduce(
      (acc, payment) => {
        const category = getPaymentCategory(payment.payment_method?.type);
        const amount = payment.amount || 0;

        if (category === 'cash') {
          acc.cash += amount;
        } else if (category === 'check') {
          acc.check += amount;
        } else {
          acc.company += amount;
        }
        acc.total += amount;
        return acc;
      },
      { cash: 0, check: 0, company: 0, total: 0 }
    );

    // Total to deposit = cash + checks (not credit cards/EFT which go directly to company)
    const totalToDeposit = totals.cash + totals.check;

    // Sort payments: cash first, then checks, then company payments
    const sortedPayments = [...payments].sort((a, b) => {
      const categoryOrder = { cash: 0, check: 1, company: 2 };
      const catA = getPaymentCategory(a.payment_method?.type);
      const catB = getPaymentCategory(b.payment_method?.type);
      return categoryOrder[catA] - categoryOrder[catB];
    });

    // Generate empty rows to fill the page (like the original form)
    const minRows = 25;
    const emptyRowsNeeded = Math.max(0, minRows - sortedPayments.length);

    return (
      <div ref={ref} className="daily-cash-sheet bg-white p-6 font-mono text-sm">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="text-sm font-bold">
            {format(parseISO(sheetDate), 'MM/dd/yy')}
          </div>
          <div className="text-center flex-1">
            <h1 className="text-xl font-bold tracking-wide">DAILY CASH</h1>
          </div>
          <div className="w-16"></div>
        </div>

        {/* Main Table */}
        <table className="w-full border-collapse border border-black">
          <thead>
            <tr>
              <th className="border border-black p-2 text-left font-normal w-[18%]">
                Name Insured
              </th>
              <th className="border border-black p-2 text-left font-normal w-[14%]">
                Company
              </th>
              <th className="border border-black p-2 text-center font-normal w-[14%]">
                Cash to Escrow
              </th>
              <th className="border border-black p-2 text-center font-normal w-[14%]">
                M/O or Check<br />to Escrow
              </th>
              <th className="border border-black p-2 text-center font-normal w-[14%]">
                Paid to Company
              </th>
              <th className="border border-black p-2 text-center font-normal w-[16%]">
                Cash/Check/Money<br />Order/Credit<br />Card/EFT
              </th>
              <th className="border border-black p-2 text-center font-normal w-[10%]">
                Check#
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Payment Rows */}
            {sortedPayments.map((payment) => {
              const category = getPaymentCategory(payment.payment_method?.type);
              const customerName = payment.payer_name || payment.account?.name || '-';
              const carrier = payment.policy?.carrier || '-';

              return (
                <tr key={payment.id}>
                  <td className="border border-black p-2">{customerName}</td>
                  <td className="border border-black p-2">{carrier}</td>
                  <td className="border border-black p-2 text-right">
                    {category === 'cash' && (
                      <>
                        <span className="mr-1">$</span>
                        {formatCurrency(payment.amount)}
                      </>
                    )}
                  </td>
                  <td className="border border-black p-2 text-right">
                    {category === 'check' && (
                      <>
                        <span className="mr-1">$</span>
                        {formatCurrency(payment.amount)}
                      </>
                    )}
                  </td>
                  <td className="border border-black p-2 text-right">
                    {category === 'company' && (
                      <>
                        <span className="mr-1">$</span>
                        {formatCurrency(payment.amount)}
                      </>
                    )}
                  </td>
                  <td className="border border-black p-2 text-center">
                    {getPaymentTypeAbbr(payment.payment_method?.type)}
                  </td>
                  <td className="border border-black p-2 text-center">
                    {payment.check_number || ''}
                  </td>
                </tr>
              );
            })}

            {/* Empty rows to fill page */}
            {Array.from({ length: emptyRowsNeeded }).map((_, idx) => (
              <tr key={`empty-${idx}`}>
                <td className="border border-black p-2 h-8"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Section */}
        <div className="mt-0">
          <table className="border-collapse">
            <tbody>
              <tr>
                <td className="border border-black p-2 w-[18%]"></td>
                <td className="border border-black p-2 w-[14%] font-bold">Totals</td>
                <td className="border border-black p-2 w-[14%] text-right">
                  <span className="mr-1">$</span>
                  {formatCurrency(totals.cash) || '-'}
                </td>
                <td className="border border-black p-2 w-[14%] text-right">
                  <span className="mr-1">$</span>
                  {formatCurrency(totals.check) || '-'}
                </td>
                <td className="border border-black p-2 w-[14%] text-right">
                  <span className="mr-1">$</span>
                  {formatCurrency(totals.company) || '-'}
                </td>
                <td className="border border-black p-2 w-[16%]"></td>
                <td className="border border-black p-2 w-[10%]"></td>
              </tr>
              <tr>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2 font-bold">Total to Deposit</td>
                <td className="border border-black p-2 text-right">
                  <span className="mr-1">$</span>
                  {formatCurrency(totalToDeposit) || '-'}
                </td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }
);

DailyCashSheet.displayName = 'DailyCashSheet';
