// Runtime render check for the Additional Insureds directory page.
//
// list_additional_insureds / count_additional_insured_cohorts are auth-gated in
// the live app, so this test is the headless runtime verification that the page
// renders the directory correctly against the REAL RPC data shapes. The fixtures
// below are minimal, faithful instances of AdditionalInsuredListRow[] and
// AdditionalInsuredCohorts (src/hooks/useAdditionalInsureds.ts).
//
// Approach mirrors src/__tests__/components/MasterCOISection.test.tsx: the whole
// hand-rolled useAdditionalInsureds module is mocked so the list hook returns the
// fixtures (loading:false so the data path renders, not the skeleton), the search
// hook is inert, and the duplicate-groups hook returns an empty queue. The page is
// wrapped in a MemoryRouter (its subtree touches react-router). AppLayout is
// stubbed to a passthrough so the page's own directory content renders without
// dragging in the auth / AI-assistant / messenger / floor-cockpit provider tree.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  AdditionalInsuredListRow,
  AdditionalInsuredCohorts,
} from '@/hooks/useAdditionalInsureds';

// ---------------------------------------------------------------------------
// Stub AppLayout to a passthrough. The real one pulls the whole app chrome
// (AppRail/AppHeader/CommandPalette) plus auth, AI-assistant, messenger and
// floor-cockpit providers/hooks — none of which this directory render is about.
// ---------------------------------------------------------------------------
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ---------------------------------------------------------------------------
// Mock the whole useAdditionalInsureds module BEFORE importing the page. Every
// export the render tree touches is stubbed. The factory is self-contained (no
// outer refs, because vi.mock is hoisted); the hooks are wired to the fixtures in
// beforeEach.
// ---------------------------------------------------------------------------
vi.mock('@/hooks/useAdditionalInsureds', () => ({
  useAdditionalInsuredsList: vi.fn(),
  useAdditionalInsuredSearch: vi.fn(),
  useAdditionalInsuredDuplicateGroups: vi.fn(),
  // Free async fns imported by the page / its in-file MergeIntoAnotherSheet.
  mergeAdditionalInsuredsManual: vi.fn(),
}));

// Imported AFTER the mock is registered.
import AdditionalInsuredsPage from '@/pages/AdditionalInsuredsPage';
import {
  useAdditionalInsuredsList,
  useAdditionalInsuredSearch,
  useAdditionalInsuredDuplicateGroups,
} from '@/hooks/useAdditionalInsureds';

// ---------------------------------------------------------------------------
// Fixtures — faithful AdditionalInsuredListRow[] + cohort counts. Cohort counts
// are all distinct so each triage tile's number is uniquely assertable.
// ---------------------------------------------------------------------------

function row(
  over: Partial<AdditionalInsuredListRow> & { additional_insured_id: string; name: string; kind: string },
): AdditionalInsuredListRow {
  return {
    address_line1: '100 Main St',
    city: 'Live Oak',
    state: 'FL',
    zip_code: '32064',
    email: null,
    phone: null,
    notes: null,
    usage_count: 0,
    last_used_at: null,
    has_pending_duplicate: false,
    created_at: '2026-06-01T00:00:00+00:00',
    ...over,
  };
}

const ROWS: AdditionalInsuredListRow[] = [
  row({
    additional_insured_id: 'ai-1',
    name: 'First National Bank',
    kind: 'lender',
    email: 'coi@firstnational.example',
    usage_count: 4,
    last_used_at: '2026-06-20T00:00:00+00:00',
  }),
  row({
    additional_insured_id: 'ai-2',
    name: 'City of Live Oak',
    kind: 'government',
    address_line1: null, // triggers the "No address" flag pill
    city: null,
    state: null,
    zip_code: null,
    usage_count: 0,
  }),
  row({
    additional_insured_id: 'ai-3',
    name: 'Acme Property Management LLC',
    kind: 'business',
    usage_count: 2,
    has_pending_duplicate: true, // triggers the "Possible duplicate" flag pill
  }),
];

