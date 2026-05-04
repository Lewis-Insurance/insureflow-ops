import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface EnumComboboxOption {
  /** Stored value (what gets saved to the DB). */
  value: string;
  /** Display label shown in the trigger and list. Defaults to `value`. */
  label?: string;
}

interface EnumComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: EnumComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Show an alert icon and amber border, e.g. when a parser prefill failed to map. */
  needsConfirmation?: boolean;
  /** Show error styling. */
  error?: boolean;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  className?: string;
}

/**
 * Searchable combobox for strict enum-style fields. Typing filters the list;
 * selection is required to set a value. Use this for fields that have a DB
 * CHECK constraint or a fixed canonical option set.
 */
export function EnumCombobox({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No matches.',
  needsConfirmation = false,
  error = false,
  disabled = false,
  loading = false,
  id,
  className,
}: EnumComboboxProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const triggerLabel = selected?.label ?? selected?.value ?? '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
            error && 'border-destructive',
            needsConfirmation &&
              !selected &&
              'border-amber-500 ring-1 ring-amber-500/40',
            className,
          )}
        >
          <span className="truncate">
            {loading
              ? 'Loading...'
              : selected
                ? triggerLabel
                : needsConfirmation
                  ? 'Needs confirmation — pick one'
                  : placeholder}
          </span>
          {needsConfirmation && !selected ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 z-50"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const label = opt.label ?? opt.value;
                return (
                  <CommandItem
                    key={opt.value}
                    value={`${label} ${opt.value}`}
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === opt.value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
