import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260814120000_tasks_assignee_and_scope.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

describe('tasks assignee and scope migration', () => {
  it('adds assignee columns to search_tasks return type', () => {
    expect(sql).toMatch(/assignee_id uuid,\s*assignee_name text/);
    expect(sql).toMatch(/LEFT JOIN public\.profiles p ON p\.id = t\.assignee_id/);
    expect(sql).toMatch(/p\.full_name AS assignee_name/);
  });

  it('implements mine, unclaimed, and office scope filters in search_tasks', () => {
    expect(sql).toMatch(/filter_scope = 'office'/);
    expect(sql).toMatch(/filter_scope = 'mine' AND \(t\.assignee_id = auth\.uid\(\) OR t\.assignee_id IS NULL\)/);
    expect(sql).toMatch(/filter_scope = 'unclaimed' AND t\.assignee_id IS NULL/);
  });

  it('adds p_scope param to get_task_triage_counts with matching CTE filter', () => {
    expect(sql).toMatch(/get_task_triage_counts\(p_scope text DEFAULT 'office'\)/);
    expect(sql).toMatch(/p_scope = 'mine' AND \(assignee_id = auth\.uid\(\) OR assignee_id IS NULL\)/);
    expect(sql).toMatch(/p_scope = 'unclaimed' AND assignee_id IS NULL/);
  });

  it('revokes PUBLIC and anon, grants authenticated and service_role', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.search_tasks\(jsonb, integer, integer, text\) FROM PUBLIC, anon/,
    );
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.get_task_triage_counts\(text\) FROM PUBLIC, anon/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.search_tasks\(jsonb, integer, integer, text\) TO authenticated, service_role/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_task_triage_counts\(text\) TO authenticated, service_role/,
    );
  });

  it('keeps is_staff guard on search_tasks', () => {
    expect(sql).toMatch(/IF NOT public\.is_staff\(\) THEN/);
    expect(sql).toMatch(/WHERE public\.is_staff\(\)/);
  });
});
