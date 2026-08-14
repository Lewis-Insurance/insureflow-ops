import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPaths = [
  'supabase/migrations/20260814120000_renewal_intelligence_summary_rpc.sql',
  'supabase/migrations/20260814121000_renewal_intelligence_tenant_fix.sql',
];

function normalizedMigration(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
    .replace(/--.*$/gm, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

describe.each(migrationPaths)('%s', (path) => {
  const sql = normalizedMigration(path);

  it('keeps the RPC invoker-scoped with an empty search path', () => {
    expect(sql).toContain('security invoker');
    expect(sql).not.toContain('security definer');
    expect(sql).toContain("set search_path = ''");
  });

  it('requires a staff identity and active membership in each counted workspace', () => {
    expect(sql).toContain('select auth.uid() as user_id');
    expect(sql).toContain('auth.uid() is not null');
    expect(sql).toContain('public.is_staff()');
    expect(sql).toContain('public.agency_workspace_memberships');
    expect(sql).toContain("awm.status = 'active'");
    expect(sql).toContain('awm.agency_workspace_id = a.agency_workspace_id');
  });

  it('preserves the summary metric contract and fails closed on campaign ownership drift', () => {
    expect(sql).toContain("r.status in ('upcoming', 'in_progress')");
    expect(sql).toContain('renewal_date >= current_date');
    expect(sql).toContain('renewal_date <= current_date + 30');
    expect(sql).toContain('avg(coalesce(risk_score, 0))');
    expect(sql).toContain("risk_level = 'critical'");
    expect(sql).toContain("risk_level = 'high'");
    expect(sql).toContain("risk_level = 'medium'");
    expect(sql).toContain("risk_level = 'low'");
    expect(sql).toContain('rr.account_id = rc.account_id');
    expect(sql).toContain("rc.status = 'active'");
  });

  it('removes every verified permissive policy before restoring scoped policies', () => {
    for (const policy of [
      'staff can manage renewals',
      'staff can view all renewals',
      'staff can insert renewals',
      'staff can update renewals',
      'staff can delete renewals',
      'staff can manage all campaigns',
      'staff can manage renewal campaigns',
      'staff can view all campaigns',
      'staff can manage campaigns',
      'users can view campaigns for their workspace accounts',
    ]) {
      expect(sql).toContain(`drop policy if exists "${policy}"`);
    }

    expect(sql).not.toContain('drop policy if exists "users can view renewals for their workspace accounts"');
  });

  it('restores tenant-scoped renewal writes with the intended roles and checks', () => {
    expect(sql).toContain('create policy "staff can insert renewals"');
    expect(sql).toContain('create policy "staff can update renewals"');
    expect(sql).toContain('create policy "staff can delete renewals"');
    expect(sql).toContain("awm.role in ('owner', 'admin', 'producer', 'csr')");
    expect(sql).toContain("awm.role in ('owner', 'admin')");
    expect(sql).toContain('awm.user_id = (select auth.uid())');
    expect(sql).toContain("awm.status = 'active'");
    expect(sql).toMatch(/create policy "staff can update renewals".*?using \(.*?with check \(/);
  });

  it('restores consistent tenant-scoped campaign writes for direct client mutations', () => {
    expect(sql).toContain('create policy "staff can manage campaigns"');
    expect(sql).toMatch(/create policy "staff can manage campaigns".*?for all.*?to authenticated/);
    expect(sql).toContain('r.id = renewal_campaigns.renewal_id');
    expect(sql).toContain('r.account_id = renewal_campaigns.account_id');
    expect(sql).toMatch(/create policy "staff can manage campaigns".*?using \(.*?with check \(/);
  });

  it('restores authenticated campaign reads without exposing inconsistent account ownership', () => {
    expect(sql).toMatch(
      /create policy "users can view campaigns for their workspace accounts".*?for select.*?to authenticated.*?using \(/,
    );
    expect(sql).toMatch(
      /create policy "users can view campaigns for their workspace accounts".*?r\.id = renewal_campaigns\.renewal_id.*?r\.account_id = renewal_campaigns\.account_id/,
    );
  });

  it('exposes the RPC only to authenticated callers', () => {
    expect(sql).toContain(
      'revoke all on function public.get_renewal_intelligence_summary() from public, anon, authenticated, service_role;',
    );
    expect(sql).toContain(
      'grant execute on function public.get_renewal_intelligence_summary() to authenticated;',
    );
    expect(sql).not.toContain('to authenticated, service_role');
  });
});
