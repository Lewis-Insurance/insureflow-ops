import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FIX = 'supabase/migrations/20260831120000_fix_policy_named_insureds_rls_recursion.sql';
const ORIGINAL = 'supabase/migrations/20260827200000_policy_named_insureds.sql';

const sql = readFileSync(FIX, 'utf8');
const original = readFileSync(ORIGINAL, 'utf8');

/**
 * Regression guard for the outage caused by 20260827200000: the SELECT policy on
 * public.policies read public.policy_named_insureds while every policy on
 * public.policy_named_insureds read public.policies. Postgres detected the cycle and
 * aborted with `infinite recursion detected in policy for relation "policies"`, which
 * took out every direct read of policies and of the ~150 policy_* child tables whose
 * own RLS joins back to policies.
 *
 * The invariant these tests protect: neither table's RLS expression may name the other
 * table. All cross-table lookups go through SECURITY DEFINER helpers instead.
 */

/** Body of a `create policy "<name>" on <table> ... ;` statement. */
function policyBody(source: string, policyName: string): string {
  const start = source.indexOf(`create policy "${policyName}"`);
  expect(start, `policy ${policyName} should be defined`).toBeGreaterThan(-1);
  const end = source.indexOf('\n\n', start);
  return source.slice(start, end === -1 ? source.length : end);
}

describe('policy_named_insureds RLS recursion fix', () => {
  it('reproduces the shape of the bug it fixes (the original pair is mutually recursive)', () => {
    // Guard the premise: if the original migration stops being recursive, this whole
    // fix migration needs revisiting rather than silently passing.
    const originalPolicies = policyBody(original, 'Users can view policies for their workspace accounts');
    expect(originalPolicies).toContain('policy_named_insureds');

    const originalJunctionSelect = policyBody(original, 'Staff can view policy named insureds');
    expect(originalJunctionSelect).toMatch(/from\s+public\.policies\s+p/i);
  });

  it('drops and recreates every policy on both sides of the cycle', () => {
    for (const name of [
      'Users can view policies for their workspace accounts',
      'Staff can view policy named insureds',
      'Staff can insert policy named insureds',
      'Staff can delete policy named insureds',
    ]) {
      expect(sql).toContain(`drop policy if exists "${name}"`);
      expect(sql).toContain(`create policy "${name}"`);
    }
  });

  it('policies RLS no longer names policy_named_insureds', () => {
    const body = policyBody(sql, 'Users can view policies for their workspace accounts');
    expect(body).not.toContain('policy_named_insureds');
    // The named-insured branch survives, via an uncorrelated definer helper so the
    // planner evaluates it once per statement rather than once per policy row.
    expect(body).toContain('public.named_insured_policy_ids_for_current_user()');
    // Owner visibility is unchanged.
    expect(body).toMatch(/a\.id = policies\.account_id/);
  });

  it('policy_named_insureds RLS no longer names policies', () => {
    for (const name of [
      'Staff can view policy named insureds',
      'Staff can insert policy named insureds',
      'Staff can delete policy named insureds',
    ]) {
      const body = policyBody(sql, name);
      expect(body, `${name} must not read public.policies`).not.toMatch(/public\.policies/);
      expect(body).toContain('public.is_staff()');
    }
  });

  it('keeps the junction staff-only, workspace-scoped and write-role gated', () => {
    const insert = policyBody(sql, 'Staff can insert policy named insureds');
    // A Named Insured link may only ever join two accounts in the same workspace.
    expect(insert).toContain('public.account_agency_workspace_id(policy_named_insureds.account_id)');
    expect(insert).toContain('public.policy_owner_workspace_id(policy_named_insureds.policy_id)');
    expect(insert).toMatch(/awm\.role in \('owner', 'admin', 'producer', 'csr'\)/);

    const del = policyBody(sql, 'Staff can delete policy named insureds');
    expect(del).toMatch(/awm\.role in \('owner', 'admin', 'producer', 'csr'\)/);
  });

  it('every helper is a stable SECURITY DEFINER function with a pinned search_path', () => {
    const helpers = [
      'policy_owner_account_id',
      'policy_owner_workspace_id',
      'account_agency_workspace_id',
      'named_insured_policy_ids_for_current_user',
    ];
    for (const helper of helpers) {
      const start = sql.indexOf(`create or replace function public.${helper}(`);
      expect(start, `${helper} should be defined`).toBeGreaterThan(-1);
      const body = sql.slice(start, sql.indexOf('$$;', start));
      // security definer is what breaks the cycle: the inner read runs as postgres
      // (rolbypassrls), so the rewriter never expands the other table's policies.
      expect(body).toContain('security definer');
      expect(body).toContain('set search_path = public');
      expect(body).toContain('stable');
    }
  });

  it('revokes the helpers from public and grants only what each caller needs', () => {
    expect(sql).toMatch(/revoke all on function public\.policy_owner_account_id\(uuid\) from public, anon/);
    expect(sql).toMatch(/revoke all on function public\.policy_owner_workspace_id\(uuid\) from public, anon/);
    expect(sql).toMatch(/revoke all on function public\.account_agency_workspace_id\(uuid\) from public, anon/);
    // The policies SELECT policy applies to role public, so anon must be able to
    // evaluate this one. It returns no rows when auth.uid() is null.
    expect(sql).toMatch(
      /grant execute on function public\.named_insured_policy_ids_for_current_user\(\) to authenticated, anon, service_role/,
    );
  });

  it('routes the junction guard trigger through the definer helper', () => {
    const start = sql.indexOf('create or replace function public.guard_policy_named_insured_owner()');
    expect(start).toBeGreaterThan(-1);
    const body = sql.slice(start);
    // Reading public.policies here pulled RLS (and the cycle) into every INSERT.
    expect(body).toContain('public.policy_owner_account_id(new.policy_id)');
    expect(body.slice(0, body.indexOf('$$;'))).not.toMatch(/from public\.policies/i);
    // The owner-cannot-be-a-named-insured invariant is preserved.
    expect(body).toContain('Policy owner cannot be a Named Insured junction row');
  });

  it('does not widen access or touch unrelated objects', () => {
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/disable row level security/i);
    expect(sql).not.toMatch(/grant .* to anon\b(?!, service_role)/i);
    // The Named Insured RPCs from #164 are left exactly as they are.
    expect(sql).not.toMatch(/create or replace function public\.list_account_policies/i);
    expect(sql).not.toMatch(/create or replace function public\.add_policy_named_insured/i);
  });

  it('is marked as needing approval before a production apply', () => {
    expect(sql).toContain('NEEDS LANDEN APPROVAL BEFORE PROD APPLY');
  });
});
