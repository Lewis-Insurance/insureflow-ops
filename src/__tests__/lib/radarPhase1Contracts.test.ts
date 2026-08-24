import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { canonicalizeRow, dedupKey, normalizeEntity, preflightXlsx, validateRow } from '../../../supabase/functions/_shared/radarIngest';
import { radarOwnBookKeys } from '../../../supabase/functions/_shared/radarOwnBook';

const root = process.cwd();
const migration = readFileSync(resolve(root, 'supabase/migrations/20260824110000_wc_renewal_radar_phase1.sql'), 'utf8');
const upsert = readFileSync(resolve(root, 'supabase/functions/radar-opportunity-upsert/index.ts'), 'utf8');

describe('Radar Phase 1 contracts', () => {
  it('makes handed_off terminal and binds it to a lead', () => {
    expect(migration).toContain("OLD.stage = 'handed_off'");
    expect(migration).toContain("stage <> 'handed_off' OR lead_id IS NOT NULL");
  });

  it('uses the live task shape without task_type', () => {
    expect(migration).toContain("'renewal','wc_renewal_radar','renewal_opportunity'");
    expect(`${migration}\n${upsert}`).not.toMatch(/tasks[^;]*task_type/i);
  });

  it('keeps pre-lead scoring off lead_score_history and campaigns', () => {
    expect(`${migration}\n${upsert}`).not.toContain('lead_score_history');
    expect(`${migration}\n${upsert}`).not.toContain('campaign_enrollments');
  });

  it('does not reuse the existing opportunities CRM', () => {
    expect(`${migration}\n${upsert}`).not.toContain('public.opportunities');
  });

  it('loads complete own-book match keys beyond the PostgREST row cap', () => {
    expect(upsert).toContain('radar_own_book_match_keys');
    expect(upsert).not.toContain('from("own_book_employers")');
    expect(migration).toContain('RETURNS jsonb');
    const ownBook = Array.from({ length: 1_001 }, (_, index) => ({
      policy_number: `WC-${index}`,
      carrier: 'Carrier',
      normalized_employer_name: `employer${index}`,
      fein: String(index).padStart(9, '0'),
    }));
    const keys = radarOwnBookKeys(ownBook);
    expect(keys.policies).toHaveLength(1_001);
    expect(keys.entities).toHaveLength(1_001);
    expect(keys.policies).toContain('wc1000:carrier');
    expect(keys.entities).toContain('employer1000:000001000');
  });

  it('runs dedupe, score, atomic task, and explicit handoff surfaces', () => {
    expect(upsert).toContain('lead-scoring-engine');
    expect(upsert).toContain('radar_create_task_if_capacity');
    expect(migration).toContain('UNIQUE (agency_workspace_id, dedup_key)');
    expect(migration).toContain('handoff_radar_opportunity');
    expect(migration).toContain('IF p_account_id IS NOT NULL AND NOT EXISTS');
    expect(migration).toContain('p_account_id IS NULL OR account_id IS NULL OR account_id=p_account_id');
    expect(migration).toContain('marketing_send_queue_radar_provenance');
    expect(migration).toContain('Radar queue provenance is immutable');
  });

  it('normalizes ampersands consistently and preflights bounded one-sheet XLSX archives', () => {
    expect(normalizeEntity('Smith & Sons')).toBe('smithandsons');
    const archive = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet/>'),
    });
    expect(() => preflightXlsx(archive)).not.toThrow();
    const multi = zipSync({
      'xl/worksheets/sheet1.xml': strToU8('<worksheet/>'),
      'xl/worksheets/sheet2.xml': strToU8('<worksheet/>'),
    });
    expect(() => preflightXlsx(multi)).toThrow(/exactly one/);
    expect(canonicalizeRow({ Employer: 'Acme', Policy: 'WC1', Carrier: 'C', 'Expiration Date': new Date('2026-08-24T12:00:00Z') }).expiration_date)
      .toBe('2026-08-24');
  });

  it('separates policy renewal terms and rejects impossible calendar dates', () => {
    expect(dedupKey({ policy_number: 'WC-1', carrier: 'A&B', expiration_date: '2026-08-24' }))
      .not.toBe(dedupKey({ policy_number: 'WC-1', carrier: 'A&B', expiration_date: '2027-08-24' }));
    expect(validateRow(canonicalizeRow({ Employer: 'Acme', County: 'Lee', 'Expiration Date': '2026-02-30' })))
      .toContain('expiration_date is invalid');
  });
});
