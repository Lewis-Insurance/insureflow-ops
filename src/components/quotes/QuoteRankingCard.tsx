import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, DollarSign, Shield, Wrench, TrendingUp } from "lucide-react";
import type { RankedQuote } from "@/hooks/useRankedQuotes";

interface QuoteRankingCardProps {
  quote: RankedQuote;
  onClick?: () => void;
  showRank?: boolean;
}

export function QuoteRankingCard({ quote, onClick, showRank = true }: QuoteRankingCardProps) {
  const getRankBadgeVariant = (rank: number) => {
    if (rank === 1) return "default"; // Gold
    if (rank === 2) return "secondary"; // Silver
    if (rank === 3) return "outline"; // Bronze
    return "outline";
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-green-600";
    if (score >= 70) return "text-blue-600";
    if (score >= 55) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return "bg-green-50 border-green-200";
    if (score >= 70) return "bg-blue-50 border-blue-200";
    if (score >= 55) return "bg-yellow-50 border-yellow-200";
    return "bg-red-50 border-red-200";
  };

  return (
    <Card
      className="hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">
              {quote.carrier_info?.name || "Unknown Carrier"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {quote.quote_ref || `Quote #${quote.id.slice(0, 8)}`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {quote.line_of_business}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {showRank && quote.rank_in_account && (
              <Badge variant={getRankBadgeVariant(quote.rank_in_account)}>
                <Trophy className="h-3 w-3 mr-1" />
                #{quote.rank_in_account}
              </Badge>
            )}
            <Badge
              variant={quote.quote_score >= 70 ? "default" : "secondary"}
              className={getScoreColor(quote.quote_score)}
            >
              {quote.quote_score}/100
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Premium Display */}
        {quote.premium && (
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Annual Premium</span>
            <span className="text-lg font-bold">
              ${quote.premium.toLocaleString()}
            </span>
          </div>
        )}

        {/* Score Breakdown */}
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span>Price Competitiveness</span>
              </div>
              <span className="font-medium">{quote.price_score}/30</span>
            </div>
            <Progress value={(quote.price_score / 30) * 100} className="h-2" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-600" />
                <span>Coverage Completeness</span>
              </div>
              <span className="font-medium">
                {quote.coverage_completeness_score}/25
              </span>
            </div>
            <Progress
              value={(quote.coverage_completeness_score / 25) * 100}
              className="h-2"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-600" />
                <span>Carrier Rating</span>
              </div>
              <span className="font-medium">
                {quote.carrier_rating_score}/20
              </span>
            </div>
            <Progress
              value={(quote.carrier_rating_score / 20) * 100}
              className="h-2"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-purple-600" />
                <span>Deductible Quality</span>
              </div>
              <span className="font-medium">{quote.deductible_score}/15</span>
            </div>
            <Progress
              value={(quote.deductible_score / 15) * 100}
              className="h-2"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-600" />
                <span>Value Score</span>
              </div>
              <span className="font-medium">{quote.value_score}/10</span>
            </div>
            <Progress value={(quote.value_score / 10) * 100} className="h-2" />
          </div>
        </div>

        {/* AI Recommendation */}
        {quote.ai_recommendation && (
          <div
            className={`p-3 border rounded-lg ${getScoreBgColor(
              quote.quote_score
            )}`}
          >
            <p className="text-xs leading-relaxed">
              {quote.ai_recommendation}
            </p>
          </div>
        )}

        {/* Metadata */}
        {quote.last_scored_at && (
          <div className="text-xs text-muted-foreground text-center pt-2 border-t">
            Last scored: {new Date(quote.last_scored_at).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
