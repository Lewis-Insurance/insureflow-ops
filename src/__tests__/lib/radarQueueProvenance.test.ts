import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isHandedOffRadarLead } from '../../../supabase/functions/_shared/radarLeadProvenance';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/20260824110000_wc_renewal_radar_phase1.sql'), 'utf8');
const automation = readFileSync(resolve(root, 'supabase/functions/marketing-automation-processor/index.ts'), 'utf8');
const nurture = readFileSync(resolve(root, 'supabase/functions/nurture-campaign-processor/index.ts'), 'utf8');
const guard = readFileSync(resolve(root, 'supabase/functions/radar-compliance-guard/index.ts'), 'utf8');
const enqueue = readFileSync(resolve(root, 'supabase/functions/radar-guarded-enqueue/index.ts'), 'utf8');
const supabaseConfig = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');

describe('Radar queue provenance contract', () => {
  it('blocks legacy-source enqueue for handed-off Radar recipients at the database boundary', () => {
    expect(migration).toContain('Radar-derived recipient requires guarded enqueue provenance');
    expect(migration).toContain("NEW.source_type<>'wc_renewal_radar'");
    expect(migration).toContain("IF NEW.source_type<>'wc_renewal_radar' THEN");
    expect(migration).toContain('o.lead_id IS DISTINCT FROM NEW.radar_lead_id');
    expect(migration).toContain('c.licensed_agent_id IS DISTINCT FROM NEW.from_user_id');
  });

  it('propagates per-touch Guard provenance through marketing automation', () => {
    expect(automation).toContain("return 'guard_required'");
    expect(automation).toContain("source_type: radar?.source_type || 'automation'");
    expect(automation).toContain('agency_workspace_id: radar?.agency_workspace_id || null');
    expect(automation).toContain('radar_lead_id: radar?.radar_lead_id || null');
    expect(automation).toContain('compliance_check_id: radar?.compliance_check_id || null');
  });

  it('provides an authorized transactional enqueue path with one receipt per touch', () => {
    expect(migration).toContain('CREATE FUNCTION public.enqueue_guarded_radar_touch');
    expect(migration).toContain('CREATE UNIQUE INDEX marketing_send_queue_compliance_check_idx');
    expect(enqueue).toContain("await requireAuth(req, db, headers)");
    expect(enqueue).toContain("p_idempotency_key: `wc_renewal_radar:${receipt.id}`");
    expect(enqueue).toContain("db.rpc('enqueue_guarded_radar_touch'");
    expect(enqueue).toContain('normalizeDestination(body.channel, body.destination)');
    expect(enqueue).toContain('receipt.destination !== destination');
    expect(enqueue).toContain('p_destination: destination');
    expect(supabaseConfig).toContain('[functions.radar-guarded-enqueue]\nverify_jwt = true');
  });

  it('excludes handed-off Radar leads from nurture auto-enrollment by either provenance path', () => {
    expect(nurture).toContain("account_id, lead_source, metadata");
    expect(nurture).toContain('(lead) => !isHandedOffRadarLead(lead)');
    expect(nurture).toContain('if (filteredLeads.length === 0)');
    expect(isHandedOffRadarLead({ lead_source: 'wc_renewal_radar' })).toBe(true);
    expect(isHandedOffRadarLead({ metadata: { radar_opportunity_id: 'opp-1' } })).toBe(true);
  });

  it('stamps existing leads at handoff without replacing their source or metadata', () => {
    expect(migration).toContain("CASE WHEN jsonb_typeof(metadata)='object' THEN metadata ELSE '{}'::jsonb END");
    expect(migration).toContain("|| jsonb_build_object('radar_opportunity_id',o.id)");
    expect(migration).not.toContain("UPDATE public.leads SET lead_source='wc_renewal_radar'");

    const existingLead = {
      lead_source: 'referral',
      metadata: { origin: 'manual', radar_opportunity_id: 'opp-existing' },
    };
    expect(existingLead.metadata.origin).toBe('manual');
    expect(isHandedOffRadarLead(existingLead)).toBe(true);
  });

  it('normalizes malformed legacy metadata to an object before stamping the handoff marker', () => {
    for (const legacyMetadata of [[], 'legacy-scalar']) {
      const normalizedMetadata = (
        typeof legacyMetadata === 'object' &&
        legacyMetadata !== null &&
        !Array.isArray(legacyMetadata)
      ) ? legacyMetadata : {};
      const stampedMetadata = { ...normalizedMetadata, radar_opportunity_id: 'opp-legacy' };
      expect(Array.isArray(stampedMetadata)).toBe(false);
      expect(isHandedOffRadarLead({ metadata: stampedMetadata })).toBe(true);
    }
  });

  it('keeps ordinary leads eligible and safely handles absent or malformed Radar metadata', () => {
    expect(isHandedOffRadarLead({ lead_source: 'referral', metadata: null })).toBe(false);
    expect(isHandedOffRadarLead({ metadata: 'not-an-object' })).toBe(false);
    expect(isHandedOffRadarLead({ metadata: [] })).toBe(false);
    expect(isHandedOffRadarLead({ metadata: { radar_opportunity_id: null } })).toBe(false);
    expect(isHandedOffRadarLead({ metadata: { radar_opportunity_id: '  ' } })).toBe(false);
  });

  it('binds account-less handoffs directly to lead email and phone', () => {
    expect(guard).toContain(".select('id, agency_workspace_id, account_id, email, phone')");
    expect(guard).toContain('isLeadContactBindingValid(lead.account_id, body.contact_id)');
    expect(guard).toContain('normalizePhone(lead.phone) !== dncPhone');
    expect(guard).toContain("(lead.email || '').trim().toLowerCase() !== destination");
  });

  it('does not trust a caller-supplied recipient timezone', () => {
    expect(guard).toContain('deriveFloridaRecipientTimezone(opportunity.source, opportunity.county)');
    expect(guard).not.toContain('body.recipient_timezone');
    expect(guard).toContain("recipient_timezone: recipientTimezone || 'UNVERIFIED'");
  });
});
