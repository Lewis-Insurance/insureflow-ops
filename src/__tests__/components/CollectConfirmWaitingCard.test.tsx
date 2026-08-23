import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const navigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/hooks/useMyCollectConfirmWaiting', () => ({
  useMyCollectConfirmWaiting: vi.fn(),
}));

import {
  CollectConfirmWaitingCard,
  truncateFilename,
} from '@/components/dashboard/CollectConfirmWaitingCard';
import {
  useMyCollectConfirmWaiting,
  type CollectConfirmWaitingRow,
} from '@/hooks/useMyCollectConfirmWaiting';

const LONG_FILENAME = 'a-very-long-client-named-declarations-page-for-the-2026-term.pdf';

function row(overrides: Partial<CollectConfirmWaitingRow> = {}): CollectConfirmWaitingRow {
  return {
    analysis_id: 'analysis-1',
    account_id: 'acct-1',
    account_name: 'Acme Manufacturing LLC',
    upload_id: 'upload-1',
    filename: 'dec-page.pdf',
    uploaded_at: '2026-08-22T14:05:00Z',
    pending_count: 1,
    line_class: 'commercial',
    ...overrides,
  };
}

function mockHook(
  rows: CollectConfirmWaitingRow[],
  extra: Partial<ReturnType<typeof useMyCollectConfirmWaiting>> = {},
) {
  vi.mocked(useMyCollectConfirmWaiting).mockReturnValue({
    rows,
    limit: 6,
    loading: false,
    error: null,
    refetch: vi.fn(),
    ...extra,
  } as ReturnType<typeof useMyCollectConfirmWaiting>);
}

function renderCard(onHasRows?: (v: boolean) => void) {
  return render(
    <MemoryRouter>
      <CollectConfirmWaitingCard onHasRows={onHasRows} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CollectConfirmWaitingCard', () => {
  it('renders nothing when there are no rows and reports hasRows false', () => {
    const onHasRows = vi.fn();
    mockHook([]);
    const { container } = renderCard(onHasRows);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('Portal came back')).not.toBeInTheDocument();
    expect(onHasRows).toHaveBeenCalledWith(false);
  });

  it('renders nothing while loading', () => {
    mockHook([], { loading: true });
    const { container } = renderCard();
    expect(container.firstChild).toBeNull();
  });

  it('renders rows with account, file, pill, and one lime primary on the newest row', () => {
    const onHasRows = vi.fn();
    mockHook([
      row(),
      row({
        analysis_id: 'analysis-2',
        upload_id: 'upload-2',
        account_name: 'Bob Jones',
        filename: 'auto-dec.pdf',
        uploaded_at: '2026-08-21T09:00:00Z',
        pending_count: 3,
      }),
    ]);
    const { container } = renderCard(onHasRows);

    expect(screen.getByText('Portal came back')).toBeInTheDocument();
    expect(screen.getByText('Acme Manufacturing LLC')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getAllByText('Confirm waiting')).toHaveLength(2);
    expect(screen.getByText('3 carriers to review')).toBeInTheDocument();
    expect(onHasRows).toHaveBeenCalledWith(true);

    const primaries = container.querySelectorAll('[data-primary]');
    expect(primaries).toHaveLength(1);
    expect(primaries[0].textContent).toContain('Confirm write-back');
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });

  it('navigates to the analysis page on tap', () => {
    mockHook([row(), row({ analysis_id: 'analysis-2', upload_id: 'upload-2' })]);
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /Confirm write-back/ }));
    expect(navigate).toHaveBeenCalledWith('/analyze-documents/analysis-1');

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(navigate).toHaveBeenCalledWith('/analyze-documents/analysis-2');
  });

  it('does not render em or en dashes', () => {
    mockHook([row({ filename: LONG_FILENAME, pending_count: 2 })]);
    const { container } = renderCard();
    expect(container.textContent).not.toMatch(/[–—]/);
  });

  it('truncates long filenames at 40 characters', () => {
    mockHook([row({ filename: LONG_FILENAME })]);
    renderCard();

    expect(screen.queryByText(new RegExp(LONG_FILENAME))).not.toBeInTheDocument();
    expect(truncateFilename(LONG_FILENAME)).toHaveLength(40);
    expect(truncateFilename('short.pdf')).toBe('short.pdf');
    expect(screen.getByText(new RegExp(truncateFilename(LONG_FILENAME).slice(0, 39)))).toBeInTheDocument();
  });

  it('shows View all only when rows reach the limit', () => {
    mockHook(Array.from({ length: 6 }, (_, i) => row({ analysis_id: `a-${i}`, upload_id: `u-${i}` })));
    renderCard();
    expect(screen.getByText('View all')).toBeInTheDocument();

    fireEvent.click(screen.getByText('View all'));
    expect(navigate).toHaveBeenCalledWith('/analyze-documents');
  });

  it('hides View all below the limit', () => {
    mockHook([row()]);
    renderCard();
    expect(screen.queryByText('View all')).not.toBeInTheDocument();
  });

  it('renders an inline error with Retry and no lime', () => {
    const refetch = vi.fn();
    mockHook([], { error: new Error('permission denied'), refetch });
    const { container } = renderCard();

    expect(screen.getByText(/Could not load portal uploads\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
    expect(container.querySelectorAll('[data-primary]')).toHaveLength(0);
  });
});
