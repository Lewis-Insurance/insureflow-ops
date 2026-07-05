import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Chip } from '@/components/cc';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  UserPlus,
  Pencil,
  Check,
  Loader2,
  ShieldQuestion,
  ChevronDown,
  ClipboardCheck,
  Plus,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import {
  useAdditionalInsuredSearch,
  resolveAdditionalInsured,
  type AdditionalInsuredSearchResult,
  type AdditionalInsuredSavedRow,
} from '@/hooks/useAdditionalInsureds';
import {
  parseHolderRequirements,
  type HolderRequirements,
  type HolderRequirementsMinLimit,
  type HolderRequirementsFlag,
} from '@/lib/acord/acord25/requirements';
import type { Acord25LineKey } from '@/lib/acord/acord25/types';

/**
 * Add / edit an additional insured (certificate holder). Forked from
 * LinkAccountDrawer: the Sheet shell, the 250ms debounce effect, and the
 * selected-record card are the account version's patterns kept intact.
 *
 * NET-NEW vs the link drawer: a live duplicate typeahead under the Name field
 * (create mode only). As the name is typed we search the live book and surface
 * possible existing entries with a match reason. Saving ALWAYS routes through
 * resolve_additional_insured (never a raw insert) so two concurrent identical
 * creates still land exactly one row. Edit mode is a direct update by id.
 */

/** The row the drawer edits. Superset of the saved-row the caller receives back. */
export interface AdditionalInsuredEditRow {
  id: string;
  name: string;
  kind: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

interface AdditionalInsuredDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode (typeahead on); a row = edit mode (typeahead off). */
  initial?: AdditionalInsuredEditRow | null;
  /** Seeds the Name in create mode when opened from the certificate generator. */
  initialName?: string;
  /** Fires with the FULL saved row so callers never need to re-fetch. */
  onSaved: (saved: AdditionalInsuredSavedRow) => void;
}

const KIND_OPTIONS = [
  { value: 'business', label: 'Business' },
  { value: 'individual', label: 'Individual' },
  { value: 'government', label: 'Government' },
  { value: 'lender', label: 'Lender' },
  { value: 'other', label: 'Other' },
] as const;

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.map((k) => [k.value, k.label]),
);

interface FormState {
  name: string;
  kind: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  email: string;
  phone: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  kind: 'business',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip_code: '',
  email: '',
  phone: '',
  notes: '',
};

function fromRow(row: AdditionalInsuredEditRow): FormState {
  return {
    name: row.name ?? '',
    kind: row.kind ?? 'business',
    address_line1: row.address_line1 ?? '',
    address_line2: row.address_line2 ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    zip_code: row.zip_code ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    notes: row.notes ?? '',
  };
}

/**
 * Hydrate the full saved row by id so callers get a complete record on save.
 * additional_insureds is not in the generated Supabase types yet (types regen is
 * a separate step), so we use the repo's `.from('<table>' as any)` drift pattern.
 */
async function hydrateSavedRow(id: string): Promise<AdditionalInsuredSavedRow | null> {
  const { data, error } = await supabase
    .from('additional_insureds' as any)
    .select('id, name, kind, address_line1, address_line2, city, state, zip_code')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('additional insured hydrate error', error);
    return null;
  }
  return (data as unknown as AdditionalInsuredSavedRow) ?? null;
}

// ---------------------------------------------------------------------------
// Holder requirements editor (07 Section 4.3).
//
// Edits the closed schema stored on additional_insureds.requirements jsonb
// (07 Section 4.2): structured min_limit rows, per-line flag toggles, notice
// days, endorsement form chips, required lines, plus free-text notes. All
// optional; a holder with no requirements behaves exactly as today. The shape
// here is the same HolderRequirements consumed by the shared evaluator, so the
// generator reads back exactly what this editor writes.
// ---------------------------------------------------------------------------

const REQ_LINE_OPTIONS: Array<{ value: Acord25LineKey; label: string }> = [
  { value: 'gl', label: 'General Liability' },
  { value: 'auto', label: 'Automobile Liability' },
  { value: 'umbrella', label: 'Umbrella / Excess' },
  { value: 'wc', label: 'Workers Compensation' },
  { value: 'property', label: 'Property' },
  // 'other' removed: the generator never selects an OTHER line, so a required
  // 'other' could never be satisfied on a standard certificate (review fix).
];

