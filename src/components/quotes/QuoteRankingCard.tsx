import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Trophy, DollarSign, Shield, Wrench, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import type { RankedQuote } from "@/hooks/useRankedQuotes";
import { formatLimitAmount, getTierLabel, getTierColorClass } from "@/hooks/useCoverageLimitStandards";

interface QuoteRankingCardProps {
  quote: RankedQuote;
  onClick?: () => void;
  /** Called on mouse enter - use for prefetching */
  onMouseEnter?: () => void;
  showRank?: boolean;
}

// Default weights if none are provided
const DEFAULT_WEIGHTS = {
  price: 30,
  coverage: 25,
  carrier: 20,
  deductible: 15,
  value: 10,
};

// Helper component for score dimension rows
function ScoreDimensionRow({
  icon,
  label,
  score,
  maxScore,
}: {
  icon: React.ReactNode;
  label: string;
  score: number;
  maxScore: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-medium">{score}/{maxScore}</span>
      </div>
      <Progress value={(score / maxScore) * 100} className="h-2" />
    </div>
  );
}

export const QuoteRankingCard = memo(function QuoteRankingCard({
  quote,
  onClick,
  onMouseEnter,
  showRank = true,
}: QuoteRankingCardProps) {
  // Extract scoring metadata
  const scoringMetadata = quote.scoring_metadata || {};
  const belowMinimumLimits = scoringMetadata.below_minimum_limits || [];
  const coverageTiers = scoringMetadata.coverage_tiers || [];
  const completenessPoints = scoringMetadata.completeness_points ?? Math.round((quote.coverage_completeness_score / 25) * 15);
  const adequacyPoints = scoringMetadata.adequacy_points ?? Math.round((quote.coverage_completeness_score / 25) * 10);

  // Get weights from metadata or use defaults
  const weightsUsed = scoringMetadata.weights_used;
  const weights = weightsUsed
    ? {
        price: weightsUsed.price,
        coverage: weightsUsed.coverage,
        carrier: weightsUsed.carrier,
        deductible: weightsUsed.deductible,
        value: weightsUsed.value,
      }
    : DEFAULT_WEIGHTS;

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
      onMouseEnter={onMouseEnter}
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
        <TooltipProvider>
          <div className="space-y-3">
            {/* Price */}
            <ScoreDimensionRow
              icon={<DollarSign className="h-4 w-4 text-green-600" />}
              label="Price Competitiveness"
              score={quote.price_score}
              maxScore={weights.price}
            />

            {/* Coverage with adequacy indicator */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <span>Coverage</span>
                  {belowMinimumLimits.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="font-medium text-amber-600 mb-1">Limits Below Minimum</p>
                        <ul className="text-xs space-y-1">
                          {belowMinimumLimits.map((item, i) => (
                            <li key={i}>
                              {item.coverage}: {formatLimitAmount(item.limit)} (min: {formatLimitAmount(item.minimum)})
                            </li>
                          ))}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <span className="font-medium">
                  {quote.coverage_completeness_score}/{weights.coverage}
                </span>
              </div>
              {/* Split progress bar for completeness + adequacy */}
              <div className="flex gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-[3]">
                      <Progress
                        value={(completenessPoints / 15) * 100}
                        className="h-2 rounded-r-none"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Completeness: {completenessPoints}/15 pts
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-[2]">
                      <Progress
                        value={(adequacyPoints / 10) * 100}
                        className={`h-2 rounded-l-none ${
                          adequacyPoints < 5 ? '[&>div]:bg-amber-500' : ''
                        }`}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Limit Adequacy: {adequacyPoints}/10 pts
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Carrier Rating */}
            <ScoreDimensionRow
              icon={<Trophy className="h-4 w-4 text-yellow-600" />}
              label="Carrier Rating"
              score={quote.carrier_rating_score}
              maxScore={weights.carrier}
            />

            {/* Deductible */}
            <ScoreDimensionRow
              icon={<Wrench className="h-4 w-4 text-purple-600" />}
              label="Deductible Quality"
              score={quote.deductible_score}
              maxScore={weights.deductible}
            />

            {/* Value */}
            <ScoreDimensionRow
              icon={<TrendingUp className="h-4 w-4 text-orange-600" />}
              label="Value Score"
              score={quote.value_score}
              maxScore={weights.value}
            />
          </div>
        </TooltipProvider>

        {/* Coverage Tiers (if available) */}
        {coverageTiers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {coverageTiers.slice(0, 6).map((tier, i) => (
              <Badge
                key={i}
                variant="outline"
                className={`text-xs ${getTierColorClass(tier.tier)}`}
              >
                {tier.coverage}: {getTierLabel(tier.tier)}
              </Badge>
            ))}
            {coverageTiers.length > 6 && (
              <Badge variant="outline" className="text-xs">
                +{coverageTiers.length - 6} more
              </Badge>
            )}
          </div>
        )}

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
        <div className="text-xs text-muted-foreground text-center pt-2 border-t space-y-1">
          {weightsUsed?.profile_name && (
            <div className="flex items-center justify-center gap-1">
              <CheckCircle className="h-3 w-3" />
              <span>Profile: {weightsUsed.profile_name}</span>
            </div>
          )}
          {quote.last_scored_at && (
            <div>
              Scored: {new Date(quote.last_scored_at).toLocaleString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
