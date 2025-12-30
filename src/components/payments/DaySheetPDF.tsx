import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import { format, parseISO } from 'date-fns';
import type { PremiumPayment } from '@/types/payments';

// PDF Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#000',
  },
  agencyName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  date: {
    fontSize: 12,
    marginBottom: 3,
  },
  sheetNumber: {
    fontSize: 9,
    color: '#666',
  },
  summarySection: {
    marginBottom: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryColumn: {
    width: '48%',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  summaryLabel: {
    fontSize: 10,
  },
  summaryValue: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    marginTop: 5,
    borderTopWidth: 2,
    borderTopColor: '#000',
  },
  grandTotalLabel: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  grandTotalValue: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
  },
  statsText: {
    fontSize: 10,
    marginHorizontal: 10,
  },
  depositBox: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#999',
  },
  depositRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  depositLabel: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  depositValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  tableRow: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
  tableRowAlt: {
    backgroundColor: '#fafafa',
  },
  tableFooter: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ccc',
    fontWeight: 'bold',
  },
  tableCell: {
    padding: 5,
    fontSize: 9,
  },
  tableCellHeader: {
    padding: 5,
    fontSize: 9,
    fontWeight: 'bold',
  },
  colReceipt: { width: '12%' },
  colCustomer: { width: '20%' },
  colPolicy: { width: '15%' },
  colMethod: { width: '15%' },
  colRef: { width: '15%' },
  colAmount: { width: '13%', textAlign: 'right' },
  colAmountFooter: { width: '77%', textAlign: 'right' },
  footer: {
    marginTop: 30,
    paddingTop: 15,
    borderTopWidth: 2,
    borderTopColor: '#000',
  },
  signatureGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '45%',
  },
  signatureLine: {
    fontSize: 10,
    marginBottom: 15,
  },
  printTimestamp: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 8,
    color: '#999',
  },
});

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
}

interface DaySheetPDFProps {
  daySheet: DaySheetData;
  payments: PremiumPayment[];
  agencyName?: string;
}

const formatCurrency = (amount: number | null | undefined): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount || 0);
};

// The PDF Document component
const DaySheetDocument = ({ daySheet, payments, agencyName = 'Lewis Insurance Agency' }: DaySheetPDFProps) => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.agencyName}>{agencyName}</Text>
        <Text style={styles.title}>Daily Payment Sheet</Text>
        <Text style={styles.date}>
          {format(parseISO(daySheet.sheet_date), 'EEEE, MMMM d, yyyy')}
        </Text>
        {daySheet.sheet_number && (
          <Text style={styles.sheetNumber}>Sheet #: {daySheet.sheet_number}</Text>
        )}
      </View>

      {/* Summary Section */}
      <View style={styles.summarySection}>
        <Text style={styles.sectionTitle}>Daily Summary</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryColumn}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Cash:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(daySheet.total_cash)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Checks ({daySheet.check_count || 0}):</Text>
              <Text style={styles.summaryValue}>{formatCurrency(daySheet.total_checks)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Credit Cards:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(daySheet.total_credit_cards)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Debit Cards:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(daySheet.total_debit_cards)}</Text>
            </View>
          </View>
          <View style={styles.summaryColumn}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>ACH/EFT:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(daySheet.total_ach)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Agency Bill:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(daySheet.total_agency_bill)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Other:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(daySheet.total_other)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>GRAND TOTAL:</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(daySheet.grand_total)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>Total Payments: {daySheet.payment_count || 0}</Text>
          <Text style={styles.statsText}>|</Text>
          <Text style={styles.statsText}>Status: {daySheet.status.toUpperCase()}</Text>
        </View>
      </View>

      {/* Depositable Amount */}
      <View style={styles.depositBox}>
        <View style={styles.depositRow}>
          <Text style={styles.depositLabel}>Cash + Checks (Bank Deposit Amount):</Text>
          <Text style={styles.depositValue}>
            {formatCurrency((daySheet.total_cash || 0) + (daySheet.total_checks || 0))}
          </Text>
        </View>
      </View>

      {/* Payment Details Table */}
      <View style={styles.table}>
        <Text style={styles.sectionTitle}>Payment Details</Text>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCellHeader, styles.colReceipt]}>Receipt #</Text>
          <Text style={[styles.tableCellHeader, styles.colCustomer]}>Customer</Text>
          <Text style={[styles.tableCellHeader, styles.colPolicy]}>Policy #</Text>
          <Text style={[styles.tableCellHeader, styles.colMethod]}>Method</Text>
          <Text style={[styles.tableCellHeader, styles.colRef]}>Ref/Check #</Text>
          <Text style={[styles.tableCellHeader, styles.colAmount]}>Amount</Text>
        </View>

        {/* Table Rows */}
        {payments.length === 0 ? (
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: '100%', textAlign: 'center', color: '#666' }]}>
              No payments recorded
            </Text>
          </View>
        ) : (
          payments.map((payment, idx) => (
            <View key={payment.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
              <Text style={[styles.tableCell, styles.colReceipt]}>{payment.receipt_number || '-'}</Text>
              <Text style={[styles.tableCell, styles.colCustomer]}>
                {payment.payer_name || payment.account?.name || '-'}
              </Text>
              <Text style={[styles.tableCell, styles.colPolicy]}>{payment.policy?.policy_number || '-'}</Text>
              <Text style={[styles.tableCell, styles.colMethod]}>{payment.payment_method?.name || '-'}</Text>
              <Text style={[styles.tableCell, styles.colRef]}>
                {payment.check_number || payment.reference_number || '-'}
              </Text>
              <Text style={[styles.tableCell, styles.colAmount]}>{formatCurrency(payment.amount)}</Text>
            </View>
          ))
        )}

        {/* Table Footer */}
        {payments.length > 0 && (
          <View style={styles.tableFooter}>
            <Text style={[styles.tableCellHeader, styles.colAmountFooter]}>TOTAL:</Text>
            <Text style={[styles.tableCellHeader, styles.colAmount]}>
              {formatCurrency(payments.reduce((sum, p) => sum + (p.amount || 0), 0))}
            </Text>
          </View>
        )}
      </View>

      {/* Footer with signatures */}
      <View style={styles.footer}>
        <View style={styles.signatureGrid}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>Prepared By: _______________________</Text>
            <Text style={styles.signatureLine}>Date: {format(new Date(), 'MM/dd/yyyy')}</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>Verified By: _______________________</Text>
            <Text style={styles.signatureLine}>Date: _____________</Text>
          </View>
        </View>
      </View>

      {/* Print timestamp */}
      <Text style={styles.printTimestamp}>
        Generated on {format(new Date(), 'MM/dd/yyyy h:mm a')}
      </Text>
    </Page>
  </Document>
);

// Function to generate and download the PDF
export async function downloadDaySheetPDF(
  daySheet: DaySheetData,
  payments: PremiumPayment[],
  agencyName?: string
): Promise<void> {
  const blob = await pdf(
    <DaySheetDocument daySheet={daySheet} payments={payments} agencyName={agencyName} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `day-sheet-${daySheet.sheet_date}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Function to open PDF in new tab for printing
export async function printDaySheetPDF(
  daySheet: DaySheetData,
  payments: PremiumPayment[],
  agencyName?: string
): Promise<void> {
  const blob = await pdf(
    <DaySheetDocument daySheet={daySheet} payments={payments} agencyName={agencyName} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

export { DaySheetDocument };
