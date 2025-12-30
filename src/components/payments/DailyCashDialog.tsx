import { useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download, X } from 'lucide-react';
import { DailyCashSheet } from './DailyCashSheet';
import type { PremiumPayment } from '@/types/payments';

interface DailyCashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetDate: string;
  payments: PremiumPayment[];
}

export function DailyCashDialog({
  open,
  onOpenChange,
  sheetDate,
  payments,
}: DailyCashDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;

    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the Daily Cash sheet');
      return;
    }

    // Get the HTML content
    const content = printRef.current.innerHTML;

    // Write the print document
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Daily Cash - ${sheetDate}</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              padding: 0.5in;
              background: white;
            }
            .daily-cash-sheet {
              background: white;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid black;
              padding: 4px 6px;
            }
            th {
              font-weight: normal;
              text-align: left;
            }
            .text-right {
              text-align: right;
            }
            .text-center {
              text-align: center;
            }
            .font-bold {
              font-weight: bold;
            }
            h1 {
              font-size: 16px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 12px;
              letter-spacing: 2px;
            }
            .flex {
              display: flex;
            }
            .justify-between {
              justify-content: space-between;
            }
            .items-start {
              align-items: flex-start;
            }
            .mb-4 {
              margin-bottom: 16px;
            }
            .flex-1 {
              flex: 1;
            }
            .w-16 {
              width: 64px;
            }
            .mt-0 {
              margin-top: 0;
            }
            .p-2 {
              padding: 4px 6px;
            }
            .h-8 {
              height: 24px;
            }
            .mr-1 {
              margin-right: 4px;
            }
            @media print {
              @page {
                size: letter landscape;
                margin: 0.5in;
              }
              body {
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);

    printWindow.document.close();

    // Wait for content to load then print
    printWindow.onload = () => {
      printWindow.print();
    };

    // Fallback: print after a short delay if onload doesn't fire
    setTimeout(() => {
      try {
        printWindow.print();
      } catch (e) {
        // Already printed or window closed
      }
    }, 500);
  }, [sheetDate]);

  const handleDownloadCSV = useCallback(() => {
    // Generate CSV content
    const headers = [
      'Name Insured',
      'Company',
      'Cash to Escrow',
      'M/O or Check to Escrow',
      'Paid to Company',
      'Payment Type',
      'Check #',
    ];

    const getCategory = (type: string | undefined) => {
      if (!type) return 'company';
      const t = type.toLowerCase();
      if (t === 'cash') return 'cash';
      if (t === 'check' || t === 'money_order') return 'check';
      return 'company';
    };

    const getTypeAbbr = (type: string | undefined) => {
      if (!type) return '';
      const t = type.toLowerCase();
      switch (t) {
        case 'cash': return 'cash';
        case 'check': return 'ck';
        case 'money_order': return 'm/o';
        case 'credit_card': return 'cc';
        case 'debit_card': return 'dc';
        case 'ach': return 'eft';
        default: return t;
      }
    };

    const rows = payments.map((p) => {
      const cat = getCategory(p.payment_method?.type);
      const customerName = p.payer_name || p.account?.name || '';
      const carrier = p.policy?.carrier || '';
      const amount = p.amount || 0;

      return [
        customerName,
        carrier,
        cat === 'cash' ? amount.toFixed(2) : '',
        cat === 'check' ? amount.toFixed(2) : '',
        cat === 'company' ? amount.toFixed(2) : '',
        getTypeAbbr(p.payment_method?.type),
        p.check_number || '',
      ];
    });

    // Calculate totals
    const totals = payments.reduce(
      (acc, p) => {
        const cat = getCategory(p.payment_method?.type);
        const amt = p.amount || 0;
        if (cat === 'cash') acc.cash += amt;
        else if (cat === 'check') acc.check += amt;
        else acc.company += amt;
        return acc;
      },
      { cash: 0, check: 0, company: 0 }
    );

    // Add totals row
    rows.push([
      '',
      'Totals',
      totals.cash.toFixed(2),
      totals.check.toFixed(2),
      totals.company.toFixed(2),
      '',
      '',
    ]);

    // Add total to deposit row
    rows.push([
      '',
      'Total to Deposit',
      (totals.cash + totals.check).toFixed(2),
      '',
      '',
      '',
      '',
    ]);

    // Build CSV string
    const csvContent = [
      `Daily Cash - ${sheetDate}`,
      '',
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => (cell.toString().includes(',') ? `"${cell}"` : cell)).join(',')
      ),
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-cash-${sheetDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [payments, sheetDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Daily Cash Sheet</DialogTitle>
          <div className="flex gap-2 no-print">
            <Button variant="outline" size="sm" onClick={handleDownloadCSV}>
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="border rounded-lg overflow-auto">
          <DailyCashSheet ref={printRef} sheetDate={sheetDate} payments={payments} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
