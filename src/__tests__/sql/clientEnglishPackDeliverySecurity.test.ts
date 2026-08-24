import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sql = readFileSync(resolve(root, 'supabase/migrations/20260824090000_client_english_pack_delivery_security.sql'), 'utf8');

describe('Client English Pack delivery security migration', () => {
  it('keeps every RPC staff and workspace scoped with a fixed search path', () => {
    expect(sql.match(/security definer set search_path = public, pg_temp/g)).toHaveLength(6);
    expect(sql.match(/is_staff\(\)/g)?.length).toBeGreaterThanOrEqual(6);
    expect(sql.match(/agency_workspace_memberships/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('revokes public and anon, grants only authenticated, and creates no bucket', () => {
    expect(sql.match(/from public;/g)).toHaveLength(6);
    expect(sql.match(/from anon;/g)).toHaveLength(6);
    expect(sql.match(/to authenticated;/g)).toHaveLength(6);
    expect(sql).not.toMatch(/insert\s+into\s+storage\.buckets/i);
  });

  it('scopes storage writes and makes portal publication idempotent', () => {
    expect(sql).toContain("bucket_id='portal-documents'");
    expect(sql).toContain('/client-english-pack/');
    expect(sql).toContain("a.id=split_part(name,'/',1)::uuid");
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('if v_id is not null then return v_id');
  });
});
