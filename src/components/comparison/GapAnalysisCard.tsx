import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, AlertOctagon, Info } from 'lucide-react';

interface GapAnalysis {
  coverageType: string;
  missingIn: 'option1' | 'option2';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

interface GapAnalysisCardProps {
  gaps: GapAnalysis[];
}

export const GapAnalysisCard = ({ gaps }: GapAnalysisCardProps) => {
  if (gaps.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-green-600" />
            Gap Analysis
          </CardTitle>
          <CardDescription>No critical coverage gaps identified</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Both options provide comprehensive coverage with no major gaps detected.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'default';
      case 'medium':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertOctagon className="h-5 w-5 text-destructive" />;
      case 'high':
      case 'medium':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const criticalGaps = gaps.filter(g => g.severity === 'critical');
  const otherGaps = gaps.filter(g => g.severity !== 'critical');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Gap Analysis
        </CardTitle>
        <CardDescription>
          {criticalGaps.length > 0 && (
            <span className="text-destructive font-medium">
              {criticalGaps.length} critical gap{criticalGaps.length > 1 ? 's' : ''} identified
            </span>
          )}
          {criticalGaps.length === 0 && otherGaps.length > 0 && (
            <span>
              {otherGaps.length} potential improvement{otherGaps.length > 1 ? 's' : ''} identified
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {criticalGaps.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-destructive">Critical Issues</h4>
            {criticalGaps.map((gap, idx) => (
              <Alert key={idx} variant="destructive">
                <div className="flex items-start gap-3">
                  {getSeverityIcon(gap.severity)}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{gap.coverageType}</p>
                      <Badge variant={getSeverityColor(gap.severity)}>
                        {gap.severity.toUpperCase()}
                      </Badge>
                    </div>
                    <AlertDescription className="text-sm">
                      {gap.description}
                    </AlertDescription>
                    <p className="text-xs mt-2 p-2 bg-background rounded border">
                      <strong>Recommendation:</strong> {gap.recommendation}
                    </p>
                  </div>
                </div>
              </Alert>
            ))}
          </div>
        )}

        {otherGaps.length > 0 && (
          <div className="space-y-3">
            {criticalGaps.length > 0 && <div className="border-t pt-4" />}
            <h4 className="font-medium text-sm">Additional Considerations</h4>
            {otherGaps.map((gap, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getSeverityIcon(gap.severity)}
                    <p className="font-medium text-sm">{gap.coverageType}</p>
                  </div>
                  <Badge variant={getSeverityColor(gap.severity)}>
                    {gap.severity}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{gap.description}</p>
                <p className="text-xs text-muted-foreground p-2 bg-muted rounded">
                  <strong>Recommendation:</strong> {gap.recommendation}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
