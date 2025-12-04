import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertCircle, DollarSign, Calendar, Building, FileText, TrendingUp } from "lucide-react";
import { Loader2 } from "lucide-react";
import { QuoteFollowUpTimeline } from "@/components/quotes/QuoteFollowUpTimeline";
import { FollowUpStatsCard } from "@/components/quotes/FollowUpStatsCard";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export default function QuoteDetail() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const navigate = useNavigate();

  const { data: quote, isLoading, error } = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: async () => {
      if (!quoteId) throw new Error("Quote ID is required");

      const { data, error } = await supabase
        .from("quotes")
        .select(`
          *,
          account:accounts!quotes_account_id_fkey(
            id,
            name,
            type,
            industry
          ),
          carrier_info:carriers!quotes_carrier_id_fkey(
            id,
            name,
            rating
          ),
          quote_coverages(
            id,
            coverage_type,
            limit_amount,
            deductible_amount,
            premium_amount,
            is_included
          )
        `)
        .eq("id", quoteId)
        .single();

      if (error) throw new Error(`Failed to fetch quote: ${error.message}`);
      return data;
    },
    enabled: !!quoteId,
    staleTime: 30 * 1000, // 30 seconds
  });

  if (!quoteId) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-destructive">No quote ID provided</p>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (error || !quote) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load quote: {error?.message || "Unknown error"}</span>
          </div>
        </div>
      </AppLayout>
    );
  }

  const getScoreColor = (score: number | null) => {
    if (!score) return "text-gray-600";
    if (score >= 85) return "text-green-600";
    if (score >= 70) return "text-blue-600";
    if (score >= 55) return "text-yellow-600";
    return "text-red-600";
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      open: "default",
      sent: "secondary",
      accepted: "default",
      rejected: "destructive",
      expired: "secondary",
    };
    return variants[status] || "outline";
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">
                {quote.quote_ref || `Quote #${quote.id.slice(0, 8)}`}
              </h1>
              <p className="text-muted-foreground">
                {quote.account?.name || "Unknown Account"}
              </p>
            </div>
          </div>
          <Badge variant={getStatusBadge(quote.status)}>
            {quote.status}
          </Badge>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Quote Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getScoreColor(quote.quote_score)}`}>
                {quote.quote_score || "N/A"}{quote.quote_score ? "/100" : ""}
              </div>
              <p className="text-xs text-muted-foreground">
                Overall ranking score
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Premium</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {quote.premium ? `$${quote.premium.toLocaleString()}` : "N/A"}
              </div>
              <p className="text-xs text-muted-foreground">Annual premium</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Carrier</CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {quote.carrier_info?.name || "Unknown"}
              </div>
              {quote.carrier_info?.rating && (
                <p className="text-xs text-muted-foreground">
                  Rating: {quote.carrier_info.rating}/5
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expires</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {quote.expires_at
                  ? format(new Date(quote.expires_at), "MMM d, yyyy")
                  : "N/A"}
              </div>
              <p className="text-xs text-muted-foreground">Quote expiration</p>
            </CardContent>
          </Card>
        </div>

        {/* Score Breakdown */}
        {quote.quote_score && (
          <Card>
            <CardHeader>
              <CardTitle>Score Breakdown</CardTitle>
              <CardDescription>
                Multi-dimensional analysis of this quote
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Price Competitiveness</span>
                    <span className="font-semibold">
                      {quote.price_score}/30
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${((quote.price_score || 0) / 30) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Coverage Completeness</span>
                    <span className="font-semibold">
                      {quote.coverage_completeness_score}/25
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{
                        width: `${((quote.coverage_completeness_score || 0) / 25) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Carrier Rating</span>
                    <span className="font-semibold">
                      {quote.carrier_rating_score}/20
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full"
                      style={{
                        width: `${((quote.carrier_rating_score || 0) / 20) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Deductible Quality</span>
                    <span className="font-semibold">
                      {quote.deductible_score}/15
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-yellow-600 h-2 rounded-full"
                      style={{
                        width: `${((quote.deductible_score || 0) / 15) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Value Score</span>
                    <span className="font-semibold">{quote.value_score}/10</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-orange-600 h-2 rounded-full"
                      style={{ width: `${((quote.value_score || 0) / 10) * 100}%` }}
                    />
                  </div>
                </div>

                {quote.ai_recommendation && (
                  <div className="pt-4 border-t">
                    <div className="text-sm font-medium mb-2">AI Recommendation:</div>
                    <div className="text-sm text-muted-foreground">
                      {quote.ai_recommendation}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Coverage Details */}
        {quote.quote_coverages && quote.quote_coverages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Coverage Details</CardTitle>
              <CardDescription>
                Coverages included in this quote
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {quote.quote_coverages.map((coverage: any) => (
                  <div
                    key={coverage.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">{coverage.coverage_type}</div>
                      <div className="text-sm text-muted-foreground">
                        {coverage.limit_amount && `Limit: ${coverage.limit_amount}`}
                        {coverage.deductible_amount &&
                          ` • Deductible: ${coverage.deductible_amount}`}
                      </div>
                    </div>
                    {coverage.premium_amount && (
                      <div className="text-right">
                        <div className="font-semibold">
                          ${coverage.premium_amount.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Premium</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Follow-Up Timeline and Stats */}
        <div className="grid gap-6 md:grid-cols-2">
          <ErrorBoundary level="component">
            <QuoteFollowUpTimeline quoteId={quoteId} />
          </ErrorBoundary>
          <ErrorBoundary level="component">
            <FollowUpStatsCard accountId={quote.account_id} />
          </ErrorBoundary>
        </div>
      </div>
    </AppLayout>
  );
}
