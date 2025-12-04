import { useState } from "react";
import { useRankedQuotesByAccount } from "@/hooks/useRankedQuotes";
import { useBulkScoreQuotes } from "@/hooks/useQuoteScoring";
import { QuoteRankingCard } from "./QuoteRankingCard";
import { QuoteComparisonTable } from "./QuoteComparisonTable";
import { Button } from "@/components/ui/button";
import { RefreshCw, Table2, LayoutGrid, AlertCircle, Trophy } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface QuoteRankingDashboardProps {
  accountId: string;
  onQuoteClick?: (quoteId: string) => void;
}

export function QuoteRankingDashboard({
  accountId,
  onQuoteClick,
}: QuoteRankingDashboardProps) {
  const { data: quotes, isLoading, error } = useRankedQuotesByAccount(accountId);
  const bulkScore = useBulkScoreQuotes();
  const [view, setView] = useState<"grid" | "table">("grid");

  const handleRescoreAll = () => {
    bulkScore.mutate({ accountId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading quote rankings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load quote rankings: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!quotes || quotes.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Quotes Found</AlertTitle>
        <AlertDescription>
          There are no open or pending quotes for this account. Add quotes to see rankings.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Quote Rankings</h2>
          <p className="text-muted-foreground">
            {quotes.length} quote{quotes.length > 1 ? "s" : ""} ranked by overall
            score
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setView(view === "grid" ? "table" : "grid")}
          >
            {view === "grid" ? (
              <>
                <Table2 className="h-4 w-4 mr-2" />
                Table View
              </>
            ) : (
              <>
                <LayoutGrid className="h-4 w-4 mr-2" />
                Grid View
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRescoreAll}
            disabled={bulkScore.isPending}
          >
            {bulkScore.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Rescore All
          </Button>
        </div>
      </div>

      {/* Top Quote Highlight */}
      {quotes.length > 0 && quotes[0].quote_score >= 70 && (
        <Alert className="bg-green-50 border-green-200">
          <Trophy className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-900">
            Top Quote: {quotes[0].carrier_info?.name || "Unknown Carrier"}
          </AlertTitle>
          <AlertDescription className="text-green-800">
            Score: {quotes[0].quote_score}/100 •{" "}
            {quotes[0].premium
              ? `Premium: $${quotes[0].premium.toLocaleString()}`
              : "Premium not set"}
          </AlertDescription>
        </Alert>
      )}

      {/* View Toggle */}
      {view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quotes.map((quote) => (
            <QuoteRankingCard
              key={quote.id}
              quote={quote}
              onClick={() => onQuoteClick?.(quote.id)}
              showRank={true}
            />
          ))}
        </div>
      ) : (
        <QuoteComparisonTable quotes={quotes} />
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">
            {quotes[0].quote_score}
          </div>
          <div className="text-xs text-muted-foreground">Highest Score</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">
            {Math.round(
              quotes.reduce((sum, q) => sum + q.quote_score, 0) / quotes.length
            )}
          </div>
          <div className="text-xs text-muted-foreground">Average Score</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">
            {quotes.filter((q) => q.premium).length > 0
              ? `$${Math.min(
                  ...quotes.filter((q) => q.premium).map((q) => q.premium!)
                ).toLocaleString()}`
              : "N/A"}
          </div>
          <div className="text-xs text-muted-foreground">Lowest Premium</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">
            {quotes.filter((q) => q.quote_score >= 70).length}
          </div>
          <div className="text-xs text-muted-foreground">Strong Quotes</div>
        </div>
      </div>
    </div>
  );
}
