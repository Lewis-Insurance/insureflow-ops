import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260822120000_collect_confirm_waiting_rpc.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

describe('get_my_collect_confirm_waiting migration', () => {
  it('uses the expected migration filename', () => {
    expect(migrationPath).toMatch(/20260822120000_collect_confirm_waiting_rpc\.sql$/);
  });

  it('defines a security definer function with pinned search_path', () => {
    expect(sql).toMatch(
      /create or replace function public\.get_my_collect_confirm_waiting\(p_limit integer default 6\)/i,
    );
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public/i);
    expect(sql).toMatch(/\bstable\b/i);
  });

  it('gates on is_staff and is_agency_member via the account workspace', () => {
    expect(sql).toMatch(/where public\.is_staff\(\)/i);
    expect(sql).toMatch(/public\.is_agency_member\(a\.agency_workspace_id\)/);
  });

  it('pins rows to the minting producer via token_id audit jsonb with packet creator fallback', () => {
    expect(sql).toMatch(/al\.new_value->>'token_id'/);
    expect(sql).toMatch(/al\.action = 'document_uploaded'/);
    expect(sql).toMatch(/public\.collection_access_tokens t/);
    expect(sql).toMatch(/cw\.created_by/);
    expect(sql).toMatch(/\) = auth\.uid\(\)/);
    expect(sql).toMatch(/public\.comparison_workspaces cw/);
  });

  it('filters to extracted portal uploads with pending proposals on live accounts', () => {
    expect(sql).toMatch(/cu\.upload_channel = 'portal'/);
    expect(sql).toMatch(/cu\.processing_status = 'extracted'/);
    expect(sql).toMatch(/p\.status = 'pending'/);
    expect(sql).toMatch(/a\.deleted_at is null/);
  });

  it('is read only and never applies a proposal', () => {
    expect(sql).not.toMatch(/apply_extract_writeback_proposal/);
    expect(sql).not.toMatch(/insert into/i);
    expect(sql).not.toMatch(/\bupdate public\./i);
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/alter table/i);
  });

  it('revokes anon and public and grants authenticated', () => {
    expect(sql).toMatch(
      /revoke all on function public\.get_my_collect_confirm_waiting\(integer\) from anon, public/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.get_my_collect_confirm_waiting\(integer\) to authenticated/i,
    );
  });

  it('includes a commented ROLLBACK block', () => {
    expect(sql).toMatch(/-- ROLLBACK/);
    expect(sql).toMatch(/-- drop function if exists public\.get_my_collect_confirm_waiting\(integer\)/i);
  });

  it('uses no em or en dashes', () => {
    expect(sql).not.toMatch(/[–—]/);
  });
});
