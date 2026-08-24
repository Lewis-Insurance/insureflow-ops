export const RADAR_SOURCE_TYPE = 'wc_renewal_radar';
export const RADAR_GUARD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const RADAR_DNC_MAX_AGE_MS = 31 * 24 * 60 * 60 * 1000;

export interface RadarQueueIdentity {
  source_type: string;
  source_id: string | null;
  org_id: string;
  agency_workspace_id?: string | null;
  channel: 'email' | 'sms';
  to_contact_id: string | null;
  to_email: string | null;
  to_phone: string | null;
  from_user_id: string;
  compliance_check_id?: string | null;
}

export interface RadarComplianceReceipt {
  id: string;
  agency_workspace_id: string;
  opportunity_id: string;
  contact_id: string | null;
  channel: 'email' | 'sms' | 'letter';
  destination: string;
  dnc_phone: string;
  recipient_timezone: string;
  licensed_agent_id: string;
  license_number: string;
  pewc: boolean;
  pewc_phone: string | null;
  dnc_national_at: string;
  dnc_fdacs_at: string;
  hours_ok: boolean;
  fresh_through: string;
  passed: boolean;
  status: string;
  created_at: string;
}

export function normalizePhone(value: string | null | undefined): string {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return value?.trim() || '';
}

export function normalizeDestination(channel: 'email' | 'sms', value: string | null | undefined): string {
  return channel === 'sms' ? normalizePhone(value) : (value || '').trim().toLowerCase();
}

export function isLeadContactBindingValid(
  leadAccountId: string | null | undefined,
  requestedContactId: string | null | undefined,
): boolean {
  return leadAccountId ? leadAccountId === requestedContactId : requestedContactId == null;
}

const FLORIDA_CENTRAL_TIME_COUNTIES = new Set([
  'bay', 'calhoun', 'escambia', 'holmes', 'jackson',
  'okaloosa', 'santa rosa', 'walton', 'washington',
]);
const FLORIDA_COUNTIES = new Set([
  'alachua', 'baker', 'bay', 'bradford', 'brevard', 'broward', 'calhoun', 'charlotte',
  'citrus', 'clay', 'collier', 'columbia', 'de soto', 'dixie', 'duval', 'escambia',
  'flagler', 'franklin', 'gadsden', 'gilchrist', 'glades', 'gulf', 'hamilton', 'hardee',
  'hendry', 'hernando', 'highlands', 'hillsborough', 'holmes', 'indian river', 'jackson',
  'jefferson', 'lafayette', 'lake', 'lee', 'leon', 'levy', 'liberty', 'madison', 'manatee',
  'marion', 'martin', 'miami-dade', 'monroe', 'nassau', 'okaloosa', 'okeechobee', 'orange',
  'osceola', 'palm beach', 'pasco', 'pinellas', 'polk', 'putnam', 'santa rosa', 'sarasota',
  'seminole', 'st. johns', 'st. lucie', 'sumter', 'suwannee', 'taylor', 'union', 'volusia',
  'wakulla', 'walton', 'washington',
]);

export function deriveFloridaRecipientTimezone(
  source: string | null | undefined,
  county: string | null | undefined,
): string | null {
  if (!['fl_poc_cancel', 'fl_dfs_swo'].includes((source || '').trim().toLowerCase())) return null;
  const normalizedCounty = (county || '').trim().toLowerCase().replace(/\s+county$/, '').trim();
  if (!FLORIDA_COUNTIES.has(normalizedCounty)) return null;
  // Gulf County straddles the Florida time-zone boundary; county alone is not authoritative.
  if (normalizedCounty === 'gulf') return null;
  return FLORIDA_CENTRAL_TIME_COUNTIES.has(normalizedCounty)
    ? 'America/Chicago'
    : 'America/New_York';
}

export interface ConsentLedgerEvidence {
  action?: string;
  phone?: string;
  purpose?: string;
  source?: string;
  source_details?: Record<string, unknown> | null;
  consent_text_shown?: string | null;
}

