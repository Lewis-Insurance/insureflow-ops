/**
 * The repeating cards inside a line section. Auto is the only line that uses it today
 * (Vehicles and Drivers), and the group definition comes from the line configuration, so
 * a second line can gain a repeating block without touching this file.
 */

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/cc';
import { cn } from '@/lib/utils';
import type { RepeatableGroup as RepeatableGroupConfig } from '@/config/intake/lineConfig';
import { LineFieldInput, type FieldValue, type LineValues } from './LineFieldInput';

export interface RepeatableGroupProps {
  group: RepeatableGroupConfig;
  rows: LineValues[];
  onChange: (rows: LineValues[]) => void;
  /** Unique per line, so two groups on one page never share a field id. */
  idPrefix: string;
}

export function RepeatableGroup({ group, rows, onChange, idPrefix }: RepeatableGroupProps) {
  const addRow = () => onChange([...rows, {}]);

  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  const setField = (index: number, key: string, value: FieldValue) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <SectionLabel>
          {group.label}
          {rows.length > 0 && <span className="cc-num ml-2 text-cc-text-muted">{rows.length}</span>}
        </SectionLabel>
      </div>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-cc-lg border border-dashed border-cc-border-interactive bg-cc-surface-raised p-5 text-center">
          <p className="text-sm text-cc-text-secondary">
            No {group.itemLabel.toLowerCase()} on this yet. Carriers will not quote without one.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={addRow}
            className="mt-3 gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {group.addLabel}
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-3">
            {rows.map((row, index) => (
              <div
                key={index}
                className="rounded-cc-lg border border-cc-border-subtle bg-cc-surface-raised p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-cc-text-primary">
                    {group.itemLabel} <span className="cc-num">{index + 1}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    aria-label={`Remove ${group.itemLabel.toLowerCase()} ${index + 1}`}
                    className="flex h-8 w-8 items-center justify-center rounded-cc-sm text-cc-text-muted transition-colors hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {group.fields.map((field) => (
                    <LineFieldInput
                      key={field.key}
                      field={field}
                      id={`${idPrefix}-${group.key}-${index}-${field.key}`}
                      value={row[field.key]}
                      onChange={(value) => setField(index, field.key, value)}
                      className={cn(!field.half && 'sm:col-span-2')}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={addRow}
            className="mt-3 gap-1.5 rounded-cc-md text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {group.addLabel}
          </Button>
        </>
      )}
    </section>
  );
}
