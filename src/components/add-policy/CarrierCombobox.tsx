import { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useCarriersWithNaic, type CarrierOption } from '@/hooks/useLookupData';

export interface CarrierResolution {
  id: string;
  naic: string | null;
}

interface CarrierComboboxProps {
  value: string;
  resolution: CarrierResolution | null;
  onChange: (name: string, resolution: CarrierResolution | null) => void;
  error?: boolean;
  id?: string;
}

/**
 * Fillable carrier picker. The dropdown lists saved carriers (with their NAIC,
 * or "No NAIC" when none is on file); choosing one resolves carrier_id +
 * carrier_naic. Typing a name not in the list is allowed (a new carrier) and
 * resolves to null so the policy keeps the free-text carrier only.
 */
export function CarrierCombobox({ value, resolution, onChange, error, id }: CarrierComboboxProps) {
  const { data: carriers = [] } = useCarriersWithNaic();
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const q = value.trim().toLowerCase();
  const matches = useMemo(
    () => carriers.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 30),
    [carriers, q],
  );
  const exact = carriers.some((c) => c.name.toLowerCase() === q);

  const pick = (c: CarrierOption) => {
    onChange(c.name, { id: c.id, naic: c.naic });
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        autoComplete="off"
        placeholder="Type or select carrier"
        aria-invalid={error || undefined}
        className={error ? 'border-destructive' : ''}
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
      />

      {open && (matches.length > 0 || (!!q && !exact)) && (
        <div
          className="absolute z-dropdown mt-1 max-h-60 w-full overflow-auto rounded-cc-sm border border-cc-border-strong bg-cc-surface-overlay shadow-lift"
          onMouseDown={(e) => {
            // keep focus so the click registers before the input blur closes us
            e.preventDefault();
            if (blurTimer.current) window.clearTimeout(blurTimer.current);
          }}
        >
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              className="flex w-full items-center gap-2 border-b border-cc-border-subtle px-3 py-2 text-left text-sm last:border-b-0 hover:bg-cc-surface-raised"
            >
              <span className="flex-1 truncate text-cc-text-primary">{c.name}</span>
              {c.naic ? (
                <span className="cc-num shrink-0 rounded-pill border border-cc-info/30 bg-cc-info/10 px-2 py-0.5 text-xs font-semibold text-cc-info">
                  NAIC {c.naic}
                </span>
              ) : (
                <span className="shrink-0 rounded-pill border border-cc-border-strong px-2 py-0.5 text-xs text-cc-text-faint">
                  No NAIC
                </span>
              )}
            </button>
          ))}
          {!!q && !exact && (
            <button
              type="button"
              onClick={() => {
                onChange(value, null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-cc-accent hover:bg-cc-surface-raised"
            >
              Use "{value}" (new carrier)
            </button>
          )}
        </div>
      )}

      {resolution?.naic ? (
        <p className="mt-1 text-xs text-cc-info">
          NAIC auto-filled from saved carrier: <span className="cc-num font-semibold">{resolution.naic}</span>
        </p>
      ) : resolution ? (
        <p className="mt-1 text-xs text-cc-text-faint">Saved carrier. No NAIC on file yet.</p>
      ) : value.trim() ? (
        <p className="mt-1 text-xs text-cc-text-faint">New carrier. No NAIC on file.</p>
      ) : null}
    </div>
  );
}
