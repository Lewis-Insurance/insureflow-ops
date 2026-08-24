import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STALE_EXTRACT_MESSAGE,
  useClientEnglishPackSend,
  type StageClientEnglishPackInput,
  type StagedClientEnglishPackSend,
} from '@/hooks/useClientEnglishPackSend';

const calls: string[] = [];
const invoke = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
const getUser = vi.fn();
const from = vi.fn();
const rpc = vi.fn();
const createClientSendApproval = vi.fn();
const loggerError = vi.fn();
const insertedRows = new Map<string, Record<string, unknown>>();
let documentInsertError: Error | null = null;
let documentLookup = {
  account_id: 'account-1', policy_id: 'policy-1', storage_bucket: 'portal-documents',
  storage_path: 'account-1/client-english-pack/abcdef012345-random.pdf', sha256: 'abcdef0123456789',
};
let portalDeleteError: Error | null = null;

vi.mock('@/lib/clientSendApproval', () => ({
  createClientSendApproval: (...args: unknown[]) => createClientSendApproval(...args),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: (...args: unknown[]) => loggerError(...args) } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => upload(...args),
        remove: (...args: unknown[]) => remove(...args),
      }),
    },
    auth: { getUser: (...args: unknown[]) => getUser(...args) },
  },
}));

function input(overrides: Partial<StageClientEnglishPackInput> = {}): StageClientEnglishPackInput {
  return {
    pdfBytes: new Uint8Array([37, 80, 68, 70]),
    currentSnapshotHash: 'snapshot-confirmed',
    confirmedSnapshotHash: 'snapshot-confirmed',
    accountId: 'account-1',
    policyId: 'policy-1',
    portalEmail: 'portal@example.invalid',
    accountEmail: 'account@example.invalid',
    recipientFirstName: 'Jamie',
    agencyName: 'Lewis Insurance',
    agencyPhone: '(386) 755-0050',
    portalUrl: 'https://example.invalid/portal',
    ...overrides,
  };
}

function staged(): StagedClientEnglishPackSend {
  return {
    accountId: 'account-1',
    policyId: 'policy-1',
    documentId: 'document-1',
    documentName: 'Client coverage summary.pdf',
    storagePath: 'account-1/client-english-pack/abcdef012345-random.pdf',
    pdfSha256: 'abcdef0123456789',
    snapshotHash: 'snapshot-confirmed',
    fileSizeBytes: 4,
    recipient: 'portal@example.invalid',
    subject: 'Your coverage summary from Lewis Insurance',
    body: 'Hi Jamie, your coverage summary is ready. Sign in to your portal to view it: https://example.invalid/portal. Questions? Call us at (386) 755-0050. Document reference: abcdef012345.',
  };
}

async function rejectionWithinAct(run: () => Promise<unknown>): Promise<unknown> {
  let failure: unknown;
  await act(async () => { try { await run(); } catch (error) { failure = error; } });
  return failure;
}

function insertBuilder(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    single: vi.fn(async () => {
      calls.push(`${table}:single`);
      if (table === 'documents') {
        return documentInsertError
          ? { data: null, error: documentInsertError }
          : { data: { id: 'document-1' }, error: null };
      }
      return { data: { id: 'portal-document-1' }, error: null };
    }),
  };
  return builder;
}

function deleteBuilder(table: string) {
  return {
    eq: vi.fn(async () => {
      calls.push(`${table}:delete`);
      return { error: table === 'portal_documents' ? portalDeleteError : null };
    }),
  };
}

function lookupBuilder() {
  const builder = {
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      calls.push('documents:lookup');
      return { data: documentLookup, error: null };
    }),
  };
  return builder;
}

