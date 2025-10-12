import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ComparisonResult } from '@/types/insurance-comparison';

interface PDFReportProps {
  comparison: ComparisonResult;
  clientName?: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    borderBottom: 2,
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 3,
  },
  date: {
    fontSize: 10,
    color: '#999',
  },
  section: {
    marginTop: 15,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
    borderBottom: 1,
    borderColor: '#ddd',
    paddingBottom: 4,
  },
  subsectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
    color: '#444',
  },
  text: {
    lineHeight: 1.5,
    marginBottom: 5,
  },
  boldText: {
    fontWeight: 'bold',
  },
  table: {
    marginTop: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 6,
  },
  tableHeader: {
    backgroundColor: '#f5f5f5',
    fontWeight: 'bold',
  },
  tableCol1: {
    width: '30%',
    paddingRight: 5,
  },
  tableCol2: {
    width: '30%',
    paddingRight: 5,
  },
  tableCol3: {
    width: '30%',
    paddingRight: 5,
  },
  tableCol4: {
    width: '10%',
    textAlign: 'center',
  },
  alert: {
    backgroundColor: '#fff3cd',
    border: 1,
    borderColor: '#ffc107',
    padding: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  criticalAlert: {
    backgroundColor: '#f8d7da',
    border: 1,
    borderColor: '#dc3545',
    padding: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  alertText: {
    fontSize: 10,
    color: '#856404',
  },
  criticalAlertText: {
    fontSize: 10,
    color: '#721c24',
    fontWeight: 'bold',
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bulletPoint: {
    width: 15,
    fontSize: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#999',
    textAlign: 'center',
    borderTop: 1,
    borderColor: '#eee',
    paddingTop: 10,
  },
  grid: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 10,
  },
  gridItem: {
    flex: 1,
    border: 1,
    borderColor: '#ddd',
    padding: 8,
  },
  gridLabel: {
    fontSize: 9,
    color: '#666',
    marginBottom: 2,
  },
  gridValue: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  advantageOption1: {
    color: '#28a745',
  },
  advantageOption2: {
    color: '#dc3545',
  },
  advantageNeutral: {
    color: '#6c757d',
  },
});

