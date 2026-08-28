import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260828020000_portal_shared_policies_and_household_accounts.sql',
  'utf8',
);

describe('portal cluster switcher migration', () => {
  it('exposes only active accessible account names and marks home', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.list_my_portal_accounts\(\)/i);
    expect(sql).toContain('public.portal_accessible_account_ids()');
    expect(sql).toContain('FROM accessible_accounts accessible');
    expect(sql).toMatch(/a\.deleted_at IS NULL/i);
    expect(sql).toMatch(/FROM public\.portal_household_members phm[\s\S]*?phm\.auth_user_id = auth\.uid\(\)/i);
    expect(sql).toMatch(/cpu2\.account_id[\s\S]*?AS is_home/i);
    expect(sql).not.toMatch(/JOIN public\.accounts a\s+ON a\.id IN/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.list_my_portal_accounts\(\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_my_portal_accounts\(\) TO authenticated/i);
  });

  it('exposes owned and named-insured policies only for an accessible account', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.list_my_portal_policies\(p_account_id uuid\)/i);
    expect(sql).toMatch(/p_account_id IS NULL OR NOT EXISTS[\s\S]*?portal_accessible_account_ids/i);
    expect(sql).toContain("USING ERRCODE = '42501'");
    expect(sql).toMatch(/'owner'::text AS membership[\s\S]*?UNION ALL[\s\S]*?'named_insured'::text AS membership/i);
    expect(sql).toMatch(/FROM public\.policy_named_insureds pni/i);
    expect(sql.match(/portal_accessible_account_ids\(\)/gi)).toHaveLength(4);
    expect(sql).toMatch(/p\.line_of_business/i);
    expect(sql).toMatch(/LEFT JOIN public\.carriers c ON c\.id = p\.carrier_id/i);
    expect(sql).not.toMatch(/p\.policy_type/i);
    expect(sql).not.toMatch(/p\.carrier_name/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.list_my_portal_policies\(uuid\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_my_portal_policies\(uuid\) TO authenticated/i);
  });

  it('does not remove portal account memberships or inspect production data', () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|VIEW|FUNCTION)\b/i);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.list_account_policies/i);
  });
});
