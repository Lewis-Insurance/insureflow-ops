import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCoverageGapAnalyses, useAnalyzeCoverageGaps } from '@/hooks/useCoverageGapAnalysis';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  TrendingUp,
  Shield,
  DollarSign,
  FileText,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { TableSkeleton } from '@/components/ui/skeleton-components';
import { parseLocalDate } from '@/lib/date/localDate';

export default function CoverageGapAnalysis() {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const { data: analyses, isLoading, error } = useCoverageGapAnalyses(accountId);
  const analyzeMutation = useAnalyzeCoverageGaps();
  const [selectedAnalysis, setSelectedAnalysis] = useState<string | null>(null);

  const handleNewAnalysis = async () => {
    if (!accountId) return;

    await analyzeMutation.mutateAsync({
      account_id: accountId,
      analysis_type: 'manual',
    });
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sold': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'declined': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'quoted': return <FileText className="h-4 w-4 text-blue-600" />;
      case 'reviewed': return <Clock className="h-4 w-4 text-yellow-600" />;
      default: return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  if (isLoading) {
    return <TableSkeleton rows={5} />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Analyses</AlertTitle>
        <AlertDescription>
          {error.message || 'Failed to load coverage gap analyses'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!analyses || analyses.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>No Coverage Gap Analyses</AlertTitle>
          <AlertDescription>
            Run your first coverage gap analysis to identify cross-sell opportunities and protect your customers better.
          </AlertDescription>
        </Alert>

        {accountId && (
          <div className="mt-4">
            <Button
              onClick={handleNewAnalysis}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Run Coverage Analysis
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Calculate summary stats
  const totalGaps = analyses.reduce((sum, a) => (a.identified_gaps?.length || 0) + sum, 0);
  const totalPotentialRevenue = analyses
    .filter(a => a.status === 'pending' || a.status === 'reviewed')
    .reduce((sum, a) => sum + (a.estimated_premium_increase || 0), 0);
  const conversionRate = analyses.length > 0
    ? ((analyses.filter(a => a.was_sold).length / analyses.length) * 100).toFixed(1)
    : '0';

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Coverage Gap Analysis</h1>
          <p className="text-muted-foreground">
            AI-powered coverage gap identification and cross-sell opportunities
          </p>
        </div>
        {accountId && (
          <Button
            onClick={handleNewAnalysis}
            disabled={analyzeMutation.isPending}
          >
            {analyzeMutation.isPending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                New Analysis
              </>
            )}
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Analyses</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyses.length}</div>
            <p className="text-xs text-muted-foreground">
              All time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coverage Gaps</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalGaps}</div>
            <p className="text-xs text-muted-foreground">
              Identified opportunities
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Potential Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalPotentialRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Open opportunities
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground">
              Sold vs total analyses
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Analyses List */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Analyses</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="high-risk">High Risk</TabsTrigger>
          <TabsTrigger value="converted">Converted</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {analyses.map((analysis) => (
            <Card
              key={analysis.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => navigate(`/coverage-gap/${analysis.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">
                        {analysis.customer_name || 'Unknown Customer'}
                      </CardTitle>
                      <Badge variant={getRiskLevelColor(analysis.risk_level)}>
                        {analysis.risk_level?.toUpperCase()} RISK
                      </Badge>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(analysis.status)}
                        <span className="text-sm capitalize">{analysis.status}</span>
                      </div>
                    </div>
                    <CardDescription>
                      Analyzed {format(parseLocalDate(analysis.analysis_date), 'PPP')} ·
                      Risk Score: {analysis.risk_score}/100 ·
                      {analysis.identified_gaps?.length || 0} gap{(analysis.identified_gaps?.length || 0) !== 1 ? 's' : ''} found
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">
                      +${(analysis.estimated_premium_increase || 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Premium opportunity</p>
                  </div>
                </div>
              </CardHeader>

              {analysis.ai_summary && (
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                    {analysis.ai_summary}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {analyses
            .filter(a => a.status === 'pending' || a.status === 'reviewed')
            .map((analysis) => (
              <Card
                key={analysis.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => navigate(`/coverage-gap/${analysis.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">
                          {analysis.customer_name || 'Unknown Customer'}
                        </CardTitle>
                        <Badge variant={getRiskLevelColor(analysis.risk_level)}>
                          {analysis.risk_level?.toUpperCase()} RISK
                        </Badge>
                      </div>
                      <CardDescription>
                        {analysis.identified_gaps?.length || 0} gap{(analysis.identified_gaps?.length || 0) !== 1 ? 's' : ''} ·
                        Score: {analysis.risk_score}/100
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600">
                        +${(analysis.estimated_premium_increase || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
        </TabsContent>

        <TabsContent value="high-risk" className="space-y-4">
          {analyses
            .filter(a => a.risk_level === 'high' || a.risk_level === 'critical')
            .map((analysis) => (
              <Card
                key={analysis.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors border-red-200"
                onClick={() => navigate(`/coverage-gap/${analysis.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <CardTitle className="text-lg">
                          {analysis.customer_name || 'Unknown Customer'}
                        </CardTitle>
                        <Badge variant="destructive">
                          {analysis.risk_level?.toUpperCase()} RISK
                        </Badge>
                      </div>
                      <CardDescription className="text-red-600">
                        {analysis.risk_factors?.length || 0} risk factor{(analysis.risk_factors?.length || 0) !== 1 ? 's' : ''} identified
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold">{analysis.risk_score}/100</div>
                      <p className="text-xs text-muted-foreground">Risk Score</p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
        </TabsContent>

        <TabsContent value="converted" className="space-y-4">
          {analyses
            .filter(a => a.was_sold)
            .map((analysis) => (
              <Card
                key={analysis.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors border-green-200"
                onClick={() => navigate(`/coverage-gap/${analysis.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <CardTitle className="text-lg">
                          {analysis.customer_name || 'Unknown Customer'}
                        </CardTitle>
                        <Badge className="bg-green-100 text-green-800">
                          SOLD
                        </Badge>
                      </div>
                      <CardDescription>
                        Sold {analysis.sold_at ? format(new Date(analysis.sold_at), 'PPP') : 'N/A'}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600">
                        ${(analysis.sale_amount || 0).toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
