import type { InsuranceDocument, Coverage, CoverageDifference } from '@/types/insurance-comparison';

interface GapAnalysis {
  coverageType: string;
  missingIn: 'option1' | 'option2';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

interface PremiumBreakdown {
  option1Total: number;
  option2Total: number;
  difference: number;
  percentageDiff: number;
  costPerCoverage: {
    option1: Record<string, number>;
    option2: Record<string, number>;
  };
}

export class ComparisonEngine {
  // Normalize different carrier terminology
  private normalizeTerms: Record<string, string[]> = {
    'BI': ['Bodily Injury', 'BI Liability', 'Bodily Injury Liability', 'Liability - BI'],
    'PD': ['Property Damage', 'PD Liability', 'Property Damage Liability', 'Liability - PD'],
    'COMP': ['Comprehensive', 'Other Than Collision', 'OTC', 'Comprehensive Coverage'],
    'COLL': ['Collision', 'Collision Coverage', 'Collision Damage'],
    'UM': ['Uninsured Motorist', 'UM/UIM', 'Uninsured/Underinsured', 'UM Coverage'],
    'UMPD': ['Uninsured Motorist Property Damage', 'UMPD', 'UM Property Damage'],
    'MED': ['Medical Payments', 'Med Pay', 'Medical', 'Medical Coverage'],
    'PIP': ['Personal Injury Protection', 'PIP', 'No-Fault'],
    'RENTAL': ['Rental Reimbursement', 'Rental Car', 'Transportation Expense'],
    'TOWING': ['Towing and Labor', 'Roadside Assistance', 'Emergency Road Service'],
  };

  // Reverse mapping for quick lookup
  private termToCanonical: Map<string, string>;

  constructor() {
    this.termToCanonical = new Map();
    Object.entries(this.normalizeTerms).forEach(([canonical, variations]) => {
      variations.forEach(variation => {
        this.termToCanonical.set(variation.toLowerCase(), canonical);
      });
    });
  }

  /**
   * Main comparison method
   */
  compareDocuments(doc1: InsuranceDocument, doc2: InsuranceDocument) {
    const normalizedCoverages1 = this.normalizeCoverages(doc1.coverages);
    const normalizedCoverages2 = this.normalizeCoverages(doc2.coverages);

    return {
      executiveSummary: this.generateExecutiveSummary(doc1, doc2),
      coverageComparison: this.compareCoverages(normalizedCoverages1, normalizedCoverages2),
      premiumAnalysis: this.analyzePremiums(doc1, doc2),
      gaps: this.identifyGaps(normalizedCoverages1, normalizedCoverages2),
      recommendations: this.generateRecommendations(doc1, doc2, normalizedCoverages1, normalizedCoverages2)
    };
  }

  /**
   * Normalize coverage types across different carrier terminologies
   */
  private normalizeCoverages(coverages: Coverage[]): Map<string, Coverage> {
    const normalized = new Map<string, Coverage>();

    coverages.forEach(coverage => {
      const canonicalType = this.getCanonicalType(coverage.type);
      normalized.set(canonicalType, {
        ...coverage,
        type: canonicalType
      });
    });

    return normalized;
  }

  /**
   * Get canonical coverage type
   */
  private getCanonicalType(type: string): string {
    const lowerType = type.toLowerCase();
    
    // Check exact match in reverse mapping
    if (this.termToCanonical.has(lowerType)) {
      return this.termToCanonical.get(lowerType)!;
    }

    // Fuzzy matching for partial matches
    for (const [canonical, variations] of Object.entries(this.normalizeTerms)) {
      if (variations.some(v => lowerType.includes(v.toLowerCase()) || v.toLowerCase().includes(lowerType))) {
        return canonical;
      }
    }

    // Return original if no match found
    return type;
  }

