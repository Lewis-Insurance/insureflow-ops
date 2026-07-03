// Runtime render check for the Master COI panel.
//
// get_master_coi is auth-gated in the live app, so this test is the runtime
// verification that the panel renders correctly against the REAL RPC data shape.
// The mock below is a faithful minimal instance of the get_master_coi output for
// account 227fd13b (True Life Apostolic Church), captured from prod and
// reconciled with src/types/master-coi.ts:
//   - gl + property present (letters A / B), auto / umbrella / wc absent
//   - every limit cell missing
//   - readiness: not ready, 2 blockers + 5 warnings
//   - review.stale = true, never reviewed
//   - insurers A = United States Liability Insurance Company,
//     B = Covington Specialty Insurance Company (both NAIC missing)
//   - lines.other empty
//
// Approach: FULL-PANEL render. The whole useMasterCoi hook module is mocked so
// the read query returns the fixture and the mutation hooks are inert; the panel
// is wrapped in a QueryClientProvider + MemoryRouter (for useNavigate). The
// coverage-line drawer is closed by default, so no shadcn Sheet/portal mounts on
// the base render.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  COICell,
  MasterCOI,
} from '@/types/master-coi';

const ACCOUNT_ID = '227fd13b-d9fe-4bbc-abd5-db6d344360fb';

// ---------------------------------------------------------------------------
// Mock the whole useMasterCoi module BEFORE importing the panel. Every hook the
// render tree touches is stubbed. The factory is self-contained (no outer refs,
// because vi.mock is hoisted): the read query returns null here and is wired to
// the fixture in beforeEach; the mutation hooks return an inert
// { mutate, isPending:false } so the mark-reviewed / save-profile buttons (and
// the drawer-only mutations) are harmless.
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useMasterCoi', () => {
  const inert = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useMasterCoi: vi.fn(() => ({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
    useMarkMasterCoiReviewed: vi.fn(inert),
    useSaveAccountCoiProfile: vi.fn(inert),
    useSaveMasterCoiFields: vi.fn(inert),
    useSetLineAiEndorsement: vi.fn(inert),
  };
});

// Imported AFTER the mock is registered.
import { MasterCOISection } from '@/components/customers/MasterCOISection';
import {
  useMasterCoi,
  useMarkMasterCoiReviewed,
  useSaveAccountCoiProfile,
  useSaveMasterCoiFields,
  useSetLineAiEndorsement,
} from '@/hooks/useMasterCoi';

