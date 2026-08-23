import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AoRenewalEvidenceRail } from '@/components/renewals/AoRenewalEvidenceRail';
import type { AoRenewalEvidence } from '@/lib/aoRenewalEvidence';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()), useNavigate: () => navigate,
}));

const ready: AoRenewalEvidence = {
  renewalId: 'renewal-1', accountId: 'account-1', dec: { state: 'on_file', newestAt: '2026-03-14' },
  extract: { analysisId: 'analysis-1', label: 'Extract ready' }, openQuoteCount: 3,
  items: { missingCount: 0, inReviewCount: 0, totalCount: 5, allRequiredComplete: true },
  touch: { state: 'recent', lastTouchAt: '2026-03-20', daysAgo: 3 },
  nextHole: { kind: 'ready', label: 'Ready', href: null },
};

beforeEach(() => navigate.mockReset());

describe('AoRenewalEvidenceRail', () => {
  it('renders five evidence chips and Ready with no lime action', () => {
    render(<MemoryRouter><AoRenewalEvidenceRail evidence={ready} /></MemoryRouter>);
    for (const label of ['Dec on file', 'Extract ready', '3 quotes in', 'All items in', 'Touched 3d ago', 'Ready']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Ready' })).not.toBeInTheDocument();
  });

  it('describes an extract-proven dec truthfully when no document date is available', () => {
    render(<MemoryRouter><AoRenewalEvidenceRail evidence={{ ...ready, dec: { state: 'on_file', newestAt: null } }} /></MemoryRouter>);
    expect(screen.getByText('Dec on file')).toHaveAttribute('title', 'Current dec proven by this-term extract');
  });

  it.each([
    ['get_dec', 'Get dec', '/customers/account-1?tab=documents'],
    ['open_checklist', 'Open checklist', '/customers/account-1?tab=documents'],
    ['analyze_dec', 'Analyze dec', '/analyze-documents'],
    ['start_quote', 'Start quote', '/customers/account-1?tab=policies&policiesTab=quotes'],
    ['log_contact', 'Log contact', '/ao-renewals/renewal-1/edit#contact-log'],
  ] as const)('stops propagation and navigates for %s', async (kind, label, href) => {
    const parentClick = vi.fn();
    render(<MemoryRouter><div onClick={parentClick}><AoRenewalEvidenceRail evidence={{ ...ready, nextHole: { kind, label, href } }} /></div></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(parentClick).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(href);
    expect(screen.getAllByRole('button', { name: label })).toHaveLength(1);
  });

  it('keeps Confirm extract behavior in the existing signal link', async () => {
    const parentClick = vi.fn();
    render(<MemoryRouter><div onClick={parentClick}><AoRenewalEvidenceRail evidence={{ ...ready,
      extract: { analysisId: 'pending-1', label: 'Confirm extract' },
      nextHole: { kind: 'confirm_extract', label: 'Confirm extract', href: '/analyze-documents/pending-1' } }} /></div></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm extract' }));
    expect(parentClick).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/analyze-documents/pending-1');
    expect(screen.getAllByRole('button', { name: 'Confirm extract' })).toHaveLength(1);
  });

  it('calls the editor contact callback without navigating', async () => {
    const onLogContact = vi.fn();
    render(<MemoryRouter><AoRenewalEvidenceRail evidence={{ ...ready,
      nextHole: { kind: 'log_contact', label: 'Log contact', href: '/fallback' } }} onLogContact={onLogContact} /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Log contact' }));
    expect(onLogContact).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('renders five stable skeleton pills while loading, then nothing on error', () => {
    const { container, rerender } = render(<MemoryRouter><AoRenewalEvidenceRail evidence={undefined} isLoading /></MemoryRouter>);
    expect(screen.getByLabelText('Loading renewal evidence').children).toHaveLength(5);
    rerender(<MemoryRouter><AoRenewalEvidenceRail evidence={undefined} isError /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
