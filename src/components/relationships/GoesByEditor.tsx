import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Plus, Check, Loader2 } from 'lucide-react';
import { setGoesBy } from '@/hooks/useRelationshipGraph';

interface GoesByEditorProps {
  accountId: string;
  goesBy?: string | null;
  onSaved: (value: string) => void;
}

/**
 * Inline "goes by" capture on the customer header. Storing the alias the first
 * time a producer types it is the ONLY fix for the Lance problem (no algorithm
 * derives "Lance" from "David"). Saving also seeds a searchable nickname alias.
 */
export function GoesByEditor({ accountId, goesBy, onSaved }: GoesByEditorProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(goesBy ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const ok = await setGoesBy(accountId, value, goesBy);
    setSaving(false);
    if (ok) {
      onSaved(value.trim());
      setOpen(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    const ok = await setGoesBy(accountId, '', goesBy);
    setSaving(false);
    if (ok) {
      onSaved('');
      setOpen(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(goesBy ?? '');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 rounded-pill px-2 text-xs text-cc-text-muted hover:text-cc-text-primary"
        >
          {goesBy ? <Pencil className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {goesBy ? 'Edit "goes by"' : 'Add "goes by"'}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 rounded-cc-lg border-cc-border-subtle bg-cc-surface p-4"
      >
        <p className="mb-1 text-sm font-medium text-cc-text-primary">Goes by</p>
        <p className="mb-3 text-xs text-cc-text-muted">
          A preferred name this person is known by. Becomes searchable immediately.
        </p>
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder="e.g. Lance"
            className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
          />
          <Button
            data-primary
            size="icon"
            disabled={saving}
            onClick={handleSave}
            aria-label="Save goes by"
            className="h-9 w-9 shrink-0 rounded-cc-md"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
        </div>
        {goesBy && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving}
            className="mt-2 text-xs text-cc-text-muted hover:text-cc-text-primary disabled:opacity-50"
          >
            Remove "goes by"
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
