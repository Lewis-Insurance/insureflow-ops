import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260827210000_portal_user_accounts.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

describe('portal user accounts migration', () => {
  it('uses the reserved migration filename', () => {
    expect(migrationPath).toMatch(/20260827210000_portal_user_accounts\.sql$/);
    expect(migrationPath).not.toContain('20260827200000');
  });

  it('models one portal identity with unique account memberships and one home', () => {
    expect(sql).toMatch(/CREATE TABLE public\.portal_user_accounts/);
    expect(sql).toMatch(
      /portal_user_id uuid NOT NULL REFERENCES public\.client_portal_users\(id\) ON DELETE CASCADE/,
    );
    expect(sql).toMatch(/account_id uuid NOT NULL REFERENCES public\.accounts\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/UNIQUE \(portal_user_id, account_id\)/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX portal_user_accounts_one_home_idx[\s\S]*ON public\.portal_user_accounts \(portal_user_id\)[\s\S]*WHERE is_home/,
    );
    expect(sql).not.toMatch(/CREATE TABLE (?:public\.)?client_portal_users/i);
    expect(sql).not.toMatch(/\brel_type\b[\s\S]*portal_user_accounts/i);
  });

  it('requires home membership and keeps it aligned with the CPU home account', () => {
    expect(sql).toMatch(
      /IF \(NEW\.account_id = v_home_account_id\) IS DISTINCT FROM NEW\.is_home THEN/,
    );
    expect(sql).toMatch(/Home junction must exactly match client_portal_users\.account_id/);
    expect(sql).toMatch(/NOT is_home\s*AND\s*public\.is_staff\(\)/);
    expect(sql).not.toMatch(/BEFORE DELETE ON public\.portal_user_accounts/);
    expect(sql).toMatch(/Portal account must be in the home account workspace/);
    expect(sql).toMatch(/SET account_id = p_replace_home_account_id/);
    expect(sql).toMatch(/SET is_home = true[\s\S]*account_id = p_replace_home_account_id/);
  });

  it('adds invitation scope and backfills only each CPU home account', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.portal_invitations[\s\S]*ADD COLUMN scope_account_ids uuid\[\] NOT NULL DEFAULT '\{\}'::uuid\[\]/,
    );
    expect(sql).toMatch(
      /INSERT INTO public\.portal_user_accounts \(portal_user_id, account_id, is_home\)\s*SELECT cpu\.id, cpu\.account_id, true\s*FROM public\.client_portal_users cpu/,
    );
    expect(sql).not.toMatch(/INSERT INTO public\.portal_user_accounts[\s\S]{0,300}get_account_cluster/);
    expect(sql).toMatch(/PR 2 accept path must write these accounts plus home/);
  });

  it('preserves direct, junction, and household accessible-account branches', () => {
    expect(sql).toMatch(
      /SELECT cpu\.account_id[\s\S]*UNION[\s\S]*SELECT pua\.account_id[\s\S]*JOIN public\.client_portal_users cpu ON cpu\.id = pua\.portal_user_id[\s\S]*UNION[\s\S]*SELECT cpu2\.account_id/,
    );
    expect(sql).toMatch(
      /FROM public\.portal_household_members phm\s*JOIN public\.client_portal_users cpu2 ON cpu2\.id = phm\.primary_user_id\s*WHERE phm\.auth_user_id = auth\.uid\(\)\s*AND phm\.status = 'active'\s*AND cpu2\.portal_status = 'active'/,
    );
  });

  it('keeps policies owner-FK and expands them through CPU plus junction accounts', () => {
    expect(sql).toMatch(/cpu\.id AS portal_user_id/);
    expect(sql).not.toMatch(/cpu\.user_id AS portal_user_id/);
    expect(sql).toMatch(
      /JOIN public\.accounts a ON a\.id IN \(\s*SELECT cpu\.account_id\s*UNION\s*SELECT pua\.account_id/,
    );
    expect(sql).toMatch(/JOIN public\.policies p ON p\.account_id = a\.id/);
    expect(sql).not.toMatch(/INSERT INTO public\.policies/);
  });

  it('applies commercial-only invite defaults and omits same_as', () => {
    expect(sql).toMatch(/cluster\.account_id = p_account_id/);
    expect(sql).toMatch(
      /cluster\.is_business\s*AND cluster\.node_role IN \('parent_company', 'affiliated_business', 'owned_business', 'owns'\)/,
    );
    expect(sql).toMatch(/WHERE cluster\.node_role <> 'same_as'/);
    expect(sql).not.toMatch(/cluster\.node_role IN \([^)]*spouse/);
    expect(sql).not.toMatch(/cluster\.node_role IN \([^)]*household/);
    expect(sql).toMatch(
      /cluster_account\.agency_workspace_id = origin_account\.agency_workspace_id/,
    );
  });

  it('rejects cross-workspace and non-cluster additions', () => {
    expect(sql).toMatch(/v_scope_workspace_id IS DISTINCT FROM v_home_workspace_id/);
    expect(sql).toMatch(/Account is outside the portal home workspace/);
    expect(sql).toMatch(
      /FROM public\.get_account_cluster\(v_portal_user\.account_id\) cluster\s*WHERE cluster\.account_id = p_account_id/,
    );
    expect(sql).toMatch(/Account is outside the portal home cluster/);
    expect(sql).toMatch(
      /FROM public\.client_portal_users\s*WHERE id = p_portal_user_id\s*FOR UPDATE/g,
    );
    expect(sql).toMatch(/Cannot remove the last portal account/);
    const addBody = sql.match(
      /CREATE OR REPLACE FUNCTION public\.add_portal_user_account\([\s\S]*?\n\$\$;/,
    )?.[0];
    const removeBody = sql.match(
      /CREATE OR REPLACE FUNCTION public\.remove_portal_user_account\([\s\S]*?\n\$\$;/,
    )?.[0];
    expect(addBody).toBeDefined();
    expect(addBody).not.toMatch(/p_replace_home_account_id|Cannot remove the last portal account/);
    expect(removeBody).toMatch(
      /count\(\*\) FROM public\.portal_user_accounts WHERE portal_user_id = p_portal_user_id\) <= 1/,
    );
    expect(removeBody).toMatch(/Cannot remove the last portal account/);
  });

  it('does not reuse household members for commercial account scope', () => {
    expect(sql).not.toMatch(/INSERT INTO public\.portal_household_members/);
    expect(sql).not.toMatch(/UPDATE public\.portal_household_members/);
    expect(sql).not.toMatch(/DELETE FROM public\.portal_household_members/);
  });

  it('keeps client_portal_users.account_id', () => {
    expect(sql).not.toMatch(/DROP\s+(?:COLUMN\s+)?(?:IF EXISTS\s+)?account_id/i);
    expect(sql).not.toMatch(/ALTER TABLE public\.client_portal_users[\s\S]*DROP/i);
  });

  it('enables RLS without anon access and prevents portal self-service writes', () => {
    expect(sql).toMatch(/ALTER TABLE public\.portal_user_accounts ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY portal_user_accounts_select/);
    expect(sql).toMatch(/cpu\.auth_user_id = auth\.uid\(\)[\s\S]*cpu\.portal_status = 'active'/);
    expect(sql).toMatch(/public\.is_staff\(\)[\s\S]*agency_workspace_memberships/);
    expect(sql).toMatch(/awm\.role IN \('owner', 'admin', 'producer', 'csr'\)/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.portal_user_accounts FROM anon/);
    expect(sql).not.toMatch(/GRANT [^;]*portal_user_accounts TO anon/);
  });

  it('hardens every staff RPC and grants only intended execution roles', () => {
    const rpcSignatures = [
      ['list_portal_invite_cluster', 'uuid'],
      ['add_portal_user_account', 'uuid, uuid'],
      ['remove_portal_user_account', 'uuid, uuid, uuid'],
    ] as const;
    for (const [name, signature] of rpcSignatures) {
      const definition = sql.match(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
        ),
      )?.[0];
      expect(definition).toBeDefined();
      expect(definition).toMatch(/SECURITY DEFINER/);
      expect(definition).toMatch(/SET search_path = public/);
      expect(definition).toMatch(/IF NOT public\.is_staff\(\) THEN/);
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(${signature}\\) FROM PUBLIC, anon`),
      );
      expect(sql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${name}\\(${signature}\\) TO authenticated, service_role`,
        ),
      );
    }
    expect(sql.match(/IF NOT public\.is_staff\(\) THEN/g)).toHaveLength(3);
    expect(sql.match(/SECURITY DEFINER/g)?.length).toBeGreaterThanOrEqual(6);
    expect(sql).toMatch(/SET search_path = public/g);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.list_portal_invite_cluster\(uuid\) FROM PUBLIC, anon/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.add_portal_user_account\(uuid, uuid\) FROM PUBLIC, anon/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.remove_portal_user_account\(uuid, uuid, uuid\) FROM PUBLIC, anon/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.list_portal_invite_cluster\(uuid\) TO authenticated, service_role/,
    );
  });

  it('contains ASCII punctuation only for dash characters', () => {
    expect(sql).not.toMatch(/[\u2013\u2014]/);
  });

  it('ends with executable commented rollback SQL in safe reverse order', () => {
    const rollback = sql.slice(sql.indexOf('-- ROLLBACK SQL'));
    expect(rollback).toMatch(
      /-- DROP FUNCTION IF EXISTS public\.remove_portal_user_account\(uuid, uuid, uuid\);/,
    );
    expect(rollback).toMatch(/-- DROP VIEW IF EXISTS public\.portal_user_policies;/);
    expect(rollback).toMatch(/-- DROP TABLE IF EXISTS public\.portal_user_accounts;/);
    expect(rollback).toMatch(
      /-- ALTER TABLE public\.portal_invitations DROP COLUMN IF EXISTS scope_account_ids;/,
    );
    expect(rollback).toMatch(
      /-- CREATE OR REPLACE FUNCTION public\.portal_accessible_account_ids\(\)/,
    );
    expect(rollback).toMatch(/-- CREATE OR REPLACE VIEW public\.portal_user_policies/);
    expect(rollback.indexOf('DROP VIEW')).toBeLessThan(rollback.indexOf('DROP TABLE'));
    expect(
      rollback.indexOf('CREATE OR REPLACE FUNCTION public.portal_accessible_account_ids'),
    ).toBeLessThan(rollback.indexOf('DROP TABLE'));
    expect(rollback).toMatch(
      /-- REVOKE ALL ON FUNCTION public\.portal_accessible_account_ids\(\) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(rollback).toMatch(
      /-- GRANT EXECUTE ON FUNCTION public\.portal_accessible_account_ids\(\) TO authenticated;/,
    );
  });
});
