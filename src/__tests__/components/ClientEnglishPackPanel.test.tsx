import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientEnglishPackPanel } from '@/components/document-analysis/ClientEnglishPackPanel';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';

const stageSend = vi.fn();
const approveAndSend = vi.fn();
const discardStaged = vi.fn();
const renderPdf = vi.fn();
const hashSnapshot = vi.fn();
const queryState = vi.hoisted(() => ({
  data: { accountEmail: 'account@example.com', portalEmail: 'portal@example.com', firstName: 'Avery', agencyName: 'Lewis Insurance', agencyPhone: '555-0100' } as {
    accountEmail: string | null; portalEmail: string | null; firstName: string | null; agencyName: string; agencyPhone: string;
  },
  isLoading: false,
  error: null as Error | null,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => queryState,
}));
vi.mock('@/hooks/useClientEnglishPackSend', () => ({
  STALE_EXTRACT_MESSAGE: 'This extract changed after it was confirmed. Re-confirm before sending.',
  ClientEnglishPackDeliveryError: class ClientEnglishPackDeliveryError extends Error { outcome = 'unknown'; },
  useClientEnglishPackSend: () => ({ stageSend, approveAndSend, discardStaged, isStaging: false, isApproving: false }),
}));
vi.mock('@/hooks/useQuoteIncumbentComparison', () => ({
  useQuoteIncumbentComparison: () => ({ diffResult: null }),
}));
vi.mock('@/lib/clientEnglishPackPdf', () => ({ renderClientEnglishPackPdf: (...args: unknown[]) => renderPdf(...args) }));
vi.mock('@/lib/extractWritebackProposal', () => ({ hashExtractSnapshot: (...args: unknown[]) => hashSnapshot(...args) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

const snapshot: ExtractSnapshotV1 = {
  schema_version: 1,
  insured_name: 'Harbor Bakery LLC',
  carriers: ['Acme Insurance'],
  effective_date: '2026-01-01',
  expiration_date: '2027-01-01',
  claims_made: true,
  defense_inside_limits: false,
  premium: { total: 1200, frequency: 'annual' },
  fees: [],
  commission: null,
  coverages: [{ name: 'General liability', limit: '$1,000,000', deductible: '$1,000', premium: null, parent_coverage: null }],
  locations: [],
  vehicles: [],
  drivers: [],
  document_type: 'quote',
  policy_number: 'POL-100',
  key_details: ['Audit applies'],
};

describe('ClientEnglishPackPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashSnapshot.mockResolvedValue('confirmed-hash');
    renderPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
    stageSend.mockResolvedValue({ recipient: 'portal@example.com', subject: 'Your coverage summary from Lewis Insurance', body: 'Hi Avery, summary ready.', documentId: 'doc-1' });
    approveAndSend.mockResolvedValue({ recipient: 'portal@example.com', documentId: 'doc-1', portalDocumentId: 'portal-doc-1', sentAt: '2026-08-23T12:00:00.000Z' });
    discardStaged.mockResolvedValue(undefined);
    queryState.data = { accountEmail: 'account@example.com', portalEmail: 'portal@example.com', firstName: 'Avery', agencyName: 'Lewis Insurance', agencyPhone: '555-0100' };
    queryState.error = null;
  });

  it('previews locally with one primary action and no writes', async () => {
    render(<ClientEnglishPackPanel snapshot={snapshot} confirmedSnapshotHash="confirmed-hash" accountId="account-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview client summary' }));
    expect(await screen.findByTestId('client-english-pack-preview')).toHaveTextContent('Harbor Bakery LLC');
    expect(document.querySelectorAll('[data-primary]')).toHaveLength(1);
    expect(stageSend).not.toHaveBeenCalled();
    expect(approveAndSend).not.toHaveBeenCalled();
  });

  it('queues before presenting the exact approval review', async () => {
    render(<ClientEnglishPackPanel snapshot={snapshot} confirmedSnapshotHash="confirmed-hash" accountId="account-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview client summary' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Queue send to client' }));
    await waitFor(() => expect(stageSend).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Review before it goes out')).toBeInTheDocument();
    expect(screen.getByText('Preview only. Nothing is sent until you approve this exact email.')).toBeInTheDocument();
    expect(approveAndSend).not.toHaveBeenCalled();
  });

  it('refuses a stale extract and hides the send action', async () => {
    hashSnapshot.mockResolvedValue('changed-hash');
    render(<ClientEnglishPackPanel snapshot={snapshot} confirmedSnapshotHash="confirmed-hash" accountId="account-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview client summary' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This extract changed after it was confirmed. Re-confirm before sending.');
    expect(screen.queryByRole('button', { name: 'Queue send to client' })).not.toBeInTheDocument();
    expect(stageSend).not.toHaveBeenCalled();
  });

  it('hides Queue when neither portal nor account email exists', async () => {
    queryState.data = { ...queryState.data, portalEmail: null, accountEmail: null };
    render(<ClientEnglishPackPanel snapshot={snapshot} confirmedSnapshotHash="confirmed-hash" accountId="account-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview client summary' }));
    expect(await screen.findByTestId('client-english-pack-preview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Queue send to client' })).not.toBeInTheDocument();
  });

  it('approves only after the staged email is shown', async () => {
    render(<ClientEnglishPackPanel snapshot={snapshot} confirmedSnapshotHash="confirmed-hash" accountId="account-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview client summary' }));
    expect(approveAndSend).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Queue send to client' }));
    await screen.findByText('Review before it goes out');
    expect(approveAndSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send' }));
    await waitFor(() => expect(approveAndSend).toHaveBeenCalledTimes(1));
    expect(approveAndSend).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc-1' }));
  });

  it('discards a staged artifact when the drawer-hosted panel unmounts', async () => {
    const view = render(<ClientEnglishPackPanel snapshot={snapshot} confirmedSnapshotHash="confirmed-hash" accountId="account-1" embedded />);
    fireEvent.click(await screen.findByRole('button', { name: 'Queue send to client' }));
    await screen.findByText('Review before it goes out');
    view.unmount();
    await waitFor(() => expect(discardStaged).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc-1' })));
  });

  it('does not discard on cancel, close, or unmount while approval is in flight', async () => {
    approveAndSend.mockImplementation(() => new Promise(() => undefined));
    const view = render(<ClientEnglishPackPanel snapshot={snapshot} confirmedSnapshotHash="confirmed-hash" accountId="account-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview client summary' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Queue send to client' }));
    await screen.findByText('Review before it goes out');
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    view.unmount();
    expect(discardStaged).not.toHaveBeenCalled();
  });
});
