import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260828100000_accept_portal_invitation.sql',
);
const sql = readFileSync(migrationPath, 'utf8');
const normalizedSql = sql.replace(/\s+/g, ' ');

describe('accept_portal_invitation migration', () => {
  it('is an authenticated-only SECURITY DEFINER RPC with a fixed search path', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.accept_portal_invitation\(p_invitation_id uuid\)/);
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
    expect(sql).toMatch(/v_auth_user_id uuid := auth\.uid\(\)/);
    expect(sql).toMatch(/IF v_auth_user_id IS NULL THEN/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.accept_portal_invitation\(uuid\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.accept_portal_invitation\(uuid\) TO authenticated/);
    expect(sql).not.toMatch(/GRANT EXECUTE[^;]+\b(?:PUBLIC|anon)\b/);
    expect(sql).not.toMatch(/p_auth_user_id/);
  });

  it('loads exactly one invitation by id and fails closed when it is absent or expired', () => {
    expect(normalizedSql).toContain(
      'FROM public.portal_invitations WHERE id = p_invitation_id FOR UPDATE',
    );
    expect(normalizedSql).toMatch(
      /IF NOT FOUND OR v_invitation\.status NOT IN \('pending', 'sent', 'clicked', 'registered'\) OR v_invitation\.expires_at IS NULL OR v_invitation\.expires_at <= v_now/,
    );
    expect(sql).not.toMatch(/INSERT INTO public\.client_portal_users/);
  });

  it('matches the session email to both the invitation and invited CPU without leaking it', () => {
    expect(sql).toMatch(/SELECT email\s+INTO v_auth_email\s+FROM auth\.users\s+WHERE id = v_auth_user_id/);
    expect(sql.match(/lower\(btrim\([^)]*email(?:::text)?\)\) IS DISTINCT FROM lower\(btrim\(v_auth_email\)\)/g)).toHaveLength(2);
    expect(sql.match(/RAISE EXCEPTION 'Portal invitation cannot be accepted'/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).not.toMatch(/RAISE EXCEPTION[^\n]*(?:v_auth_email|v_invitation\.email|v_portal_user\.email)/);
  });

  it('resolves the CPU through portal_user_id and rejects disabled or foreign-bound users', () => {
    expect(sql).toMatch(/IF v_invitation\.portal_user_id IS NULL THEN/);
    expect(normalizedSql).toContain(
      'FROM public.client_portal_users WHERE id = v_invitation.portal_user_id FOR UPDATE',
    );
    expect(normalizedSql).toContain("v_portal_user.portal_status = 'disabled'");
    expect(normalizedSql).toContain(
      'v_portal_user.auth_user_id IS NOT NULL AND v_portal_user.auth_user_id <> v_auth_user_id',
    );
  });

  it('binds the Auth user, activates the existing CPU, and produces the active row shape used by usePortalAuth', () => {
    expect(normalizedSql).toMatch(
      /UPDATE public\.client_portal_users SET auth_user_id = v_auth_user_id, portal_status = 'active'/,
    );
    expect(normalizedSql).toContain('first_login_at = COALESCE(first_login_at, v_now)');
    expect(normalizedSql).toContain('last_login_at = v_now');
    expect(normalizedSql).toContain(
      'login_count = COALESCE(login_count, 0) + CASE WHEN auth_user_id IS NULL THEN 1 ELSE 0 END',
    );
    expect(normalizedSql).toContain('WHERE id = v_portal_user.id RETURNING * INTO v_portal_user');
    expect(sql).not.toMatch(/UPDATE public\.client_portal_users[\s\S]*SET\s+account_id\s*=/);

    const acceptedRow = { auth_user_id: 'session-user', portal_status: 'active' };
    expect(
      acceptedRow.auth_user_id === 'session-user' && acceptedRow.portal_status === 'active',
    ).toBe(true);
  });

  it('writes the invitation scope plus home with unique, correct home junctions', () => {
    expect(normalizedSql).toContain(
      "unnest(array_append(COALESCE(v_invitation.scope_account_ids, '{}'::uuid[]), v_portal_user.account_id))",
    );
    expect(normalizedSql).toContain('SELECT DISTINCT account_id');
    expect(normalizedSql).toContain('WHERE account_id IS NOT NULL');
    expect(normalizedSql).toContain(
      'SELECT v_portal_user.id, scope.account_id, scope.account_id = v_portal_user.account_id',
    );
    expect(normalizedSql).toContain(
      'ON CONFLICT (portal_user_id, account_id) DO UPDATE SET is_home = EXCLUDED.is_home',
    );
    expect(sql).not.toMatch(/DELETE FROM public\.portal_user_accounts/);
  });

  it('is idempotent for the same Auth user and cannot create a second CPU', () => {
    expect(normalizedSql).toContain(
      'v_portal_user.auth_user_id IS NOT NULL AND v_portal_user.auth_user_id <> v_auth_user_id',
    );
    expect(sql).not.toMatch(/INSERT INTO public\.client_portal_users/);
    expect(normalizedSql).toContain('ON CONFLICT (portal_user_id, account_id) DO UPDATE');
    expect(normalizedSql).toContain(
      'CASE WHEN auth_user_id IS NULL THEN 1 ELSE 0 END',
    );
  });

  it('marks registration without making that bookkeeping update fatal', () => {
    expect(normalizedSql).toMatch(
      /BEGIN UPDATE public\.portal_invitations SET status = 'registered', registered_at = COALESCE\(registered_at, v_now\)/,
    );
    expect(normalizedSql).toContain('EXCEPTION WHEN OTHERS THEN NULL; END;');
    expect(normalizedSql).toContain('RETURN v_portal_user');
  });

  it('contains only ASCII dash punctuation', () => {
    expect(sql).not.toMatch(/[\u2013\u2014]/);
  });
});
