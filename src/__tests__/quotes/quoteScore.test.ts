// ============================================
// Quote Score Tests
// Tests for multi-dimensional quote ranking
// ============================================

import { describe, it, expect } from 'vitest';

// Quote scoring interfaces
interface Quote {
  id: string;
  carrier: string;
  premium: number;
  coverageScore: number;  // 0-100
  carrierRating: number;  // 1-5 stars
  deductible: number;
  limits: {
    liability: number;
    property: number;
  };
}

interface QuoteScoreResult {
  quoteId: string;
  totalScore: number;
  priceScore: number;
  coverageScore: number;
  carrierScore: number;
  rank: number;
}

// Quote scoring algorithm
function calculateQuoteScore(
  quote: Quote,
  allQuotes: Quote[],
  weights: { price: number; coverage: number; carrier: number } = { price: 0.4, coverage: 0.35, carrier: 0.25 }
): QuoteScoreResult {
  // Price score (lower premium = higher score)
  const minPremium = Math.min(...allQuotes.map(q => q.premium));
  const maxPremium = Math.max(...allQuotes.map(q => q.premium));
  const priceRange = maxPremium - minPremium || 1;
  const priceScore = 100 - ((quote.premium - minPremium) / priceRange) * 100;

  // Coverage score (already 0-100)
  const coverageScore = quote.coverageScore;

  // Carrier score (convert 1-5 stars to 0-100)
  const carrierScore = (quote.carrierRating / 5) * 100;

  // Weighted total
  const totalScore =
    (priceScore * weights.price) +
    (coverageScore * weights.coverage) +
    (carrierScore * weights.carrier);

  return {
    quoteId: quote.id,
    totalScore: Math.round(totalScore * 10) / 10,
    priceScore: Math.round(priceScore * 10) / 10,
    coverageScore,
    carrierScore: Math.round(carrierScore * 10) / 10,
    rank: 0, // Set after sorting
  };
}

function rankQuotes(quotes: Quote[], weights?: { price: number; coverage: number; carrier: number }): QuoteScoreResult[] {
  const scores = quotes.map(q => calculateQuoteScore(q, quotes, weights));

  // Sort by total score descending
  scores.sort((a, b) => b.totalScore - a.totalScore);

  // Assign ranks
  scores.forEach((score, index) => {
    score.rank = index + 1;
  });

  return scores;
}

