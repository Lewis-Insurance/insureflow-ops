import { useFeedbackAnalytics, useRefreshFeedbackAnalytics } from "@/hooks/useAIFeedback";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, TrendingUp, TrendingDown, ThumbsUp, ThumbsDown, Zap, AlertCircle } from "lucide-react";
import { Loader2 } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

interface AIFeedbackAnalyticsProps {
  days?: number;
}

export function AIFeedbackAnalytics({ days = 30 }: AIFeedbackAnalyticsProps) {
  const { data: analytics, isLoading, error } = useFeedbackAnalytics(days);
  const refreshAnalytics = useRefreshFeedbackAnalytics();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Response Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Response Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load analytics: {error.message}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analytics || analytics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Response Analytics</CardTitle>
          <CardDescription>No feedback data available yet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>Start using AI features and provide feedback to see analytics here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate aggregate metrics
  const totalFeedback = analytics.reduce((sum, a) => sum + a.total_feedback, 0);
  const totalHelpful = analytics.reduce((sum, a) => sum + a.helpful_count, 0);
  const totalNotHelpful = analytics.reduce((sum, a) => sum + a.not_helpful_count, 0);
  const overallHelpfulnessRate = totalFeedback > 0 ? (totalHelpful / totalFeedback) * 100 : 0;
  const avgResponseTime = analytics.reduce((sum, a) => sum + a.avg_response_time, 0) / analytics.length;
  const avgCacheHitRate = analytics.reduce((sum, a) => sum + a.cache_hit_rate, 0) / analytics.length;

  // Prepare chart data (reverse to show oldest to newest)
  const chartData = [...analytics].reverse().map((a) => ({
    date: format(new Date(a.date), "MMM d"),
    helpfulnessRate: a.helpfulness_rate,
    cacheHitRate: a.cache_hit_rate,
    totalFeedback: a.total_feedback,
    helpful: a.helpful_count,
    notHelpful: a.not_helpful_count,
  }));

  const getHelpfulnessColor = (rate: number) => {
    if (rate >= 80) return "text-green-600";
    if (rate >= 60) return "text-blue-600";
    if (rate >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  const getHelpfulnessTrend = (rate: number) => {
    if (rate >= 80) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (rate >= 60) return <TrendingUp className="h-4 w-4 text-blue-600" />;
    return <TrendingDown className="h-4 w-4 text-red-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>AI Response Analytics</CardTitle>
              <CardDescription>
                Feedback metrics for the last {days} days
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshAnalytics.mutate()}
              disabled={refreshAnalytics.isPending}
            >
              {refreshAnalytics.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Key Metrics Grid */}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Feedback</span>
              </div>
              <div className="text-2xl font-bold">{totalFeedback}</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Helpfulness Rate</span>
                {getHelpfulnessTrend(overallHelpfulnessRate)}
              </div>
              <div className={`text-2xl font-bold ${getHelpfulnessColor(overallHelpfulnessRate)}`}>
                {overallHelpfulnessRate.toFixed(1)}%
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Response Time</span>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold">
                {avgResponseTime < 1000
                  ? `${avgResponseTime.toFixed(0)}ms`
                  : `${(avgResponseTime / 1000).toFixed(2)}s`}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Cache Hit Rate</span>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {avgCacheHitRate.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Positive/Negative Breakdown */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-4 p-4 border rounded-lg bg-green-50">
              <ThumbsUp className="h-8 w-8 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-600">{totalHelpful}</div>
                <div className="text-sm text-green-700">Helpful Responses</div>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 border rounded-lg bg-red-50">
              <ThumbsDown className="h-8 w-8 text-red-600" />
              <div>
                <div className="text-2xl font-bold text-red-600">{totalNotHelpful}</div>
                <div className="text-sm text-red-700">Not Helpful Responses</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Helpfulness Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Helpfulness Trend</CardTitle>
          <CardDescription>Daily helpfulness rate over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="helpfulnessRate"
                stroke="#10b981"
                name="Helpfulness Rate (%)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="cacheHitRate"
                stroke="#3b82f6"
                name="Cache Hit Rate (%)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Feedback Volume Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Feedback Volume</CardTitle>
          <CardDescription>Helpful vs not helpful responses by day</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="helpful" fill="#10b981" name="Helpful" />
              <Bar dataKey="notHelpful" fill="#ef4444" name="Not Helpful" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Context Type Breakdown */}
      {analytics.some((a) => a.context_type) && (
        <Card>
          <CardHeader>
            <CardTitle>Feedback by Context</CardTitle>
            <CardDescription>Performance across different AI features</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from(new Set(analytics.map((a) => a.context_type)))
                .filter(Boolean)
                .map((contextType) => {
                  const contextData = analytics.filter((a) => a.context_type === contextType);
                  const contextTotal = contextData.reduce(
                    (sum, a) => sum + a.total_feedback,
                    0
                  );
                  const contextHelpful = contextData.reduce(
                    (sum, a) => sum + a.helpful_count,
                    0
                  );
                  const contextRate =
                    contextTotal > 0 ? (contextHelpful / contextTotal) * 100 : 0;

                  return (
                    <div
                      key={contextType}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium capitalize">
                          {contextType?.replace(/_/g, " ")}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {contextTotal} responses
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            contextRate >= 80
                              ? "default"
                              : contextRate >= 60
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {contextRate.toFixed(1)}% helpful
                        </Badge>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