  /**
   * Generate executive summary
   */
  private generateExecutiveSummary(doc1: InsuranceDocument, doc2: InsuranceDocument): string {
    const premiumDiff = (doc2.totalPremium || 0) - (doc1.totalPremium || 0);
    const percentDiff = ((premiumDiff / (doc1.totalPremium || 1)) * 100).toFixed(1);

    const cheaperOption = premiumDiff < 0 ? 'Option 2' : 'Option 1';
    const moreExpensiveOption = premiumDiff < 0 ? 'Option 1' : 'Option 2';

    return `Comparing ${doc1.carrier} vs ${doc2.carrier}: ${cheaperOption} is ${Math.abs(Number(percentDiff))}% cheaper ($${Math.abs(premiumDiff).toFixed(2)} difference). ${doc1.coverages.length} coverages in Option 1, ${doc2.coverages.length} in Option 2.`;
  }

  /**
   * Compare coverages between two documents
   */
  private compareCoverages(
    coverages1: Map<string, Coverage>,
    coverages2: Map<string, Coverage>
  ): CoverageDifference[] {
    const differences: CoverageDifference[] = [];
    const allTypes = new Set([...coverages1.keys(), ...coverages2.keys()]);

    allTypes.forEach(type => {
      const cov1 = coverages1.get(type);
      const cov2 = coverages2.get(type);

      if (!cov1 && cov2) {
        differences.push({
          coverageType: type,
          option1Value: 'Not Included',
          option2Value: this.formatCoverageValue(cov2),
          advantage: 'option2',
          description: `${type} is only available in Option 2`
        });
      } else if (cov1 && !cov2) {
        differences.push({
          coverageType: type,
          option1Value: this.formatCoverageValue(cov1),
          option2Value: 'Not Included',
          advantage: 'option1',
          description: `${type} is only available in Option 1`
        });
      } else if (cov1 && cov2) {
        const advantage = this.determineAdvantage(cov1, cov2);
        differences.push({
          coverageType: type,
          option1Value: this.formatCoverageValue(cov1),
          option2Value: this.formatCoverageValue(cov2),
          advantage,
          description: this.generateCoverageDescription(type, cov1, cov2, advantage)
        });
      }
    });

    return differences;
  }

  /**
   * Format coverage value for display
   */
  private formatCoverageValue(coverage: Coverage): string {
    const parts: string[] = [];
    
    if (coverage.limit) parts.push(`Limit: ${coverage.limit}`);
    if (coverage.deductible) parts.push(`Ded: ${coverage.deductible}`);
    if (coverage.premium) parts.push(`$${coverage.premium}`);
    
    return parts.length > 0 ? parts.join(' | ') : 'Included';
  }

  /**
   * Determine which option has the advantage for a coverage
   */
  private determineAdvantage(cov1: Coverage, cov2: Coverage): 'option1' | 'option2' | 'neutral' {
    // Higher limits are generally better
    const limit1 = this.parseLimitValue(cov1.limit);
    const limit2 = this.parseLimitValue(cov2.limit);

    if (limit1 > limit2) return 'option1';
    if (limit2 > limit1) return 'option2';

    // Lower deductibles are generally better
    const ded1 = this.parseDeductibleValue(cov1.deductible);
    const ded2 = this.parseDeductibleValue(cov2.deductible);

    if (ded1 < ded2) return 'option1';
    if (ded2 < ded1) return 'option2';

    return 'neutral';
  }

  /**
   * Parse limit string to numeric value
   */
  private parseLimitValue(limit?: string): number {
    if (!limit) return 0;
    
    const cleaned = limit.replace(/[$,]/g, '');
    const matches = cleaned.match(/(\d+)([kKmM])?/);
    
    if (!matches) return 0;
    
    const value = parseFloat(matches[1]);
    const multiplier = matches[2]?.toLowerCase();
    
    if (multiplier === 'k') return value * 1000;
    if (multiplier === 'm') return value * 1000000;
    
    return value;
  }

