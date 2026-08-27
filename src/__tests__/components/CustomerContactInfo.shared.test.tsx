import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usePoliciesByAccountMock } = vi.hoisted(() => ({
  usePoliciesByAccountMock: vi.fn(),
}));

vi.mock('@/hooks/usePoliciesByAccount', () => ({
  usePoliciesByAccount: usePoliciesByAccountMock,
}));

vi.mock('@/components/customers/EditContactInfoModal', () => ({ EditContactInfoModal: () => null }));
vi.mock('@/components/communications/SMSComposerModal', () => ({ SMSComposerModal: () => null }));

import { CustomerContactInfo } from '@/components/customers/CustomerContactInfo';

describe('CustomerContactInfo shared policies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePoliciesByAccountMock.mockReturnValue({
      data: [
        { id: 'owned-policy', membership: 'owner', status: 'bound', line_of_business: 'personal_auto' },
        { id: 'shared-policy', membership: 'named_insured', status: 'active', line_of_business: 'general_liability' },
      ],
    });
  });

  it('shows an owned active-policy bubble but not a shared active-policy bubble', () => {
    render(
      <CustomerContactInfo
        account={{
          id: 'child-account',
          name: 'Child Account',
          type: 'household',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Personal Auto' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'General Liability' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});
