import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, AlertCircle, Check, X, AlertTriangle, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { PDFReport } from './PDFReport';
import type { ComparisonResult } from '@/types/insurance-comparison';
import { GapAnalysisCard } from './GapAnalysisCard';
import { format } from 'date-fns';

interface ComparisonReportProps {
  comparison: ComparisonResult;
}

export const ComparisonReport = ({ comparison }: ComparisonReportProps) => {
  const { option1, option2, differences } = comparison;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getCoverageStatus = (diff: any) => {
    if (diff.option1Value === 'Not Included' || diff.option2Value === 'Not Included') {
      return 'gap';
    }
    if (diff.advantage === 'neutral') {
      return 'identical';
    }
    return 'different';
  };

  const displayValue = (val?: string) => {
    if (!val) return '—';
    const v = String(val).trim();
    if (/^yes$/i.test(v)) return 'Included';
    if (/^no$/i.test(v)) return 'Not Included';
    return v;
  };

  const hasGaps = differences.gaps && differences.gaps.length > 0;
  const criticalGaps = differences.gaps?.filter(g => g.severity === 'critical') || [];
  
  // Prepare chart data
  const premiumChartData = [
    {
      name: option1.carrier,
      premium: option1.totalPremium || 0,
      fill: '#8884d8'
    },
    {
      name: option2.carrier,
      premium: option2.totalPremium || 0,
      fill: '#82ca9d'
    }
  ];

  // Generate E&O concerns
  const eoConcerns = criticalGaps.length > 0 
    ? `CRITICAL: ${criticalGaps.length} coverage gap${criticalGaps.length > 1 ? 's' : ''} identified that could expose the insured to significant financial risk. ${criticalGaps.map(g => g.coverageType).join(', ')} missing.`
    : null;

  // Top 3 differences
  const topDifferences = differences.coverageDifferences
    .filter(d => d.advantage !== 'neutral')
    .slice(0, 3)
    .map(d => `${d.coverageType}: ${d.description}`);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Action Bar */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Comparison Report</h2>
          <p className="text-sm text-muted-foreground">
            {option1.carrier} vs {option2.carrier}
          </p>
        </div>
        
        <PDFDownloadLink
          document={<PDFReport comparison={comparison} clientName={option1.insuredName} />}
          fileName={`insurance-comparison-${format(comparison.analysisDate, 'yyyy-MM-dd')}.pdf`}
        >
          {({ loading }) => (
            <Button disabled={loading} className="gap-2">
              <Download className="h-4 w-4" />
              {loading ? 'Generating PDF...' : 'Download PDF Report'}
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Executive Summary</CardTitle>
          <CardDescription>
            Generated on {format(comparison.analysisDate, 'PPP')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant={hasGaps ? "destructive" : "default"}>
            <AlertDescription>
              <strong>{option1.carrier}</strong> vs <strong>{option2.carrier}</strong>: {' '}
              {differences.premiumDifference < 0 ? 'Option 1' : 'Option 2'} is{' '}
              <strong>{Math.abs(differences.premiumPercentage).toFixed(1)}%</strong> more expensive{' '}
              ({formatCurrency(Math.abs(differences.premiumDifference))} difference).{' '}
              {hasGaps && (
                <span className="text-destructive font-semibold">
                  {differences.gaps?.length} coverage gap{differences.gaps && differences.gaps.length > 1 ? 's' : ''} identified.
                </span>
              )}
            </AlertDescription>
          </Alert>

          {topDifferences.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Top Differences</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {topDifferences.map((diff, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Badge variant="outline">{i + 1}</Badge>
                    <span className="text-sm">{diff}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {eoConcerns && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>E&O Concerns</AlertTitle>
              <AlertDescription>{eoConcerns}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Gap Analysis */}
      {differences.gaps && <GapAnalysisCard gaps={differences.gaps} />}

      {/* Coverage Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Coverage Analysis</CardTitle>
          <CardDescription>Detailed comparison of policy coverages</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coverage</TableHead>
                <TableHead>{option1.carrier}</TableHead>
                <TableHead>{option2.carrier}</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {differences.coverageDifferences.map((diff, idx) => {
                const status = getCoverageStatus(diff);
                return (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{diff.coverageType}</TableCell>
                    <TableCell>{displayValue(diff.option1Value)}</TableCell>
                    <TableCell>{displayValue(diff.option2Value)}</TableCell>
                    <TableCell className="text-center">
                      {status === 'identical' && (
                        <div className="flex items-center justify-center gap-1">
                          <Check className="h-4 w-4 text-green-500" />
                          <span className="text-xs text-muted-foreground">Match</span>
                        </div>
                      )}
                      {status === 'different' && (
                        <div className="flex items-center justify-center gap-1">
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                          <span className="text-xs text-muted-foreground">Differs</span>
                        </div>
                      )}
                      {status === 'gap' && (
                        <div className="flex items-center justify-center gap-1">
                          <X className="h-4 w-4 text-red-500" />
                          <span className="text-xs text-destructive font-medium">Gap</span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Premium Analysis with Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Premium Analysis</CardTitle>
          <CardDescription>Visual comparison of annual premiums</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={premiumChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis 
                tickFormatter={(value) => `$${value.toLocaleString()}`}
              />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar 
                dataKey="premium" 
                name="Annual Premium"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Absolute Difference</p>
                <p className="text-lg font-bold">
                  {formatCurrency(Math.abs(differences.premiumDifference))}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Percentage Difference</p>
                <p className="text-lg font-bold">
                  {Math.abs(differences.premiumPercentage).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendation */}
      {comparison.recommendation && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{comparison.recommendation}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
