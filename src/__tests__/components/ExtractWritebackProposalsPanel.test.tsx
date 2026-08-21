import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';

const useExtractWritebackProposals = vi.fn();

vi.mock('@/hooks/useExtractWritebackProposals', () => ({
  useExtractWritebackProposals: (...args: unknown[]) => useExtractWritebackProposals(...args),
}));

import { ExtractWritebackProposalsPanel } from '@/components/document-analysis/ExtractWritebackProposalsPanel';

const SNAPSHOT: ExtractSnapshotV1 = {
  schema_version: 1,
  insured_name: 'Acme Manufacturing LLC',
  carriers: ['Hartford'],
  effective_date: '2026-03-01',
  expiration_date: '2027-03-01',
  claims_made: null,
  defense_inside_limits: null,
  premium: { total: 48250, frequency: 'annual' },
  fees: [],
  commission: null,
  coverages: [],
  locations: [],
  vehicles: [],
  drivers: [],
  document_type: 'commercial_quote',
  policy_number: 'COM-2026-0042',
  key_details: [],
};

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderPanel() {
  return render(
    <ExtractWritebackProposalsPanel
      analysisId="analysis-1"
      accountId="acct-1"
      snapshot={SNAPSHOT}
      lineCategory="commercial"
    />,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  useExtractWritebackProposals.mockReset();
  useExtractWritebackProposals.mockReturnValue({
    proposals: [],
    proposalsLoading: false,
    proposalsError: null,
    ensuring: false,
    rejecting: false,
    ensureProposals: vi.fn(),
    rejectProposal: vi.fn(),
  });
});

describe('ExtractWritebackProposalsPanel ensure→refetch visibility', () => {
  it('stays visible with skeletons while proposals refetch after ensure completes', () => {
    useExtractWritebackProposals.mockReturnValue({
      proposals: [],
      proposalsLoading: false,
      proposalsError: null,
      ensuring: true,
      rejecting: false,
      ensureProposals: vi.fn(),
      rejectProposal: vi.fn(),
    });

    const { container } = renderPanel();

    expect(screen.getByTestId('writeback-proposals-panel')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(12);
  });

  it('stays visible with skeletons while ensure is in flight', () => {
    useExtractWritebackProposals.mockReturnValue({
      proposals: [],
      proposalsLoading: false,
      proposalsError: null,
      ensuring: true,
      rejecting: false,
      ensureProposals: vi.fn(),
      rejectProposal: vi.fn(),
    });

    const { container } = renderPanel();

    expect(screen.getByTestId('writeback-proposals-panel')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(12);
  });
});
