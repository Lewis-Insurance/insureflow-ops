import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  useCarrierDirectory,
  useCreateCarrier,
  useSetCarrierNaic,
  type CarrierDirectoryEntry,
} from '@/hooks/useCarrierDirectory';

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
  /**
   * Link an exact directory name automatically when no resolution is set.
   * Edit surfaces pass false until the policy's existing carrier_id has loaded,
   * so a slower seed can never lose to the auto-link.
   */
  autoLink?: boolean;
}

/**
 * The one carrier picker. Every surface that puts a carrier on a policy uses
 * this: Add Policy, the customer file's Add Policy modal, and Edit Policy.
 *
 * `public.carriers` is the single carrier store (product decision 2026-09-02),
 * so this control both reads and writes it. Picking a saved carrier resolves
 * carrier_id + NAIC. A name that is not in the directory can be added from here,
 * and a saved carrier that has no NAIC can get one from here, in both cases
 * writing the same row the Carriers page owns. That is what keeps the NAIC on an
 * ACORD 25 in step with the Carriers page without re-keying the policy.
 *
 * Free text is still allowed so intake is never blocked, but it says plainly
 * that a name-only carrier cannot fill a NAIC on a certificate.
 */
export function CarrierCombobox({ value, resolution, onChange, error, id, autoLink = true }: CarrierComboboxProps) {
  const { data: carriers = [] } = useCarrierDirectory();
  const createCarrier = useCreateCarrier();
  const setCarrierNaic = useSetCarrierNaic();

  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);

  // Inline "add to directory" form, opened from the dropdown footer.
  const [addingNaic, setAddingNaic] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  // Inline "add NAIC" form for a linked carrier that has none on file.
  const [naicDraft, setNaicDraft] = useState('');
  const [showNaicDraft, setShowNaicDraft] = useState(false);

  const q = value.trim().toLowerCase();
  const matches = useMemo(
    () => carriers.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 30),
    [carriers, q],
  );
  const exact = carriers.some((c) => c.name.toLowerCase() === q);

  // Keep the resolved NAIC honest when the directory refreshes underneath us
  // (someone edits the same carrier on /carriers while this form is open).
  const linked = resolution ? carriers.find((c) => c.id === resolution.id) : undefined;
  useEffect(() => {
    if (linked && linked.naic !== (resolution?.naic ?? null)) {
      onChange(value, { id: linked.id, naic: linked.naic });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked?.naic]);

  // Auto-link an exact directory name that arrived without a resolution: a
  // carrier read off an uploaded declarations page, a form seeded from an
  // existing policy, or a name typed in full. Without this the policy saves as
  // text only and the certificate has no carrier row to take a NAIC from.
  // Only exact names link; anything looser stays a deliberate choice.
  const exactMatch = useMemo(
    () => (q ? carriers.find((c) => c.name.trim().toLowerCase() === q) : undefined),
    [carriers, q],
  );
  useEffect(() => {
    if (autoLink && !resolution && exactMatch) {
      onChange(exactMatch.name, { id: exactMatch.id, naic: exactMatch.naic });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLink, exactMatch?.id, resolution?.id]);

  // The linked carrier record and the name on the policy are different carriers.
  // Usually the wholesaler is on the link and the issuing carrier is in the text.
  // The certificate prints the text and takes its NAIC from that carrier record,
  // so say so here instead of leaving two carriers silently disagreeing.
  const linkMismatch =
    !!linked && !!q && linked.name.trim().toLowerCase() !== q && !!exactMatch && exactMatch.id !== linked.id;

  // Certificate NAIC source mirrors get_master_coi: when the link names a different
  // carrier than the printed insurer, the name-matched row wins over the link.
  const linkedMatchesPrinted = !!linked && !!q && linked.name.trim().toLowerCase() === q;
  const certificateNaic = linkedMatchesPrinted
    ? linked?.naic ?? exactMatch?.naic ?? resolution?.naic ?? null
    : exactMatch?.naic ?? linked?.naic ?? resolution?.naic ?? null;
  const naicSourceCarrier = linkedMatchesPrinted && linked?.naic
    ? linked
    : exactMatch?.naic
      ? exactMatch
      : linked?.naic
        ? linked
        : exactMatch ?? linked ?? null;

  const pick = (c: CarrierDirectoryEntry) => {
    onChange(c.name, { id: c.id, naic: c.naic });
    setOpen(false);
    setShowAdd(false);
    setShowNaicDraft(false);
  };

  const handleAddToDirectory = async () => {
    const name = value.trim();
    if (!name) return;
    try {
      const created = await createCarrier.mutateAsync({ name, naic: addingNaic });
      onChange(created.name, { id: created.id, naic: created.naic });
      setShowAdd(false);
      setAddingNaic('');
      setOpen(false);
      toast.success(
        created.naic
          ? `${created.name} added to the carrier directory with NAIC ${created.naic}.`
          : `${created.name} added to the carrier directory. Add its NAIC so certificates can fill it.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add the carrier.');
    }
  };

  const handleSaveNaic = async () => {
    const targetId = naicSourceCarrier?.id ?? resolution?.id;
    if (!targetId) return;
    try {
      const saved = await setCarrierNaic.mutateAsync({ carrierId: targetId, naic: naicDraft });
      if (targetId === resolution?.id) {
        onChange(value, { id: resolution.id, naic: saved });
      }
      setShowNaicDraft(false);
      setNaicDraft('');
      toast.success(
        saved
          ? `NAIC ${saved} saved on the carrier directory. Certificates will use it.`
          : 'NAIC cleared on the carrier directory.',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save the NAIC.');
    }
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
          setShowNaicDraft(false);
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

          {!!q && !exact && !showAdd && (
            <div className="border-t border-cc-border-subtle">
              <button
                type="button"
                onClick={() => {
                  setShowAdd(true);
                  setAddingNaic('');
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-cc-accent hover:bg-cc-surface-raised"
              >
                Add "{value.trim()}" to the carrier directory
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(value, null);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-cc-text-muted hover:bg-cc-surface-raised"
              >
                Use "{value.trim()}" as text only
              </button>
            </div>
          )}

          {!!q && !exact && showAdd && (
            <div className="space-y-2 border-t border-cc-border-subtle bg-cc-surface-raised p-3">
              <p className="text-xs text-cc-text-muted">
                Adds <span className="font-medium text-cc-text-primary">{value.trim()}</span> to the
                same carrier directory the Carriers page manages.
              </p>
              <Input
                value={addingNaic}
                onChange={(e) => setAddingNaic(e.target.value)}
                placeholder="NAIC (optional)"
                inputMode="numeric"
                className="cc-num h-8"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={createCarrier.isPending}
                  onClick={handleAddToDirectory}
                  className="rounded-cc-sm bg-cc-accent px-3 py-1.5 text-xs font-semibold text-cc-on-accent disabled:opacity-60"
                >
                  {createCarrier.isPending ? 'Adding...' : 'Add carrier'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="rounded-cc-sm border border-cc-border-interactive px-3 py-1.5 text-xs text-cc-text-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {linkMismatch && exactMatch && linked && (
        <div className="mt-1 space-y-1">
          <p className="text-xs text-cc-warning">
            Linked to the carrier record {linked.name}, but this policy names {exactMatch.name}.
            Certificates print {exactMatch.name} and take the NAIC from that record.
          </p>
          <button
            type="button"
            onClick={() => pick(exactMatch)}
            className="text-xs font-semibold text-cc-accent underline-offset-2 hover:underline"
          >
            Link this policy to {exactMatch.name}
          </button>
        </div>
      )}

      {certificateNaic ? (
        <p className="mt-1 text-xs text-cc-info">
          NAIC <span className="cc-num font-semibold">{certificateNaic}</span> from the carrier
          directory. Certificates read it from there, so a change on the Carriers page follows
          automatically.
        </p>
      ) : resolution || exactMatch ? (
        <div className="mt-1 space-y-1">
          <p className="text-xs text-cc-warning">
            {linkMismatch && exactMatch
              ? `No NAIC on file for ${exactMatch.name}, the carrier this policy names. Certificates will show the NAIC box as missing.`
              : 'Linked to the carrier directory, but no NAIC is on file. Certificates will show the NAIC box as missing.'}
          </p>
          {showNaicDraft ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={naicDraft}
                onChange={(e) => setNaicDraft(e.target.value)}
                placeholder="NAIC"
                inputMode="numeric"
                className="cc-num h-8 w-32"
              />
              <button
                type="button"
                disabled={setCarrierNaic.isPending || !naicSourceCarrier}
                onClick={handleSaveNaic}
                className="rounded-cc-sm bg-cc-accent px-3 py-1.5 text-xs font-semibold text-cc-on-accent disabled:opacity-60"
              >
                {setCarrierNaic.isPending ? 'Saving...' : 'Save NAIC'}
              </button>
              <button
                type="button"
                onClick={() => setShowNaicDraft(false)}
                className="rounded-cc-sm border border-cc-border-interactive px-3 py-1.5 text-xs text-cc-text-secondary"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!naicSourceCarrier}
              onClick={() => {
                setNaicDraft('');
                setShowNaicDraft(true);
              }}
              className="text-xs font-semibold text-cc-accent underline-offset-2 hover:underline disabled:opacity-60"
            >
              Add NAIC to the carrier directory
            </button>
          )}
        </div>
      ) : value.trim() ? (
        <p className="mt-1 text-xs text-cc-warning">
          Not in the carrier directory. Certificates cannot fill a NAIC for a text-only carrier. Pick
          a saved carrier, or add this one from the list above.
        </p>
      ) : null}
    </div>
  );
}
