import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import type { ComparisonResult } from '@/types/insurance-comparison';
import { GapAnalysisCard } from './GapAnalysisCard';
import { format } from 'date-fns';

interface ComparisonReportProps {
  comparison: ComparisonResult;
}

export const ComparisonReport = ({ comparison }: ComparisonReportProps) => {
  const { option1, option2, differences } = comparison;

  const getAdvantageIcon = (advantage: string) => {
    if (advantage === 'option1') return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (advantage === 'option2') return <TrendingDown className="h-4 w-4 text-blue-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Comparison Summary</CardTitle>
          <CardDescription>
            Generated on {format(comparison.analysisDate, 'PPP')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Option 1</p>
              <p className="text-lg font-semibold">{option1.carrier}</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(option1.totalPremium || 0)}/year
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Option 2</p>
              <p className="text-lg font-semibold">{option2.carrier}</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(option2.totalPremium || 0)}/year
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium mb-2">Premium Difference</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {formatCurrency(Math.abs(differences.premiumDifference))}
              </span>
              <Badge variant={differences.premiumDifference < 0 ? 'default' : 'secondary'}>
                {differences.premiumPercentage > 0 ? '+' : ''}
                {differences.premiumPercentage.toFixed(1)}%
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {differences.premiumDifference < 0 
                ? 'Option 1 is more expensive'
                : 'Option 2 is more expensive'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Gap Analysis */}
      {differences.gaps && <GapAnalysisCard gaps={differences.gaps} />}

      {/* Coverage Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Coverage Analysis</CardTitle>
          <CardDescription>Detailed comparison of policy coverages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {differences.coverageDifferences.map((diff, idx) => (
              <div key={idx} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium flex items-center gap-2">
                    {diff.coverageType}
                    {getAdvantageIcon(diff.advantage)}
                  </h4>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Option 1</p>
                    <p className="font-medium">{diff.option1Value}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Option 2</p>
                    <p className="font-medium">{diff.option2Value}</p>
                  </div>
                </div>

                {diff.description && (
                  <p className="text-sm text-muted-foreground mt-2">{diff.description}</p>
                )}
              </div>
            ))}
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