/**
 * Field keys offered per line for a min_limit row. Each is a key that resolves
 * to a numeric COICell in the get_master_coi line contract (matching the
 * resolver in requirements.ts). GL nests its limits under limits.{field}; the
 * others carry them directly. 'other' has no canonical numeric field, so it
 * offers none.
 */
const REQ_FIELD_OPTIONS: Record<Acord25LineKey, Array<{ value: string; label: string }>> = {
  gl: [
    { value: 'each_occurrence', label: 'Each occurrence' },
    { value: 'general_aggregate', label: 'General aggregate' },
    { value: 'products_completed_ops_aggregate', label: 'Products / completed ops aggregate' },
    { value: 'personal_advertising_injury', label: 'Personal and advertising injury' },
    { value: 'damage_to_rented_premises', label: 'Damage to rented premises' },
    { value: 'medical_expense', label: 'Medical expense' },
  ],
  auto: [
    { value: 'csl', label: 'Combined single limit' },
    { value: 'bi_per_person', label: 'Bodily injury per person' },
    { value: 'bi_per_accident', label: 'Bodily injury per accident' },
    { value: 'pd_per_accident', label: 'Property damage per accident' },
  ],
  umbrella: [
    { value: 'each_occurrence', label: 'Each occurrence' },
    { value: 'aggregate', label: 'Aggregate' },
  ],
  wc: [
    { value: 'el_each_accident', label: 'EL each accident' },
    { value: 'el_disease_each_employee', label: 'EL disease, each employee' },
    { value: 'el_disease_policy_limit', label: 'EL disease, policy limit' },
  ],
  property: [{ value: 'limit_amount', label: 'Limit amount' }],
  other: [],
};

/** The editor's working form: HolderRequirements plus the notes string. */
interface RequirementsFormState {
  min_limits: HolderRequirementsMinLimit[];
  flags: HolderRequirementsFlag[];
  required_endorsement_forms: string[];
  notice_days: string;
  required_lines: Acord25LineKey[];
  notes: string;
}

const EMPTY_REQUIREMENTS: RequirementsFormState = {
  min_limits: [],
  flags: [],
  required_endorsement_forms: [],
  notice_days: '',
  required_lines: [],
  notes: '',
};

/** Seed the editor form from parsed requirements + the notes column. */
function requirementsToForm(
  parsed: HolderRequirements | null,
  notes: string | null,
): RequirementsFormState {
  if (!parsed) {
    return { ...EMPTY_REQUIREMENTS, notes: notes ?? '' };
  }
  return {
    min_limits: parsed.min_limits.map((m) => ({ ...m })),
    flags: parsed.flags.map((f) => ({ ...f })),
    required_endorsement_forms: [...parsed.required_endorsement_forms],
    notice_days: parsed.notice_days != null ? String(parsed.notice_days) : '',
    // Drop a legacy stored 'other' (no longer offered; the generator can
    // never satisfy it) so the next save clears it instead of echoing it.
    required_lines: parsed.required_lines.filter((l) => l !== 'other'),
    notes: notes ?? '',
  };
}

/**
 * Serialize the editor form back into the closed requirements jsonb the RPC
 * stores. Empty / partial rows are dropped so a holder that opened the section
 * but added nothing stays with no requirements.
 */
function formToRequirementsPayload(form: RequirementsFormState): Record<string, unknown> {
  const min_limits = form.min_limits
    .filter((m) => m.field.trim().length > 0 && Number.isFinite(m.min))
    .map((m) => ({ line_key: m.line_key, field: m.field, min: m.min }));

  const flags = form.flags
    .filter((f) => f.requires_additional_insured || f.requires_waiver)
    .map((f) => ({
      line_key: f.line_key,
      requires_additional_insured: !!f.requires_additional_insured,
      requires_waiver: !!f.requires_waiver,
    }));

  const required_endorsement_forms = form.required_endorsement_forms
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const noticeNum = Number.parseInt(form.notice_days, 10);
  const notice_days = Number.isFinite(noticeNum) && noticeNum > 0 ? noticeNum : null;

  return {
    min_limits,
    flags,
    required_endorsement_forms,
    notice_days,
    required_lines: [...form.required_lines],
  };
}

interface RequirementsSectionProps {
  form: RequirementsFormState;
  onChange: (next: RequirementsFormState) => void;
  loading: boolean;
}