  /**
   * Parse deductible string to numeric value
   */
  private parseDeductibleValue(deductible?: string): number {
    if (!deductible) return 0;
    
    const cleaned = deductible.replace(/[$,]/g, '');
    return parseFloat(cleaned) || 0;
  }

  /**
   * Generate coverage comparison description
   */
  private generateCoverageDescription(
    type: string,
    cov1: Coverage,
    cov2: Coverage,
    advantage: 'option1' | 'option2' | 'neutral'
  ): string {
    if (advantage === 'neutral') {
      return `Both options provide equivalent ${type} coverage`;
    }

    const better = advantage === 'option1' ? 'Option 1' : 'Option 2';
    const limit1 = this.parseLimitValue(cov1.limit);
    const limit2 = this.parseLimitValue(cov2.limit);

    if (limit1 !== limit2) {
      return `${better} offers ${advantage === 'option1' ? 'higher' : 'lower'} limits for ${type}`;
    }

    const ded1 = this.parseDeductibleValue(cov1.deductible);
    const ded2 = this.parseDeductibleValue(cov2.deductible);

    if (ded1 !== ded2) {
      return `${better} has a ${advantage === 'option1' ? 'lower' : 'higher'} deductible for ${type}`;
    }

    return `${better} provides better ${type} coverage`;
  }

  /**
   * Analyze premium differences
   */
  private analyzePremiums(doc1: InsuranceDocument, doc2: InsuranceDocument): PremiumBreakdown {
    const option1Total = doc1.totalPremium || 0;
    const option2Total = doc2.totalPremium || 0;
    const difference = option2Total - option1Total;
    const percentageDiff = ((difference / option1Total) * 100);

    return {
      option1Total,
      option2Total,
      difference,
      percentageDiff,
      costPerCoverage: {
        option1: this.calculateCostPerCoverage(doc1),
        option2: this.calculateCostPerCoverage(doc2)
      }
    };
  }

  /**
   * Calculate cost per coverage
   */
  private calculateCostPerCoverage(doc: InsuranceDocument): Record<string, number> {
    const costMap: Record<string, number> = {};
    
    doc.coverages.forEach(coverage => {
      if (coverage.premium) {
        costMap[coverage.type] = coverage.premium;
      }
    });

    return costMap;
  }

