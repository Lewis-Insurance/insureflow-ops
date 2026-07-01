import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * DateField — a keyboard-first date input for the Calm Command surfaces.
 *
 * The native `<input type="date">` forces a month -> day -> year click dance and blocks
 * select-all / copy / paste. This replaces it with a plain text field you can select, type,
 * and paste into (accepts MM/DD/YYYY, M/D/YY, YYYY-MM-DD, MMDDYYYY, etc.), plus a calendar
 * popover for pointer users. The value contract is unchanged: an ISO `YYYY-MM-DD` string in,
 * an ISO `YYYY-MM-DD` string (or '') out, so callers and validation stay identical.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO YYYY-MM-DD -> display MM/DD/YYYY (empty string if not a full ISO date). */
function isoToUs(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
}

/** True only for a real calendar date (rejects 02/30, month 13, etc.). */
function isValidYmd(y: number, mo: number, d: number): boolean {
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * Parse a free-typed / pasted date into ISO YYYY-MM-DD, or null if it isn't a complete,
 * valid date. Tries multiple interpretations and returns the first that is a real calendar
 * date, so both "12/31/2025" and "12312025" and "2025-12-31" resolve.
 */
function parseToIso(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const candidates: Array<[number, number, number]> = [];
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(s))) candidates.push([+m[1], +m[2], +m[3]]);
  if ((m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(s))) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    candidates.push([y, +m[1], +m[2]]);
  }
  if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(s))) candidates.push([+m[3], +m[1], +m[2]]); // MMDDYYYY
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) candidates.push([+m[1], +m[2], +m[3]]); // YYYYMMDD
  for (const [y, mo, d] of candidates) {
    if (isValidYmd(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  return null;
}

export interface DateFieldProps {
  /** ISO YYYY-MM-DD, or '' for empty. */
  value: string;
  /** Fires with a valid ISO YYYY-MM-DD, or '' when cleared. Never fires a partial. */
  onChange: (iso: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Applied to the text input (field styling: height, border, background, cc-num, etc.). */
  className?: string;
  /** Applied to the wrapper (layout: margins/width). Keeps the calendar button aligned. */
  containerClassName?: string;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
}

export function DateField({
  value,
  onChange,
  id,
  disabled,
  placeholder = 'MM/DD/YYYY',
  className,
  containerClassName,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  // Draft mirrors what the user sees. Seeded from the ISO value; re-synced whenever the
  // parent value changes to something other than what's already typed (e.g. the widget
  // deriving the expiration from the effective date).
  const [draft, setDraft] = React.useState(() => isoToUs(value));
  React.useEffect(() => {
    if (parseToIso(draft) !== (value || null)) setDraft(isoToUs(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const selected = value ? parseLocalNoon(value) : undefined;

  const commit = (raw: string) => {
    const iso = parseToIso(raw);
    if (iso) {
      setDraft(isoToUs(iso));
      if (iso !== value) onChange(iso);
    } else if (raw.trim() === '') {
      if (value !== '') onChange('');
    } else {
      // Unparseable: snap back to the last good value rather than stranding bad text.
      setDraft(isoToUs(value));
    }
  };

  return (
    <div className={cn('relative', disabled && 'opacity-60', containerClassName)}>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          // Commit live once a complete, valid date is present so downstream derivations
          // (e.g. expiration from effective) update as you type. Partial input stays local.
          const iso = parseToIso(raw);
          if (iso && iso !== value) onChange(iso);
          else if (raw.trim() === '' && value !== '') onChange('');
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
        className={cn('pr-10', className)}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Open calendar"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-cc-sm text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-primary disabled:pointer-events-none"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (d) {
                const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
                setDraft(isoToUs(iso));
                if (iso !== value) onChange(iso);
              }
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** ISO YYYY-MM-DD -> a local Date anchored at noon (avoids DST/UTC off-by-one). */
function parseLocalNoon(iso: string): Date {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (mo || 1) - 1, d || 1, 12, 0, 0, 0);
}