export function isWrittenMarketingPewc(evidence: ConsentLedgerEvidence | null, phone: string): boolean {
  const writtenSources = new Set(['web_form', 'preference_center', 'paper_form']);
  const details = evidence?.source_details;
  return evidence?.action === 'opt_in' && evidence.purpose === 'marketing' &&
    normalizePhone(evidence.phone) === normalizePhone(phone) && writtenSources.has(evidence.source || '') &&
    typeof evidence.consent_text_shown === 'string' && evidence.consent_text_shown.trim().length > 0 &&
    typeof details?.evidence_id === 'string' && details.evidence_id.length > 0 &&
    typeof details?.consent_version === 'string' && details.consent_version.length > 0;
}

export function isWithinRecipientHours(now: Date, timeZone: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    return Number.isFinite(hour) && hour >= 8 && hour < 20;
  } catch {
    return false;
  }
}

export function validateRadarComplianceReceipt(
  item: RadarQueueIdentity,
  receipt: RadarComplianceReceipt | null,
  smsEnabled: boolean,
  now = new Date(),
): string | null {
  if (item.source_type !== RADAR_SOURCE_TYPE) return null;
  if (!item.compliance_check_id) return 'radar_guard_missing';
  if (!receipt || receipt.id !== item.compliance_check_id) return 'radar_guard_not_found';
  if (!receipt.passed || receipt.status !== 'passed') return 'radar_guard_failed';
  if (!item.agency_workspace_id || receipt.agency_workspace_id !== item.agency_workspace_id) {
    return 'radar_guard_workspace_mismatch';
  }
  if (!item.source_id || receipt.opportunity_id !== item.source_id) return 'radar_guard_opportunity_mismatch';
  if (receipt.channel !== item.channel) return 'radar_guard_channel_mismatch';
  if (receipt.contact_id !== item.to_contact_id) return 'radar_guard_contact_mismatch';
  if (receipt.licensed_agent_id !== item.from_user_id || !receipt.license_number.trim()) {
    return 'radar_guard_license_mismatch';
  }

  const target = normalizeDestination(item.channel, item.channel === 'sms' ? item.to_phone : item.to_email);
  if (!target || normalizeDestination(item.channel, receipt.destination) !== target) {
    return 'radar_guard_destination_mismatch';
  }
  if (!normalizePhone(receipt.dnc_phone)) return 'radar_guard_dnc_phone_missing';
  if (item.channel === 'sms' && normalizePhone(receipt.dnc_phone) !== normalizePhone(item.to_phone)) {
    return 'radar_guard_dnc_phone_mismatch';
  }

  const createdAt = new Date(receipt.created_at).getTime();
  const freshThrough = new Date(receipt.fresh_through).getTime();
  if (!Number.isFinite(createdAt) || now.getTime() - createdAt > RADAR_GUARD_MAX_AGE_MS) {
    return 'radar_guard_stale';
  }
  if (!Number.isFinite(freshThrough) || freshThrough < now.getTime()) return 'radar_guard_expired';
  if (!receipt.hours_ok) return 'radar_guard_outside_hours';
  if (!isWithinRecipientHours(now, receipt.recipient_timezone)) return 'radar_guard_outside_hours';

  for (const timestamp of [receipt.dnc_national_at, receipt.dnc_fdacs_at]) {
    const checkedAt = new Date(timestamp).getTime();
    if (!Number.isFinite(checkedAt) || now.getTime() - checkedAt > RADAR_DNC_MAX_AGE_MS || checkedAt > now.getTime()) {
      return 'radar_guard_dnc_stale';
    }
  }

  if (item.channel === 'sms') {
    if (!smsEnabled) return 'radar_sms_disabled';
    if (!receipt.pewc || normalizePhone(receipt.pewc_phone) !== normalizePhone(item.to_phone)) {
      return 'radar_sms_pewc_missing';
    }
  }
  return null;
}
