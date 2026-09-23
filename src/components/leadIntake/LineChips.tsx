/**
 * What they need. Four chips up front, the rest behind Show more.
 *
 * Picking a chip opens that line's section below and nothing else on the page moves,
 * which is the whole reason this is a page and not a wizard.
 */

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  PRIMARY_LINES,
  SECONDARY_LINES,
  lineLabel,
  type LineKey,
} from '@/config/intake/lineConfig';
import { cn } from '@/lib/utils';

interface ChipProps {
  line: LineKey;
  selected: boolean;
  onToggle: (line: LineKey) => void;
}

function LineChip({ line, selected, onToggle }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(line)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-1.5 text-sm transition-colors duration-fast',
        selected
          ? 'border-cc-accent bg-cc-surface-raised font-medium text-cc-text-primary'
          : 'border-cc-border-interactive bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary',
      )}
    >
      {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      {lineLabel(line)}
    </button>
  );
}

export interface LineChipsProps {
  selected: LineKey[];
  onToggle: (line: LineKey) => void;
}

export function LineChips({ selected, onToggle }: LineChipsProps) {
  // Open the drawer on its own once a secondary line is already chosen, so a restored
  // selection is never hidden behind a button.
  const [showMore, setShowMore] = useState(() =>
    SECONDARY_LINES.some((line) => selected.includes(line)),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {PRIMARY_LINES.map((line) => (
          <LineChip
            key={line}
            line={line}
            selected={selected.includes(line)}
            onToggle={onToggle}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowMore((open) => !open)}
          aria-expanded={showMore}
          className="h-auto gap-1 rounded-cc-md px-2 py-1.5 text-sm text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
        >
          {showMore ? 'Show less' : 'Show more'}
          {showMore ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {showMore && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-cc-border-subtle pt-3">
          {SECONDARY_LINES.map((line) => (
            <LineChip
              key={line}
              line={line}
              selected={selected.includes(line)}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
