import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'supabase/functions/portal-send-invitation/index.ts'),
  'utf8',
);

describe('portal-send-invitation source invariants', () => {
  it('validates cluster scope before the first portal write', () => {
    expect(source.indexOf("userClient.rpc('list_portal_invite_cluster'")).toBeGreaterThan(-1);
    expect(source.indexOf("userClient.rpc('list_portal_invite_cluster'")).toBeLessThan(
      source.indexOf("from('client_portal_users').insert"),
    );
    expect(source.indexOf('if (!allowedIds.has(body.account_id))')).toBeLessThan(
      source.indexOf("from('client_portal_users').insert"),
    );
    expect(source).not.toContain('allowedIds.add(body.account_id)');
  });

  it('looks up the normalized email globally and never upserts a portal identity', () => {
    expect(source).toContain("const escapedEmailPattern = normalizedEmail.replace(/[\\\\%_]/g, '\\\\$&')");
    expect(source).toContain(".from('client_portal_users')\n      .select('id, account_id, email, portal_status')\n      .ilike('email', escapedEmailPattern)");
    expect(source).not.toMatch(/from\('client_portal_users'\)\.upsert/);
    expect(source).not.toContain("onConflict: 'account_id,email'");
  });

  it('defaults an omitted account_ids list to the invite-from account', () => {
    expect(source).toContain('account_ids?: string[]');
    expect(source).toContain(
      'body.account_ids === undefined ? [body.account_id] : body.account_ids',
    );
  });

  it('contains only one identity insert, invitation insert, and magic-link call', () => {
    expect(source.match(/from\('client_portal_users'\)\.insert/g)).toHaveLength(1);
    expect(source.match(/from\('portal_invitations'\)\.insert/g)).toHaveLength(1);
    expect(source.match(/auth\.admin\.generateLink/g)).toHaveLength(1);
  });

  it('has one magic-link generation call after the active-user return', () => {
    expect(source.match(/auth\.admin\.generateLink/g)).toHaveLength(1);
    expect(source.indexOf("decision === 'expand_active'")).toBeLessThan(
      source.indexOf('auth.admin.generateLink'),
    );
  });

  it('rejects disabled logins before any scope expansion', () => {
    expect(source.indexOf("decision === 'reject_disabled'")).toBeLessThan(
      source.indexOf("userClient.rpc('add_portal_user_account'"),
    );
  });

  it('rejects foreign account scope before identity, junction, or invitation writes', () => {
    const rejection = source.indexOf("decision === 'reject_foreign'");
    expect(rejection).toBeGreaterThan(-1);
    expect(rejection).toBeLessThan(source.indexOf("from('client_portal_users').insert"));
    expect(rejection).toBeLessThan(source.indexOf("userClient.rpc('add_portal_user_account'"));
    expect(rejection).toBeLessThan(source.indexOf("from('portal_invitations').insert"));
  });

  it('rejects non-object JSON bodies before reading request fields', () => {
    expect(source.indexOf("typeof parsedBody !== 'object'")).toBeLessThan(
      source.indexOf('const body = parsedBody as InvitationRequest'),
    );
  });

  it('preflights invitation ambiguity before identity and scope writes', () => {
    const preflight = source.indexOf(
      ".from('portal_invitations')\n      .select('id, account_id, email, portal_user_id, scope_account_ids, status')",
    );
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(source.indexOf("from('client_portal_users').insert"));
    expect(preflight).toBeLessThan(source.indexOf("userClient.rpc('add_portal_user_account'"));
  });

  it('looks up invitations by email globally rather than by home', () => {
    expect(source).toContain(
      ".from('portal_invitations')\n      .select('id, account_id, email, portal_user_id, scope_account_ids, status')\n      .ilike('email', escapedEmailPattern)",
    );
    expect(source).not.toContain('invitationHomeId');
  });

  it('fails when the final invitation status cannot be persisted', () => {
    expect(source).toContain('const { error: statusUpdateError }');
    expect(source).toContain("if (statusUpdateError) return json({ error: 'Failed to persist invitation delivery status' }");
  });
});