// The global setup runs vi.clearAllMocks() afterEach, which wipes mock
// implementations. Re-establish them before every test: the read query points at
// the fixture and each mutation hook returns an inert { mutate, isPending:false }
// (otherwise the mark-reviewed / save-profile buttons would read .isPending off
// undefined). The fixture is referenced here, at test time, not during hoisting.
beforeEach(() => {
  vi.mocked(useMasterCoi).mockReturnValue({
    data: MASTER_COI_FIXTURE,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMasterCoi>);

  const inert = { mutate: vi.fn(), isPending: false };
  vi.mocked(useMarkMasterCoiReviewed).mockReturnValue(
    inert as unknown as ReturnType<typeof useMarkMasterCoiReviewed>,
  );
  vi.mocked(useSaveAccountCoiProfile).mockReturnValue(
    inert as unknown as ReturnType<typeof useSaveAccountCoiProfile>,
  );
  vi.mocked(useSaveMasterCoiFields).mockReturnValue(
    inert as unknown as ReturnType<typeof useSaveMasterCoiFields>,
  );
  vi.mocked(useSetLineAiEndorsement).mockReturnValue(
    inert as unknown as ReturnType<typeof useSetLineAiEndorsement>,
  );
});

// ---------------------------------------------------------------------------
// Fixture builders — faithful COICell instances.
// ---------------------------------------------------------------------------

/** A populated, non-editable cell (path: null), as sourced from a policy. */
function cell<T>(v: T, src: COICell<T>['src'] = 'manual'): COICell<T> {
  return { v, src, path: null, conf: null, flag: null, updated_at: null, updated_by: null };
}

/** A missing, editable cell carrying its registry write path. */
function missing<T>(path: string | null = null): COICell<T> {
  return { v: null, src: 'missing', path, conf: null, flag: null, updated_at: null, updated_by: null };
}

// ---------------------------------------------------------------------------
// The 227fd13b (True Life Apostolic Church) get_master_coi fixture.
// ---------------------------------------------------------------------------

const MASTER_COI_FIXTURE: MasterCOI = {
  version: 1,
  generated_at: '2026-07-03T22:48:13.41238+00:00',
  account_id: ACCOUNT_ID,

  named_insured: {
    name: cell('True Life Apostolic Church', 'account'),
    dba: missing(),
    address_line1: cell('23883 County Road 49', 'account'),
    address_line2: missing(),
    city: cell('O Brien', 'account'),
    state: cell('FL', 'account'),
    zip: cell('32071', 'account'),
    policy_named_insured_mismatch: false,
  },

  producer: {
    name: cell("Brian Lewis's Agency", 'workspace'),
    contact_name: missing(),
    phone: missing(),
    fax: missing(),
    email: cell('blewis@lewisinsurance.com', 'workspace'),
    address_line1: missing(),
    address_line2: missing(),
    city: missing(),
    state: missing(),
    zip: missing(),
    license_number: missing(),
  },

  insurers: [
    {
      letter: 'A',
      name: cell('United States Liability Insurance Company'),
      naic: missing(),
      carrier_id: '7172b943-0fc6-4f54-ae1c-a5568dbea2f1',
      resolution: 'carrier_id',
      lines: ['gl'],
      policy_ids: ['20aa9ecb-28d1-4830-b55c-b8653f12dbcf'],
    },
    {
      letter: 'B',
      name: cell('Covington Specialty Insurance Company'),
      naic: missing(),
      carrier_id: '4ba0e8a4-2615-476d-a713-65a9ce24ac04',
      resolution: 'carrier_id',
      lines: ['property'],
      policy_ids: ['680d7663-0e6a-4e26-86cb-a2d980b08562'],
    },
  ],
  insurer_overflow: [],

  lines: {
    gl: {
      present: true,
      policy_id: '20aa9ecb-28d1-4830-b55c-b8653f12dbcf',
      insurer_letter: 'A',
      status: 'active',
      expired: false,
      policy_number: cell('NPP1571126J'),
      effective_date: cell('2026-06-29'),
      expiration_date: cell('2027-06-29'),
      candidates: [
        {
          policy_id: '20aa9ecb-28d1-4830-b55c-b8653f12dbcf',
          policy_number: 'NPP1571126J',
          status: 'active',
          expiration_date: '2027-06-29',
          expired: false,
          selected: true,
        },
      ],
      occurrence_or_claims_made: missing('cgl_details.coverage_options.policy_form'),
      aggregate_applies_per: missing('cgl_details.limits.aggregate_applies_per'),
      limits: {
        each_occurrence: missing('cgl_details.limits.each_occurrence'),
        damage_to_rented_premises: missing('cgl_details.limits.damage_to_rented_premises'),
        medical_expense: missing('cgl_details.limits.medical_expense'),
        personal_advertising_injury: missing('cgl_details.limits.personal_advertising_injury'),
        general_aggregate: missing('cgl_details.limits.general_aggregate'),
        products_completed_ops_aggregate: missing('cgl_details.limits.products_completed_ops_aggregate'),
      },
      additional_insureds: [],
    },

    // Absent lines return the full COILineBase skeleton with present:false and
    // missing cells; line-specific limit/checkbox cells are omitted while absent.
    auto: {
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
    } as unknown as MasterCOI['lines']['auto'],

    umbrella: {
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
    } as unknown as MasterCOI['lines']['umbrella'],

    wc: {
      present: false,
      policy_id: null,
      insurer_letter: null,
      status: null,
      expired: false,
      policy_number: missing(),
      effective_date: missing(),
      expiration_date: missing(),
      candidates: [],
      subrogation_waivers: [],
    } as unknown as MasterCOI['lines']['wc'],

    property: {
      present: true,
      policy_id: '680d7663-0e6a-4e26-86cb-a2d980b08562',
      insurer_letter: 'B',
      status: 'active',
      expired: false,
      policy_number: cell('VBB180104'),
      effective_date: cell('2026-06-29'),
      expiration_date: cell('2027-06-29'),
      candidates: [
        {
          policy_id: '680d7663-0e6a-4e26-86cb-a2d980b08562',
          policy_number: 'VBB180104',
          status: 'active',
          expiration_date: '2027-06-29',
          expired: false,
          selected: true,
        },
      ],
      label: missing('property_details.coi_summary.label'),
      limit_amount: missing('property_details.coi_summary.limit_amount'),
      limit_description: missing('property_details.coi_summary.limit_description'),
      additional_insureds: [],
    },

    other: [],
  },

  description_of_operations: {
    v: null,
    src: 'missing',
    prefill_candidates: [],
  },

  review: {
    last_reviewed_at: null,
    last_reviewed_by: null,
    stale: true,
  },

  readiness: {
    ready: false,
    blockers: [
      { code: 'limit_missing', line: 'gl', path: 'cgl_details.limits.each_occurrence', message: 'GL Each Occurrence limit is empty' },
      { code: 'limit_missing', line: 'gl', path: 'cgl_details.limits.general_aggregate', message: 'GL General Aggregate limit is empty' },
    ],
    warnings: [
      { code: 'producer_incomplete', message: 'Producer name or phone is missing' },
      { code: 'ops_missing', message: 'Description of operations is empty' },
      { code: 'review_stale', message: 'Policy data changed after the last Master COI review' },
      { code: 'naic_missing', message: 'Insurer A has no NAIC code' },
      { code: 'naic_missing', message: 'Insurer B has no NAIC code' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Render harness.
// ---------------------------------------------------------------------------

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MasterCOISection accountId={ACCOUNT_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MasterCOISection (227fd13b — True Life Apostolic Church)', () => {
  it('renders the data state without throwing', () => {
    const { container } = renderPanel();
    // The panel title proves we are in the data state (not error / loading).
    expect(screen.getByText('Certificate of insurance')).toBeTruthy();
    expect(container.textContent).toBeTruthy();
  });

  it('shows the readiness pill with "2 blockers" (not ready)', () => {
    renderPanel();
    // "2 blockers" appears twice: the header ReadinessPill (2 total blockers) and
    // the GL row completeness pill (both blockers are GL limit_missing). Robust to
    // that duplication: assert both are present.
    expect(screen.getAllByText('2 blockers')).toHaveLength(2);
  });

  it('renders the named insured "True Life Apostolic Church"', () => {
    renderPanel();
    expect(screen.getByText('True Life Apostolic Church')).toBeTruthy();
  });

  it('renders the GL line with letter A, its carrier, and a missing limit indicator', () => {
    renderPanel();
    // Letter badge A appears on the GL row (and again in the insurer table).
    expect(screen.getAllByText('A').length).toBeGreaterThan(0);
    // Carrier name appears as a Chip on the GL row (and in the insurer table).
    expect(
      screen.getAllByText('United States Liability Insurance Company').length,
    ).toBeGreaterThan(0);
    // The GL policy number renders (present line, sourced from policy).
    expect(screen.getByText('NPP1571126J')).toBeTruthy();
    // Every limit cell is missing -> "Missing" appears in the limits strip.
    expect(screen.getAllByText('Missing').length).toBeGreaterThan(0);
  });

  it('renders the property line with letter B and its policy number', () => {
    renderPanel();
    expect(screen.getAllByText('B').length).toBeGreaterThan(0);
    expect(screen.getByText('VBB180104')).toBeTruthy();
  });

  it('renders auto, umbrella, and wc as "Not on file" rows', () => {
    renderPanel();
    // Three absent lines each render exactly one "Not on file" row.
    expect(screen.getAllByText('Not on file')).toHaveLength(3);
    expect(screen.getByText('Automobile Liability')).toBeTruthy();
    expect(screen.getByText('Umbrella/Excess Liability')).toBeTruthy();
    expect(
      screen.getByText('Workers Compensation and Employers Liability'),
    ).toBeTruthy();
  });

  it('renders the insurer table with both insurer names and NAIC "Missing"', () => {
    renderPanel();
    const table = screen.getByRole('table');
    const scoped = within(table);
    expect(
      scoped.getByText('United States Liability Insurance Company'),
    ).toBeTruthy();
    expect(scoped.getByText('Covington Specialty Insurance Company')).toBeTruthy();
    // Both insurers have no NAIC -> at least two "Missing" cells inside the table.
    expect(scoped.getAllByText('Missing').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the review row as never reviewed and stale', () => {
    renderPanel();
    expect(screen.getByText('Never reviewed')).toBeTruthy();
    expect(
      screen.getByText('Policy data changed after the last review.'),
    ).toBeTruthy();
  });
});
