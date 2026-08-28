import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usePoliciesByAccountMock, usePolicyNamedInsuredsMock, useQuotesByAccountMock } = vi.hoisted(() => ({
  usePoliciesByAccountMock: vi.fn(),
  usePolicyNamedInsuredsMock: vi.fn(),
  useQuotesByAccountMock: vi.fn(),
}));

vi.mock('@/hooks/usePoliciesByAccount', () => ({
  usePoliciesByAccount: usePoliciesByAccountMock,
}));

vi.mock('@/hooks/usePolicyNamedInsureds', () => ({
  usePolicyNamedInsureds: usePolicyNamedInsuredsMock,
}));

vi.mock('@/hooks/useQuotes', () => ({
  useQuotesByAccount: useQuotesByAccountMock,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/customers/AddPolicyModal', () => ({ AddPolicyModal: () => null }));
vi.mock('@/components/customers/AddQuoteModal', () => ({ AddQuoteModal: () => null }));
vi.mock('@/components/customers/AddNoteModal', () => ({ AddNoteModal: () => null }));
vi.mock('@/components/customers/AddTaskModal', () => ({ AddTaskModal: () => null }));
vi.mock('@/components/customers/UploadDocModal', () => ({ UploadDocModal: () => null }));
vi.mock('@/components/customers/EditPolicyModal', () => ({ EditPolicyModal: () => null }));
vi.mock('@/components/customers/PolicyDocumentDrop', () => ({ PolicyDocumentDrop: () => null }));
vi.mock('@/components/quotes/QuoteVsIncumbentComparison', () => ({
  QuoteVsIncumbentComparison: () => null,
}));
vi.mock('@/components/quotes/ClientEnglishPackDrawer', () => ({
  ClientEnglishPackDrawer: () => null,
}));

import { CustomerPoliciesSection } from '@/components/customers/CustomerPoliciesSection';

const OWNER_POLICY_ID = '22222222-2222-2222-2222-222222222222';

function LocationProbe() {
  return <output aria-label="current path">{useLocation().pathname}</output>;
}

describe('CustomerPoliciesSection shared policies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePoliciesByAccountMock.mockReturnValue({
      data: [
        {
          id: OWNER_POLICY_ID,
          account_id: '11111111-1111-1111-1111-111111111111',
          membership: 'named_insured',
          owner_account_id: '11111111-1111-1111-1111-111111111111',
          owner_account_name: 'Parent Holdings LLC',
          policy_number: 'GL-100',
          line_of_business: 'general_liability',
          status: 'active',
          premium: 12500,
          effective_date: '2026-01-01',
          expiration_date: '2027-01-01',
          named_insured: 'Parent Holdings LLC',
          carrier_info: { id: '', name: 'Example Mutual' },
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    });
    useQuotesByAccountMock.mockReturnValue({ data: [], isLoading: false, refetch: vi.fn() });
    usePolicyNamedInsuredsMock.mockReturnValue({ data: [] });
  });

  it('renders and navigates to the owner policy for a child with only a shared policy', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={['/customers/child-account']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <CustomerPoliciesSection accountId="child-account" />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelectorAll(`#policy-${OWNER_POLICY_ID}`)).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'No policies' })).not.toBeInTheDocument();
    expect(screen.getByText('Shared / Named Insured')).toBeInTheDocument();
    expect(screen.getByText('Parent Holdings LLC')).toBeInTheDocument();
    expect(screen.getByText('Counted on Parent Holdings LLC')).toBeInTheDocument();
    expect(usePolicyNamedInsuredsMock).toHaveBeenCalledWith([]);

    await user.click(screen.getByRole('button', { name: 'View full policy' }));

    expect(screen.getByLabelText('current path')).toHaveTextContent(`/policies/${OWNER_POLICY_ID}`);
  });

  it('shows both linked account names on an owner policy card', () => {
    usePoliciesByAccountMock.mockReturnValue({
      data: [{
        id: OWNER_POLICY_ID,
        account_id: 'parent-account',
        membership: 'owner',
        owner_account_id: 'parent-account',
        owner_account_name: 'Parent Holdings LLC',
        policy_number: 'GL-100',
        line_of_business: 'general_liability',
        status: 'active',
        premium: 12500,
      }],
      isLoading: false,
      refetch: vi.fn(),
    });
    usePolicyNamedInsuredsMock.mockReturnValue({
      data: [
        { policy_id: OWNER_POLICY_ID, account_id: 'child-one', name: 'North Shop LLC' },
        { policy_id: OWNER_POLICY_ID, account_id: 'child-two', name: 'South Shop LLC' },
      ],
    });

    render(
      <MemoryRouter>
        <CustomerPoliciesSection accountId="parent-account" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Also named:')).toBeInTheDocument();
    expect(screen.getByText('North Shop LLC, South Shop LLC')).toBeInTheDocument();
    expect(screen.queryByText('Shared / Named Insured')).not.toBeInTheDocument();
    expect(usePolicyNamedInsuredsMock).toHaveBeenCalledWith([OWNER_POLICY_ID]);
  });

  it('renders an owner policy without an Also named line when no accounts are linked', () => {
    usePoliciesByAccountMock.mockReturnValue({
      data: [{
        id: OWNER_POLICY_ID,
        account_id: 'parent-account',
        membership: 'owner',
        owner_account_id: 'parent-account',
        owner_account_name: 'Parent Holdings LLC',
        policy_number: 'GL-100',
        line_of_business: 'general_liability',
        status: 'active',
        premium: 12500,
      }],
      isLoading: false,
      refetch: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <CustomerPoliciesSection accountId="parent-account" />
      </MemoryRouter>,
    );

    expect(container.querySelector(`#policy-${OWNER_POLICY_ID}`)).toBeInTheDocument();
    expect(screen.queryByText('Also named:')).not.toBeInTheDocument();
  });
});
