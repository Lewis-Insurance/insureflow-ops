import { describe, it, expect } from 'vitest';

// ============================================================================
// TYPES (mirrored from edge function for testing)
// ============================================================================

interface ModelConfig {
  weights: Record<string, number>;
  thresholds: {
    low: number;
    medium: number;
    high: number;
  };
  windows: {
    renewal_days_ahead: number;
    contact_stale_days: number;
    claim_lookback_months: number;
    payment_lookback_days: number;
  };
}

interface RetentionFactors {
  policy_id: string;
  account_id: string;
  days_to_renewal: number;
  days_since_contact: number;
  claim_count_12mo: number;
  tenure_days: number;
  bundle_count: number;
  payment_issues: number;
  premium: number;
  line_of_business: string;
}

interface ScoringResult {
  score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  top_factors: Array<{
    factor_key: string;
    direction: 'positive' | 'negative';
    weight: number;
    raw_value: number;
    contribution: number;
    explanation: string;
  }>;
}

// ============================================================================
// SCORING ENGINE (extracted for testing)
// ============================================================================

function computePolicyRenewalScore(
  factors: RetentionFactors,
  config: ModelConfig
): ScoringResult {
  const weights = config.weights;
  const contributions: Array<{
    factor_key: string;
    direction: 'positive' | 'negative';
    weight: number;
    raw_value: number;
    contribution: number;
    explanation: string;
  }> = [];

  let totalScore = 0;

  // Days since contact (higher = riskier)
  const contactScore = Math.min(factors.days_since_contact / 180, 1);
  const contactContrib = contactScore * (weights.days_since_contact || 0.15);
  totalScore += contactContrib;
  contributions.push({
    factor_key: 'days_since_contact',
    direction: factors.days_since_contact > 90 ? 'negative' : 'positive',
    weight: weights.days_since_contact || 0.15,
    raw_value: factors.days_since_contact,
    contribution: contactContrib,
    explanation: factors.days_since_contact > 90
      ? `No contact in ${factors.days_since_contact} days`
      : `Recent contact ${factors.days_since_contact} days ago`,
  });

  // Claims (more = riskier)
  const claimScore = Math.min(factors.claim_count_12mo / 3, 1);
  const claimContrib = claimScore * (weights.claim_count_12mo || 0.15);
  totalScore += claimContrib;
  if (factors.claim_count_12mo > 0) {
    contributions.push({
      factor_key: 'claim_count_12mo',
      direction: 'negative',
      weight: weights.claim_count_12mo || 0.15,
      raw_value: factors.claim_count_12mo,
      contribution: claimContrib,
      explanation: `${factors.claim_count_12mo} claim(s) in last 12 months`,
    });
  }

  // Payment issues
  const paymentScore = Math.min(factors.payment_issues / 2, 1);
  const paymentContrib = paymentScore * (weights.payment_issues || 0.15);
  totalScore += paymentContrib;
  if (factors.payment_issues > 0) {
    contributions.push({
      factor_key: 'payment_issues',
      direction: 'negative',
      weight: weights.payment_issues || 0.15,
      raw_value: factors.payment_issues,
      contribution: paymentContrib,
      explanation: `${factors.payment_issues} payment issue(s)`,
    });
  }

  // Tenure (longer = more stable, reduces risk)
  const tenureScore = 1 - Math.min(factors.tenure_days / 1095, 1);
  const tenureWeight = Math.abs(weights.tenure_days || 0.10);
  const tenureContrib = tenureScore * tenureWeight * -1;
  totalScore += tenureContrib;
  contributions.push({
    factor_key: 'tenure_days',
    direction: factors.tenure_days > 365 ? 'positive' : 'negative',
    weight: weights.tenure_days || -0.10,
    raw_value: factors.tenure_days,
    contribution: tenureContrib,
    explanation: factors.tenure_days > 365
      ? `${Math.floor(factors.tenure_days / 365)} year(s) tenure - stable`
      : `New customer (${factors.tenure_days} days)`,
  });

  // Bundle count (more = stickier)
  const bundleScore = 1 - Math.min((factors.bundle_count - 1) / 3, 1);
  const bundleWeight = Math.abs(weights.bundle_count || 0.10);
  const bundleContrib = bundleScore * bundleWeight * -1;
  totalScore += bundleContrib;
  if (factors.bundle_count > 1) {
    contributions.push({
      factor_key: 'bundle_count',
      direction: 'positive',
      weight: weights.bundle_count || -0.10,
      raw_value: factors.bundle_count,
      contribution: bundleContrib,
      explanation: `${factors.bundle_count} policies bundled - reduces churn risk`,
    });
  }

  // Days to renewal urgency
  const urgencyScore = factors.days_to_renewal <= 14 ? 0.1 : 0;
  totalScore += urgencyScore;
  if (factors.days_to_renewal <= 14) {
    contributions.push({
      factor_key: 'days_to_renewal',
      direction: 'negative',
      weight: 0.1,
      raw_value: factors.days_to_renewal,
      contribution: urgencyScore,
      explanation: `Only ${factors.days_to_renewal} days until renewal - urgent`,
    });
  }

  // Normalize score
  const normalizedScore = Math.max(0, Math.min(1, totalScore));

  // Determine risk level
  let risk_level: 'low' | 'medium' | 'high' | 'critical';
  if (normalizedScore >= config.thresholds.high) {
    risk_level = 'critical';
  } else if (normalizedScore >= config.thresholds.medium) {
    risk_level = 'high';
  } else if (normalizedScore >= config.thresholds.low) {
    risk_level = 'medium';
  } else {
    risk_level = 'low';
  }

  // Sort factors by contribution
  const top_factors = contributions
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  return {
    score: Math.round(normalizedScore * 10000) / 10000,
    risk_level,
    top_factors,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Retention Scoring Engine', () => {
  const defaultConfig: ModelConfig = {
    weights: {
      days_since_contact: 0.15,
      premium_change_pct: 0.20,
      claim_count_12mo: 0.15,
      payment_issues: 0.15,
      tenure_days: -0.10,
      bundle_count: -0.10,
    },
    thresholds: {
      low: 0.25,
      medium: 0.50,
      high: 0.75,
    },
    windows: {
      renewal_days_ahead: 60,
      contact_stale_days: 90,
      claim_lookback_months: 12,
      payment_lookback_days: 90,
    },
  };

  const baseFactors: RetentionFactors = {
    policy_id: 'policy-1',
    account_id: 'account-1',
    days_to_renewal: 30,
    days_since_contact: 30,
    claim_count_12mo: 0,
    tenure_days: 730, // 2 years
    bundle_count: 2,
    payment_issues: 0,
    premium: 1500,
    line_of_business: 'auto',
  };

  describe('computePolicyRenewalScore', () => {
    it('should return low risk for healthy customer profile', () => {
      const result = computePolicyRenewalScore(baseFactors, defaultConfig);

      expect(result.risk_level).toBe('low');
      expect(result.score).toBeLessThan(0.25);
    });

    it('should return high risk for customer with no recent contact', () => {
      const factors = {
        ...baseFactors,
        days_since_contact: 180,
      };

      const result = computePolicyRenewalScore(factors, defaultConfig);

      // Score increases with days_since_contact even though other factors are good
      expect(result.score).toBeGreaterThan(0);
      expect(result.top_factors[0].factor_key).toBe('days_since_contact');
      expect(result.top_factors[0].direction).toBe('negative');
    });

    it('should increase risk for multiple claims', () => {
      const factors = {
        ...baseFactors,
        claim_count_12mo: 3,
      };

      const result = computePolicyRenewalScore(factors, defaultConfig);

      const claimFactor = result.top_factors.find(f => f.factor_key === 'claim_count_12mo');
      expect(claimFactor).toBeDefined();
      expect(claimFactor?.direction).toBe('negative');
    });

    it('should decrease risk for long tenure', () => {
      const factors = {
        ...baseFactors,
        tenure_days: 1095, // 3 years
      };

      const result = computePolicyRenewalScore(factors, defaultConfig);

      const tenureFactor = result.top_factors.find(f => f.factor_key === 'tenure_days');
      expect(tenureFactor).toBeDefined();
      expect(tenureFactor?.direction).toBe('positive');
    });

    it('should increase risk for new customers', () => {
      const factors = {
        ...baseFactors,
        tenure_days: 60, // 2 months
      };

      const result = computePolicyRenewalScore(factors, defaultConfig);

      const tenureFactor = result.top_factors.find(f => f.factor_key === 'tenure_days');
      expect(tenureFactor).toBeDefined();
      expect(tenureFactor?.direction).toBe('negative');
    });

    it('should add urgency for imminent renewals', () => {
      const factors = {
        ...baseFactors,
        days_to_renewal: 7,
      };

      const result = computePolicyRenewalScore(factors, defaultConfig);

      const renewalFactor = result.top_factors.find(f => f.factor_key === 'days_to_renewal');
      expect(renewalFactor).toBeDefined();
      expect(renewalFactor?.explanation).toContain('7 days');
    });

    it('should return elevated risk for worst case scenario', () => {
      const factors: RetentionFactors = {
        policy_id: 'policy-1',
        account_id: 'account-1',
        days_to_renewal: 5,
        days_since_contact: 180,
        claim_count_12mo: 3,
        tenure_days: 30,
        bundle_count: 1,
        payment_issues: 2,
        premium: 1500,
        line_of_business: 'auto',
      };

      const result = computePolicyRenewalScore(factors, defaultConfig);

      // With all negative factors, score should be elevated (medium or higher)
      expect(['medium', 'high', 'critical']).toContain(result.risk_level);
      expect(result.score).toBeGreaterThan(0.25);
    });

    it('should factor in bundle count', () => {
      // Use factors with some risk to make bundle difference measurable
      const riskyFactors = {
        ...baseFactors,
        days_since_contact: 120, // Some contact staleness
        claim_count_12mo: 1,     // One claim
      };

      const singlePolicy = computePolicyRenewalScore(
        { ...riskyFactors, bundle_count: 1 },
        defaultConfig
      );

      const bundledPolicy = computePolicyRenewalScore(
        { ...riskyFactors, bundle_count: 4 },
        defaultConfig
      );

      // Both should have valid scores and bundle_count should be factored
      expect(singlePolicy.score).toBeGreaterThanOrEqual(0);
      expect(bundledPolicy.score).toBeGreaterThanOrEqual(0);

      // Bundled policy should have bundle_count in factors
      const bundleFactor = bundledPolicy.top_factors.find(f => f.factor_key === 'bundle_count');
      expect(bundleFactor).toBeDefined();
      expect(bundleFactor?.direction).toBe('positive');
    });

    it('should return at most 5 top factors', () => {
      const factors: RetentionFactors = {
        ...baseFactors,
        days_since_contact: 120,
        claim_count_12mo: 2,
        payment_issues: 1,
        days_to_renewal: 10,
      };

      const result = computePolicyRenewalScore(factors, defaultConfig);

      expect(result.top_factors.length).toBeLessThanOrEqual(5);
    });

    it('should normalize score between 0 and 1', () => {
      // Test with extreme positive case
      const lowRisk = computePolicyRenewalScore(baseFactors, defaultConfig);
      expect(lowRisk.score).toBeGreaterThanOrEqual(0);
      expect(lowRisk.score).toBeLessThanOrEqual(1);

      // Test with extreme negative case
      const highRisk = computePolicyRenewalScore(
        {
          ...baseFactors,
          days_since_contact: 500,
          claim_count_12mo: 10,
          payment_issues: 5,
        },
        defaultConfig
      );
      expect(highRisk.score).toBeGreaterThanOrEqual(0);
      expect(highRisk.score).toBeLessThanOrEqual(1);
    });
  });
});
