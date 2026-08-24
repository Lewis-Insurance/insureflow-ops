import { describe, expect, it } from 'vitest';
import { calculateLeadScore, calculateRadarScore, deriveRadarScoreFactors } from './scoring';

describe('lead-scoring-engine scoring', () => {
  it('scores a radar opportunity using the 30/25/20/15/10 rubric', () => {
    expect(calculateRadarScore({
      class: 30,
      daysToEvent: 25,
      displacement: 20,
      size: 15,
      completeness: 10,
    })).toBe(100);
  });

  it('rejects radar components outside their rubric bounds', () => {
    expect(() => calculateRadarScore({
      class: 31,
      daysToEvent: 25,
      displacement: 20,
      size: 15,
      completeness: 10,
    })).toThrow('radar.factors.class must be an integer between 0 and 30');
  });

  it('derives radar factors from stored opportunity facts instead of caller scores', () => {
    expect(deriveRadarScoreFactors({
      kind: 'swo',
      class_code: ' 8810 ',
      expiration_date: '2026-09-01',
      estimated_premium: 50_000,
      employer_name: 'Acme LLC',
      county: 'Leon',
      policy_number: 'WC-1',
      carrier: 'Carrier',
    }, ['8810'], new Date('2026-08-24T00:00:00.000Z'))).toEqual({
      class: 30,
      daysToEvent: 20,
      displacement: 20,
      size: 15,
      completeness: 10,
    });
  });

  it('does not award urgency points for a past event', () => {
    const factors = deriveRadarScoreFactors({
      kind: 'cancel',
      class_code: '8810',
      expiration_date: '2026-08-01',
      estimated_premium: null,
      employer_name: 'Acme LLC',
      county: null,
      policy_number: null,
      carrier: null,
    }, ['8810'], new Date('2026-08-24T00:00:00.000Z'));
    expect(factors.daysToEvent).toBe(0);
  });

  it('continues to score existing leads with the existing rubric', () => {
    expect(calculateLeadScore({
      insuranceNeeds: ['commercial'],
      currentPremium: 5000,
      decisionTimeframe: 'immediate',
      hasEmail: true,
      hasPhone: true,
      source: 'referral',
      hasCurrentCarrier: true,
    })).toBe(100);
  });
});
