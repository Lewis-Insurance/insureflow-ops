// Master COI insurer table preview (blueprint Section 2.7).
//
// Read-only mirror of the ACORD 25 "Insurer(s) affording coverage" A-F block.
// Letters are assigned server-side in SQL and read straight off
// masterCoi.insurers; this component never assigns or reorders them. Carriers are
// name Chips, never colored. NAIC renders through the shared Cell so an absent
// value shows the honest "Missing" warning rather than a blank. When more than
// six distinct insurers exist the overflow note explains the ACORD 25 A-F limit
// instead of silently dropping rows. The table scrolls inside its own
// overflow-x-auto container so the page body never scrolls sideways.

import { Chip, SectionLabel } from '@/components/cc';
import { Cell } from './Cell';
import { lineLabel } from './lineDisplay';
import type { COIInsurer, COIInsurerOverflow } from '@/types/master-coi';

export interface InsurerTablePreviewProps {
  insurers: COIInsurer[];
  overflow: COIInsurerOverflow[];
}

export function InsurerTablePreview({ insurers, overflow }: InsurerTablePreviewProps) {
  return (
    <div className="space-y-2">
      <SectionLabel>Insurers affording coverage</SectionLabel>

      {insurers.length === 0 ? (
        <p className="text-sm text-cc-text-muted">
          No insurers resolved yet. Add a policy to populate this table.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-cc-md border border-cc-border-subtle">
          <table className="w-full min-w-[32rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-cc-border-subtle">
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                  Letter
                </th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                  Insurer
                </th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                  NAIC
                </th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                  Lines
                </th>
              </tr>
            </thead>
            <tbody>
              {insurers.map((insurer) => (
                <tr
                  key={insurer.letter}
                  className="border-b border-cc-border-subtle last:border-b-0 align-top"
                >
                  <td className="px-3 py-2">
                    <span className="cc-num inline-flex h-5 w-5 items-center justify-center rounded-cc-sm border border-cc-border-interactive text-xs text-cc-text-secondary">
                      {insurer.letter}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {insurer.name?.v != null && insurer.name.src !== 'missing' ? (
                      <Chip className="max-w-full whitespace-normal break-words">
                        {insurer.name.v}
                      </Chip>
                    ) : (
                      <Cell label="Insurer" cell={insurer.name} format="text" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Cell label="NAIC" cell={insurer.naic} format="text" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {insurer.lines.map((line) => (
                        <Chip key={line}>{lineLabel(line)}</Chip>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {overflow.length > 0 && (
        <p className="text-xs text-cc-text-muted">
          This account has more than 6 distinct insurers. ACORD 25 has rows A
          through F; uncheck lines at generation time or issue two certificates.
        </p>
      )}
    </div>
  );
}