  /**
   * Identify coverage gaps - CRITICAL for Progressive collision gap scenario
   */
  private identifyGaps(
    coverages1: Map<string, Coverage>,
    coverages2: Map<string, Coverage>
  ): GapAnalysis[] {
    const gaps: GapAnalysis[] = [];

    // Critical coverages to check
    const criticalCoverages = ['COLL', 'COMP', 'BI', 'PD', 'UM'];
    const importantCoverages = ['MED', 'PIP', 'RENTAL', 'TOWING'];

    // Check for missing critical coverages
    criticalCoverages.forEach(type => {
      if (!coverages1.has(type) && coverages2.has(type)) {
        gaps.push({
          coverageType: this.getReadableName(type),
          missingIn: 'option1',
          severity: 'critical',
          description: `Option 1 is missing ${this.getReadableName(type)} coverage`,
          recommendation: `Add ${this.getReadableName(type)} coverage to Option 1 or select Option 2`
        });
      }

      if (coverages1.has(type) && !coverages2.has(type)) {
        gaps.push({
          coverageType: this.getReadableName(type),
          missingIn: 'option2',
          severity: 'critical',
          description: `Option 2 is missing ${this.getReadableName(type)} coverage`,
          recommendation: `Add ${this.getReadableName(type)} coverage to Option 2 or select Option 1`
        });
      }
    });

    // Check for missing important coverages
    importantCoverages.forEach(type => {
      if (!coverages1.has(type) && coverages2.has(type)) {
        gaps.push({
          coverageType: this.getReadableName(type),
          missingIn: 'option1',
          severity: 'high',
          description: `Option 1 does not include ${this.getReadableName(type)}`,
          recommendation: `Consider adding ${this.getReadableName(type)} for additional protection`
        });
      }

      if (coverages1.has(type) && !coverages2.has(type)) {
        gaps.push({
          coverageType: this.getReadableName(type),
          missingIn: 'option2',
          severity: 'high',
          description: `Option 2 does not include ${this.getReadableName(type)}`,
          recommendation: `Consider adding ${this.getReadableName(type)} for additional protection`
        });
      }
    });

    // Check for inadequate limits
    ['BI', 'PD', 'UM'].forEach(type => {
      const cov1 = coverages1.get(type);
      const cov2 = coverages2.get(type);

      if (cov1) {
        const limit = this.parseLimitValue(cov1.limit);
        if (limit < 100000) {
          gaps.push({
            coverageType: this.getReadableName(type),
            missingIn: 'option1',
            severity: 'medium',
            description: `Option 1 has low ${this.getReadableName(type)} limits ($${limit.toLocaleString()})`,
            recommendation: `Increase ${this.getReadableName(type)} limits to at least $100,000`
          });
        }
      }

      if (cov2) {
        const limit = this.parseLimitValue(cov2.limit);
        if (limit < 100000) {
          gaps.push({
            coverageType: this.getReadableName(type),
            missingIn: 'option2',
            severity: 'medium',
            description: `Option 2 has low ${this.getReadableName(type)} limits ($${limit.toLocaleString()})`,
            recommendation: `Increase ${this.getReadableName(type)} limits to at least $100,000`
          });
        }
      }
    });

    return gaps.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Get readable coverage name
   */
  private getReadableName(canonicalType: string): string {
    const names: Record<string, string> = {
      'BI': 'Bodily Injury',
      'PD': 'Property Damage',
      'COMP': 'Comprehensive',
      'COLL': 'Collision',
      'UM': 'Uninsured Motorist',
      'UMPD': 'Uninsured Motorist Property Damage',
      'MED': 'Medical Payments',
      'PIP': 'Personal Injury Protection',
      'RENTAL': 'Rental Reimbursement',
      'TOWING': 'Towing and Labor'
    };

    return names[canonicalType] || canonicalType;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    doc1: InsuranceDocument,
    doc2: InsuranceDocument,
    coverages1: Map<string, Coverage>,
    coverages2: Map<string, Coverage>
  ): string[] {
    const recommendations: string[] = [];

    // Premium-based recommendation
    const premiumDiff = (doc2.totalPremium || 0) - (doc1.totalPremium || 0);
    if (Math.abs(premiumDiff) > 100) {
      const cheaper = premiumDiff < 0 ? 'Option 2' : 'Option 1';
      recommendations.push(
        `${cheaper} offers significant savings of $${Math.abs(premiumDiff).toFixed(2)} annually`
      );
    }

    // Coverage gap recommendations
    const gaps = this.identifyGaps(coverages1, coverages2);
    const criticalGaps = gaps.filter(g => g.severity === 'critical');
    
    if (criticalGaps.length > 0) {
      criticalGaps.forEach(gap => {
        recommendations.push(gap.recommendation);
      });
    }

    // Coverage breadth recommendation
    const cov1Count = coverages1.size;
    const cov2Count = coverages2.size;
    
    if (Math.abs(cov1Count - cov2Count) > 2) {
      const broader = cov1Count > cov2Count ? 'Option 1' : 'Option 2';
      recommendations.push(
        `${broader} provides more comprehensive coverage with ${Math.max(cov1Count, cov2Count)} coverage types`
      );
    }

    // Carrier reputation (basic implementation)
    recommendations.push(
      `Review carrier ratings and customer service reviews for ${doc1.carrier} and ${doc2.carrier}`
    );

    return recommendations;
  }
}

export interface ComparisonResult {
  executiveSummary: string;
  coverageComparison: CoverageDifference[];
  premiumAnalysis: PremiumBreakdown;
  gaps: GapAnalysis[];
  recommendations: string[];
}

export type { GapAnalysis, PremiumBreakdown };
