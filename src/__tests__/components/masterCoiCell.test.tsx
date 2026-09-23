// Master COI Cell: blank is missing (regression, 2026-09-02).
//
// carriers.naic held '' for "no NAIC on file". The insurer table rendered that
// through Cell, which only checked `value == null`, so the NAIC column showed an
// empty box with a "reference" provenance label under it. That reads as a
// resolved value that failed to print rather than as data that is not there,
// which is exactly how the Donald Roberts Masonry LLC certificate looked.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Cell } from '@/components/master-coi/Cell';
import type { COICell } from '@/types/master-coi';

function textCell(v: string | null): COICell<string> {
  return { v, src: 'reference', path: null };
}

describe('Master COI Cell blank handling', () => {
  it('renders Missing for an empty-string value even when a source is claimed', () => {
    render(<Cell label="NAIC" cell={textCell('')} format="text" />);
    expect(screen.getByLabelText('NAIC missing')).toBeInTheDocument();
    expect(screen.queryByText('reference')).not.toBeInTheDocument();
  });

  it('renders Missing for a whitespace-only value', () => {
    render(<Cell label="NAIC" cell={textCell('   ')} format="text" />);
    expect(screen.getByLabelText('NAIC missing')).toBeInTheDocument();
  });

  it('still renders Missing for null', () => {
    render(<Cell label="NAIC" cell={textCell(null)} format="text" />);
    expect(screen.getByLabelText('NAIC missing')).toBeInTheDocument();
  });

  it('renders a real value with its provenance', () => {
    render(<Cell label="NAIC" cell={textCell('19879')} format="text" />);
    expect(screen.getByText('19879')).toBeInTheDocument();
    expect(screen.getByText('reference')).toBeInTheDocument();
    expect(screen.queryByLabelText('NAIC missing')).not.toBeInTheDocument();
  });
});
