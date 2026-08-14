import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260814180000_security_audit_rpc_hardening.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

describe('security audit RPC hardening migration', () => {
  it('uses the expected migration filename', () => {
    expect(migrationPath).toMatch(/20260814180000_security_audit_rpc_hardening\.sql$/);
  });

  it('hardens rollback_import_batch with staff and workspace membership guards', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.rollback_import_batch\(p_batch_id UUID\)/);
    expect(sql).toMatch(/IF NOT public\.is_staff\(\) THEN/);
    expect(sql).toMatch(/RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501'/);
    expect(sql).toMatch(/SELECT EXISTS \(\s*SELECT 1 FROM import_batches WHERE id = p_batch_id/s);
    expect(sql).toMatch(
      /SELECT DISTINCT agency_workspace_id[\s\S]*FROM accounts[\s\S]*WHERE import_batch_id = p_batch_id[\s\S]*AND deleted_at IS NULL/s,
    );
    expect(sql).toMatch(
      /IF v_workspace_id IS NOT NULL AND NOT public\.is_agency_member\(v_workspace_id\) THEN/,
    );
    expect(sql).toMatch(/imported_by = auth\.uid\(\)/);
    expect(sql).toMatch(/SET status = 'rolled_back'/);
  });

  it('hardens enqueue_outbox_event with agency membership guard and service_role-only execute', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION enqueue_outbox_event\(/);
    expect(sql).toMatch(
      /IF auth\.role\(\) IS DISTINCT FROM 'service_role'[\s\S]*AND NOT public\.is_agency_member\(p_workspace_id\) THEN/s,
    );
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION enqueue_outbox_event\(UUID, TEXT, TEXT, UUID, JSONB, TEXT\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION enqueue_outbox_event\(UUID, TEXT, TEXT, UUID, JSONB, TEXT\) TO service_role/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION enqueue_outbox_event\(UUID, TEXT, TEXT, UUID, JSONB, TEXT\) TO authenticated/,
    );
  });

  it('hardens cancel_outbox_events to reject NULL workspace for non-service_role', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION cancel_outbox_events\(/);
    expect(sql).toMatch(
      /IF p_workspace_id IS NULL AND auth\.role\(\) IS DISTINCT FROM 'service_role' THEN/,
    );
    expect(sql).toMatch(
      /IF p_workspace_id IS NOT NULL AND auth\.role\(\) IS DISTINCT FROM 'service_role' THEN/,
    );
    expect(sql).toMatch(/IF NOT public\.is_staff\(\) OR NOT public\.is_agency_admin\(p_workspace_id\) THEN/);
    expect(sql).toMatch(/status IN \('pending', 'failed'\)/);
  });

  it('revokes PUBLIC and anon execute on hardened functions', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.rollback_import_batch\(UUID\) FROM PUBLIC, anon/,
    );
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION cancel_outbox_events\(UUID, TEXT, TEXT\) FROM PUBLIC, anon/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.rollback_import_batch\(UUID\) TO authenticated, service_role/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION cancel_outbox_events\(UUID, TEXT, TEXT\) TO authenticated, service_role/,
    );
  });
});