describe('Quote Scoring', () => {
  const sampleQuotes: Quote[] = [
    {
      id: 'quote-1',
      carrier: 'State Farm',
      premium: 1200,
      coverageScore: 85,
      carrierRating: 4.5,
      deductible: 500,
      limits: { liability: 100000, property: 50000 },
    },
    {
      id: 'quote-2',
      carrier: 'Geico',
      premium: 950,
      coverageScore: 75,
      carrierRating: 4.0,
      deductible: 1000,
      limits: { liability: 100000, property: 50000 },
    },
    {
      id: 'quote-3',
      carrier: 'Progressive',
      premium: 1100,
      coverageScore: 90,
      carrierRating: 4.2,
      deductible: 500,
      limits: { liability: 150000, property: 75000 },
    },
    {
      id: 'quote-4',
      carrier: 'Allstate',
      premium: 1400,
      coverageScore: 95,
      carrierRating: 4.8,
      deductible: 250,
      limits: { liability: 200000, property: 100000 },
    },
  ];

  describe('Individual Quote Scoring', () => {
    it('should calculate price score correctly', () => {
      const cheapestQuote = sampleQuotes[1]; // Geico at $950
      const result = calculateQuoteScore(cheapestQuote, sampleQuotes);

      // Cheapest should have price score of 100
      expect(result.priceScore).toBe(100);
    });

    it('should calculate carrier score from rating', () => {
      const topRatedQuote = sampleQuotes[3]; // Allstate at 4.8 stars
      const result = calculateQuoteScore(topRatedQuote, sampleQuotes);

      expect(result.carrierScore).toBe(96); // (4.8/5) * 100
    });

    it('should use coverage score directly', () => {
      const highCoverageQuote = sampleQuotes[3]; // Allstate at 95
      const result = calculateQuoteScore(highCoverageQuote, sampleQuotes);

      expect(result.coverageScore).toBe(95);
    });

    it('should apply weights correctly', () => {
      const quote = sampleQuotes[0];

      // Equal weights
      const equalWeights = { price: 0.33, coverage: 0.34, carrier: 0.33 };
      const result = calculateQuoteScore(quote, sampleQuotes, equalWeights);

      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Quote Ranking', () => {
    it('should rank all quotes', () => {
      const rankings = rankQuotes(sampleQuotes);

      expect(rankings).toHaveLength(4);
      expect(rankings[0].rank).toBe(1);
      expect(rankings[3].rank).toBe(4);
    });

    it('should sort by total score descending', () => {
      const rankings = rankQuotes(sampleQuotes);

      for (let i = 0; i < rankings.length - 1; i++) {
        expect(rankings[i].totalScore).toBeGreaterThanOrEqual(rankings[i + 1].totalScore);
      }
    });

    it('should rank best value quote first with default weights', () => {
      const rankings = rankQuotes(sampleQuotes);

      // The #1 ranked quote should be the best balance of price, coverage, and carrier
      const topRanked = rankings[0];
      expect(topRanked.rank).toBe(1);
      expect(topRanked.totalScore).toBeGreaterThan(70);
    });

    it('should prioritize price when price weight is high', () => {
      const priceWeights = { price: 0.7, coverage: 0.2, carrier: 0.1 };
      const rankings = rankQuotes(sampleQuotes, priceWeights);

      // Cheapest quote (Geico) should rank first
      expect(rankings[0].quoteId).toBe('quote-2');
    });

    it('should prioritize coverage when coverage weight is high', () => {
      const coverageWeights = { price: 0.05, coverage: 0.85, carrier: 0.1 };
      const rankings = rankQuotes(sampleQuotes, coverageWeights);

      // Highest coverage quote (Allstate at 95) should rank first
      expect(rankings[0].quoteId).toBe('quote-4');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single quote', () => {
      const singleQuote = [sampleQuotes[0]];
      const rankings = rankQuotes(singleQuote);

      expect(rankings).toHaveLength(1);
      expect(rankings[0].rank).toBe(1);
      expect(rankings[0].priceScore).toBe(100); // Only quote = best price
    });

    it('should handle quotes with same premium', () => {
      const samePriceQuotes = [
        { ...sampleQuotes[0], premium: 1000 },
        { ...sampleQuotes[1], premium: 1000 },
      ];

      const rankings = rankQuotes(samePriceQuotes);

      // Both should have same price score
      expect(rankings[0].priceScore).toBe(rankings[1].priceScore);
    });

    it('should handle zero premium gracefully', () => {
      const freeQuote = { ...sampleQuotes[0], premium: 0 };
      const quotes = [...sampleQuotes, freeQuote];

      const rankings = rankQuotes(quotes);

      // Free quote should rank very high on price
      const freeRanking = rankings.find(r => r.quoteId === freeQuote.id);
      expect(freeRanking?.priceScore).toBe(100);
    });
  });

  describe('Comparison Utilities', () => {
    function calculateSavings(currentPremium: number, newPremium: number): {
      amount: number;
      percentage: number;
    } {
      const amount = currentPremium - newPremium;
      const percentage = currentPremium > 0 ? (amount / currentPremium) * 100 : 0;
      return {
        amount: Math.round(amount * 100) / 100,
        percentage: Math.round(percentage * 10) / 10,
      };
    }

    it('should calculate savings correctly', () => {
      const savings = calculateSavings(1200, 950);

      expect(savings.amount).toBe(250);
      expect(savings.percentage).toBeCloseTo(20.8, 1);
    });

    it('should handle no savings (higher premium)', () => {
      const savings = calculateSavings(1000, 1200);

      expect(savings.amount).toBe(-200);
      expect(savings.percentage).toBe(-20);
    });

    it('should handle zero current premium', () => {
      const savings = calculateSavings(0, 500);

      expect(savings.amount).toBe(-500);
      expect(savings.percentage).toBe(0);
    });
  });
});