beforeEach(() => {
  vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).buffer);
  calls.length = 0;
  insertedRows.clear();
  documentInsertError = null;
  documentLookup = {
    account_id: 'account-1', policy_id: 'policy-1', storage_bucket: 'portal-documents',
    storage_path: 'account-1/client-english-pack/abcdef012345-random.pdf', sha256: 'abcdef0123456789',
  };
  portalDeleteError = null;
  vi.clearAllMocks();
  upload.mockImplementation(async () => {
    calls.push('upload');
    return { error: null };
  });
  remove.mockImplementation(async () => {
    calls.push('object:remove');
    return { error: null };
  });
  createClientSendApproval.mockImplementation(async () => {
    calls.push('mint');
    return { approval_ref: 'sendapproval_pack_abcdefghijkl', approved_by_human_id: 'user-1' };
  });
  invoke.mockImplementation(async () => {
    calls.push('invoke');
    return { data: { success: true, delivery_outcome: 'sent' }, error: null };
  });
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  rpc.mockImplementation(async (name: string) => {
    if (name === 'finalize_client_english_pack_document') {
      calls.push('documents:finalize');
      return documentInsertError ? { data: null, error: documentInsertError } : { data: 'document-1', error: null };
    }
    if (name === 'verify_client_english_pack_document') {
      calls.push('documents:lookup');
      return { data: documentLookup.sha256 === 'abcdef0123456789', error: null };
    }
    if (name === 'publish_client_english_pack_document') {
      calls.push('portal_documents:publish'); return { data: 'portal-document-1', error: null };
    }
    if (name === 'unpublish_client_english_pack_document') {
      calls.push('portal_documents:delete');
      return portalDeleteError ? { data: false, error: portalDeleteError } : { data: true, error: null };
    }
    if (name === 'delete_client_english_pack_document') {
      calls.push('documents:delete'); return { data: true, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  from.mockImplementation((table: string) => ({
    select: vi.fn(() => lookupBuilder()),
    insert: vi.fn((row: Record<string, unknown>) => {
      calls.push(`${table}:insert`);
      insertedRows.set(table, row);
      if (table === 'communications') return Promise.resolve({ data: null, error: null });
      return insertBuilder(table);
    }),
    delete: vi.fn(() => deleteBuilder(table)),
  }));
});

describe('useClientEnglishPackSend', () => {
  it('stages the artifact without minting, publishing, or sending and prefers the portal email', async () => {
    const { result } = renderHook(() => useClientEnglishPackSend());
    let value: StagedClientEnglishPackSend | undefined;
    await act(async () => { value = await result.current.stageSend(input()); });

    expect(value?.recipient).toBe('portal@example.invalid');
    expect(value?.body).toMatch(/^Hi Jamie,.*Document reference: [a-f0-9]{12}\.$/);
    expect(calls).toEqual(['upload', 'documents:finalize']);
    expect(rpc).toHaveBeenCalledWith('finalize_client_english_pack_document', expect.objectContaining({
      p_account_id: 'account-1', p_policy_id: 'policy-1', p_size: 4,
    }));
    expect(createClientSendApproval).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalledWith('portal_documents');
  });

  it('falls back to account email and rejects a missing recipient before writing', async () => {
    const { result } = renderHook(() => useClientEnglishPackSend());
    let value: StagedClientEnglishPackSend | undefined;
    await act(async () => { value = await result.current.stageSend(input({ portalEmail: ' ' })); });
    expect(value?.recipient).toBe('account@example.invalid');

    calls.length = 0;
    expect(await rejectionWithinAct(() => result.current.stageSend(input({ portalEmail: null, accountEmail: null })))).toEqual(expect.objectContaining({ message: expect.stringContaining('A client email address is required') }));
    expect(calls).toEqual([]);
  });

  it('refuses a stale snapshot before any write', async () => {
    const { result } = renderHook(() => useClientEnglishPackSend());
    expect(await rejectionWithinAct(() => result.current.stageSend(input({ currentSnapshotHash: 'changed' })))).toEqual(expect.objectContaining({ message: STALE_EXTRACT_MESSAGE }));
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('removes the uploaded object when the documents row cannot be created', async () => {
    documentInsertError = new Error('documents insert failed');
    const { result } = renderHook(() => useClientEnglishPackSend());

    expect(await rejectionWithinAct(() => result.current.stageSend(input()))).toEqual(expect.objectContaining({ message: 'documents insert failed' }));
    expect(calls).toEqual(['upload', 'documents:finalize', 'object:remove']);
    expect(createClientSendApproval).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalledWith('portal_documents');
  });

  it('mints, publishes, then invokes with the exact approved payload and logs no content', async () => {
    const { result } = renderHook(() => useClientEnglishPackSend());
    await act(async () => { await result.current.approveAndSend(staged()); });

    expect(calls).toEqual([
      'documents:lookup',
      'mint',
      'portal_documents:publish',
      'invoke',
      'communications:insert',
    ]);
    const payload = { to: staged().recipient, subject: staged().subject, body: staged().body };
    expect(createClientSendApproval).toHaveBeenCalledWith('email-send', payload);
    expect(invoke).toHaveBeenCalledWith('email-send', {
      body: { ...payload, client_send_approval: expect.objectContaining({ approval_ref: expect.any(String) }) },
    });
    const communication = from.mock.results
      .filter((_, index) => from.mock.calls[index][0] === 'communications')[0];
    expect(communication).toBeDefined();
    const insertCall = communication.value.insert.mock.calls[0][0];
    expect(insertCall.body).toBeNull();
    expect(insertCall.meta).toEqual({
      pack_document_id: 'document-1',
      snapshot_hash: 'snapshot-confirmed',
    });
    expect(JSON.stringify(insertCall.meta)).not.toContain('Jamie');
    expect(JSON.stringify(insertCall.meta)).not.toContain('portal@example.invalid');
  });

  it.each(([
    { label: 'artifact', arrange: () => { documentLookup = { ...documentLookup, sha256: 'different' }; }, makeStaged: staged },
    { label: 'body digest', arrange: () => undefined, makeStaged: () => ({ ...staged(), body: staged().body.replace('abcdef012345', '999999999999') }) },
  ]) as Array<{ label: string; arrange: () => void; makeStaged: () => StagedClientEnglishPackSend }>)(
    'refuses staged $label tampering before mint or publish', async ({ arrange, makeStaged }) => {
      arrange();
      const { result } = renderHook(() => useClientEnglishPackSend());

      expect(await rejectionWithinAct(() => result.current.approveAndSend(makeStaged()))).toEqual(expect.objectContaining({ message: expect.stringMatching(/Queue it again/) }));
      expect(createClientSendApproval).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalledWith('portal_documents');
      expect(invoke).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('unpublishes and removes the staged artifact when sending fails', async () => {
    invoke.mockImplementation(async () => {
      calls.push('invoke');
      return { data: { success: false, delivery_outcome: 'not_sent', error: 'provider unavailable' }, error: null };
    });
    const { result } = renderHook(() => useClientEnglishPackSend());

    expect(await rejectionWithinAct(() => result.current.approveAndSend(staged()))).toEqual(expect.objectContaining({ message: 'provider unavailable' }));
    expect(calls).toEqual([
      'documents:lookup',
      'mint',
      'portal_documents:publish',
      'invoke',
      'portal_documents:delete',
      'documents:delete',
      'object:remove',
    ]);
  });

  it('preserves the underlying artifact when compensating unpublish fails', async () => {
    portalDeleteError = new Error('unpublish denied');
    invoke.mockImplementation(async () => {
      calls.push('invoke');
      return { data: { success: false, delivery_outcome: 'not_sent', error: 'provider unavailable' }, error: null };
    });
    const { result } = renderHook(() => useClientEnglishPackSend());

    expect(await rejectionWithinAct(() => result.current.approveAndSend(staged()))).toEqual(expect.objectContaining({ message: 'Client summary unpublish failed: unpublish denied' }));
    expect(calls).toEqual([
      'documents:lookup', 'mint', 'portal_documents:publish',
      'invoke', 'portal_documents:delete',
    ]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the published artifact and returns sent when post-send audit lookup fails', async () => {
    getUser.mockRejectedValue(new Error('auth unavailable'));
    const { result } = renderHook(() => useClientEnglishPackSend());
    let sent;
    await act(async () => { sent = await result.current.approveAndSend(staged()); });

    expect(sent).toMatchObject({ documentId: 'document-1', portalDocumentId: 'portal-document-1' });
    expect(calls).toEqual([
      'documents:lookup', 'mint', 'portal_documents:publish', 'invoke',
    ]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('reports a resolved audit error without retracting a sent artifact', async () => {
    from.mockImplementation((table: string) => ({
      insert: vi.fn(async () => table === 'communications'
        ? { data: null, error: new Error('audit unavailable') }
        : { data: null, error: null }),
    }));
    const { result } = renderHook(() => useClientEnglishPackSend());
    let sent;
    await act(async () => { sent = await result.current.approveAndSend(staged()); });

    expect(sent).toMatchObject({ portalDocumentId: 'portal-document-1' });
    expect(loggerError).toHaveBeenCalledWith('Client English Pack audit log failed', expect.any(Error));
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the published artifact when provider outcome is ambiguous', async () => {
    invoke.mockImplementation(async () => {
      calls.push('invoke');
      return { data: { success: false, delivery_outcome: 'unknown' }, error: null };
    });
    const { result } = renderHook(() => useClientEnglishPackSend());
    expect(await rejectionWithinAct(() => result.current.approveAndSend(staged()))).toEqual(expect.objectContaining({ message: expect.stringContaining('remains published') }));
    expect(calls).toEqual(['documents:lookup', 'mint', 'portal_documents:publish', 'invoke']);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([403, 500])('compensates an HTTP Functions error with status %s', async (status) => {
    const functionsError = Object.assign(new Error('function failed'), { context: { status } });
    invoke.mockImplementation(async () => { calls.push('invoke'); return { data: null, error: functionsError }; });
    const { result } = renderHook(() => useClientEnglishPackSend());

    const failure = await rejectionWithinAct(() => result.current.approveAndSend(staged()));
    expect(failure).toEqual(expect.objectContaining({ outcome: 'not_sent' }));
    expect(calls).toEqual([
      'documents:lookup', 'mint', 'portal_documents:publish', 'invoke',
      'portal_documents:delete', 'documents:delete', 'object:remove',
    ]);
  });

  it('preserves publication for a transport error without an HTTP response context', async () => {
    invoke.mockImplementation(async () => { calls.push('invoke'); return { data: null, error: new Error('network lost') }; });
    const { result } = renderHook(() => useClientEnglishPackSend());

    const failure = await rejectionWithinAct(() => result.current.approveAndSend(staged()));
    expect(failure).toEqual(expect.objectContaining({ outcome: 'unknown' }));
    expect(calls).toEqual(['documents:lookup', 'mint', 'portal_documents:publish', 'invoke']);
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes a staged artifact when the producer cancels review', async () => {
    const { result } = renderHook(() => useClientEnglishPackSend());
    await act(async () => { await result.current.discardStaged(staged()); });
    expect(calls).toEqual(['documents:delete', 'object:remove']);
  });
});
