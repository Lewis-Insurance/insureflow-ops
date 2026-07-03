// Master COI certificate defaults (blueprint Section 2.10).
//
// Two account-level defaults saved through the direct account_coi_profiles
// upsert (useSaveAccountCoiProfile): the description of operations and the
// remarks that seed every certificate for this account. The description seeds
// from the read-model's ops value and offers prefill candidates (Canopy /
// business-application risk context) as ghost "Use this" chips that fill the
// textarea; picking one never auto-saves. A live character counter warns when
// the text will not fit the ACORD 25 box (the ACORD 101 continuation form is not
// yet supported).
//
// Zero lime here (Save is an outline button; the one lime primary lives in the
// drawer). No em/en dashes. Provenance of the seeded value is small muted text,
// never a success pill. Consumes COIDescriptionOfOperations verbatim.

import * as React from 'react';
import { SectionLabel } from '@/components/cc';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSaveAccountCoiProfile } from '@/hooks/useMasterCoi';
import type {
  COIDescriptionOfOperations,
  COIOpsSource,
} from '@/types/master-coi';

/**
 * Soft character limit for the ACORD 25 description-of-operations box. Lives
 * here until a shared fieldMap exists; the counter uses it to warn before the
 * text overflows the printable box.
 */
const DOO_SOFT_LIMIT = 1200;

/** Muted provenance copy for the seeded description value. */
const OPS_SOURCE_LABEL: Record<Exclude<COIOpsSource, 'missing'>, string> = {
  manual: 'manual',
  canopy: 'from Canopy',
  bap_risk_context: 'from business application',
};

/** Muted label for each prefill candidate's source. */
const PREFILL_SOURCE_LABEL: Record<'canopy' | 'bap_risk_context', string> = {
  canopy: 'Canopy',
  bap_risk_context: 'Business application',
};

export interface CertificateDefaultsBlockProps {
  accountId: string;
  ops: COIDescriptionOfOperations;
}

export function CertificateDefaultsBlock({
  accountId,
  ops,
}: CertificateDefaultsBlockProps) {
  const saveProfile = useSaveAccountCoiProfile();

  const [description, setDescription] = React.useState(ops.v ?? '');
  const [descriptionDirty, setDescriptionDirty] = React.useState(false);
  // The read-model does not return the stored remarks default, so this field
  // cannot be seeded from it. It stays empty until the operator types, and only
  // a typed value is ever written (see handleSave), so a blank field never
  // clobbers a previously saved remarks default.
  const [remarks, setRemarks] = React.useState('');
  const [remarksDirty, setRemarksDirty] = React.useState(false);

  // Re-seed the description if the read-model value changes (e.g. after a save
  // invalidation) and the operator has not diverged from the last seed.
  const seededRef = React.useRef(ops.v ?? '');
  React.useEffect(() => {
    const next = ops.v ?? '';
    if (description === seededRef.current && next !== seededRef.current) {
      setDescription(next);
      setDescriptionDirty(false);
    }
    seededRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops.v]);

  const overflow = description.length - DOO_SOFT_LIMIT;
  const isOverLimit = overflow > 0;

  const provenanceLabel =
    ops.src && ops.src !== 'missing' ? OPS_SOURCE_LABEL[ops.src] : null;

  const isDirty = descriptionDirty || remarksDirty;

  const handleSave = () => {
    // Send only the fields the operator actually edited. An untouched field is
    // omitted so the save never overwrites the other default or the seeded
    // description's provenance.
    saveProfile.mutate({
      accountId,
      ...(descriptionDirty
        ? { descriptionOfOperations: description.trim() || null }
        : {}),
      ...(remarksDirty ? { defaultRemarks: remarks.trim() || null } : {}),
    });
  };

  return (
    <div className="space-y-4">
      <SectionLabel>Certificate defaults</SectionLabel>

      {/* Description of operations (default). */}
      <div className="space-y-1.5">
        <label
          htmlFor="coi-description-of-operations"
          className="text-sm font-medium text-cc-text-primary"
        >
          Description of operations (default)
        </label>

        {provenanceLabel && (
          <div className="text-[10px] uppercase tracking-wide text-cc-text-muted">
            {provenanceLabel}
          </div>
        )}

        <Textarea
          id="coi-description-of-operations"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setDescriptionDirty(true);
          }}
          rows={4}
          placeholder="Describe the insured's operations as they should appear on certificates."
          aria-invalid={isOverLimit}
          className="min-h-24"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={
              isOverLimit
                ? 'cc-num text-xs text-cc-warning'
                : 'cc-num text-xs text-cc-text-muted'
            }
          >
            {description.length} / {DOO_SOFT_LIMIT}
          </span>
          {isOverLimit && (
            <span className="text-xs text-cc-warning">
              Shorten by <span className="cc-num">{overflow}</span> characters.
              The form box cannot fit more; support for the ACORD 101
              continuation form is planned.
            </span>
          )}
        </div>

        {/* Prefill candidates: ghost "Use this" chips, never auto-saved. */}
        {ops.prefill_candidates.length > 0 && (
          <div className="space-y-2 pt-1">
            {ops.prefill_candidates.map((candidate, index) => (
              <div
                key={`${candidate.source}-${index}`}
                className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-2"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-cc-text-muted">
                    {PREFILL_SOURCE_LABEL[candidate.source]}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDescription(candidate.text);
                      setDescriptionDirty(true);
                    }}
                    className="h-7 rounded-cc-md px-2 text-cc-text-secondary hover:text-cc-text-primary"
                  >
                    Use this
                  </Button>
                </div>
                <p className="break-words text-xs text-cc-text-secondary">
                  {candidate.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remarks (default). */}
      <div className="space-y-1.5">
        <label
          htmlFor="coi-default-remarks"
          className="text-sm font-medium text-cc-text-primary"
        >
          Remarks (default)
        </label>
        <Textarea
          id="coi-default-remarks"
          value={remarks}
          onChange={(e) => {
            setRemarks(e.target.value);
            setRemarksDirty(true);
          }}
          rows={3}
          placeholder="Standard remarks to seed onto certificates for this account."
          className="min-h-20"
        />
        <p className="text-xs text-cc-text-muted">
          Any saved remarks default is applied at certificate time. Type here
          only to set or replace it; leaving this blank keeps the current
          default unchanged.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saveProfile.isPending || !isDirty}
          onClick={handleSave}
          className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
        >
          {saveProfile.isPending ? 'Saving...' : 'Save defaults'}
        </Button>
      </div>
    </div>
  );
}