const COHORTS: AdditionalInsuredCohorts = {
  total: 3,
  pending_duplicate_groups: 5,
  missing_address: 7,
  never_used: 9,
};

// The global setup (src/test/setup.ts) runs vi.clearAllMocks() afterEach, which
// wipes mock implementations. Re-establish them before every test.
beforeEach(() => {
  vi.mocked(useAdditionalInsuredsList).mockReturnValue({
    rows: ROWS,
    cohorts: COHORTS,
    loading: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useAdditionalInsuredsList>);

  vi.mocked(useAdditionalInsuredSearch).mockReturnValue({
    results: [],
    loading: false,
    search: vi.fn(),
    clear: vi.fn(),
  } as unknown as ReturnType<typeof useAdditionalInsuredSearch>);

  vi.mocked(useAdditionalInsuredDuplicateGroups).mockReturnValue({
    groups: [],
    total: 0,
    loading: false,
    refetch: vi.fn(),
    dismiss: vi.fn(),
    merge: vi.fn(),
  } as unknown as ReturnType<typeof useAdditionalInsuredDuplicateGroups>);
});

// ---------------------------------------------------------------------------
// Render harness. MemoryRouter (the page's subtree touches react-router) plus
// a QueryClientProvider: the AdditionalInsuredDrawer invalidates the
// holder-requirements query after a save, so it calls useQueryClient at render.
// ---------------------------------------------------------------------------
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdditionalInsuredsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdditionalInsuredsPage (directory render)', () => {
  it('renders the H1 "Additional insureds" without throwing', () => {
    const { container } = renderPage();
    expect(screen.getByRole('heading', { name: /additional insureds/i })).toBeTruthy();
    expect(container.textContent).toBeTruthy();
  });

  it('renders the three triage tiles with their cohort counts', () => {
    renderPage();
    // Labels.
    expect(screen.getByText('Possible duplicates')).toBeTruthy();
    expect(screen.getByText('Missing address')).toBeTruthy();
    expect(screen.getByText('Never used')).toBeTruthy();
    // Counts (distinct per cohort, so each is uniquely assertable).
    expect(screen.getByText('5')).toBeTruthy(); // pending_duplicate_groups
    expect(screen.getByText('7')).toBeTruthy(); // missing_address
    expect(screen.getByText('9')).toBeTruthy(); // never_used
  });

  it('renders fixture holders in the directory table', () => {
    renderPage();
    expect(screen.getByText('First National Bank')).toBeTruthy();
    expect(screen.getByText('City of Live Oak')).toBeTruthy();
    expect(screen.getByText('Acme Property Management LLC')).toBeTruthy();
  });

  it('renders the kind label as a Chip for each holder', () => {
    renderPage();
    // KIND_LABEL maps kind -> human label; the Chip renders that text. The label
    // appears once per row in the md+ layout AND once in the mobile inline block,
    // so use getAllByText and assert presence robustly.
    expect(screen.getAllByText('Lender').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Government').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Business').length).toBeGreaterThan(0);
  });

  it('renders the per-row flag pills (No address / Possible duplicate)', () => {
    renderPage();
    // ai-2 has no address; ai-3 has a pending duplicate. Each pill renders in both
    // the md+ flags cell and the mobile inline block, so match robustly.
    expect(screen.getAllByText('No address').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Possible duplicate').length).toBeGreaterThan(0);
  });

  it('shows the row count summary ("3 shown")', () => {
    renderPage();
    expect(screen.getByText(/3\s*shown/)).toBeTruthy();
  });

  it('exposes the per-row actions menu for a holder', () => {
    renderPage();
    // Proves the row action affordance mounted (not behind a loading gate).
    expect(
      within(screen.getByRole('heading', { name: /additional insureds/i }).ownerDocument.body)
        .getByLabelText('Actions for First National Bank'),
    ).toBeTruthy();
  });
});
