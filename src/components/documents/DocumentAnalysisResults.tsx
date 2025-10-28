import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Calendar, 
  DollarSign, 
  Shield, 
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Sparkles,
  Workflow
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
          <Calendar className="h-4 w-4 text-amber-500" />
          <span className="font-medium">Expiration Date</span>
        </div>
        <p>{data.expiration_date || 'N/A'}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-500" />
          <span className="font-medium">Total Premium</span>
        </div>
        <p className="text-lg font-semibold">
          ${data.total_premium?.toLocaleString() || 'N/A'}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-purple-500" />
          <span className="font-medium">Payment Frequency</span>
        </div>
        <p className="capitalize">{data.payment_frequency || 'N/A'}</p>
      </div>

      {data.coverages && data.coverages.length > 0 && (
        <div className="md:col-span-2 space-y-2">
          <h4 className="font-medium">Coverages</h4>
          <div className="space-y-2">
            {data.coverages.map((coverage: any, idx: number) => (
              <div key={idx} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{coverage.type}</span>
                  {coverage.premium && (
                    <span className="text-sm font-semibold">${coverage.premium}</span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {coverage.limit && <span>Limit: {coverage.limit}</span>}
                  {coverage.deductible && <span className="ml-3">Deductible: {coverage.deductible}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderSummary = (summary: any) => (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-yellow-500" />
          Executive Summary
        </h4>
        <p className="text-muted-foreground">{summary.executive_summary}</p>
      </div>

      {summary.key_points && summary.key_points.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Key Points</h4>
          <ul className="space-y-2">
            {summary.key_points.map((point: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-1 text-green-500 flex-shrink-0" />
                <span className="text-sm">{point}</span>
              </li>
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
          <ul className="space-y-2">
            {summary.action_items.map((item: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded">
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">{idx + 1}.</span>
                <span className="text-sm">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.risk_flags && summary.risk_flags.length > 0 && (
        <div>
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Risk Flags
          </h4>
          <ul className="space-y-1">
            {summary.risk_flags.map((flag: string, idx: number) => (
              <li key={idx} className="text-sm text-red-600 dark:text-red-400">• {flag}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const renderClassification = (classification: any) => (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="font-medium mb-2">Document Type</h4>
          <Badge variant="secondary" className="text-base">
            {classification.document_type}
          </Badge>
        </div>

        <div>
          <h4 className="font-medium mb-2">Insurance Type</h4>
          <Badge variant="secondary" className="text-base">
            {classification.insurance_type}
          </Badge>
        </div>

        <div>
          <h4 className="font-medium mb-2">Business Type</h4>
          <Badge variant="outline" className="text-base">
            {classification.business_type}
          </Badge>
        </div>

        <div>
          <h4 className="font-medium mb-2">Urgency</h4>
          <Badge 
            variant={
              classification.urgency === 'urgent' ? 'destructive' :
              classification.urgency === 'high' ? 'default' :
              'secondary'
            }
            className="text-base"
          >
            {classification.urgency}
          </Badge>
        </div>
      </div>

      {classification.tags && classification.tags.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Tags</h4>
          <div className="flex flex-wrap gap-2">
            {classification.tags.map((tag: string, idx: number) => (
              <Badge key={idx} variant="outline">{tag}</Badge>
            ))}
          </div>
        </div>
      )}

      {classification.reasoning && (
        <div>
          <h4 className="font-medium mb-2">Classification Reasoning</h4>
          <p className="text-sm text-muted-foreground">{classification.reasoning}</p>
        </div>
      )}

      {classification.requires_action && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            ⚠️ This document requires immediate action
          </p>
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
          <CardContent className="space-y-3">
            <div>
              <Badge variant={
                insights.coverage_adequacy.rating === 'excellent' ? 'default' :
                insights.coverage_adequacy.rating === 'good' ? 'secondary' :
                insights.coverage_adequacy.rating === 'adequate' ? 'outline' :
                'destructive'
              }>
                {insights.coverage_adequacy.rating}
              </Badge>
            </div>
            
            {insights.coverage_adequacy.gaps && insights.coverage_adequacy.gaps.length > 0 && (
              <div>
                <h5 className="text-sm font-medium mb-1">Coverage Gaps</h5>
                <ul className="space-y-1">
                  {insights.coverage_adequacy.gaps.map((gap: string, idx: number) => (
                    <li key={idx} className="text-sm text-red-600 dark:text-red-400">• {gap}</li>
                  ))}
                </ul>
              </div>
            )}

            {insights.coverage_adequacy.recommendations && insights.coverage_adequacy.recommendations.length > 0 && (
              <div>
                <h5 className="text-sm font-medium mb-1">Recommendations</h5>
                <ul className="space-y-1">
                  {insights.coverage_adequacy.recommendations.map((rec: string, idx: number) => (
                    <li key={idx} className="text-sm text-muted-foreground">• {rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {insights.cost_analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Cost Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Badge variant={
                insights.cost_analysis.competitiveness === 'bargain' ? 'default' :
                insights.cost_analysis.competitiveness === 'competitive' ? 'secondary' :
                'outline'
              }>
                {insights.cost_analysis.competitiveness}
              </Badge>
            </div>

            {insights.cost_analysis.potential_savings && (
              <div>
                <p className="text-sm text-muted-foreground">Potential Savings</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  ${insights.cost_analysis.potential_savings.toLocaleString()}
                </p>
              </div>
            )}

            {insights.cost_analysis.savings_opportunities && insights.cost_analysis.savings_opportunities.length > 0 && (
              <div>
                <h5 className="text-sm font-medium mb-1">Savings Opportunities</h5>
                <ul className="space-y-1">
                  {insights.cost_analysis.savings_opportunities.map((opp: string, idx: number) => (
                    <li key={idx} className="text-sm text-muted-foreground">• {opp}</li>
                  ))}
                </ul>
              </div>
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
                <li key={idx} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <p className="font-medium">{opp.product}</p>
                    <p className="text-sm text-muted-foreground">{opp.reason}</p>
                  </div>
                  <Badge variant={
                    opp.priority === 'high' ? 'destructive' :
                    opp.priority === 'medium' ? 'default' :
                    'secondary'
                  }>
                    {opp.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {insights.risk_assessment && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Risk Assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Badge variant={
                insights.risk_assessment.risk_level === 'low' ? 'secondary' :
                insights.risk_assessment.risk_level === 'medium' ? 'default' :
                insights.risk_assessment.risk_level === 'high' ? 'destructive' :
                'destructive'
              }>
                {insights.risk_assessment.risk_level} risk
              </Badge>
            </div>

            {insights.risk_assessment.risk_factors && insights.risk_assessment.risk_factors.length > 0 && (
              <div>
                <h5 className="text-sm font-medium mb-1">Risk Factors</h5>
                <ul className="space-y-1">
                  {insights.risk_assessment.risk_factors.map((factor: string, idx: number) => (
                    <li key={idx} className="text-sm text-muted-foreground">• {factor}</li>
                  ))}
                </ul>
              </div>
            )}

            {insights.risk_assessment.mitigation_strategies && insights.risk_assessment.mitigation_strategies.length > 0 && (
              <div>
                <h5 className="text-sm font-medium mb-1">Mitigation Strategies</h5>
                <ul className="space-y-1">
                  {insights.risk_assessment.mitigation_strategies.map((strategy: string, idx: number) => (
                    <li key={idx} className="text-sm text-green-600 dark:text-green-400">• {strategy}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderWorkflow = (workflow: any) => (
    <div className="space-y-4">
      {workflow.triggers && workflow.triggers.length > 0 ? (
        <div className="space-y-3">
          {workflow.triggers.map((trigger: any, idx: number) => (
            <Card key={idx}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Workflow className="h-4 w-4" />
                    {trigger.trigger_type.replace(/_/g, ' ').toUpperCase()}
                  </CardTitle>
                  <Badge variant={
                    trigger.priority === 'urgent' ? 'destructive' :
                    trigger.priority === 'high' ? 'default' :
                    'secondary'
                  }>
                    {trigger.priority}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">{trigger.trigger_reason}</p>
                </div>

                {trigger.recommended_actions && trigger.recommended_actions.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium mb-1">Recommended Actions</h5>
                    <ul className="space-y-1">
                      {trigger.recommended_actions.map((action: string, actionIdx: number) => (
                        <li key={actionIdx} className="text-sm flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Confidence</span>
                  <span className="text-sm font-medium">{trigger.confidence}%</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No workflow triggers identified for this document
          </CardContent>
        </Card>
      )}

      {workflow.manual_review_required && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-400">
                Manual Review Required
              </p>
              {workflow.manual_review_reason && (
                <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">
                  {workflow.manual_review_reason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (mode === 'all' && analysis.parsed_data) {
    return (
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="classification">Classification</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Policy Details</CardTitle>
            </CardHeader>
            <CardContent>
              {renderParsedData(analysis.parsed_data)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {analysis.summary ? renderSummary(analysis.summary) : (
                <p className="text-muted-foreground">No summary available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="classification" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Classification</CardTitle>
            </CardHeader>
            <CardContent>
              {analysis.classification ? renderClassification(analysis.classification) : (
                <p className="text-muted-foreground">No classification available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          {analysis.insights ? renderInsights(analysis.insights) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No insights available
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="workflow" className="mt-4">
          {analysis.workflow ? renderWorkflow(analysis.workflow) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No workflow triggers available
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    );
  }

  // Single mode rendering
  return (
    <Card>
      <CardHeader>
        <CardTitle className="capitalize">{mode} Results</CardTitle>
      </CardHeader>
      <CardContent>
        {mode === 'parse' && renderParsedData(analysis)}
        {mode === 'summarize' && renderSummary(analysis)}
        {mode === 'classify' && renderClassification(analysis)}
        {mode === 'insights' && renderInsights(analysis)}
        {mode === 'workflow' && renderWorkflow(analysis)}
      </CardContent>
    </Card>
  );
};