export const PDFReport = ({ comparison, clientName }: PDFReportProps) => {
  const { option1, option2, differences } = comparison;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const criticalGaps = differences.gaps?.filter(g => g.severity === 'critical') || [];
  const hasGaps = differences.gaps && differences.gaps.length > 0;

  const getAdvantageColor = (advantage: string) => {
    switch (advantage) {
      case 'option1':
        return styles.advantageOption1;
      case 'option2':
        return styles.advantageOption2;
      default:
        return styles.advantageNeutral;
    }
  };

  return (
    <Document
      title={`Insurance Comparison - ${clientName || 'Client'}`}
      author="Insurance Comparison Tool"
      subject="Coverage Analysis"
      creator="Insurance Management System"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Insurance Coverage Comparison Analysis</Text>
          {clientName && <Text style={styles.subtitle}>Prepared for: {clientName}</Text>}
          <Text style={styles.date}>
            Generated: {new Date(comparison.analysisDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </Text>
        </View>

        {/* Executive Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <Text style={styles.text}>
            This analysis compares insurance coverage between {option1.carrier} and {option2.carrier}.
          </Text>
          
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Option 1 Premium</Text>
              <Text style={styles.gridValue}>{formatCurrency(option1.totalPremium || 0)}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Option 2 Premium</Text>
              <Text style={styles.gridValue}>{formatCurrency(option2.totalPremium || 0)}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Difference</Text>
              <Text style={styles.gridValue}>{formatCurrency(Math.abs(differences.premiumDifference))}</Text>
            </View>
          </View>

          {hasGaps && criticalGaps.length > 0 && (
            <View style={styles.criticalAlert}>
              <Text style={styles.criticalAlertText}>
                ⚠ CRITICAL: {criticalGaps.length} coverage gap{criticalGaps.length > 1 ? 's' : ''} identified
              </Text>
            </View>
          )}
        </View>

        {/* Coverage Comparison */}
        <View break style={styles.section}>
          <Text style={styles.sectionTitle}>Coverage Comparison</Text>
          
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.tableCol1}>Coverage Type</Text>
              <Text style={styles.tableCol2}>{option1.carrier}</Text>
              <Text style={styles.tableCol3}>{option2.carrier}</Text>
              <Text style={styles.tableCol4}>Status</Text>
            </View>

            {differences.coverageDifferences.map((diff, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={styles.tableCol1}>{diff.coverageType}</Text>
                <Text style={[styles.tableCol2, getAdvantageColor(diff.advantage === 'option1' ? 'option1' : 'neutral')]}>
                  {diff.option1Value}
                </Text>
                <Text style={[styles.tableCol3, getAdvantageColor(diff.advantage === 'option2' ? 'option2' : 'neutral')]}>
                  {diff.option2Value}
                </Text>
                <Text style={styles.tableCol4}>
                  {diff.option1Value === 'Not Included' || diff.option2Value === 'Not Included' 
                    ? '✗' 
                    : diff.advantage === 'neutral' 
                      ? '✓' 
                      : '≠'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Gap Analysis */}
        {differences.gaps && differences.gaps.length > 0 && (
          <View break style={styles.section}>
            <Text style={styles.sectionTitle}>Gap Analysis</Text>
            
            {criticalGaps.length > 0 && (
              <View>
                <Text style={styles.subsectionTitle}>Critical Gaps</Text>
                {criticalGaps.map((gap, idx) => (
                  <View key={idx} style={styles.criticalAlert}>
                    <Text style={styles.criticalAlertText}>
                      {gap.coverageType} - Missing in {gap.missingIn === 'option1' ? option1.carrier : option2.carrier}
                    </Text>
                    <Text style={[styles.alertText, { marginTop: 4 }]}>
                      {gap.description}
                    </Text>
                    <Text style={[styles.alertText, { marginTop: 2, fontSize: 9 }]}>
                      Recommendation: {gap.recommendation}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {differences.gaps.filter(g => g.severity !== 'critical').length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.subsectionTitle}>Additional Considerations</Text>
                {differences.gaps.filter(g => g.severity !== 'critical').map((gap, idx) => (
                  <View key={idx} style={styles.alert}>
                    <Text style={styles.alertText}>
                      • {gap.coverageType}: {gap.description}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Recommendations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommendations</Text>
          
          {comparison.recommendation && (
            <Text style={styles.text}>{comparison.recommendation}</Text>
          )}

          <View style={{ marginTop: 10 }}>
            {criticalGaps.length > 0 && (
              <View style={styles.bullet}>
                <Text style={styles.bulletPoint}>•</Text>
                <Text style={styles.bulletText}>
                  Address {criticalGaps.length} critical coverage gap{criticalGaps.length > 1 ? 's' : ''} before binding coverage
                </Text>
              </View>
            )}

            <View style={styles.bullet}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}>
                {differences.premiumDifference < 0 
                  ? `${option2.carrier} offers ${Math.abs(differences.premiumPercentage).toFixed(1)}% savings`
                  : `${option1.carrier} offers ${Math.abs(differences.premiumPercentage).toFixed(1)}% savings`}
              </Text>
            </View>

            <View style={styles.bullet}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}>
                Review carrier financial ratings and customer service reviews
              </Text>
            </View>

            <View style={styles.bullet}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}>
                Confirm all coverage details with carrier representatives before final decision
              </Text>
            </View>
          </View>
        </View>

        {/* Risk Assessment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Risk Assessment</Text>
          
          {criticalGaps.length > 0 ? (
            <View style={styles.criticalAlert}>
              <Text style={styles.criticalAlertText}>
                HIGH RISK: Critical coverage gaps identified that could expose the insured to significant financial liability.
              </Text>
            </View>
          ) : (
            <View style={styles.alert}>
              <Text style={styles.alertText}>
                STANDARD RISK: Both options provide adequate coverage for typical exposures.
              </Text>
            </View>
          )}

          <Text style={[styles.text, { marginTop: 10, fontSize: 9, fontStyle: 'italic' }]}>
            This analysis is based on the information provided in the quoted or policy documents. 
            Actual coverage may vary based on policy language, endorsements, and exclusions. 
            Please review complete policy documents before making a final decision.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            This comparison report is for informational purposes only and does not constitute insurance advice or a recommendation.
          </Text>
          <Text style={{ marginTop: 2 }}>
            Generated by Insurance Comparison Tool • Page 1 of 1
          </Text>
        </View>
      </Page>
    </Document>
  );
};
