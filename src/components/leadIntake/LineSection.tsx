/**
 * One line of business, opened by its chip. It renders only the fields that line asks
 * for, and it closes with the short list of what a carrier will still want. That list is
 * the point of the section: whoever picks the file up next knows exactly what to ask.
 */

import { ClipboardCheck, ListChecks, X } from 'lucide-react';
import { SectionLabel } from '@/components/cc';
import {
  LINE_CONFIGS,
  stillNeededToQuote,
  type LineKey,
} from '@/config/intake/lineConfig';
import { cn } from '@/lib/utils';
import { LineFieldInput, type FieldValue, type LineValues } from './LineFieldInput';
import { RepeatableGroup } from './RepeatableGroup';

/**
 * lead_auto_vehicles has year, make and model NOT NULL, so a half filled vehicle card
 * cannot be saved. The section says so here rather than letting Save fail.
 */
function incompleteVehicleNotes(rows: LineValues[]): string[] {
  const notes: string[] = [];
  rows.forEach((row, index) => {
    const filled = (key: string) => String(row[key] ?? '').trim() !== '';
    const required = ['year', 'make', 'model'];
    const touched = [...required, 'vin'].some(filled);
    if (touched && !required.every(filled)) {
      notes.push(`Vehicle ${index + 1} needs a year, make and model or it will not save`);
    }
  });
  return notes;
}

export interface LineSectionProps {
  line: LineKey;
  values: LineValues;
  onValueChange: (key: string, value: FieldValue) => void;
  groups: Record<string, LineValues[]>;
  onGroupChange: (groupKey: string, rows: LineValues[]) => void;
  onRemove: () => void;
}

export function LineSection({
  line,
  values,
  onValueChange,
  groups,
  onGroupChange,
  onRemove,
}: LineSectionProps) {
  const config = LINE_CONFIGS[line];
  if (!config) return null;

  const missing = stillNeededToQuote(line, values, groups);
  const notes = line === 'auto' ? incompleteVehicleNotes(groups.vehicles ?? []) : [];
  const outstanding = [...missing, ...notes];

  return (
    <section
      aria-labelledby={`line-${line}-heading`}
      className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionLabel>Line of business</SectionLabel>
          <h2
            id={`line-${line}-heading`}
            className="mt-1 text-base font-semibold text-cc-text-primary"
          >
            {config.label}
          </h2>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${config.label}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-cc-sm text-cc-text-muted transition-colors hover:bg-cc-surface-overlay hover:text-cc-text-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {config.fields.map((field) => (
          <LineFieldInput
            key={field.key}
            field={field}
            id={`line-${line}-${field.key}`}
            value={values[field.key]}
            onChange={(value) => onValueChange(field.key, value)}
            className={cn(!field.half && 'sm:col-span-2')}
          />
        ))}
      </div>

      {(config.groups ?? []).map((group) => (
        <RepeatableGroup
          key={group.key}
          group={group}
          rows={groups[group.key] ?? []}
          onChange={(rows) => onGroupChange(group.key, rows)}
          idPrefix={`line-${line}`}
        />
      ))}

      <div className="mt-6 rounded-cc-lg bg-cc-surface-raised p-4">
        <SectionLabel>Still needed to quote</SectionLabel>
        {outstanding.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-cc-text-secondary">
            <ClipboardCheck className="h-4 w-4 shrink-0 text-cc-text-muted" aria-hidden="true" />
            Nothing else needed to quote this.
          </p>
        ) : (
          <>
            <p className="mt-2 flex items-center gap-2 text-sm text-cc-text-secondary">
              <ListChecks className="h-4 w-4 shrink-0 text-cc-text-muted" aria-hidden="true" />
              <span>
                <span className="cc-num">{outstanding.length}</span> to ask about. Save now and fill
                these in as you get them.
              </span>
            </p>
            <ul className="mt-2 space-y-1 pl-6">
              {outstanding.map((item) => (
                <li key={item} className="text-sm text-cc-text-muted">
                  {item}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
