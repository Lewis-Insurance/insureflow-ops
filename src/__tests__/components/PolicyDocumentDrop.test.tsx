import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above the file, so the spies they close over
// have to be hoisted with them.
const { uploadCustomerDocumentMock, toastMock, permissions } = vi.hoisted(() => ({
  uploadCustomerDocumentMock: vi.fn(),
  toastMock: vi.fn(),
  permissions: { canManageDocuments: true },
}));

vi.mock('@/lib/documents/uploadCustomerDocument', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/documents/uploadCustomerDocument')
  >();
  return {
    ...actual,
    uploadCustomerDocument: (...args: unknown[]) => uploadCustomerDocumentMock(...args),
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canManageDocuments: permissions.canManageDocuments }),
}));

import { PolicyDocumentDrop } from '@/components/customers/PolicyDocumentDrop';

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const POLICY_ID = '22222222-2222-2222-2222-222222222222';

function renderControl(props: Partial<React.ComponentProps<typeof PolicyDocumentDrop>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PolicyDocumentDrop
        accountId={ACCOUNT_ID}
        policyId={POLICY_ID}
        policyLabel="AO-12345"
        {...props}
      />
    </QueryClientProvider>,
  );
}

function makeFile(name = 'dec-page.pdf') {
  return new File(['dec page'], name, { type: 'application/pdf' });
}

/** A drop event carrying one file, the way a browser delivers it. */
function fileDrop(files: File[]) {
  return {
    dataTransfer: {
      files,
      items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
      types: ['Files'],
    },
  };
}

describe('PolicyDocumentDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions.canManageDocuments = true;
    uploadCustomerDocumentMock.mockResolvedValue({ id: 'doc-1', policy_id: POLICY_ID });
  });

  it('uploads a dropped file against the policy it was dropped on', async () => {
    const onUploaded = vi.fn();
    renderControl({ onUploaded });

    const control = screen.getByRole('button');
    fireEvent.drop(control, fileDrop([makeFile()]));

    await waitFor(() => expect(uploadCustomerDocumentMock).toHaveBeenCalledTimes(1));
    expect(uploadCustomerDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: ACCOUNT_ID, policyId: POLICY_ID }),
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
  });

  it('uploads every file in a multi file drop', async () => {
    renderControl();

    fireEvent.drop(
      screen.getByRole('button'),
      fileDrop([makeFile('a.pdf'), makeFile('b.pdf'), makeFile('c.pdf')]),
    );

    await waitFor(() => expect(uploadCustomerDocumentMock).toHaveBeenCalledTimes(3));
  });

  it('opens the file picker when clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderControl();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');

    await user.click(screen.getByRole('button'));
    expect(click).toHaveBeenCalled();
  });

  it('ignores a drag that carries no files', () => {
    renderControl();

    const control = screen.getByRole('button');
    fireEvent.drop(control, { dataTransfer: { files: [], items: [], types: ['text/plain'] } });

    expect(uploadCustomerDocumentMock).not.toHaveBeenCalled();
  });

  it('keeps going and reports the file that failed when one upload breaks', async () => {
    uploadCustomerDocumentMock
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValueOnce({ id: 'doc-2', policy_id: POLICY_ID });

    renderControl();
    fireEvent.drop(screen.getByRole('button'), fileDrop([makeFile('bad.pdf'), makeFile('good.pdf')]));

    await waitFor(() => expect(uploadCustomerDocumentMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not add bad.pdf', variant: 'destructive' }),
      ),
    );
    // The one that worked still gets its success toast.
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Document added' }),
      ),
    );
  });

  it('renders nothing for a user who cannot manage documents', () => {
    permissions.canManageDocuments = false;
    const { container } = renderControl();

    expect(container).toBeEmptyDOMElement();
  });
});
