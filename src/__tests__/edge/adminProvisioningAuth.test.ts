import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const clientContextApiPath = resolve(
  import.meta.dirname,
  '../../../supabase/functions/client-context-api/index.ts',
);
const clientContextApiSource = readFileSync(clientContextApiPath, 'utf8');

const adminUpdatePasswordPath = resolve(
  import.meta.dirname,
  '../../../supabase/functions/admin-update-password/index.ts',
);
const adminApprovalsPath = resolve(
  import.meta.dirname,
  '../../../supabase/functions/admin-approvals/index.ts',
);

const adminUpdatePasswordSource = readFileSync(adminUpdatePasswordPath, 'utf8');
const adminApprovalsSource = readFileSync(adminApprovalsPath, 'utf8');

describe('client-context-api verifyAccountAccess', () => {
  it('requires active agency workspace membership, not existence-only', () => {
    expect(clientContextApiSource).toMatch(
      /\.select\('id, agency_workspace_id'\)/,
    );
    expect(clientContextApiSource).toMatch(/\.is\('deleted_at', null\)/);
    expect(clientContextApiSource).toMatch(
      /\.from\('agency_workspace_memberships'\)/,
    );
    expect(clientContextApiSource).toMatch(/\.eq\('status', 'active'\)/);
    expect(clientContextApiSource).not.toMatch(/return true;\s*\/\/.*allow access if account exists/s);
    expect(clientContextApiSource).not.toMatch(/For now, allow access if account exists/);
  });
});

describe('admin edge functions use requireActiveProvisionedAdmin', () => {
  it('admin-update-password imports and calls requireActiveProvisionedAdmin', () => {
    expect(adminUpdatePasswordSource).toMatch(
      /import\s*\{[^}]*requireActiveProvisionedAdmin[^}]*\}\s*from\s*['"]\.\.\/_shared\/admin-provisioning\.ts['"]/,
    );
    expect(adminUpdatePasswordSource).toMatch(
      /await requireActiveProvisionedAdmin\(supabaseAdmin, authenticatedUser\.id\)/,
    );
    expect(adminUpdatePasswordSource).toMatch(
      /Forbidden - Active provisioned admin access required/,
    );
    expect(adminUpdatePasswordSource).not.toMatch(/profile\?\.role !== 'admin'/);
  });

  it('admin-approvals imports and calls requireActiveProvisionedAdmin', () => {
    expect(adminApprovalsSource).toMatch(
      /import\s*\{[^}]*requireActiveProvisionedAdmin[^}]*\}\s*from\s*['"]\.\.\/_shared\/admin-provisioning\.ts['"]/,
    );
    expect(adminApprovalsSource).toMatch(
      /await requireActiveProvisionedAdmin\(supabaseClient, authenticatedUser\.id\)/,
    );
    expect(adminApprovalsSource).toMatch(
      /Forbidden - Active provisioned admin access required/,
    );
    expect(adminApprovalsSource).not.toMatch(/profile\.role !== 'admin'/);
  });
});
