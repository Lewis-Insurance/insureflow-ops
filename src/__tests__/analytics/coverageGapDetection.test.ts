import { describe, it, expect } from 'vitest';

// ============================================================================
// TYPES (mirrored from edge function for testing)
// ============================================================================

interface InsuranceProfile {
  account_id: string;
  lines_held: string[];
  policy_count: number;
  total_premium: number;
  tenure_days: number;
  max_liability_limit: number;
  has_auto: boolean;
  has_home: boolean;
  has_renters: boolean;
  has_umbrella: boolean;
  has_commercial: boolean;
  has_cyber: boolean;
  has_workers_comp: boolean;
}

interface GapRule {
  id: string;
  rule_key: string;
  name: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high';
  logic: {
    requires?: string[];
    requires_liability_min?: number;
    missing?: string[];
    max_lines?: number;
    eligible_for_bundle?: boolean;
  };
  applies_to_lines: string[];
  recommended_action: string | null;
}

interface DetectedGap {
  rule: GapRule;
  confidence: number;
  rationale: {
    rule_key: string;
    trigger_reason: string;
    current_lines: string[];
    missing_lines: string[];
  };
  recommended_next_step: string;
}

// ============================================================================
// GAP DETECTION ENGINE (extracted for testing)
// ============================================================================

function evaluateRule(profile: InsuranceProfile, rule: GapRule): DetectedGap | null {
  const logic = rule.logic;
  const linesHeld = profile.lines_held.map(l => l.toLowerCase());

  // Check if rule applies
  if (rule.applies_to_lines && rule.applies_to_lines.length > 0) {
    const applies = rule.applies_to_lines.some(line =>
      linesHeld.includes(line.toLowerCase())
    );
    if (!applies) {
      return null;
    }
  }

  // Check requires condition
  if (logic.requires) {
    const hasRequired = logic.requires.some(req =>
      linesHeld.includes(req.toLowerCase())
    );
    if (!hasRequired) {
      return null;
    }
  }

  // Check max_lines condition
  if (logic.max_lines !== undefined) {
    if (profile.policy_count > logic.max_lines) {
      return null;
    }
  }

  // Check liability minimum
  if (logic.requires_liability_min !== undefined) {
    if (profile.max_liability_limit < logic.requires_liability_min) {
      return null;
    }
  }

  // Check missing condition
  if (logic.missing) {
    const hasMissing = logic.missing.some(missing =>
      linesHeld.includes(missing.toLowerCase())
    );
    if (hasMissing) {
      return null;
    }
  }

  const missingLines = logic.missing || [];

  return {
    rule,
    confidence: 0.85,
    rationale: {
      rule_key: rule.rule_key,
      trigger_reason: rule.description || `Detected ${rule.name}`,
      current_lines: profile.lines_held,
      missing_lines: missingLines,
    },
    recommended_next_step: rule.recommended_action || `Contact customer about ${missingLines.join(' or ')} coverage`,
  };
}

function detectGaps(profile: InsuranceProfile, rules: GapRule[]): DetectedGap[] {
  const gaps: DetectedGap[] = [];

  for (const rule of rules) {
    const gap = evaluateRule(profile, rule);
    if (gap) {
      gaps.push(gap);
    }
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => severityOrder[a.rule.severity] - severityOrder[b.rule.severity]);

  return gaps;
}

// ============================================================================
// TEST DATA
// ============================================================================

const defaultRules: GapRule[] = [
  {
    id: 'rule-1',
    rule_key: 'auto_no_home',
    name: 'Auto without Home/Renters',
    description: 'Customer has auto insurance but no property coverage',
    severity: 'medium',
    logic: {
      requires: ['auto'],
      missing: ['homeowners', 'renters', 'condo'],
    },
    applies_to_lines: ['auto'],
    recommended_action: 'Contact customer to discuss bundling auto with home/renters',
  },
  {
    id: 'rule-2',
    rule_key: 'home_no_auto',
    name: 'Home without Auto',
    description: 'Customer has home insurance but no auto coverage',
    severity: 'medium',
    logic: {
      requires: ['homeowners', 'renters', 'condo'],
      missing: ['auto'],
    },
    applies_to_lines: ['homeowners', 'renters', 'condo'],
    recommended_action: 'Discuss auto insurance options and bundling benefits',
  },
  {
    id: 'rule-3',
    rule_key: 'high_liability_no_umbrella',
    name: 'High Liability without Umbrella',
    description: 'Customer has high liability limits but no umbrella policy',
    severity: 'high',
    logic: {
      requires_liability_min: 300000,
      missing: ['umbrella', 'personal_umbrella'],
    },
    applies_to_lines: ['auto', 'homeowners'],
    recommended_action: 'Recommend umbrella policy for comprehensive liability protection',
  },
  {
    id: 'rule-4',
    rule_key: 'single_policy_bundle',
    name: 'Single Policy - Bundle Opportunity',
    description: 'Customer has only one policy line - bundling opportunity',
    severity: 'low',
    logic: {
      max_lines: 1,
      eligible_for_bundle: true,
    },
    applies_to_lines: ['auto', 'homeowners', 'renters'],
    recommended_action: 'Discuss multi-policy discounts and bundling options',
  },
];

