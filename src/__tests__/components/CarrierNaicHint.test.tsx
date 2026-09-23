// The policy page has to say where the certificate NAIC comes from.
//
// Every state below used to render nothing at all on the policy record, so a
// blank NAIC box on the ACORD 25 had no explanation anywhere in the app.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CarrierNaicHint } from '@/components/policies/CarrierNaicHint';

function renderHint(props: React.ComponentProps<typeof CarrierNaicHint>) {
  return render(
    <MemoryRouter>
      <CarrierNaicHint {...props} />
    </MemoryRouter>,
  );
}

describe('CarrierNaicHint', () => {
  it('says the policy is not linked, and points at Carriers', () => {
    renderHint({ carrierText: 'Security National Insurance Company', carrierInfo: null });
    expect(screen.getByText(/not linked to the carrier directory/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open carriers/i })).toHaveAttribute(
      'href',
      '/carriers?q=Security%20National%20Insurance%20Company',
    );
  });

  it('shows the directory NAIC when the linked carrier has one', () => {
    renderHint({
      carrierText: 'Auto-Owners',
      carrierInfo: { id: 'car-1', name: 'Auto-Owners', naic: '18988' },
    });
    expect(screen.getByText(/18988/)).toBeInTheDocument();
    expect(screen.queryByText(/no naic on file/i)).not.toBeInTheDocument();
  });

  it('treats a blank directory NAIC as missing and links to that carrier row', () => {
    renderHint({
      carrierText: 'Bass Underwriting',
      carrierInfo: { id: 'car-2', name: 'Bass Underwriting', naic: '' },
    });
    expect(screen.getByText(/no naic on file/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add it on carriers/i })).toHaveAttribute(
      'href',
      '/carriers?carrier=car-2',
    );
  });

  it('calls out a link that points at a different carrier than the policy names', () => {
    // The reported shape: the wholesaler is on the link, the issuing carrier is
    // the name the certificate prints.
    renderHint({
      carrierText: 'Security National Insurance Company',
      carrierInfo: { id: 'car-2', name: 'Bass Underwriting', naic: '' },
    });
    expect(
      screen.getByText(/names Security National Insurance Company but is linked to the carrier record Bass Underwriting/i),
    ).toBeInTheDocument();
  });

  it('labels a policy-level NAIC as the override it is', () => {
    renderHint({
      carrierText: 'Auto-Owners',
      carrierInfo: { id: 'car-1', name: 'Auto-Owners', naic: '18988' },
      policyNaic: '99999',
    });
    expect(screen.getByText(/overrides the carrier directory/i)).toBeInTheDocument();
    expect(screen.getByText('99999')).toBeInTheDocument();
  });
});
