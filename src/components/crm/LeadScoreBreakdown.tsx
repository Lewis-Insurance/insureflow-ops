import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, RefreshCw } from "lucide-react";
import { useScoreLead } from "@/hooks/useLeadScoring";

interface ScoringFactors {
  contactInfo: number;
  insuranceNeeds: number;
  premiumPotential: number;
  timeline: number;
  engagement: number;
  source: number;
}

interface LeadScoreBreakdownProps {
  leadId: string;
  score: number;
  factors?: ScoringFactors;
  recommendation?: string;
  lastScoredAt?: string;
}

export function LeadScoreBreakdown({
  leadId,
  score,
  factors,
  recommendation,
  lastScoredAt,
}: LeadScoreBreakdownProps) {
  const scoreLead = useScoreLead();

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-50 border-green-200";
    if (score >= 60) return "text-blue-600 bg-blue-50 border-blue-200";
    if (score >= 40) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const factorLabels = {
    contactInfo: "Contact Info",
    insuranceNeeds: "Insurance Needs",
    premiumPotential: "Premium Potential",
    timeline: "Decision Timeline",
    engagement: "Engagement Level",
    source: "Lead Source",
  };

  const factorMaxScores = {
    contactInfo: 15,
    insuranceNeeds: 25,
    premiumPotential: 25,
    timeline: 20,
    engagement: 10,
    source: 5,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Lead Score
            </CardTitle>
            <CardDescription>
              {lastScoredAt
                ? `Last updated ${new Date(lastScoredAt).toLocaleDateString()}`
                : "Not yet scored"}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => scoreLead.mutate(leadId)}
            disabled={scoreLead.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${scoreLead.isPending ? "animate-spin" : ""}`} />
            Rescore
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Score */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Overall Score</p>
            <p className="text-4xl font-bold">{score}</p>
          </div>
          <Badge className={`text-lg px-4 py-2 ${getScoreColor(score)}`}>
            {score >= 80 ? "Hot Lead" : score >= 60 ? "Warm" : score >= 40 ? "Cool" : "Cold"}
          </Badge>
        </div>

        {/* Recommendation */}
        {recommendation && (
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-1">Recommendation</p>
            <p className="text-sm text-muted-foreground">{recommendation}</p>
          </div>
        )}

        {/* Factor Breakdown */}
        {factors && (
          <div className="space-y-4">
            <p className="text-sm font-medium">Score Breakdown</p>
            {Object.entries(factors).map(([key, value]) => {
              const maxScore = factorMaxScores[key as keyof ScoringFactors];
              const percentage = (value / maxScore) * 100;

              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {factorLabels[key as keyof ScoringFactors]}
                    </span>
                    <span className="font-medium">
                      {value}/{maxScore}
                    </span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              );
            })}
          </div>
        )}

        {!factors && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Score this lead to see detailed breakdown
          </p>
        )}
      </CardContent>
    </Card>
  );
}
