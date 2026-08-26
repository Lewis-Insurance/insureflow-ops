// ============================================
// Shared customer document upload helper
// One upload path for the Upload Document modal and the policy card
// drag/click control, so both write the same documents row.
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadMock = vi.fn();
const removeMock = vi.fn();
const insertMock = vi.fn();
const getUserMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => uploadMock(...args),
        remove: (...args: unknown[]) => removeMock(...args),
      }),
    },
    from: () => ({ insert: (...args: unknown[]) => insertMock(...args) }),
  },
}));

import {
  CustomerDocumentUploadError,
  uploadCustomerDocument,
} from '@/lib/documents/uploadCustomerDocument';

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const POLICY_ID = '22222222-2222-2222-2222-222222222222';

function makeFile(name = 'dec-page.pdf', type = 'application/pdf') {
  return new File(['dec page contents'], name, { type });
}

/** insert(...).select().single() resolves to { data, error }. */
function mockInsertResult(result: { data: unknown; error: unknown }) {
  insertMock.mockReturnValue({
    select: () => ({ single: () => Promise.resolve(result) }),
  });
}

describe('uploadCustomerDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    uploadMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
    mockInsertResult({ data: { id: 'doc-1', policy_id: POLICY_ID }, error: null });
  });

  it('writes policy_id when a policy is supplied, which is what carries the Policy # chip', async () => {
    await uploadCustomerDocument({ file: makeFile(), accountId: ACCOUNT_ID, policyId: POLICY_ID });

    const row = insertMock.mock.calls[0][0];
    expect(row.policy_id).toBe(POLICY_ID);
    expect(row.account_id).toBe(ACCOUNT_ID);
    expect(row.uploaded_by).toBe('user-1');
  });

  it('omits policy_id for an account level document', async () => {
    await uploadCustomerDocument({ file: makeFile(), accountId: ACCOUNT_ID });

    expect(insertMock.mock.calls[0][0]).not.toHaveProperty('policy_id');
  });

  it('keeps storage_path and file_path in sync so downstream readers can open the file', async () => {
    await uploadCustomerDocument({ file: makeFile(), accountId: ACCOUNT_ID });

    const row = insertMock.mock.calls[0][0];
    expect(row.storage_path).toBe(row.file_path);
    expect(row.storage_bucket).toBe('documents');
    expect(row.file_missing).toBe(false);
    expect(row.storage_path.startsWith(`${ACCOUNT_ID}/`)).toBe(true);
    expect(row.storage_path.endsWith('.pdf')).toBe(true);
  });

  it('does not turn a name into an extension when the file has none', async () => {
    await uploadCustomerDocument({ file: makeFile('scan', ''), accountId: ACCOUNT_ID });

    const row = insertMock.mock.calls[0][0];
    expect(row.storage_path).not.toContain('.scan');
    expect(row.filename).toBe('scan');
  });

  it('falls back to the file name when no display name is given', async () => {
    await uploadCustomerDocument({ file: makeFile(), accountId: ACCOUNT_ID, name: '   ' });

    expect(insertMock.mock.calls[0][0].name).toBe('dec-page.pdf');
  });

  it('reports the auth stage and never touches storage when signed out', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    await expect(
      uploadCustomerDocument({ file: makeFile(), accountId: ACCOUNT_ID }),
    ).rejects.toMatchObject({ stage: 'auth' });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('reports the storage stage and does not insert a row when the upload fails', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'bucket unavailable' } });

    await expect(
      uploadCustomerDocument({ file: makeFile(), accountId: ACCOUNT_ID }),
    ).rejects.toBeInstanceOf(CustomerDocumentUploadError);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('removes the orphan object when the row insert fails', async () => {
    mockInsertResult({ data: null, error: { message: 'row level security' } });

    await expect(
      uploadCustomerDocument({ file: makeFile(), accountId: ACCOUNT_ID }),
    ).rejects.toMatchObject({ stage: 'database' });
    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
