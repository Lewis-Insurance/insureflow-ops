export interface LeadProvenance {
  lead_source?: string | null;
  metadata?: unknown;
}

export function isHandedOffRadarLead(lead: LeadProvenance): boolean {
  if (lead.lead_source === 'wc_renewal_radar') return true;

  const metadata = lead.metadata;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return false;
  }

  const radarOpportunityId = (metadata as Record<string, unknown>).radar_opportunity_id;
  return typeof radarOpportunityId === 'string' && radarOpportunityId.trim().length > 0;
}
