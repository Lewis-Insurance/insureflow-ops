// Runtime render check for the policy coverage panel, pinned to the exact bug it
// fixes: an "absent line skeleton" (present:false, base cells only, no limit
// cells) - which get_master_coi returns for empty-blob / unclassified commercial
// policies - used to leave every coverage input disabled, so the operator could
// not enter limits at all. These tests assert the panel is now always editable
// and money formats live.
//
// Approach mirrors MasterCOISection.test.tsx: mock the useMasterCoi module so the
// read query returns a fixture and the save mutation is inert; the additional-
// coverages hook and the endorsements subtree (both hit supabase / the AI
// directory) are stubbed as out of scope for the coverage-edit behavior.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MasterCOI } from '@/types/master-coi';

vi.mock('@/hooks/useMasterCoi', () => {
  const inert = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useMasterCoi: vi.fn(() => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() })),
    useSaveMasterCoiFields: vi.fn(inert),
  };
});

vi.mock('@/hooks/usePolicyAdditionalCoverages', () => ({
  usePolicyAdditionalCoverages: vi.fn(() => ({
    coverages: [],
    isLoading: false,
    add: { mutate: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
  })),
}));

// The endorsements subtree (additional insureds / waivers) reads supabase + the
// directory; it is a sibling of the coverage editor and out of scope here.
vi.mock('@/components/policies/PolicyEndorsementsSection', () => ({
  PolicyEndorsementsSection: () => null,
}));

import { PolicyCoveragePanel } from '@/components/policies/PolicyCoveragePanel';
import { useMasterCoi, useSaveMasterCoiFields } from '@/hooks/useMasterCoi';

const missing = () => ({ v: null, src: 'missing' as const, path: null });

// Faithful minimal absent-line skeleton, mirroring get_master_coi at
// master_coi_rpcs.sql:1430 - present:false, base cells only (path null), and NO
// line-specific coverage cells. This is exactly the state that locked the panel.
const absentGl = {
  present: false,
  policy_id: null,
  insurer_letter: null,
  status: null,
  expired: false,
  policy_number: missing(),
  effective_date: missing(),
  expiration_date: missing(),
  candidates: [],
  additional_insureds: [],
};

const fixture = { lines: { gl: absentGl }, insurers: [] } as unknown as MasterCOI;

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderPanel() {
  return render(
    <PolicyCoveragePanel accountId="acc-1" policyId="pol-1" lineKey="gl" />,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  vi.mocked(useMasterCoi).mockReturnValue({
    data: fixture,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as never);
  vi.mocked(useSaveMasterCoiFields).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never);
});

describe('PolicyCoveragePanel on an absent/empty line', () => {
  it('renders the unified two-zone layout (Coverage basis + Limits)', () => {
    renderPanel();
    expect(screen.getByText('Coverage basis')).toBeInTheDocument();
    expect(screen.getByText('Limits')).toBeInTheDocument();
  });

  it('keeps the Edit button available even when the line is absent (present:false)', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeEnabled();
  });

  it('makes every limit field an enabled input after clicking Edit', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    // GL has 6 money limits; all must be editable (the bug left them disabled).
    const moneyInputs = screen.getAllByPlaceholderText('0');
    expect(moneyInputs).toHaveLength(6);
    moneyInputs.forEach((input) => expect(input).toBeEnabled());
  });

  it('formats money with thousands separators while typing', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const [eachOccurrence] = screen.getAllByPlaceholderText('0');
    fireEvent.change(eachOccurrence, { target: { value: '1000000' } });
    expect((eachOccurrence as HTMLInputElement).value).toBe('1,000,000');
  });

  it('saves the edited limit to its registry path', () => {
    const mutate = vi.fn();
    vi.mocked(useSaveMasterCoiFields).mockReturnValue({ mutate, isPending: false } as never);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    const save = screen.getByRole('button', { name: /^save$/i });
    expect(save).toBeDisabled(); // nothing changed yet

    const [eachOccurrence] = screen.getAllByPlaceholderText('0');
    fireEvent.change(eachOccurrence, { target: { value: '1000000' } });
    expect(save).toBeEnabled();

    fireEvent.click(save);
    expect(mutate).toHaveBeenCalledTimes(1);
    const arg = mutate.mock.calls[0][0];
    expect(arg.policyId).toBe('pol-1');
    expect(arg.updates['cgl_details.limits.each_occurrence']).toBe(1000000);
  });
});
