import { describe, expect, it } from 'vitest';
import {
  type RadarComplianceReceipt,
  type RadarQueueIdentity,
  isWrittenMarketingPewc,
  isLeadContactBindingValid,
  validateRadarComplianceReceipt,
} from '../../../supabase/functions/_shared/radarCompliance';

const now = new Date('2026-08-24T16:00:00.000Z');
const item: RadarQueueIdentity = {
  source_type: 'wc_renewal_radar', source_id: 'opp-1', org_id: 'legacy-org-99', agency_workspace_id: 'org-1', channel: 'sms',
  to_contact_id: 'account-1', to_email: null, to_phone: '+12395550100', from_user_id: 'agent-1',
  compliance_check_id: 'check-1',
};
const receipt: RadarComplianceReceipt = {
  id: 'check-1', agency_workspace_id: 'org-1', opportunity_id: 'opp-1', contact_id: 'account-1',
  channel: 'sms', destination: '+12395550100', dnc_phone: '+12395550100', recipient_timezone: 'America/New_York',
  licensed_agent_id: 'agent-1', license_number: 'A123456', pewc: true, pewc_phone: '+12395550100',
  dnc_national_at: '2026-08-24T15:00:00.000Z', dnc_fdacs_at: '2026-08-24T15:00:00.000Z',
  hours_ok: true, fresh_through: '2026-08-31T15:00:00.000Z', passed: true,
  status: 'passed', created_at: '2026-08-24T15:00:00.000Z',
};

describe('Radar compliance receipt', () => {
  it('requires a Guard id', () => {
    expect(validateRadarComplianceReceipt({ ...item, compliance_check_id: null }, receipt, true, now))
      .toBe('radar_guard_missing');
  });

  it('refuses SMS without workspace enablement or exact-number PEWC', () => {
    expect(validateRadarComplianceReceipt(item, receipt, false, now)).toBe('radar_sms_disabled');
    expect(validateRadarComplianceReceipt(item, { ...receipt, pewc_phone: '+12395550199' }, true, now))
      .toBe('radar_sms_pewc_missing');
  });

  it('binds the DNC scrub to the exact SMS E.164 destination', () => {
    expect(validateRadarComplianceReceipt(item, { ...receipt, dnc_phone: '+12395550199' }, true, now))
      .toBe('radar_guard_dnc_phone_mismatch');
  });

  it('binds the receipt and leaves non-Radar sends compatible', () => {
    expect(validateRadarComplianceReceipt(item, receipt, true, now)).toBeNull();
    expect(validateRadarComplianceReceipt(
      { ...item, source_type: 'campaign', compliance_check_id: null }, null, false, now,
    )).toBeNull();
  });

  it('uses the explicit workspace identity, never the legacy org identity', () => {
    expect(item.org_id).not.toBe(item.agency_workspace_id);
    expect(validateRadarComplianceReceipt(item, receipt, true, now)).toBeNull();
    expect(validateRadarComplianceReceipt({ ...item, agency_workspace_id: 'workspace-2' }, receipt, true, now))
      .toBe('radar_guard_workspace_mismatch');
  });
});

describe('Radar PEWC evidence', () => {
  const written = {
    action: 'opt_in', phone: '+12395550100', purpose: 'marketing', source: 'web_form',
    consent_text_shown: 'I agree to receive marketing text messages.',
    source_details: { evidence_id: 'form-1', consent_version: 'v3' },
  };

  it('requires written, versioned marketing evidence for the exact phone', () => {
    expect(isWrittenMarketingPewc(written, '+12395550100')).toBe(true);
    expect(isWrittenMarketingPewc({ ...written, purpose: 'transactional' }, '+12395550100')).toBe(false);
    expect(isWrittenMarketingPewc({ ...written, source: 'verbal' }, '+12395550100')).toBe(false);
    expect(isWrittenMarketingPewc({ ...written, source_details: {} }, '+12395550100')).toBe(false);
    expect(isWrittenMarketingPewc(written, '+12395550199')).toBe(false);
  });
});

describe('Radar handoff contact binding', () => {
  it('accepts nullable contact only for an account-less handed-off lead', () => {
    expect(isLeadContactBindingValid(null, null)).toBe(true);
    expect(isLeadContactBindingValid(undefined, undefined)).toBe(true);
    expect(isLeadContactBindingValid(null, 'account-1')).toBe(false);
    expect(isLeadContactBindingValid('account-1', null)).toBe(false);
    expect(isLeadContactBindingValid('account-1', 'account-1')).toBe(true);
    expect(isLeadContactBindingValid('account-1', 'account-2')).toBe(false);
  });
});
