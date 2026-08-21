import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260821140000_persist_extract_account_link.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

describe('persist extract account link migration', () => {
  it('uses the expected migration filename', () => {
    expect(migrationPath).toMatch(/20260821140000_persist_extract_account_link\.sql$/);
  });

  it('defines persist_extract_account_link RPC with staff and workspace gates', () => {
    expect(sql).toMatch(/create or replace function public\.persist_extract_account_link/i);
    expect(sql).toMatch(/if not public\.is_staff\(\) then/i);
    expect(sql).toMatch(/public\.is_agency_member\(a\.agency_workspace_id\)/);
  });

  it('atomically updates document_analysis and documents', () => {
    expect(sql).toMatch(/update public\.document_analysis/i);
    expect(sql).toMatch(/update public\.documents/i);
    expect(sql).toMatch(/document update affected 0 rows/i);
    expect(sql).toMatch(/document_id does not match analysis/i);
  });

  it('includes commented ROLLBACK block with DROP FUNCTION', () => {
    expect(sql).toMatch(/-- ROLLBACK/);
    expect(sql).toMatch(
      /-- drop function if exists public\.persist_extract_account_link\(uuid, uuid, uuid, jsonb\)/i,
    );
  });
});
