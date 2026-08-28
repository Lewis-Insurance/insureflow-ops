import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260828010000_portal_cluster_switcher.sql',
  'utf8',
);

describe('portal cluster switcher migration', () => {
  it('exposes only active accessible account names and marks home', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.list_my_portal_accounts\(\)/i);
    expect(sql).toContain('public.portal_accessible_account_ids()');
    expect(sql).toContain("cpu.portal_status = 'active'");
    expect(sql).toMatch(/a\.deleted_at IS NULL/i);
    expect(sql).toMatch(/a\.id = cpu\.account_id AS is_home/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.list_my_portal_accounts\(\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_my_portal_accounts\(\) TO authenticated/i);
  });

  it('accepts only a selected accessible account and uses it for inserts', () => {
    expect(sql).toMatch(/p_account_id uuid DEFAULT NULL/i);
    expect(sql).toMatch(/WHERE accessible\.account_id = p_account_id/i);
    expect(sql).toContain("USING ERRCODE = '42501'");
    expect(sql).toMatch(/v_account_id := p_account_id/i);
    expect(sql).toMatch(/INSERT INTO public\.portal_service_requests[\s\S]*?v_account_id/i);
    expect(sql).toMatch(/INSERT INTO public\.tasks[\s\S]*?v_account_id/i);
  });

  it('does not remove portal account memberships or inspect production data', () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|VIEW)\b/i);
    const drops = [...sql.matchAll(/DROP\s+FUNCTION\s+([^;]+);/gi)].map((match) => match[1].trim());
    expect(drops).toEqual(['public.create_my_service_request(text, text, jsonb, uuid, jsonb)']);
    expect(sql).not.toMatch(/list_account_policies/i);
  });
});
