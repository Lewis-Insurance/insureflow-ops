import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  FileText, 
  Calendar, 
  DollarSign, 
  Shield, 
  AlertTriangle,
  TrendingUp,
  CheckCircle2
} from 'lucide-react';

interface DocumentAnalysisResultsProps {
  analysis: any;
  mode: string;
}

export const DocumentAnalysisResults: React.FC<DocumentAnalysisResultsProps> = ({
  analysis,
  mode
}) => {
  if (!analysis) return null;

  const renderParsedData = (data: any) => (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-500" />
          <span className="font-medium">Carrier</span>
        </div>
        <p className="text-lg">{data.carrier_name || 'N/A'}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-500" />
          <span className="font-medium">Policy Number</span>
        </div>
        <p className="text-lg font-mono">{data.policy_number || 'N/A'}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-500" />
          <span className="font-medium">Effective Date</span>
        </div>
        <p>{data.effective_date || 'N/A'}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-500" />
          <span className="font-medium">Premium</span>
        </div>
        <p className="text-lg font-semibold">
          ${data.total_premium?.toLocaleString() || 'N/A'}
        </p>
      </div>
    </div>
  );

  const renderSummary = (summary: any) => (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium mb-2">Executive Summary</h4>
        <p className="text-muted-foreground">{summary.executive_summary}</p>
      </div>

      {summary.key_points && summary.key_points.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Key Points</h4>
          <ul className="list-disc list-inside space-y-1">
            {summary.key_points.map((point: string, idx: number) => (
              <li key={idx} className="text-sm">{point}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.action_items && summary.action_items.length > 0 && (
        <div>
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Action Items
          </h4>
          <ul className="space-y-1">
            {summary.action_items.map((item: string, idx: number) => (
              <li key={idx} className="text-sm flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const renderInsights = (insights: any) => (
    <div className="space-y-4">
      {insights.coverage_adequacy && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Coverage Adequacy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={
              insights.coverage_adequacy.rating === 'excellent' ? 'default' :
              insights.coverage_adequacy.rating === 'good' ? 'secondary' :
              'destructive'
            }>
              {insights.coverage_adequacy.rating}
            </Badge>
            {insights.coverage_adequacy.recommendations && (
              <ul className="mt-2 space-y-1">
                {insights.coverage_adequacy.recommendations.map((rec: string, idx: number) => (
                  <li key={idx} className="text-sm text-muted-foreground">• {rec}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {insights.cross_sell_opportunities && insights.cross_sell_opportunities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Cross-Sell Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {insights.cross_sell_opportunities.map((opp: any, idx: number) => (
                <li key={idx} className="flex items-center justify-between">
                  <span>{opp.product}</span>
                  <Badge variant={opp.priority === 'high' ? 'destructive' : 'secondary'}>
                    {opp.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {mode === 'all' && analysis.parsed_data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Policy Details</CardTitle>
            </CardHeader>
            <CardContent>
              {renderParsedData(analysis.parsed_data)}
            </CardContent>
          </Card>

          {analysis.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {renderSummary(analysis.summary)}
              </CardContent>
            </Card>
          )}

          {analysis.insights && (
            <Card>
              <CardHeader>
                <CardTitle>AI Insights</CardTitle>
              </CardHeader>
              <CardContent>
                {renderInsights(analysis.insights)}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {mode === 'parse' && renderParsedData(analysis)}
      {mode === 'summarize' && renderSummary(analysis)}
      {mode === 'insights' && renderInsights(analysis)}
    </div>
  );
};
