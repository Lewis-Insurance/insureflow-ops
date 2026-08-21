import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260821150000_apply_extract_writeback_proposal.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

describe('apply extract writeback proposal migration', () => {
  it('uses the expected migration filename', () => {
    expect(migrationPath).toMatch(/20260821150000_apply_extract_writeback_proposal\.sql$/);
  });

  it('adds quote_id column referencing quotes', () => {
    expect(sql).toMatch(/add column if not exists quote_id uuid references public\.quotes\(id\)/i);
    expect(sql).toMatch(/applied_at timestamptz/i);
    expect(sql).toMatch(/applied_by uuid references auth\.users\(id\)/i);
  });

  it('defines apply_extract_writeback_proposal RPC with is_staff guard', () => {
    expect(sql).toMatch(/create or replace function public\.apply_extract_writeback_proposal/i);
    expect(sql).toMatch(/if not public\.is_staff\(\) then/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path to 'public'/i);
  });

  it('is idempotent when status is applied and quote_id is set', () => {
    expect(sql).toMatch(
      /if v_proposal\.status = 'applied' and v_proposal\.quote_id is not null then/i,
    );
    expect(sql).toMatch(/return v_proposal\.quote_id/i);
  });

  it('requires pending status and locks proposal row for update', () => {
    expect(sql).toMatch(/for update of p/i);
    expect(sql).toMatch(/if v_proposal\.status <> 'pending' then/i);
    expect(sql).toMatch(/public\.is_agency_member\(v_proposal\.agency_workspace_id\)/i);
  });

  it('inserts personal quotes with competitor_carrier and quote_coverages', () => {
    expect(sql).toMatch(/if v_proposal\.line_class = 'personal' then/i);
    expect(sql).toMatch(/insert into public\.quotes/i);
    expect(sql).toMatch(/competitor_carrier/i);
    expect(sql).toMatch(/insert into public\.quote_coverages/i);
    expect(sql).toMatch(/quoted_at/i);
  });

  it('uses commercial add_submission_quote path with coverage limit mapping', () => {
    expect(sql).toMatch(/public\.add_submission_quote\(/i);
    expect(sql).toMatch(/commercial_submissions/i);
    expect(sql).toMatch(/when 'workers_comp' then 'wc'/i);
    expect(sql).toMatch(/when 'commercial_auto' then 'auto'/i);
    expect(sql).toMatch(/gl_each_occurrence/i);
    expect(sql).toMatch(/gl_general_aggregate/i);
    expect(sql).toMatch(/property_limit/i);
    expect(sql).toMatch(/wc_el_/i);
    expect(sql).toMatch(/umbrella_/i);
    expect(sql).toMatch(/auto_csl/i);
  });

  it('marks proposal applied, attaches document, and writes audit log in one function', () => {
    expect(sql).toMatch(/status = 'applied'/i);
    expect(sql).toMatch(/update public\.documents/i);
    expect(sql).toMatch(/insert into public\.audit_logs/i);
    expect(sql).toMatch(/'extract_writeback_applied'/i);
  });

  it('revokes anon/public and grants execute to authenticated', () => {
    expect(sql).toMatch(
      /revoke all on function public\.apply_extract_writeback_proposal\(uuid\) from anon, public/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.apply_extract_writeback_proposal\(uuid\) to authenticated/i,
    );
  });

  it('includes commented ROLLBACK block', () => {
    expect(sql).toMatch(/-- ROLLBACK/);
    expect(sql).toMatch(
      /-- drop function if exists public\.apply_extract_writeback_proposal\(uuid\)/i,
    );
  });
});