/** The collapsed Requirements editor rendered inside the drawer (edit mode). */
function RequirementsSection({ form, onChange, loading }: RequirementsSectionProps) {
  const [open, setOpen] = useState(false);
  const [formInput, setFormInput] = useState('');

  const ruleCount =
    form.min_limits.length +
    form.flags.length +
    form.required_endorsement_forms.length +
    form.required_lines.length +
    (form.notice_days.trim() ? 1 : 0);

  const flagFor = (line: Acord25LineKey): HolderRequirementsFlag =>
    form.flags.find((f) => f.line_key === line) ?? {
      line_key: line,
      requires_additional_insured: false,
      requires_waiver: false,
    };

  const setFlag = (line: Acord25LineKey, patch: Partial<HolderRequirementsFlag>) => {
    const current = flagFor(line);
    const next: HolderRequirementsFlag = { ...current, ...patch };
    const others = form.flags.filter((f) => f.line_key !== line);
    const cleaned = next.requires_additional_insured || next.requires_waiver ? [next] : [];
    onChange({ ...form, flags: [...others, ...cleaned] });
  };

  const addMinLimit = () => {
    onChange({
      ...form,
      min_limits: [
        ...form.min_limits,
        { line_key: 'gl', field: 'general_aggregate', min: 1000000 },
      ],
    });
  };

  const updateMinLimit = (index: number, patch: Partial<HolderRequirementsMinLimit>) => {
    const next = form.min_limits.map((m, i) => {
      if (i !== index) return m;
      const merged = { ...m, ...patch };
      // When the line changes, snap the field to the first valid field for it.
      if (patch.line_key && patch.line_key !== m.line_key) {
        const fields = REQ_FIELD_OPTIONS[patch.line_key];
        merged.field = fields.length > 0 ? fields[0].value : '';
      }
      return merged;
    });
    onChange({ ...form, min_limits: next });
  };

  const removeMinLimit = (index: number) => {
    onChange({ ...form, min_limits: form.min_limits.filter((_, i) => i !== index) });
  };

  const toggleRequiredLine = (line: Acord25LineKey) => {
    const has = form.required_lines.includes(line);
    onChange({
      ...form,
      required_lines: has
        ? form.required_lines.filter((l) => l !== line)
        : [...form.required_lines, line],
    });
  };

  const addForm = () => {
    const value = formInput.trim();
    if (!value) return;
    if (form.required_endorsement_forms.some((f) => f.toLowerCase() === value.toLowerCase())) {
      setFormInput('');
      return;
    }
    onChange({ ...form, required_endorsement_forms: [...form.required_endorsement_forms, value] });
    setFormInput('');
  };

  const removeForm = (value: string) => {
    onChange({
      ...form,
      required_endorsement_forms: form.required_endorsement_forms.filter((f) => f !== value),
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised px-3 py-2.5 text-left hover:bg-cc-surface-overlay">
        <span className="flex items-center gap-2 text-sm font-medium text-cc-text-primary">
          <ClipboardCheck className="h-4 w-4 text-cc-accent" />
          Requirements
          <span className="normal-case text-cc-text-faint">(optional)</span>
        </span>
        <span className="flex items-center gap-2">
          {ruleCount > 0 && (
            <Chip>
              <span className="cc-num">{ruleCount}</span>&nbsp;{ruleCount === 1 ? 'rule' : 'rules'}
            </Chip>
          )}
          <ChevronDown
            className={`h-4 w-4 text-cc-text-muted transition-transform duration-base ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 px-1 py-2 text-sm text-cc-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading requirements
          </div>
        ) : (
          <>
            <p className="text-xs text-cc-text-muted">
              What this holder demands on a certificate. Checked before generation and shown as
              advisory pass or fail pills. Never blocks issuing.
            </p>

            {/* Minimum limits */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                Minimum limits
              </label>
              {form.min_limits.length === 0 && (
                <p className="text-xs text-cc-text-faint">No minimum limits set.</p>
              )}
              <div className="space-y-2">
                {form.min_limits.map((row, index) => {
                  const fields = REQ_FIELD_OPTIONS[row.line_key];
                  return (
                    <div
                      key={index}
                      className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface p-2"
                    >
                      <Select
                        value={row.line_key}
                        onValueChange={(v) => updateMinLimit(index, { line_key: v as Acord25LineKey })}
                      >
                        <SelectTrigger
                          aria-label="Minimum limit line"
                          className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REQ_LINE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {fields.length > 0 ? (
                        <Select
                          value={row.field}
                          onValueChange={(v) => updateMinLimit(index, { field: v })}
                        >
                          <SelectTrigger
                            aria-label="Minimum limit field"
                            className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                          >
                            <SelectValue placeholder="Field" />
                          </SelectTrigger>
                          <SelectContent>
                            {fields.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          aria-label="Minimum limit field"
                          value={row.field}
                          onChange={(e) => updateMinLimit(index, { field: e.target.value })}
                          placeholder="Field key"
                          className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                        />
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove minimum limit"
                        onClick={() => removeMinLimit(index)}
                        className="h-9 w-9 text-cc-text-muted hover:text-cc-text-primary"
                      >
                        <X className="h-4 w-4" />
                      </Button>

                      <Input
                        aria-label="Minimum amount"
                        inputMode="numeric"
                        value={Number.isFinite(row.min) ? String(row.min) : ''}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^0-9]/g, '');
                          updateMinLimit(index, { min: digits === '' ? NaN : Number.parseInt(digits, 10) });
                        }}
                        placeholder="Minimum amount"
                        className="col-span-3 rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary [font-variant-numeric:tabular-nums]"
                      />
                    </div>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addMinLimit}
                className="gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
              >
                <Plus className="h-3.5 w-3.5" /> Add minimum limit
              </Button>
            </div>

            {/* Endorsement flags per line */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                Endorsement flags
              </label>
              <div className="space-y-1.5">
                {REQ_LINE_OPTIONS.map((o) => {
                  const flag = flagFor(o.value);
                  return (
                    <div
                      key={o.value}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface px-3 py-2"
                    >
                      <span className="text-sm text-cc-text-primary">{o.label}</span>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 text-xs text-cc-text-secondary">
                          <input
                            type="checkbox"
                            checked={!!flag.requires_additional_insured}
                            onChange={(e) =>
                              setFlag(o.value, { requires_additional_insured: e.target.checked })
                            }
                            className="h-3.5 w-3.5 accent-cc-accent"
                          />
                          Additional insured
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-cc-text-secondary">
                          <input
                            type="checkbox"
                            checked={!!flag.requires_waiver}
                            onChange={(e) => setFlag(o.value, { requires_waiver: e.target.checked })}
                            className="h-3.5 w-3.5 accent-cc-accent"
                          />
                          Waiver of subrogation
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Required lines */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                Required lines
              </label>
              <div className="flex flex-wrap gap-1.5">
                {REQ_LINE_OPTIONS.map((o) => {
                  const active = form.required_lines.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleRequiredLine(o.value)}
                      className={`rounded-pill border px-2.5 py-1 text-xs transition-colors ${
                        active
                          ? 'border-cc-accent bg-cc-accent/15 text-cc-text-primary'
                          : 'border-cc-border-subtle bg-cc-surface text-cc-text-secondary hover:bg-cc-surface-overlay'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Required endorsement forms (chips) */}
            <div className="space-y-2">
              <label
                htmlFor="req-form-input"
                className="text-xs font-medium uppercase tracking-wide text-cc-text-muted"
              >
                Required endorsement forms
              </label>
              <div className="flex gap-2">
                <Input
                  id="req-form-input"
                  value={formInput}
                  onChange={(e) => setFormInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addForm();
                    }
                  }}
                  placeholder="e.g. CG 20 10"
                  className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addForm}
                  disabled={!formInput.trim()}
                  className="gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {form.required_endorsement_forms.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.required_endorsement_forms.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1 rounded-pill bg-cc-surface-overlay px-2.5 py-0.5 text-xs text-cc-text-secondary"
                    >
                      {f}
                      <button
                        type="button"
                        aria-label={`Remove ${f}`}
                        onClick={() => removeForm(f)}
                        className="text-cc-text-muted hover:text-cc-text-primary"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Notice days */}
            <div className="space-y-2">
              <label
                htmlFor="req-notice-days"
                className="text-xs font-medium uppercase tracking-wide text-cc-text-muted"
              >
                Notice of cancellation <span className="normal-case text-cc-text-faint">(days)</span>
              </label>
              <Input
                id="req-notice-days"
                inputMode="numeric"
                value={form.notice_days}
                onChange={(e) =>
                  onChange({ ...form, notice_days: e.target.value.replace(/[^0-9]/g, '') })
                }
                placeholder="e.g. 30"
                className="w-28 rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary [font-variant-numeric:tabular-nums]"
              />
            </div>

            {/* Requirements notes (never evaluated) */}
            <div className="space-y-2">
              <label
                htmlFor="req-notes"
                className="text-xs font-medium uppercase tracking-wide text-cc-text-muted"
              >
                Requirements notes <span className="normal-case text-cc-text-faint">(optional)</span>
              </label>
              <Textarea
                id="req-notes"
                value={form.notes}
                onChange={(e) => onChange({ ...form, notes: e.target.value })}
                placeholder="Free text about this holder's requirements. Not evaluated."
                rows={2}
                className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
              />
            </div>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AdditionalInsuredDrawer({
  open,
  onOpenChange,
  initial = null,
  initialName,
  onSaved,
}: AdditionalInsuredDrawerProps) {
  const isEdit = initial != null;
  const { results, loading: searching, search, clear } = useAdditionalInsuredSearch();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedMatch, setSelectedMatch] = useState<AdditionalInsuredSearchResult | null>(null);
  const [saving, setSaving] = useState(false);
  // Requirements editor state (edit mode only). Loaded on open via
  // get_additional_insured_requirements; persisted via set_..._requirements.
  const queryClient = useQueryClient();
  const [reqForm, setReqForm] = useState<RequirementsFormState>(EMPTY_REQUIREMENTS);
  const [reqLoading, setReqLoading] = useState(false);
  // Load failure must BLOCK the requirements write: saving the empty default
  // over an existing profile would erase it (review fix, PR #42).
  const [reqLoadFailed, setReqLoadFailed] = useState(false);

  // Seed the form each time the drawer opens (edit row, seeded name, or blank).
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm(fromRow(initial));
    } else {
      setForm({ ...EMPTY_FORM, name: initialName?.trim() ? initialName.trim() : '' });
    }
    setSelectedMatch(null);
  }, [open, initial, initialName]);

  // Load the holder's stored requirements when editing an existing record.
  useEffect(() => {
    if (!open || !initial) {
      setReqForm(EMPTY_REQUIREMENTS);
      // Reset the transient flags: a load cancelled mid-flight must not leave
      // reqLoading stuck and block create-mode saves (round-2 review fix).
      setReqLoading(false);
      setReqLoadFailed(false);
      return;
    }
    let cancelled = false;
    setReqLoading(true);
    setReqLoadFailed(false);
    setReqForm(EMPTY_REQUIREMENTS);
    (async () => {
      const { data, error } = await supabase.rpc('get_additional_insured_requirements', {
        p_id: initial.id,
      });
      if (cancelled) return;
      if (error) {
        logger.error('additional insured requirements load error', error);
        setReqLoadFailed(true);
        setReqLoading(false);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as
        | { requirements?: unknown; requirements_notes?: string | null }
        | null;
      const parsed = parseHolderRequirements(row?.requirements ?? null);
      setReqForm(requirementsToForm(parsed, row?.requirements_notes ?? null));
      setReqLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initial]);

  // Reset transient state when the drawer closes.
  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setSelectedMatch(null);
      setReqForm(EMPTY_REQUIREMENTS);
      clear();
    }
  }, [open, clear]);

  // Live duplicate typeahead (create mode only). Debounce cloned from
  // LinkAccountDrawer: same 250ms, same stable search/clear deps.
  useEffect(() => {
    if (!open || isEdit) return;
    const handle = setTimeout(() => {
      if (form.name.trim().length >= 2) search(form.name);
      else clear();
    }, 250);
    return () => clearTimeout(handle);
  }, [form.name, open, isEdit, search, clear]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const finish = (saved: AdditionalInsuredSavedRow) => {
    onSaved(saved);
    onOpenChange(false);
  };

  // Create path: resolve-or-create (never a raw insert). Race-safe server-side.
  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const resolved = await resolveAdditionalInsured({
      name: form.name.trim(),
      kind: form.kind,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zip: form.zip_code.trim() || null,
      notes: form.notes.trim() || null,
    });
    if (!resolved) {
      setSaving(false);
      return;
    }
    if (resolved.matched) {
      toast({ title: 'Matched an existing record', description: 'Reused the record already on file.' });
    }
    const saved = await hydrateSavedRow(resolved.id);
    setSaving(false);
    if (saved) finish(saved);
    else onOpenChange(false);
  };

  // "Use selected" path: adopt an existing record surfaced by the typeahead.
  const handleUseSelected = async () => {
    if (!selectedMatch) return;
    setSaving(true);
    const saved = await hydrateSavedRow(selectedMatch.additional_insured_id);
    setSaving(false);
    if (saved) finish(saved);
    else onOpenChange(false);
  };

  // Edit path: direct update by id.
  const handleUpdate = async () => {
    if (!initial || !form.name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('additional_insureds' as any)
      .update({
        name: form.name.trim(),
        kind: form.kind,
        address_line1: form.address_line1.trim() || null,
        address_line2: form.address_line2.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip_code: form.zip_code.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
      })
      .eq('id', initial.id);
    if (error) {
      toast({ title: 'Could not save changes', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    // Persist holder requirements alongside the base record (edit mode). The
    // onSaved row shape is unchanged; requirements are stored on the holder and
    // fetched by the generator with the holder pick, not returned here.
    // NEVER write when the load failed: reqForm is still the empty default and
    // saving it would erase the holder's existing profile (review fix).
    if (reqLoadFailed) {
      toast({
        title: 'Holder saved; requirements NOT saved',
        description: 'The existing requirements could not be loaded, so they were left untouched. Reopen the holder to edit them.',
        variant: 'destructive',
      });
    } else {
      const { error: reqError } = await supabase.rpc('set_additional_insured_requirements', {
        p_id: initial.id,
        p_requirements: formToRequirementsPayload(reqForm),
        p_requirements_notes: reqForm.notes.trim() || null,
      });
      if (reqError) {
        // The identity fields above already saved - say so explicitly.
        toast({
          title: 'Holder saved, but requirements were NOT saved',
          description: reqError.message,
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }
      // The generator caches requirements for 60s; refresh it so the
      // compliance strip reflects this edit immediately (review fix).
      queryClient.invalidateQueries({ queryKey: ['holder-requirements', initial.id] });
    }
    const saved = await hydrateSavedRow(initial.id);
    setSaving(false);
    if (saved) finish(saved);
    else onOpenChange(false);
  };

  const nameEntered = form.name.trim().length > 0;
  // In create mode a selected match takes over the primary action.
  // reqLoading gate: saving mid-load would push the empty default (review fix).
  const primaryDisabled = saving || !nameEntered || reqLoading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-cc-border-subtle bg-cc-surface p-0 sm:max-w-[480px]"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="space-y-1 border-b border-cc-border-subtle p-6 text-left">
            <SheetTitle className="flex items-center gap-2 text-cc-text-primary">
              {isEdit ? (
                <Pencil className="h-4 w-4 text-cc-accent" />
              ) : (
                <UserPlus className="h-4 w-4 text-cc-accent" />
              )}
              {isEdit ? 'Edit additional insured' : 'Add additional insured'}
            </SheetTitle>
            <SheetDescription className="text-cc-text-muted">
              {isEdit
                ? 'Update this shared certificate holder. Changes apply everywhere it is used.'
                : 'One shared record across every customer. We check for existing entries as you type.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {/* Name + live duplicate typeahead */}
            <div className="space-y-2">
              <label htmlFor="ai-name" className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                Name
              </label>
              <Input
                id="ai-name"
                autoFocus
                value={form.name}
                onChange={(e) => {
                  set('name', e.target.value);
                  setSelectedMatch(null);
                }}
                placeholder="Company or person on the certificate"
                className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
              />

              {!isEdit && selectedMatch ? (
                <div className="space-y-2 rounded-cc-md border border-l-2 border-cc-border-subtle border-l-cc-accent bg-cc-surface-raised px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                    Use this existing record
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-cc-text-primary">{selectedMatch.name}</p>
                      <p className="text-xs text-cc-text-muted">
                        {KIND_LABEL[selectedMatch.kind] ?? selectedMatch.kind}
                        {selectedMatch.city || selectedMatch.state
                          ? ` · ${[selectedMatch.city, selectedMatch.state].filter(Boolean).join(', ')}`
                          : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedMatch(null)}
                      className="text-cc-text-muted hover:text-cc-text-primary"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ) : !isEdit && form.name.trim().length >= 2 ? (
                <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface">
                  <div className="flex items-center gap-2 border-b border-cc-border-subtle px-3 py-2 text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                    <ShieldQuestion className="h-3.5 w-3.5" />
                    Possible existing entries
                  </div>
                  {searching ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-cc-text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" /> Searching the book
                    </div>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-cc-text-muted">
                      No matches yet. This will create a new record.
                    </p>
                  ) : (
                    <ul className="max-h-56 divide-y divide-cc-border-subtle overflow-y-auto">
                      {results.map((r) => (
                        <li key={r.additional_insured_id}>
                          <button
                            type="button"
                            onClick={() => setSelectedMatch(r)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-cc-surface-overlay"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-cc-text-primary">{r.name}</p>
                              <p className="flex flex-wrap items-center gap-x-2 text-xs text-cc-text-muted">
                                <span>{KIND_LABEL[r.kind] ?? r.kind}</span>
                                {(r.city || r.state) && (
                                  <span>{[r.city, r.state].filter(Boolean).join(', ')}</span>
                                )}
                                {r.match_reason && (
                                  <Chip className="lowercase first-letter:uppercase">{r.match_reason}</Chip>
                                )}
                              </p>
                            </div>
                            <Chip>
                              <span className="cc-num">{r.usage_count}</span>&nbsp;certs
                            </Chip>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>

            {/* Kind */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">Kind</label>
              <Select value={form.kind} onValueChange={(v) => set('kind', v)}>
                <SelectTrigger
                  aria-label="Kind"
                  className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <label htmlFor="ai-addr1" className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                Address <span className="normal-case text-cc-text-faint">(prints on the COI)</span>
              </label>
              <Input
                id="ai-addr1"
                value={form.address_line1}
                onChange={(e) => set('address_line1', e.target.value)}
                placeholder="Street address"
                className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
              />
              <Input
                aria-label="Address line 2"
                value={form.address_line2}
                onChange={(e) => set('address_line2', e.target.value)}
                placeholder="Suite, unit, floor (optional)"
                className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
              />
              <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                <Input
                  aria-label="City"
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  placeholder="City"
                  className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                />
                <Input
                  aria-label="State"
                  value={form.state}
                  onChange={(e) => set('state', e.target.value)}
                  placeholder="ST"
                  maxLength={2}
                  className="w-16 rounded-cc-md border-cc-border-subtle bg-cc-surface text-center uppercase text-cc-text-primary"
                />
                <Input
                  aria-label="ZIP"
                  value={form.zip_code}
                  onChange={(e) => set('zip_code', e.target.value)}
                  placeholder="ZIP"
                  className="w-24 rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary [font-variant-numeric:tabular-nums]"
                />
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="ai-email" className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                  Email
                </label>
                <Input
                  id="ai-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="name@company.com"
                  className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="ai-phone" className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                  Phone
                </label>
                <Input
                  id="ai-phone"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="555 555 5555"
                  className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary [font-variant-numeric:tabular-nums]"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label htmlFor="ai-notes" className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                Notes <span className="normal-case text-cc-text-faint">(optional)</span>
              </label>
              <Textarea
                id="ai-notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Internal notes about this holder"
                rows={3}
                className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
              />
            </div>

            {/* Requirements (edit mode only): the holder's compliance profile. */}
            {isEdit && (
              <RequirementsSection form={reqForm} onChange={setReqForm} loading={reqLoading} />
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-cc-border-subtle p-6">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              Cancel
            </Button>

            <div className="flex items-center gap-2">
              {/* Create-anyway stays available while a match is selected. */}
              {!isEdit && selectedMatch && (
                <Button
                  variant="ghost"
                  disabled={saving || !nameEntered || reqLoading}
                  onClick={() => {
                    setSelectedMatch(null);
                    handleCreate();
                  }}
                  className="rounded-cc-md text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                >
                  Create new anyway
                </Button>
              )}

              <Button
                data-primary
                disabled={
                  isEdit
                    ? saving || !nameEntered
                    : selectedMatch
                      ? saving
                      : primaryDisabled
                }
                onClick={
                  isEdit ? handleUpdate : selectedMatch ? handleUseSelected : handleCreate
                }
                className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isEdit ? 'Save changes' : selectedMatch ? 'Use selected' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
