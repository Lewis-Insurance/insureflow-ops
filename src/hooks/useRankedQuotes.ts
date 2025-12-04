import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface QuoteCoverage {
  id: string;
  coverage_type: string;
  limit_amount?: string;
  deductible_amount?: string;
  premium_amount?: number;
  is_included: boolean;
  extracted_from_document: boolean;
}

export interface RankedQuote {
  id: string;
  account_id: string;
  quote_ref: string | null;
  carrier_id: string | null;
  line_of_business: string;
  premium: number | null;
  quote_score: number;
  price_score: number;
  coverage_completeness_score: number;
  carrier_rating_score: number;
  deductible_score: number;
  value_score: number;
  ai_recommendation: string | null;
  last_scored_at: string | null;
  status: string | null;
  rank_in_account: number;
  total_quotes_for_account: number;
  carrier_info?: {
    id: string;
    name: string;
  };
  quote_coverages?: QuoteCoverage[];
}

export interface QuoteWithDetails extends RankedQuote {
  account?: {
    id: string;
    name: string;
  };
}

/**
 * Hook to fetch ranked quotes for a specific account
 * Uses materialized view for optimized performance
 */
export function useRankedQuotesByAccount(accountId: string) {
  return useQuery({
    queryKey: ["ranked-quotes", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_rankings")
        .select("*")
        .eq("account_id", accountId)
        .order("quote_score", { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch ranked quotes: ${error.message}`);
      }

      return data as RankedQuote[];
    },
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000, // 2 minutes - balance freshness with performance
  });
}

/**
 * Hook to fetch a single quote with all details including coverages and carrier
 */
export function useQuoteWithDetails(quoteId: string) {
  return useQuery({
    queryKey: ["quote-details", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(`
          *,
          quote_coverages (*),
          carrier_info:carriers!quotes_carrier_id_fkey(
            id,
            name
          ),
          account:accounts!quotes_account_id_fkey(
            id,
            name
          )
        `)
        .eq("id", quoteId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch quote: ${error.message}`);
      }

      return data as QuoteWithDetails;
    },
    enabled: !!quoteId,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch all ranked quotes (optionally filtered)
 * Useful for global quote analysis and comparisons
 */
export function useAllRankedQuotes(filters?: {
  minScore?: number;
  lineOfBusiness?: string;
}) {
  return useQuery({
    queryKey: ["all-ranked-quotes", filters],
    queryFn: async () => {
      let query = supabase
        .from("quote_rankings")
        .select("*")
        .order("quote_score", { ascending: false });

      if (filters?.minScore) {
        query = query.gte("quote_score", filters.minScore);
      }

      if (filters?.lineOfBusiness) {
        query = query.eq("line_of_business", filters.lineOfBusiness);
      }

      const { data, error } = await query.limit(100); // Reasonable limit for performance

      if (error) {
        throw new Error(`Failed to fetch ranked quotes: ${error.message}`);
      }

      return data as RankedQuote[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to get top N quotes by score across all accounts
 * Useful for showcasing best quotes or performance tracking
 */
export function useTopQuotes(limit: number = 10) {
  return useQuery({
    queryKey: ["top-quotes", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_rankings")
        .select("*")
        .order("quote_score", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch top quotes: ${error.message}`);
      }

      return data as RankedQuote[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
