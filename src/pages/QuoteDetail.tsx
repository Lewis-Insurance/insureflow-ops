import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { QuoteFollowUpTimeline } from "@/components/quotes/QuoteFollowUpTimeline";
import { FollowUpStatsCard } from "@/components/quotes/FollowUpStatsCard";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { AccentSpine, StatusPill, SectionLabel } from "@/components/cc";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, cn } from "@/lib/utils";
import { format } from "date-fns";

// The quote_score is a metric, not a stoplight. Render a tabular number plus a
// plain-language band so the meaning never rides on hue alone (constitution
// rule 3). No per-dimension colors: the bars are uniform; the value carries it.
function scoreBand(score: number | null): string {
  if (!score) return "Unscored";
  if (score >= 85) return "Strong";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  return "Needs work";
}

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
    staleTime: 30 * 1000,
  });

  if (!quoteId) {
    return (
      <AppLayout>
        <div className="p-6 text-sm text-cc-danger">No quote ID provided</div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-cc-text-muted" aria-hidden="true" />
        </div>
      </AppLayout>
    );
  }

  if (error || !quote) {
    return (
      <AppLayout>
        <div className="flex items-center gap-2 p-6 text-sm text-cc-danger">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <span>Failed to load quote: {error?.message || "Unknown error"}</span>
        </div>
      </AppLayout>
    );
  }

  const scoreBars = [
    { label: "Price competitiveness", value: quote.price_score, max: 30 },
    { label: "Coverage completeness", value: quote.coverage_completeness_score, max: 25 },
    { label: "Carrier rating", value: quote.carrier_rating_score, max: 20 },
    { label: "Deductible quality", value: quote.deductible_score, max: 15 },
    { label: "Value", value: quote.value_score, max: 10 },
  ];

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1100px] space-y-6 p-4 md:p-8">
        {/* Header: back + identity + status */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="gap-2 text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-cc-text-primary">
                {quote.quote_ref || `Quote ${quote.id.slice(0, 8)}`}
              </h1>
              <p className="text-sm text-cc-text-muted">{quote.account?.name || "Unknown account"}</p>
            </div>
          </div>
          <StatusPill status={quote.status} />
        </div>

        {/* Hero: the live record carries the single lime spine; premium is the */}
        {/* anchor, the rest of the present-state reads quiet beside it. */}
        <AccentSpine active className="p-5 md:p-6">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
            <div>
              <SectionLabel>Annual premium</SectionLabel>
              <div className="cc-num mt-1 text-3xl font-bold tracking-tight text-cc-text-primary">
                {quote.premium ? formatCurrency(quote.premium) : "N/A"}
              </div>
            </div>
            <div>
              <SectionLabel>Carrier</SectionLabel>
              <div className="mt-1 text-base font-semibold text-cc-text-primary">
                {quote.carrier_info?.name || "Unknown"}
              </div>
              {quote.carrier_info?.rating != null && (
                <div className="cc-num mt-0.5 text-xs text-cc-text-muted">Rating {quote.carrier_info.rating}/5</div>
              )}
            </div>
            <div>
              <SectionLabel>Expires</SectionLabel>
              <div className="mt-1 text-base font-semibold text-cc-text-primary">
                {quote.expires_at ? format(new Date(quote.expires_at), "MMM d, yyyy") : "N/A"}
              </div>
              {quote.quote_score != null && (
                <div className="cc-num mt-0.5 text-xs text-cc-text-muted">
                  Score {quote.quote_score}/100 - {scoreBand(quote.quote_score)}
                </div>
              )}
            </div>
          </div>
        </AccentSpine>

        {/* Score breakdown: uniform neutral bars, value-led */}
        {quote.quote_score != null && (
          <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
            <div className="flex items-center justify-between border-b border-cc-border-subtle px-5 py-3">
              <SectionLabel>Score breakdown</SectionLabel>
              <span className="cc-num text-sm font-semibold text-cc-text-primary">
                {quote.quote_score}
                <span className="text-cc-text-muted">/100</span>
              </span>
            </div>
            <div className="space-y-4 p-5">
              {scoreBars.map((bar) => {
                const value = bar.value || 0;
                const pct = Math.max(0, Math.min(100, (value / bar.max) * 100));
                return (
                  <div key={bar.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-cc-text-secondary">{bar.label}</span>
                      <span className="cc-num font-semibold text-cc-text-primary">
                        {value}
                        <span className="text-cc-text-muted">/{bar.max}</span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-pill bg-cc-surface-overlay">
                      <div className="h-full rounded-pill bg-cc-text-secondary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}

              {quote.ai_recommendation && (
                <div className="border-t border-cc-border-subtle pt-4">
                  <SectionLabel>AI recommendation</SectionLabel>
                  <p className="mt-1.5 text-sm text-cc-text-secondary">{quote.ai_recommendation}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Coverage details */}
        {quote.quote_coverages && quote.quote_coverages.length > 0 && (
          <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
            <div className="border-b border-cc-border-subtle px-5 py-3">
              <SectionLabel>Coverage details</SectionLabel>
            </div>
            <div>
              {quote.quote_coverages.map((coverage: any) => (
                <div
                  key={coverage.id}
                  className="flex items-center justify-between gap-4 border-b border-cc-border-subtle px-5 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-cc-text-primary">{coverage.coverage_type}</div>
                    <div className="cc-num text-sm text-cc-text-muted">
                      {coverage.limit_amount && `Limit ${coverage.limit_amount}`}
                      {coverage.deductible_amount && ` - Deductible ${coverage.deductible_amount}`}
                    </div>
                  </div>
                  {coverage.premium_amount != null && (
                    <div className="text-right">
                      <div className={cn("cc-num whitespace-nowrap font-semibold text-cc-text-primary")}>
                        {formatCurrency(coverage.premium_amount)}
                      </div>
                      <div className="text-xs text-cc-text-muted">Premium</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Follow-up timeline + stats */}
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
