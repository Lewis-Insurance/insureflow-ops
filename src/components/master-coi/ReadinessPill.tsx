// Master COI readiness pill (blueprint Section 2.8).
//
// A StatusPill, never a progress bar: "COI ready" (success) when there are zero
// blockers, or "N blockers" (warning) otherwise. Word plus tone, never color
// alone. The pill itself is not a button; the parent renders the adjacent
// "Review blockers" action / warnings suffix so this stays a pure read-only
// indicator. Reads the canonical COIReadiness vocabulary from
// src/types/master-coi.ts verbatim.

import { StatusPill } from '@/components/cc';
import type { COIReadiness } from '@/types/master-coi';

export interface ReadinessPillProps {
  readiness: COIReadiness;
}

export function ReadinessPill({ readiness }: ReadinessPillProps) {
  return readiness.ready ? (
    <StatusPill override={{ label: 'COI ready', tone: 'success' }} />
  ) : (
    <StatusPill
      override={{ label: `${readiness.blockers.length} blockers`, tone: 'warning' }}
    />
  );
}
