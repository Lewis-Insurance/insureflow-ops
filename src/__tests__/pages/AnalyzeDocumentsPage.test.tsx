// Runtime render check for AnalyzeDocumentsPage reload-by-analysisId (Phase 0c).
//
// useDocumentAnalysisQuery is mocked so the page renders against synthetic fixture
// data without Supabase. AppLayout is stubbed to a passthrough. MemoryRouter
// supplies the /analyze-documents/:analysisId route param.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/document-analysis/StorageDiagnostics', () => ({
  StorageDiagnostics: () => null,
}));

vi.mock('@/components/document-analysis/DocumentAnalysisUpload', () => ({
  DocumentAnalysisUpload: () => <div data-testid="upload-form">Upload form</div>,
}));

vi.mock('@/hooks/useDocumentAnalysis', () => ({
  useDocumentAnalysisQuery: vi.fn(),
}));

vi.mock('@/components/document-analysis/ExtractAccountMatchPanel', () => ({
  ExtractAccountMatchPanel: () => <div data-testid="account-match-panel">Account match panel</div>,
}));

import AnalyzeDocumentsPage from '@/pages/AnalyzeDocumentsPage';
import { useDocumentAnalysisQuery } from '@/hooks/useDocumentAnalysis';

const ANALYSIS_ID = 'analysis-fixture-uuid';

const SNAPSHOT_FIXTURE = {
  schema_version: 1,
  policy_number: 'POL-TEST-001',
  insured_name: 'Synthetic Test Insured LLC',
  carriers: ['Carrier Alpha', 'Carrier Beta'],
  document_type: 'commercial_policy',
  effective_date: '2026-01-01',
  expiration_date: '2027-01-01',
  claims_made: true,
  defense_inside_limits: false,
  premium: { total: 12500, frequency: 'annual' },
  fees: [{ type: 'tax', amount: 250, label: 'State tax' }],
  commission: { percent: 10, amount: 1250 },
  coverages: [
    {
      name: 'General Liability',
      limit: '$1,000,000',
      deductible: '$500',
      premium: 5000,
      parent_coverage: null,
    },
  ],
  locations: [],
  vehicles: [],
  drivers: [],
  key_details: [],
};

const COMPLETED_RECORD = {
  id: ANALYSIS_ID,
  file_name: 'synthetic-policy.pdf',
  processing_status: 'completed',
  analysis_result: SNAPSHOT_FIXTURE,
  ocr_text: 'Synthetic OCR sample text for unit testing only.',
  pages_analyzed: '1-3',
  total_pages: 3,
};

function renderPage(initialEntry = '/analyze-documents') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/analyze-documents" element={<AnalyzeDocumentsPage />} />
          <Route path="/analyze-documents/:analysisId" element={<AnalyzeDocumentsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(useDocumentAnalysisQuery).mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useDocumentAnalysisQuery>);
});

describe('AnalyzeDocumentsPage', () => {
  it('shows upload form when no analysisId param', () => {
    renderPage('/analyze-documents');
    expect(screen.getByTestId('upload-form')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /document analysis/i })).toBeTruthy();
  });

  it('loads fixture snapshot and renders carriers, dates, fees, and coverages', () => {
    vi.mocked(useDocumentAnalysisQuery).mockReturnValue({
      data: COMPLETED_RECORD,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDocumentAnalysisQuery>);

    renderPage(`/analyze-documents/${ANALYSIS_ID}`);

    expect(screen.getByText('Carrier Alpha')).toBeTruthy();
    expect(screen.getByText('Carrier Beta')).toBeTruthy();
    expect(screen.getByText('2026-01-01')).toBeTruthy();
    expect(screen.getByText('2027-01-01')).toBeTruthy();
    expect(screen.getByText('State tax')).toBeTruthy();
    expect(screen.getByText('General Liability')).toBeTruthy();
    expect(screen.getByText('Claims-made')).toBeTruthy();
    expect(screen.getByTestId('account-match-panel')).toBeTruthy();
    expect(screen.queryByTestId('upload-form')).toBeNull();
  });

  it('shows loading state while analysis record is loading', () => {
    vi.mocked(useDocumentAnalysisQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDocumentAnalysisQuery>);

    renderPage(`/analyze-documents/${ANALYSIS_ID}`);

    expect(screen.getByText(/loading analysis/i)).toBeTruthy();
  });

  it('shows not found state when query returns PGRST116', () => {
    vi.mocked(useDocumentAnalysisQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDocumentAnalysisQuery>);

    renderPage(`/analyze-documents/${ANALYSIS_ID}`);

    expect(screen.getByText('Not found')).toBeTruthy();
    expect(screen.getByText(/no analysis was found for this id/i)).toBeTruthy();
  });

  it('shows unauthorized state for RLS errors', () => {
    vi.mocked(useDocumentAnalysisQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: { code: '42501', message: 'new row violates row-level security policy' },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDocumentAnalysisQuery>);

    renderPage(`/analyze-documents/${ANALYSIS_ID}`);

    expect(screen.getByText('Unauthorized')).toBeTruthy();
    expect(screen.getByText(/do not have permission/i)).toBeTruthy();
  });
});
