import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Trophy } from "lucide-react";
import type { RankedQuote } from "@/hooks/useRankedQuotes";

interface QuoteComparisonTableProps {
  quotes: RankedQuote[];
}

export function QuoteComparisonTable({ quotes }: QuoteComparisonTableProps) {
  if (quotes.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No quotes to compare
      </div>
    );
  }

  // Get all unique coverage types across all quotes
  const allCoverageTypes = new Set<string>();
  quotes.forEach((quote) => {
    quote.quote_coverages?.forEach((cov) =>
      allCoverageTypes.add(cov.coverage_type)
    );
  });

  const coverageTypes = Array.from(allCoverageTypes).sort();

  // Find best value for each metric for highlighting
  const lowestPremium = Math.min(...quotes.map((q) => q.premium || Infinity));
  const highestScore = Math.max(...quotes.map((q) => q.quote_score));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote Comparison Matrix</CardTitle>
        <CardDescription>
          Comparing {quotes.length} quote{quotes.length > 1 ? "s" : ""} across
          all dimensions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px] sticky left-0 bg-background">
                  Criteria
                </TableHead>
                {quotes.map((quote) => (
                  <TableHead key={quote.id} className="text-center min-w-[180px]">
                    <div className="space-y-1">
                      <div className="font-semibold">
                        {quote.carrier_info?.name || "Unknown"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {quote.quote_ref || `#${quote.id.slice(0, 8)}`}
                      </div>
                      <Badge
                        variant={quote.rank_in_account === 1 ? "default" : "secondary"}
                      >
                        <Trophy className="h-3 w-3 mr-1" />
                        Rank #{quote.rank_in_account}
                      </Badge>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Overall Score */}
              <TableRow className="bg-muted/50 font-medium">
                <TableCell className="sticky left-0 bg-muted/50">
                  Overall Score
                </TableCell>
                {quotes.map((quote) => (
                  <TableCell
                    key={quote.id}
                    className={`text-center font-bold text-lg ${
                      quote.quote_score === highestScore
                        ? "text-green-600"
                        : ""
                    }`}
                  >
                    {quote.quote_score}/100
                  </TableCell>
                ))}
              </TableRow>

              {/* Premium */}
              <TableRow>
                <TableCell className="font-medium sticky left-0 bg-background">
                  Annual Premium
                </TableCell>
                {quotes.map((quote) => (
                  <TableCell
                    key={quote.id}
                    className={`text-center ${
                      quote.premium === lowestPremium
                        ? "text-green-600 font-bold"
                        : ""
                    }`}
                  >
                    {quote.premium
                      ? `$${quote.premium.toLocaleString()}`
                      : "N/A"}
                  </TableCell>
                ))}
              </TableRow>

              {/* Score Dimensions */}
              <TableRow className="bg-muted/30">
                <TableCell
                  colSpan={quotes.length + 1}
                  className="font-semibold sticky left-0 bg-muted/30"
                >
                  Score Breakdown
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium pl-8 sticky left-0 bg-background">
                  Price Score
                </TableCell>
                {quotes.map((quote) => (
                  <TableCell key={quote.id} className="text-center">
                    {quote.price_score}/30
                  </TableCell>
                ))}
              </TableRow>

              <TableRow>
                <TableCell className="font-medium pl-8 sticky left-0 bg-background">
                  Coverage Completeness
                </TableCell>
                {quotes.map((quote) => (
                  <TableCell key={quote.id} className="text-center">
                    {quote.coverage_completeness_score}/25
                  </TableCell>
                ))}
              </TableRow>

              <TableRow>
                <TableCell className="font-medium pl-8 sticky left-0 bg-background">
                  Carrier Rating
                </TableCell>
                {quotes.map((quote) => (
                  <TableCell key={quote.id} className="text-center">
                    {quote.carrier_rating_score}/20
                  </TableCell>
                ))}
              </TableRow>

              <TableRow>
                <TableCell className="font-medium pl-8 sticky left-0 bg-background">
                  Deductible Quality
                </TableCell>
                {quotes.map((quote) => (
                  <TableCell key={quote.id} className="text-center">
                    {quote.deductible_score}/15
                  </TableCell>
                ))}
              </TableRow>

              <TableRow>
                <TableCell className="font-medium pl-8 sticky left-0 bg-background">
                  Overall Value
                </TableCell>
                {quotes.map((quote) => (
                  <TableCell key={quote.id} className="text-center">
                    {quote.value_score}/10
                  </TableCell>
                ))}
              </TableRow>

              {/* Coverage Details */}
              {coverageTypes.length > 0 && (
                <>
                  <TableRow className="bg-muted/30">
                    <TableCell
                      colSpan={quotes.length + 1}
                      className="font-semibold sticky left-0 bg-muted/30"
                    >
                      Coverage Details
                    </TableCell>
                  </TableRow>

                  {coverageTypes.slice(0, 10).map((coverageType) => (
                    <TableRow key={coverageType}>
                      <TableCell className="font-medium pl-8 sticky left-0 bg-background">
                        {coverageType}
                      </TableCell>
                      {quotes.map((quote) => {
                        const coverage = quote.quote_coverages?.find(
                          (c) => c.coverage_type === coverageType
                        );
                        return (
                          <TableCell key={quote.id} className="text-center">
                            {coverage?.is_included ? (
                              <div className="space-y-1">
                                <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                                {coverage.limit_amount && (
                                  <div className="text-xs text-muted-foreground">
                                    {coverage.limit_amount}
                                  </div>
                                )}
                                {coverage.deductible_amount && (
                                  <div className="text-xs text-muted-foreground">
                                    Ded: {coverage.deductible_amount}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <XCircle className="h-5 w-5 text-red-400 mx-auto" />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </>
              )}

              {/* AI Recommendations */}
              <TableRow className="bg-muted/30">
                <TableCell
                  colSpan={quotes.length + 1}
                  className="font-semibold sticky left-0 bg-muted/30"
                >
                  AI Recommendations
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium pl-8 sticky left-0 bg-background">
                  Assessment
                </TableCell>
                {quotes.map((quote) => (
                  <TableCell key={quote.id} className="text-xs max-w-[250px]">
                    {quote.ai_recommendation || "No recommendation available"}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
