import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260821120000_extract_writeback_proposals.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

describe('extract writeback proposals migration', () => {
  it('uses the expected migration filename', () => {
    expect(migrationPath).toMatch(/20260821120000_extract_writeback_proposals\.sql$/);
  });

  it('defines extract_writeback_proposals with idempotency unique constraint', () => {
    expect(sql).toMatch(/create table if not exists public\.extract_writeback_proposals/i);
    expect(sql).toMatch(
      /unique \(document_analysis_id, account_id, snapshot_hash, carrier_name\)/i,
    );
    expect(sql).toMatch(/line_class text not null check \(line_class in \('personal', 'commercial'\)\)/i);
    expect(sql).toMatch(/status text not null default 'pending' check \(status in \('pending', 'applied', 'rejected'\)\)/i);
  });

  it('gates RLS with is_staff and is_agency_member via accounts workspace', () => {
    expect(sql).toMatch(/public\.is_staff\(\)/);
    expect(sql).toMatch(/public\.is_agency_member\(a\.agency_workspace_id\)/);
    expect(sql).toMatch(/staff_select_extract_writeback_proposals/);
    expect(sql).toMatch(/staff_insert_extract_writeback_proposals/);
    expect(sql).toMatch(/staff_update_extract_writeback_proposals/);
  });

  it('revokes anon and grants authenticated select insert update', () => {
    expect(sql).toMatch(/revoke all on public\.extract_writeback_proposals from anon/i);
    expect(sql).toMatch(
      /grant select, insert, update on public\.extract_writeback_proposals to authenticated/i,
    );
  });

  it('includes reject_extract_writeback_proposal RPC with is_staff guard', () => {
    expect(sql).toMatch(/create or replace function public\.reject_extract_writeback_proposal/i);
    expect(sql).toMatch(/if not public\.is_staff\(\) then/i);
    expect(sql).toMatch(/set status = 'rejected'/i);
    expect(sql).not.toMatch(/insert into public\.quotes/i);
  });

  it('includes commented ROLLBACK block with DROP TABLE', () => {
    expect(sql).toMatch(/-- ROLLBACK/);
    expect(sql).toMatch(/-- drop table if exists public\.extract_writeback_proposals/i);
  });
});
