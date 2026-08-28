import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortalPolicies } from '@/components/portal/PortalPolicies';
import { usePortalPolicies } from '@/hooks/usePortalPolicies';

vi.mock('@/hooks/usePortalPolicies', () => ({
  usePortalPolicies: vi.fn(),
}));

const mockedUsePortalPolicies = vi.mocked(usePortalPolicies);

describe('PortalPolicies', () => {
  it('renders one Shared card for a site with zero owned and one junction policy', () => {
    mockedUsePortalPolicies.mockReturnValue({
      data: [{
        id: '11111111-1111-4111-8111-111111111111',
        account_id: '22222222-2222-4222-8222-222222222222',
        membership: 'named_insured',
        owner_account_id: '22222222-2222-4222-8222-222222222222',
        owner_account_name: 'Parent Company',
        policy_number: 'FAKE-001',
        line_of_business: 'General Liability',
        status: 'active',
        premium: 1200,
        effective_date: '2026-01-01',
        expiration_date: '2027-01-01',
        named_insured: null,
        carrier_name: 'Example Carrier',
      }],
      isLoading: false,
      error: null,
    } as ReturnType<typeof usePortalPolicies>);

    render(<PortalPolicies accountId="33333333-3333-4333-8333-333333333333" />);

    expect(screen.getAllByText('Shared')).toHaveLength(1);
    expect(screen.getAllByText('General Liability')).toHaveLength(1);
    expect(screen.queryByText(/No policies are available/i)).not.toBeInTheDocument();
  });
});
