import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Radar tenant contracts', () => {
  it('tenant-scopes the SECURITY DEFINER task search through active workspace membership', () => {
    const migration = repoFile('supabase/migrations/20260824111000_radar_tasks_filter.sql');
    expect(migration).toContain("awm.status = 'active'");
    expect(migration).toContain('awm.user_id = auth.uid()');
    expect(migration).toContain('COALESCE(a.agency_workspace_id, ca.agency_workspace_id, ro.agency_workspace_id)');
    expect(migration).toContain("t.entity_type = 'renewal_opportunity'");
    expect(migration).toContain('LEFT JOIN public.customers c ON c.id = t.customer_id');
    expect(migration).toContain('LEFT JOIN public.accounts ca ON ca.id = c.account_id');
    expect(migration).toContain("t.category::text = 'renewal' AND t.source = 'wc_renewal_radar'");
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.search_tasks(jsonb, integer, integer, text) FROM PUBLIC, anon');
  });

  it('keeps only caller-owned legacy tasks when no tenant can be derived', () => {
    const migration = repoFile('supabase/migrations/20260824111000_radar_tasks_filter.sql');
    expect(migration).toContain('a.id IS NULL AND ca.id IS NULL AND ro.id IS NULL');
    expect(migration).toContain('(t.assignee_id = auth.uid() OR t.created_by = auth.uid())');
    expect(migration).not.toContain('OR public.is_staff()');
  });

  it('workspace-scopes service-role lead reads and radar writes', () => {
    const engine = repoFile('supabase/functions/lead-scoring-engine/index.ts');
    expect(engine).toContain(".eq('status', 'active')");
    expect(engine).toContain("query = query.in('agency_workspace_id', workspaceIds)");
    expect(engine).toContain(".in('agency_workspace_id', workspaceIds)");
    expect(engine).not.toContain(".from('lead_score_history')");
    expect(engine).not.toContain(".from('opportunities')");
  });
});