// ============================================================================
// TESTS
// ============================================================================

describe('Coverage Gap Detection Engine', () => {
  describe('evaluateRule', () => {
    it('should detect auto without home gap', () => {
      const profile: InsuranceProfile = {
        account_id: 'account-1',
        lines_held: ['auto'],
        policy_count: 1,
        total_premium: 1200,
        tenure_days: 365,
        max_liability_limit: 100000,
        has_auto: true,
        has_home: false,
        has_renters: false,
        has_umbrella: false,
        has_commercial: false,
        has_cyber: false,
        has_workers_comp: false,
      };

      const rule = defaultRules.find(r => r.rule_key === 'auto_no_home')!;
      const result = evaluateRule(profile, rule);

      expect(result).not.toBeNull();
      expect(result?.rule.rule_key).toBe('auto_no_home');
      expect(result?.rationale.missing_lines).toContain('homeowners');
    });

    it('should not detect auto without home if customer has homeowners', () => {
      const profile: InsuranceProfile = {
        account_id: 'account-1',
        lines_held: ['auto', 'homeowners'],
        policy_count: 2,
        total_premium: 2400,
        tenure_days: 365,
        max_liability_limit: 100000,
        has_auto: true,
        has_home: true,
        has_renters: false,
        has_umbrella: false,
        has_commercial: false,
        has_cyber: false,
        has_workers_comp: false,
      };

      const rule = defaultRules.find(r => r.rule_key === 'auto_no_home')!;
      const result = evaluateRule(profile, rule);

      expect(result).toBeNull();
    });

    it('should detect high liability without umbrella', () => {
      const profile: InsuranceProfile = {
        account_id: 'account-1',
        lines_held: ['auto', 'homeowners'],
        policy_count: 2,
        total_premium: 3000,
        tenure_days: 730,
        max_liability_limit: 500000,
        has_auto: true,
        has_home: true,
        has_renters: false,
        has_umbrella: false,
        has_commercial: false,
        has_cyber: false,
        has_workers_comp: false,
      };

      const rule = defaultRules.find(r => r.rule_key === 'high_liability_no_umbrella')!;
      const result = evaluateRule(profile, rule);

      expect(result).not.toBeNull();
      expect(result?.rule.severity).toBe('high');
    });

    it('should not detect umbrella gap if liability is below threshold', () => {
      const profile: InsuranceProfile = {
        account_id: 'account-1',
        lines_held: ['auto', 'homeowners'],
        policy_count: 2,
        total_premium: 2400,
        tenure_days: 365,
        max_liability_limit: 100000, // Below 300k threshold
        has_auto: true,
        has_home: true,
        has_renters: false,
        has_umbrella: false,
        has_commercial: false,
        has_cyber: false,
        has_workers_comp: false,
      };

      const rule = defaultRules.find(r => r.rule_key === 'high_liability_no_umbrella')!;
      const result = evaluateRule(profile, rule);

      expect(result).toBeNull();
    });

    it('should detect single policy bundle opportunity', () => {
      const profile: InsuranceProfile = {
        account_id: 'account-1',
        lines_held: ['auto'],
        policy_count: 1,
        total_premium: 1200,
        tenure_days: 180,
        max_liability_limit: 100000,
        has_auto: true,
        has_home: false,
        has_renters: false,
        has_umbrella: false,
        has_commercial: false,
        has_cyber: false,
        has_workers_comp: false,
      };

      const rule = defaultRules.find(r => r.rule_key === 'single_policy_bundle')!;
      const result = evaluateRule(profile, rule);

      expect(result).not.toBeNull();
      expect(result?.rule.severity).toBe('low');
    });

    it('should not detect single policy gap for bundled customer', () => {
      const profile: InsuranceProfile = {
        account_id: 'account-1',
        lines_held: ['auto', 'homeowners'],
        policy_count: 2,
        total_premium: 2800,
        tenure_days: 365,
        max_liability_limit: 100000,
        has_auto: true,
        has_home: true,
        has_renters: false,
        has_umbrella: false,
        has_commercial: false,
        has_cyber: false,
        has_workers_comp: false,
      };

      const rule = defaultRules.find(r => r.rule_key === 'single_policy_bundle')!;
      const result = evaluateRule(profile, rule);

      expect(result).toBeNull();
    });
  });

  describe('detectGaps', () => {
    it('should detect multiple gaps for single-line customer', () => {
      const profile: InsuranceProfile = {
        account_id: 'account-1',
        lines_held: ['auto'],
        policy_count: 1,
        total_premium: 1200,
        tenure_days: 365,
        max_liability_limit: 100000,
        has_auto: true,
        has_home: false,
        has_renters: false,
        has_umbrella: false,
        has_commercial: false,
        has_cyber: false,
        has_workers_comp: false,
      };

      const gaps = detectGaps(profile, defaultRules);

      expect(gaps.length).toBeGreaterThanOrEqual(2);
      expect(gaps.some(g => g.rule.rule_key === 'auto_no_home')).toBe(true);
      expect(gaps.some(g => g.rule.rule_key === 'single_policy_bundle')).toBe(true);
    });

    it('should return empty array for well-covered customer', () => {
      const profile: InsuranceProfile = {
        account_id: 'account-1',
        lines_held: ['auto', 'homeowners', 'umbrella'],
        policy_count: 3,
        total_premium: 4500,
        tenure_days: 1095,
        max_liability_limit: 500000,
        has_auto: true,
        has_home: true,
        has_renters: false,
        has_umbrella: true,
        has_commercial: false,
        has_cyber: false,
        has_workers_comp: false,
      };

      const gaps = detectGaps(profile, defaultRules);

      // Should only have home_no_auto (which doesn't apply since they have auto)
      // and should skip umbrella rules since they have umbrella
      expect(gaps.length).toBe(0);
    });

    it('should sort gaps by severity (high first)', () => {
      const profile: InsuranceProfile = {
        account_id: 'account-1',
        lines_held: ['auto'],
        policy_count: 1,
        total_premium: 1200,
        tenure_days: 365,
        max_liability_limit: 400000, // High enough for umbrella rule
        has_auto: true,
        has_home: false,
        has_renters: false,
        has_umbrella: false,
        has_commercial: false,
        has_cyber: false,
        has_workers_comp: false,
      };

      const gaps = detectGaps(profile, defaultRules);

      // High severity should come first
      if (gaps.length > 1) {
        const severities = gaps.map(g => g.rule.severity);
        const severityOrder = { high: 0, medium: 1, low: 2 };

        for (let i = 1; i < severities.length; i++) {
          expect(severityOrder[severities[i]]).toBeGreaterThanOrEqual(
            severityOrder[severities[i - 1]]
          );
        }
      }
    });

    it('should include confidence score in results', () => {
      const profile: InsuranceProfile = {
        account_id: 'account-1',
        lines_held: ['auto'],
        policy_count: 1,
        total_premium: 1200,
        tenure_days: 365,
        max_liability_limit: 100000,
        has_auto: true,
        has_home: false,
        has_renters: false,
        has_umbrella: false,
        has_commercial: false,
        has_cyber: false,
        has_workers_comp: false,
      };

      const gaps = detectGaps(profile, defaultRules);

      for (const gap of gaps) {
        expect(gap.confidence).toBeGreaterThan(0);
        expect(gap.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include rationale with current and missing lines', () => {
      const profile: InsuranceProfile = {
        account_id: 'account-1',
        lines_held: ['auto'],
        policy_count: 1,
        total_premium: 1200,
        tenure_days: 365,
        max_liability_limit: 100000,
        has_auto: true,
        has_home: false,
        has_renters: false,
        has_umbrella: false,
        has_commercial: false,
        has_cyber: false,
        has_workers_comp: false,
      };

      const gaps = detectGaps(profile, defaultRules);
      const autoNoHome = gaps.find(g => g.rule.rule_key === 'auto_no_home');

      expect(autoNoHome).toBeDefined();
      expect(autoNoHome?.rationale.current_lines).toContain('auto');
      expect(autoNoHome?.rationale.missing_lines.length).toBeGreaterThan(0);
    });
  });
});
