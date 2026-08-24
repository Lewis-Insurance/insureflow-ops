import {
  isWithinRecipientHours,
  isWrittenMarketingPewc,
  isLeadContactBindingValid,
  deriveFloridaRecipientTimezone,
  type RadarComplianceReceipt,
  type RadarQueueIdentity,
  validateRadarComplianceReceipt,
} from './radarCompliance.ts';

const now = new Date('2026-08-24T16:00:00.000Z');
const item: RadarQueueIdentity = {
  source_type: 'wc_renewal_radar', source_id: 'opp-1', org_id: 'legacy-org-99', agency_workspace_id: 'org-1', channel: 'sms',
  to_contact_id: 'account-1', to_email: null, to_phone: '+12395550100', from_user_id: 'agent-1',
  compliance_check_id: 'check-1',
};
const receipt: RadarComplianceReceipt = {
  id: 'check-1', agency_workspace_id: 'org-1', opportunity_id: 'opp-1', contact_id: 'account-1',
  channel: 'sms', destination: '+1 (239) 555-0100', dnc_phone: '+12395550100', recipient_timezone: 'America/New_York', licensed_agent_id: 'agent-1',
  license_number: 'A123456', pewc: true, pewc_phone: '+12395550100',
  dnc_national_at: '2026-08-24T15:00:00.000Z', dnc_fdacs_at: '2026-08-24T15:00:00.000Z',
  hours_ok: true, fresh_through: '2026-08-31T15:00:00.000Z', passed: true,
  status: 'passed', created_at: '2026-08-24T15:00:00.000Z',
};

Deno.test('radar send requires a guard id', () => {
  const reason = validateRadarComplianceReceipt({ ...item, compliance_check_id: null }, receipt, true, now);
  if (reason !== 'radar_guard_missing') throw new Error(`unexpected reason: ${reason}`);
});

Deno.test('radar SMS is refused when workspace SMS is disabled', () => {
  const reason = validateRadarComplianceReceipt(item, receipt, false, now);
  if (reason !== 'radar_sms_disabled') throw new Error(`unexpected reason: ${reason}`);
});

Deno.test('radar SMS requires PEWC for the exact destination', () => {
  const reason = validateRadarComplianceReceipt(item, { ...receipt, pewc_phone: '+12395550199' }, true, now);
  if (reason !== 'radar_sms_pewc_missing') throw new Error(`unexpected reason: ${reason}`);
});

Deno.test('radar SMS requires the DNC scrub for the exact E.164 destination', () => {
  const reason = validateRadarComplianceReceipt(item, { ...receipt, dnc_phone: '+12395550199' }, true, now);
  if (reason !== 'radar_guard_dnc_phone_mismatch') throw new Error(`unexpected reason: ${reason}`);
});

Deno.test('valid bound receipt passes and legacy sends are unaffected', () => {
  if (validateRadarComplianceReceipt(item, receipt, true, now) !== null) throw new Error('valid receipt blocked');
  if (validateRadarComplianceReceipt({ ...item, source_type: 'campaign', compliance_check_id: null }, null, false, now) !== null) {
    throw new Error('legacy send was blocked');
  }
});

Deno.test('receipt expires after seven days and DNC attestations expire after 31 days', () => {
  const staleGuard = validateRadarComplianceReceipt(item, { ...receipt, created_at: '2026-08-16T15:00:00.000Z' }, true, now);
  if (staleGuard !== 'radar_guard_stale') throw new Error(`unexpected guard result: ${staleGuard}`);
  const staleDnc = validateRadarComplianceReceipt(item, {
    ...receipt, dnc_fdacs_at: '2026-07-01T15:00:00.000Z',
  }, true, now);
  if (staleDnc !== 'radar_guard_dnc_stale') throw new Error(`unexpected DNC result: ${staleDnc}`);
});

Deno.test('recipient-local window is 08:00 inclusive to 20:00 exclusive', () => {
  if (!isWithinRecipientHours(new Date('2026-08-24T12:00:00Z'), 'America/New_York')) throw new Error('08:00 blocked');
  if (isWithinRecipientHours(new Date('2026-08-25T00:00:00Z'), 'America/New_York')) throw new Error('20:00 allowed');
  if (isWithinRecipientHours(now, 'not/a-zone')) throw new Error('invalid timezone allowed');
});

Deno.test('PEWC requires exact-phone written marketing evidence', () => {
  const evidence = {
    action: 'opt_in', phone: '+12395550100', purpose: 'marketing', source: 'web_form',
    consent_text_shown: 'I agree to receive marketing texts.',
    source_details: { evidence_id: 'form-1', consent_version: 'v2' },
  };
  if (!isWrittenMarketingPewc(evidence, '+12395550100')) throw new Error('valid PEWC refused');
  if (isWrittenMarketingPewc({ ...evidence, source: 'verbal' }, '+12395550100')) throw new Error('verbal consent accepted');
});

Deno.test('account-less Radar handoff accepts only a nullable contact', () => {
  if (!isLeadContactBindingValid(null, null)) throw new Error('account-less binding refused');
  if (isLeadContactBindingValid(null, 'account-1')) throw new Error('arbitrary account accepted');
  if (!isLeadContactBindingValid('account-1', 'account-1')) throw new Error('matching account refused');
});

Deno.test('recipient timezone comes from Florida source and county, not caller input', () => {
  if (deriveFloridaRecipientTimezone('fl_dfs_swo', 'Escambia County') !== 'America/Chicago') {
    throw new Error('Florida Central county mapped incorrectly');
  }
  if (deriveFloridaRecipientTimezone('untrusted', 'Escambia') !== null) {
    throw new Error('untrusted source established timezone');
  }
});
