/**
 * One labelled control for one field of a line configuration.
 *
 * The page never hardcodes a field. It walks LINE_CONFIGS and hands each LineField
 * here, so adding a Florida specific question stays a one line change in the config.
 *
 * Everything is held as a string except checkboxes, which are held as booleans. The
 * page converts to numbers at save time, once, in one place.
 */

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateField } from '@/components/cc';
import { cn } from '@/lib/utils';
import type { LineField } from '@/config/intake/lineConfig';

export type FieldValue = string | boolean;
export type LineValues = Record<string, FieldValue>;

/** Field chrome, matched to the Calm Command input spec (36 to 40px, cc-md radius). */
export const INTAKE_INPUT_CLASS =
  'h-10 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted';

/**
 * A neutral checkbox. The shipped shadcn checkbox fills lime when checked, which would
 * put a second lime fill on a page that already has one on Save. The check mark carries
 * the state instead of a colour.
 */
export const INTAKE_CHECKBOX_CLASS =
  'h-4 w-4 rounded-cc-sm border-cc-border-interactive data-[state=checked]:border-cc-text-primary data-[state=checked]:bg-cc-surface-overlay data-[state=checked]:text-cc-text-primary';

export const INTAKE_LABEL_CLASS = 'text-sm text-cc-text-secondary';

function asText(value: FieldValue | undefined): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : '';
}

function digitsOnly(raw: string, max?: number): string {
  const digits = raw.replace(/[^0-9]/g, '');
  return max ? digits.slice(0, max) : digits;
}

function moneyOnly(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned.slice(0, 12);
  return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`.slice(0, 15);
}

export interface LineFieldInputProps {
  field: LineField;
  /** Unique per rendered instance, so repeated group rows do not collide. */
  id: string;
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
  className?: string;
}

export function LineFieldInput({ field, id, value, onChange, className }: LineFieldInputProps) {
  const text = asText(value);

  if (field.type === 'checkbox') {
    return (
      <div className={cn('flex h-10 items-center gap-2.5', className)}>
        <Checkbox
          id={id}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
          className={INTAKE_CHECKBOX_CLASS}
        />
        <Label htmlFor={id} className={cn(INTAKE_LABEL_CLASS, 'cursor-pointer')}>
          {field.label}
        </Label>
      </div>
    );
  }

  return (
    <div className={className}>
      <Label htmlFor={id} className={INTAKE_LABEL_CLASS}>
        {field.label}
      </Label>

      {field.type === 'textarea' && (
        <Textarea
          id={id}
          rows={3}
          value={text}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1.5 min-h-[80px] rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted"
        />
      )}

      {field.type === 'select' && (
        <Select value={text} onValueChange={(next) => onChange(next)}>
          <SelectTrigger id={id} className={cn(INTAKE_INPUT_CLASS, 'mt-1.5')}>
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.type === 'date' && (
        <DateField
          id={id}
          value={text}
          onChange={(iso) => onChange(iso)}
          aria-label={field.label}
          className={cn(INTAKE_INPUT_CLASS, 'cc-num')}
          containerClassName="mt-1.5"
        />
      )}

      {field.type === 'currency' && (
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cc-text-muted">
            $
          </span>
          <Input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            value={text}
            placeholder={field.placeholder}
            onChange={(event) => onChange(moneyOnly(event.target.value))}
            className={cn(INTAKE_INPUT_CLASS, 'cc-num pl-7')}
          />
        </div>
      )}

      {field.type === 'year' && (
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={text}
          placeholder={field.placeholder ?? 'YYYY'}
          onChange={(event) => onChange(digitsOnly(event.target.value, 4))}
          className={cn(INTAKE_INPUT_CLASS, 'mt-1.5 cc-num')}
        />
      )}

      {field.type === 'number' && (
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={text}
          placeholder={field.placeholder}
          onChange={(event) => onChange(digitsOnly(event.target.value, 9))}
          className={cn(INTAKE_INPUT_CLASS, 'mt-1.5 cc-num')}
        />
      )}

      {field.type === 'text' && (
        <Input
          id={id}
          autoComplete="off"
          value={text}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(INTAKE_INPUT_CLASS, 'mt-1.5')}
        />
      )}
    </div>
  );
}
