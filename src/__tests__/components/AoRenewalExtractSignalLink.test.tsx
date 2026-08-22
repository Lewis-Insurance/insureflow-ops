import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AoRenewalExtractSignalLink } from '@/components/renewals/AoRenewalExtractSignalLink';

const navigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe('AoRenewalExtractSignalLink', () => {
  it('renders nothing when no signal is provided', () => {
    const { container } = render(
      <MemoryRouter>
        <AoRenewalExtractSignalLink signal={null} />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('navigates to analyze documents for the analysis id', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AoRenewalExtractSignalLink
          signal={{ analysisId: 'analysis-123', label: 'Extract ready' }}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Extract ready' }));
    expect(navigate).toHaveBeenCalledWith('/analyze-documents/analysis-123');
  });
});
