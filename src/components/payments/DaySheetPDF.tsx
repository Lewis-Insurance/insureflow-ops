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
  companyHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    backgroundColor: '#e8e8e8',
    padding: 5,
    marginTop: 10,
  },
  pageSectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  pgReceipt: { width: '14%' },
  pgCustomer: { width: '34%' },
  pgPolicy: { width: '20%' },
  pgMethod: { width: '16%' },
  pgAmount: { width: '16%', textAlign: 'right' },
  pgAmountFooter: { width: '84%', textAlign: 'right' },
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

// Group a list of payments by insurance company (carrier), sorted alphabetically.
interface CompanyGroup {
  company: string;
  payments: PremiumPayment[];
  subtotal: number;
}

const groupByCompany = (pmts: PremiumPayment[]): CompanyGroup[] => {
  const map = new Map<string, PremiumPayment[]>();
  for (const p of pmts) {
    const key = p.policy?.carrier?.trim() || 'Unknown Company';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([company, list]) => ({
      company,
      payments: list,
      subtotal: list.reduce((s, p) => s + (p.amount || 0), 0),
    }));
};

// A full page listing payments grouped by company for one "Paid To" bucket.
const PaymentsSectionPage = ({
  title,
  payments,
  agencyName,
  sheetDate,
}: {
  title: string;
  payments: PremiumPayment[];
  agencyName: string;
  sheetDate: string;
}) => {
  const groups = groupByCompany(payments);
  const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.agencyName}>{agencyName}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.date}>
          {format(parseISO(sheetDate), 'EEEE, MMMM d, yyyy')}
        </Text>
      </View>

      {groups.length === 0 ? (
        <Text style={{ textAlign: 'center', color: '#666', marginTop: 30 }}>
          No payments in this category.
        </Text>
      ) : (
        groups.map((group) => (
          <View key={group.company} style={styles.table} wrap={false}>
            <Text style={styles.companyHeader}>{group.company}</Text>

            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellHeader, styles.pgReceipt]}>Receipt #</Text>
              <Text style={[styles.tableCellHeader, styles.pgCustomer]}>Customer</Text>
              <Text style={[styles.tableCellHeader, styles.pgPolicy]}>Policy #</Text>
              <Text style={[styles.tableCellHeader, styles.pgMethod]}>Method</Text>
              <Text style={[styles.tableCellHeader, styles.pgAmount]}>Amount</Text>
            </View>

            {group.payments.map((payment, idx) => (
              <View key={payment.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, styles.pgReceipt]}>{payment.receipt_number || '-'}</Text>
                <Text style={[styles.tableCell, styles.pgCustomer]}>
                  {payment.account?.name || payment.payer_name || '-'}
                </Text>
                <Text style={[styles.tableCell, styles.pgPolicy]}>{payment.policy?.policy_number || '-'}</Text>
                <Text style={[styles.tableCell, styles.pgMethod]}>{payment.payment_method?.name || '-'}</Text>
                <Text style={[styles.tableCell, styles.pgAmount]}>{formatCurrency(payment.amount)}</Text>
              </View>
            ))}

            <View style={styles.tableFooter}>
              <Text style={[styles.tableCellHeader, styles.pgAmountFooter]}>
                Subtotal — {group.company}:
              </Text>
              <Text style={[styles.tableCellHeader, styles.pgAmount]}>
                {formatCurrency(group.subtotal)}
              </Text>
            </View>
          </View>
        ))
      )}

      {groups.length > 0 && (
        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>{title} Total:</Text>
          <Text style={styles.grandTotalValue}>{formatCurrency(total)}</Text>
        </View>
      )}

      <Text style={styles.printTimestamp}>
        Generated on {format(new Date(), 'MM/dd/yyyy h:mm a')}
      </Text>
    </Page>
  );
};

// The PDF Document component — 3 pages: Summary, Paid to Escrow, Paid to Company.
const DaySheetDocument = ({ daySheet, payments, agencyName = 'Lewis Insurance Agency' }: DaySheetPDFProps) => {
  const escrowPayments = payments.filter((p) => p.paid_to === 'escrow');
  const companyPayments = payments.filter((p) => p.paid_to === 'company');
  const escrowTotal = escrowPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const companyTotal = companyPayments.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <Document>
      {/* ===== PAGE 1: SUMMARY ===== */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.agencyName}>{agencyName}</Text>
          <Text style={styles.title}>Daily Payment Sheet — Summary</Text>
          <Text style={styles.date}>
            {format(parseISO(daySheet.sheet_date), 'EEEE, MMMM d, yyyy')}
          </Text>
          {daySheet.sheet_number && (
            <Text style={styles.sheetNumber}>Sheet #: {daySheet.sheet_number}</Text>
          )}
        </View>

        {/* Paid To breakdown */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Collected By Destination</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Paid to Escrow:</Text>
            <Text style={styles.summaryValue}>{formatCurrency(escrowTotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Paid to Company:</Text>
            <Text style={styles.summaryValue}>{formatCurrency(companyTotal)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>GRAND TOTAL:</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(daySheet.grand_total)}</Text>
          </View>
        </View>

        {/* Method breakdown */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>By Payment Method</Text>
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
            </View>
            <View style={styles.summaryColumn}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Credit Cards:</Text>
                <Text style={styles.summaryValue}>{formatCurrency(daySheet.total_credit_cards)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>ACH/EFT:</Text>
                <Text style={styles.summaryValue}>{formatCurrency(daySheet.total_ach)}</Text>
              </View>
            </View>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statsText}>Total Payments: {daySheet.payment_count || 0}</Text>
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

        <Text style={styles.printTimestamp}>
          Generated on {format(new Date(), 'MM/dd/yyyy h:mm a')}
        </Text>
      </Page>

      {/* ===== PAGE 2: PAID TO ESCROW ===== */}
      <PaymentsSectionPage
        title="Paid to Escrow"
        payments={escrowPayments}
        agencyName={agencyName}
        sheetDate={daySheet.sheet_date}
      />

      {/* ===== PAGE 3: PAID TO COMPANY ===== */}
      <PaymentsSectionPage
        title="Paid to Company"
        payments={companyPayments}
        agencyName={agencyName}
        sheetDate={daySheet.sheet_date}
      />
    </Document>
  );
};

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
