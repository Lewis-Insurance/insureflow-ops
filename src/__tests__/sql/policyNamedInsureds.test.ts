import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260827200000_policy_named_insureds.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

describe('policy Named Insured schema migration', () => {
  it('creates the junction with uniqueness and owner exclusion', () => {
    const tableDefinition = sql.match(
      /create table public\.policy_named_insureds \([\s\S]*?\n\);/i,
    )?.[0] ?? '';
    expect(sql).toMatch(/create table public\.policy_named_insureds/i);
    expect(sql).toMatch(/policy_id uuid not null references public\.policies\(id\) on delete cascade/i);
    expect(sql).toMatch(/account_id uuid not null references public\.accounts\(id\) on delete cascade/i);
    expect(sql).toMatch(/unique \(policy_id, account_id\)/i);
    expect(sql).toMatch(/before insert or update on public\.policy_named_insureds/i);
    expect(sql).toMatch(/new\.account_id = v_owner_account_id/i);
    expect(tableDefinition).not.toMatch(
      /\brel_type\b|\badditional_insured_id\b|premium\s+numeric[\s,]/i,
    );
  });

  it('creates account and policy lookup indexes', () => {
    expect(sql).toMatch(/idx_policy_named_insureds_account_id[\s\S]*\(account_id\)/i);
    expect(sql).toMatch(/idx_policy_named_insureds_policy_id[\s\S]*\(policy_id\)/i);
  });

  it('enables RLS with staff membership and write-role gates', () => {
    expect(sql).toMatch(/alter table public\.policy_named_insureds enable row level security/i);
    expect(sql).toMatch(/public\.is_staff\(\)/i);
    expect(sql).toMatch(/awm\.role in \('owner', 'admin', 'producer', 'csr'\)/i);
    expect(sql).toMatch(/revoke all on public\.policy_named_insureds from anon/i);
    expect(sql).not.toMatch(/create policy[\s\S]*for update[\s\S]*policy_named_insureds/i);
  });

  it('defines and hardens all four RPCs', () => {
    for (const signature of [
      'list_account_policies\\(p_account_id uuid\\)',
      'list_policy_named_insureds\\(p_policy_id uuid\\)',
      'add_policy_named_insured\\(\\s*p_policy_id uuid,\\s*p_account_id uuid\\s*\\)',
      'remove_policy_named_insured\\(\\s*p_policy_id uuid,\\s*p_account_id uuid\\s*\\)',
    ]) {
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${signature}`, 'i'));
    }
    expect(sql.match(/security definer/gi)).toHaveLength(4);
    expect(sql.match(/set search_path = public/gi)).toHaveLength(5);
    expect(sql.match(/revoke all on function public\./gi)).toHaveLength(4);
    expect(sql.match(/grant execute on function public\./gi)).toHaveLength(4);
    expect(sql).toMatch(/to authenticated, service_role/i);
    expect(sql).not.toMatch(/grant execute on function public\.(?:add|remove)_policy_named_insured[^;]+to public|grant execute on function public\.(?:add|remove)_policy_named_insured[^;]+to anon/is);
  });

  it('makes add fail closed for invalid policy, account, owner, workspace, and duplicate', () => {
    expect(sql).toMatch(/p\.deleted_at is null/i);
    expect(sql).toMatch(/owner_account\.deleted_at is null/i);
    expect(sql).toMatch(/a\.deleted_at is null/i);
    expect(sql).toMatch(/if v_owner_account_id is null then[\s\S]*raise exception 'Active policy and owner account required'/i);
    expect(sql).toMatch(/if v_linked_workspace_id is null then[\s\S]*raise exception 'Active linked account required'/i);
    expect(sql).toMatch(/if p_account_id = v_owner_account_id then/i);
    expect(sql).toMatch(/if v_linked_workspace_id <> v_owner_workspace_id then/i);
    expect(sql).toMatch(/if exists \([\s\S]*from public\.policy_named_insureds pni[\s\S]*already linked/is);
    expect(sql).toMatch(/values \(p_policy_id, p_account_id, auth\.uid\(\)\)/i);
  });

  it('removes only the junction row and remains idempotent', () => {
    const removeBody = sql.match(/create or replace function public\.remove_policy_named_insured[\s\S]*?\n\$\$;/i)?.[0] ?? '';
    expect(removeBody).toMatch(/delete from public\.policy_named_insureds/i);
    expect(removeBody).toMatch(/get diagnostics v_deleted_count = row_count/i);
    expect(removeBody).not.toMatch(/delete from public\.account_relationships|update public\.account_relationships/i);
  });

  it('lists owned and shared active policies once', () => {
    const listBody = sql.match(/create or replace function public\.list_account_policies[\s\S]*?\n\$\$;/i)?.[0] ?? '';
    expect(listBody).toMatch(/'owner'::text as membership/i);
    expect(listBody).toMatch(/'named_insured'::text as membership/i);
    expect(listBody).toMatch(/union all/i);
    expect(listBody.match(/p\.deleted_at is null/gi)).toHaveLength(2);
    expect(listBody).toMatch(/where p\.account_id = p_account_id/i);
    expect(listBody).toMatch(/where pni\.account_id = p_account_id/i);
  });

  it('adds linked-account membership as an OR to policies SELECT', () => {
    expect(sql).toMatch(/drop policy if exists "Users can view policies for their workspace accounts"/i);
    expect(sql).toMatch(/where a\.id = policies\.account_id[\s\S]*\bor exists \([\s\S]*pni\.policy_id = policies\.id/is);
  });

  it('does not alter cluster, CRM, COI, or Canopy models', () => {
    expect(sql).not.toMatch(/get_account_cluster/i);
    expect(sql).not.toMatch(/(?:insert into|update|delete from|alter table) public\.account_relationships/i);
    expect(sql).not.toMatch(/(?:insert into|update|delete from|alter table) public\.additional_insureds/i);
    expect(sql).not.toMatch(/(?:insert into|update|delete from|alter table) public\.canopy_named_insureds/i);
  });
});
