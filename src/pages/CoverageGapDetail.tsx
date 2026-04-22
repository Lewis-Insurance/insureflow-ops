import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useCoverageGapAnalysis,
  useUpdateCoverageGapAnalysis,
  useUpdateCoverageRecommendation,
} from '@/hooks/useCoverageGapAnalysis';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  AlertCircle,
  Shield,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  FileText,
  MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';
import { TableSkeleton } from '@/components/ui/skeleton-components';
import { parseLocalDate } from '@/lib/date/localDate';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function CoverageGapDetail() {
  const { analysisId } = useParams();
  const navigate = useNavigate();
  const { data: analysis, isLoading, error } = useCoverageGapAnalysis(analysisId);
  const updateAnalysisMutation = useUpdateCoverageGapAnalysis();
  const updateRecommendationMutation = useUpdateCoverageRecommendation();

  const [reviewNotes, setReviewNotes] = useState('');
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  const handleMarkReviewed = async () => {
    if (!analysisId) return;

    await updateAnalysisMutation.mutateAsync({
      analysisId,
      updates: {
        status: 'reviewed',
        review_notes: reviewNotes,
      },
    });

    setShowReviewDialog(false);
    setReviewNotes('');
  };

  const handleAcceptRecommendation = async (recommendationId: string) => {
    await updateRecommendationMutation.mutateAsync({
      recommendationId,
      status: 'accepted',
    });
  };

  const handleDeclineRecommendation = async (recommendationId: string) => {
    await updateRecommendationMutation.mutateAsync({
      recommendationId,
      status: 'declined',
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  if (isLoading) {
    return <TableSkeleton rows={5} />;
  }

  if (error || !analysis) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Analysis</AlertTitle>
        <AlertDescription>
          {error?.message || 'Failed to load coverage gap analysis'}
        </AlertDescription>
      </Alert>
    );
  }

  const riskScorePercentage = (analysis.risk_score / 100) * 100;
  const criticalGaps = (analysis.recommendations || []).filter(r => r.gap_severity === 'critical');
  const highGaps = (analysis.recommendations || []).filter(r => r.gap_severity === 'high');

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{analysis.customer_name || 'Coverage Gap Analysis'}</h1>
            <p className="text-muted-foreground">
              Analyzed {format(parseLocalDate(analysis.analysis_date), 'PPP')}
            </p>
          </div>

          {analysis.status === 'pending' && (
            <Button onClick={() => setShowReviewDialog(true)}>
              Mark as Reviewed
            </Button>
          )}
        </div>
      </div>

      {/* Risk Overview Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Score</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analysis.risk_score}/100</div>
            <Progress value={riskScorePercentage} className="mt-2" />
            <Badge variant="outline" className="mt-2">
              {analysis.risk_level?.toUpperCase()}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coverage Gaps</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analysis.recommendations?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {criticalGaps.length} critical · {highGaps.length} high priority
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Premium Impact</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              +${(analysis.estimated_premium_increase || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              New annual: ${(analysis.estimated_annual_premium || 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{analysis.status}</div>
            {analysis.was_sold && (
              <p className="text-xs text-green-600 mt-2 font-medium">
                ✓ Sold for ${(analysis.sale_amount || 0).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Summary */}
      {analysis.ai_summary && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              AI Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{analysis.ai_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* AI Recommendations */}
      {analysis.ai_recommendations && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              AI Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm font-mono">{analysis.ai_recommendations}</p>
          </CardContent>
        </Card>
      )}

      {/* Customer Profile */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Customer Profile</CardTitle>
          <CardDescription>Business information used for analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {analysis.customer_profile?.industry && (
              <div>
                <p className="text-sm font-medium">Industry</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {analysis.customer_profile.industry.replace(/_/g, ' ')}
                </p>
              </div>
            )}
            {analysis.customer_profile?.employees && (
              <div>
                <p className="text-sm font-medium">Employees</p>
                <p className="text-sm text-muted-foreground">
                  {analysis.customer_profile.employees}
                </p>
              </div>
            )}
            {analysis.customer_profile?.revenue && (
              <div>
                <p className="text-sm font-medium">Annual Revenue</p>
                <p className="text-sm text-muted-foreground">
                  ${analysis.customer_profile.revenue.toLocaleString()}
                </p>
              </div>
            )}
            {analysis.customer_profile?.vehicles && (
              <div>
                <p className="text-sm font-medium">Vehicles</p>
                <p className="text-sm text-muted-foreground">
                  {analysis.customer_profile.vehicles}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Risk Factors */}
      {analysis.risk_factors && analysis.risk_factors.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Identified Risk Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.risk_factors.map((factor, index) => (
                <li key={index} className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{factor}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Coverage Recommendations */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Coverage Recommendations</h2>

        {analysis.recommendations && analysis.recommendations.length > 0 ? (
          analysis.recommendations.map((recommendation) => (
            <Card
              key={recommendation.id}
              className={`border-l-4 ${getSeverityColor(recommendation.gap_severity)}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">
                        {recommendation.coverage_name}
                      </CardTitle>
                      <Badge variant={getSeverityBadgeVariant(recommendation.gap_severity)}>
                        {recommendation.gap_severity?.toUpperCase()}
                      </Badge>
                      {recommendation.status !== 'pending' && (
                        <Badge variant="outline" className="capitalize">
                          {recommendation.status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {recommendation.gap_description}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-xl font-bold text-green-600">
                      +${(recommendation.estimated_premium || 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Annual premium</p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">Why This Coverage?</p>
                  <p className="text-sm text-muted-foreground">
                    {recommendation.recommendation_reason}
                  </p>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm font-medium text-red-900 mb-1">
                    ⚠️ Risk If Not Covered
                  </p>
                  <p className="text-sm text-red-700">
                    {recommendation.risk_if_not_covered}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium mb-1">Recommended Limits</p>
                  <p className="text-sm text-muted-foreground">
                    {recommendation.recommended_limits}
                  </p>
                </div>

                {recommendation.status === 'pending' && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => handleAcceptRecommendation(recommendation.id)}
                      disabled={updateRecommendationMutation.isPending}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeclineRecommendation(recommendation.id)}
                      disabled={updateRecommendationMutation.isPending}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Decline
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Excellent Coverage!</AlertTitle>
            <AlertDescription>
              No coverage gaps identified. This customer has comprehensive protection.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Analysis as Reviewed</DialogTitle>
            <DialogDescription>
              Add any notes about your review of this coverage gap analysis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              placeholder="Review notes (optional)..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReviewDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMarkReviewed}
              disabled={updateAnalysisMutation.isPending}
            >
              Mark as Reviewed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
