export interface LeadScoringFactors {
  insuranceNeeds: string[];
  currentPremium: number | null;
  decisionTimeframe: 'immediate' | '30_days' | '60_days' | '90_days' | 'no_rush' | null;
  hasEmail: boolean;
  hasPhone: boolean;
  source: string | null;
  hasCurrentCarrier: boolean;
}

export interface RadarScoreFactors {
  class: number;
  daysToEvent: number;
  displacement: number;
  size: number;
  completeness: number;
}

export interface RadarOpportunityForScoring {
  kind: 'cancel' | 'swo';
  class_code: string | null;
  expiration_date: string | null;
  estimated_premium: number | null;
  employer_name: string | null;
  county: string | null;
  policy_number: string | null;
  carrier: string | null;
}

export function deriveRadarScoreFactors(
  opportunity: RadarOpportunityForScoring,
  classAllowlist: readonly string[],
  now = new Date(),
): RadarScoreFactors {
  const normalizedClass = opportunity.class_code?.trim().toUpperCase() ?? '';
  const normalizedAllowlist = new Set(classAllowlist.map((value) => value.trim().toUpperCase()));
  const classScore = normalizedClass && normalizedAllowlist.has(normalizedClass) ? 30 : 0;

  let daysToEvent = 0;
  if (opportunity.expiration_date) {
    const eventAt = new Date(`${opportunity.expiration_date}T00:00:00.000Z`);
    if (!Number.isNaN(eventAt.getTime())) {
      const days = Math.ceil((eventAt.getTime() - now.getTime()) / 86_400_000);
      if (days >= 0) {
        if (days <= 7) daysToEvent = 25;
        else if (days <= 30) daysToEvent = 20;
        else if (days <= 60) daysToEvent = 15;
        else if (days <= 90) daysToEvent = 10;
        else daysToEvent = 5;
      }
    }
  }

  const displacement = opportunity.kind === 'swo' ? 20 : 15;
  const premium = opportunity.estimated_premium ?? 0;
  const size = premium >= 50_000 ? 15 : premium >= 25_000 ? 12 : premium >= 10_000 ? 8 : premium > 0 ? 4 : 0;
  const completeFields = [
    opportunity.employer_name,
    opportunity.county,
    opportunity.policy_number,
    opportunity.carrier,
    opportunity.expiration_date,
    opportunity.class_code,
  ].filter((value) => Boolean(value?.trim())).length;
  const completeness = Math.round((completeFields / 6) * 10);

  return { class: classScore, daysToEvent, displacement, size, completeness };
}

const RADAR_FACTOR_MAXIMUMS: Readonly<Record<keyof RadarScoreFactors, number>> = {
  class: 30,
  daysToEvent: 25,
  displacement: 20,
  size: 15,
  completeness: 10,
};

export function calculateRadarScore(factors: RadarScoreFactors): number {
  const entries = Object.entries(RADAR_FACTOR_MAXIMUMS) as [keyof RadarScoreFactors, number][];

  return entries.reduce((score, [factor, maximum]) => {
    const value = factors[factor];
    if (!Number.isInteger(value) || value < 0 || value > maximum) {
      throw new Error(`radar.factors.${factor} must be an integer between 0 and ${maximum}`);
    }
    return score + value;
  }, 0);
}

export function calculateLeadScore(factors: LeadScoringFactors): number {
  let score = 0;
  const needs = factors.insuranceNeeds || [];
  if (needs.includes('commercial')) score += 25;
  else if (needs.length >= 3) score += 20;
  else if (needs.length === 2) score += 15;
  else if (needs.length === 1) score += 10;

  if (factors.currentPremium) {
    if (factors.currentPremium >= 5000) score += 20;
    else if (factors.currentPremium >= 2500) score += 15;
    else if (factors.currentPremium >= 1000) score += 10;
    else score += 5;
  } else score += 8;

  switch (factors.decisionTimeframe) {
    case 'immediate': score += 20; break;
    case '30_days': score += 15; break;
    case '60_days': score += 10; break;
    case '90_days': score += 5; break;
    case 'no_rush': score += 2; break;
    default: score += 8;
  }

  if (factors.hasEmail && factors.hasPhone) score += 15;
  else if (factors.hasEmail || factors.hasPhone) score += 10;

  const highQualitySources = ['referral', 'website', 'event'];
  const mediumQualitySources = ['social_media', 'email', 'advertising'];
  if (factors.source && highQualitySources.includes(factors.source)) score += 10;
  else if (factors.source && mediumQualitySources.includes(factors.source)) score += 6;
  else score += 3;

  score += factors.hasCurrentCarrier ? 10 : 5;
  return Math.min(Math.max(score, 0), 100);
}
