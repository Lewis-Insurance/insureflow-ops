/**
 * New Lead. One page, not a wizard.
 *
 * It opens as a name box and grows downward as the office types. A name alone is a
 * legitimate save, because the alternative is the note on the back of an envelope that
 * never reaches the system at all. Everything else on this page exists so the next
 * person to pick the file up does not have to phone the client back.
 *
 * Save does three things in order:
 *   1. inserts the lead
 *   2. writes the per line detail (home, auto, commercial have real tables; the lighter
 *      lines land in lead_line_details as jsonb)
 *   3. starts the pipeline item and opens it
 *
 * Step 1 is the one that must not be lost. If a detail write fails the page says so and
 * still starts the item, and if the item start fails the lead id is held so a retry does
 * not create a second prospect.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { SectionLabel, Skeleton } from '@/components/cc';
import { WhoSection, EMPTY_WHO, whoPrimaryName, splitPersonName, type WhoValue } from '@/components/leadIntake/WhoSection';
import { LineChips } from '@/components/leadIntake/LineChips';
import { LineSection } from '@/components/leadIntake/LineSection';
import { DuplicateHint } from '@/components/leadIntake/DuplicateHint';
import type { FieldValue, LineValues } from '@/components/leadIntake/LineFieldInput';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';
import { useIntakeV4Enabled } from '@/hooks/useFeatureFlag';
import { useStartPipelineItem } from '@/hooks/usePipeline';
import { logger } from '@/lib/logger';
import { LINE_CONFIGS, lineLabel, type LineKey } from '@/config/intake/lineConfig';

type LineGroups = Record<string, LineValues[]>;

// ---------------------------------------------------------------------------
// Value helpers. The form holds strings; the database wants numbers and nulls.
// ---------------------------------------------------------------------------

function str(value: FieldValue | undefined): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value.trim() : '';
}

function text(value: FieldValue | undefined): string | null {
  const s = str(value);
  return s === '' ? null : s;
}

function num(value: FieldValue | undefined): number | null {
  const s = str(value).replace(/[^0-9.]/g, '');
  if (s === '') return null;
  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: FieldValue | undefined): boolean {
  return value === true;
}

/** Drop blanks so the jsonb payload holds answers, not a map of empty strings. */
function compactDetails(values: LineValues): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'boolean') {
      if (value) out[key] = true;
      continue;
    }
    const s = str(value);
    if (s !== '') out[key] = s;
  }
  return out;
}

/**
 * Seed the fields the line configuration says can be prefilled. The Who section only
 * collects a town, so that is what an address style field starts from. It is a head
 * start on typing, never a claim that the address is complete.
 */
function seedLineValues(line: LineKey, town: string): LineValues {
  const seeded: LineValues = {};
  const trimmed = town.trim();
  if (!trimmed) return seeded;
  for (const field of LINE_CONFIGS[line]?.fields ?? []) {
    if (field.prefillFrom) seeded[field.key] = trimmed;
  }
  return seeded;
}

/** Auto opens with one empty vehicle and one empty driver, so the cards are visible. */
function seedLineGroups(line: LineKey): LineGroups {
  const groups: LineGroups = {};
  for (const group of LINE_CONFIGS[line]?.groups ?? []) {
    groups[group.key] = [{}];
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewLeadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeAgency } = useActiveAgency();
  const flag = useIntakeV4Enabled();
  const startItem = useStartPipelineItem();

  const [who, setWho] = useState<WhoValue>(EMPTY_WHO);
  const [acknowledged, setAcknowledged] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [lines, setLines] = useState<LineKey[]>([]);
  const [lineValues, setLineValues] = useState<Partial<Record<LineKey, LineValues>>>({});
  const [lineGroups, setLineGroups] = useState<Partial<Record<LineKey, LineGroups>>>({});
  const [saving, setSaving] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  /** Held so a retry after a failed pipeline start never creates a second prospect. */
  const savedLeadIdRef = useRef<string | null>(null);

  const primaryName = whoPrimaryName(who);

  const patchWho = useCallback((patch: Partial<WhoValue>) => {
    setWho((prev) => ({ ...prev, ...patch }));
    if (patch.name !== undefined || patch.businessName !== undefined || patch.mode !== undefined) {
      setNameError(false);
      setAcknowledged(false);
    }
  }, []);

  const toggleLine = useCallback(
    (line: LineKey) => {
      setLines((prev) => (prev.includes(line) ? prev.filter((l) => l !== line) : [...prev, line]));
      setLineValues((prev) => (prev[line] ? prev : { ...prev, [line]: seedLineValues(line, who.town) }));
      setLineGroups((prev) => (prev[line] ? prev : { ...prev, [line]: seedLineGroups(line) }));
    },
    [who.town],
  );

  const setLineValue = useCallback((line: LineKey, key: string, value: FieldValue) => {
    setLineValues((prev) => ({ ...prev, [line]: { ...(prev[line] ?? {}), [key]: value } }));
  }, []);

  const setLineGroup = useCallback((line: LineKey, groupKey: string, rows: LineValues[]) => {
    setLineGroups((prev) => ({ ...prev, [line]: { ...(prev[line] ?? {}), [groupKey]: rows } }));
  }, []);

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  const writeLineDetails = useCallback(
    async (leadId: string): Promise<string[]> => {
      const failures: string[] = [];
      const jsonRows: Record<string, unknown>[] = [];

      for (const line of lines) {
        const config = LINE_CONFIGS[line];
        if (!config) continue;
        const values = lineValues[line] ?? {};
        const groups = lineGroups[line] ?? {};

        try {
          if (config.storage === 'lead_home_insurance') {
            // roof_year is newer than the generated types, so the write is cast.
            const { error } = await (supabase as any).from('lead_home_insurance').insert({
              lead_id: leadId,
              property_address: text(values.property_address),
              year_built: num(values.year_built),
              roof_year: num(values.roof_year),
              construction_type: text(values.construction_type),
              square_footage: num(values.square_footage),
              dwelling_coverage: num(values.dwelling_coverage),
              current_carrier: text(values.current_carrier),
              claims_last_5_years: num(values.claims_last_5_years),
              claim_details: text(values.claim_details),
            });
            if (error) throw error;
          } else if (config.storage === 'lead_auto') {
            // lead_auto_vehicles has year, make and model NOT NULL. A half filled card
            // is dropped rather than failing the whole save; the section already told
            // the user it would not save.
            const vehicles = (groups.vehicles ?? [])
              .filter((row) => str(row.year) !== '' && str(row.make) !== '' && str(row.model) !== '')
              .map((row) => ({
                lead_id: leadId,
                year: num(row.year),
                make: str(row.make),
                model: str(row.model),
                vin: text(row.vin),
              }));

            const drivers = (groups.drivers ?? [])
              .filter((row) => Object.values(row).some((value) => str(value) !== ''))
              .map((row) => ({
                lead_id: leadId,
                first_name: str(row.first_name),
                last_name: str(row.last_name),
                date_of_birth: text(row.date_of_birth),
                license_state: text(row.license_state),
              }));

            if (vehicles.length > 0) {
              const { error } = await (supabase as any).from('lead_auto_vehicles').insert(vehicles);
              if (error) throw error;
            }
            if (drivers.length > 0) {
              const { error } = await (supabase as any).from('lead_auto_drivers').insert(drivers);
              if (error) throw error;
            }
          } else if (config.storage === 'lead_commercial_insurance') {
            const { error } = await (supabase as any).from('lead_commercial_insurance').insert({
              lead_id: leadId,
              business_name: who.mode === 'commercial' ? who.businessName.trim() || null : null,
              business_type: text(values.business_type),
              years_in_business: num(values.years_in_business),
              number_of_employees: num(values.number_of_employees),
              payroll_amount: num(values.payroll_amount),
              annual_revenue: num(values.annual_revenue),
              current_carrier: text(values.current_carrier),
              general_liability: bool(values.general_liability),
              property_coverage: bool(values.property_coverage),
              workers_comp: bool(values.workers_comp),
              commercial_auto: bool(values.commercial_auto),
              business_description: text(values.business_description),
            });
            if (error) throw error;
          } else {
            jsonRows.push({
              lead_id: leadId,
              line,
              details: compactDetails(values),
              created_by: user?.id ?? null,
            });
          }
        } catch (error) {
          logger.error('Line detail write failed', { line, error });
          failures.push(lineLabel(line));
        }
      }

      if (jsonRows.length > 0) {
        const { error } = await (supabase as any).from('lead_line_details').insert(jsonRows);
        if (error) {
          logger.error('lead_line_details write failed', error);
          failures.push(...jsonRows.map((row) => lineLabel(String(row.line))));
        }
      }

      return failures;
    },
    [lines, lineValues, lineGroups, who.mode, who.businessName, user?.id],
  );

  const handleSave = useCallback(async () => {
    if (saving) return;

    const workspaceId = activeAgency?.agency_workspace_id;
    if (!workspaceId) {
      toast.error('No agency is active on this session, so nothing can be saved yet.');
      return;
    }

    if (!primaryName) {
      setNameError(true);
      nameInputRef.current?.focus();
      toast.error('A name is all this page needs, but it does need one.');
      return;
    }

    setSaving(true);
    try {
      let leadId = savedLeadIdRef.current;

      if (!leadId) {
        const isCommercial = who.mode === 'commercial';
        const person = splitPersonName(isCommercial ? who.contactName : who.name);
        const autoValues: LineValues = lines.includes('auto') ? lineValues.auto ?? {} : {};

        const { data, error } = await supabase
          .from('leads')
          .insert({
            agency_workspace_id: workspaceId,
            created_by: user?.id ?? null,
            assigned_to: user?.id ?? null,
            status: 'new',
            // Both name columns are NOT NULL, so a missing half is an empty string.
            first_name: person.first,
            last_name: person.last,
            company_name: isCommercial ? who.businessName.trim() || null : null,
            phone: who.phone.trim() || null,
            email: who.email.trim() || null,
            city: who.town.trim() || null,
            lead_source: who.source || null,
            insurance_types: lines,
            // Auto's two scalar answers live on the lead itself; the auto tables only
            // hold vehicles and drivers.
            current_carrier: text(autoValues.current_carrier),
            current_premium: num(autoValues.current_premium),
          })
          .select('id')
          .single();

        if (error || !data) {
          throw new Error(error?.message ?? 'The prospect could not be saved.');
        }

        leadId = data.id;
        savedLeadIdRef.current = leadId;

        const failures = await writeLineDetails(leadId);
        if (failures.length > 0) {
          toast.warning(
            `Saved the prospect, but the detail for ${failures.join(', ')} did not save. Add it on the item.`,
          );
        }
      }

      const result = await startItem.mutateAsync({
        kind: 'new_business',
        leadId,
        lines,
        assignSelf: true,
      });

      navigate(`/pipeline?item=${result.item_id}`);
    } catch (error) {
      logger.error('New lead save failed', error);
      const message = error instanceof Error ? error.message : 'That did not save.';
      // useStartPipelineItem already toasts its own failure, so only the lead insert
      // needs a message here.
      if (!savedLeadIdRef.current) toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    activeAgency?.agency_workspace_id,
    primaryName,
    who,
    lines,
    lineValues,
    user?.id,
    writeLineDetails,
    startItem,
    navigate,
  ]);

  // Escape clears focus. Cmd or Ctrl and Enter saves from anywhere on the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  const chosenLines = useMemo(() => lines.filter((line) => !!LINE_CONFIGS[line]), [lines]);

  // -------------------------------------------------------------------------
  // Gate
  // -------------------------------------------------------------------------

  if (flag.isLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <Skeleton className="h-4 w-28 rounded-cc-sm" />
          <Skeleton className="mt-4 h-7 w-48 rounded-cc-md" />
          <div className="mt-6 space-y-4 rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-6">
            <Skeleton className="h-9 w-44 rounded-cc-md" />
            <Skeleton className="h-16 w-full rounded-cc-md" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-16 w-full rounded-cc-md" />
              <Skeleton className="h-16 w-full rounded-cc-md" />
              <Skeleton className="h-16 w-full rounded-cc-md" />
              <Skeleton className="h-16 w-full rounded-cc-md" />
            </div>
          </div>
          <div className="mt-6 space-y-4 rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-6">
            <Skeleton className="h-4 w-32 rounded-cc-sm" />
            <Skeleton className="h-9 w-full rounded-pill" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!flag.enabled) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-8 text-center shadow-card">
            <Lock className="mx-auto h-6 w-6 text-cc-text-muted" aria-hidden="true" />
            <h1 className="mt-3 text-lg font-semibold text-cc-text-primary">
              This is not switched on yet
            </h1>
            <p className="mt-2 text-sm text-cc-text-secondary">
              New intake is still in the pilot. Ask for it to be turned on for your account and this
              page will open.
            </p>
            <Button
              asChild
              variant="outline"
              className="mt-6 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              <Link to="/pipeline">Back to the pipeline</Link>
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // -------------------------------------------------------------------------
  // Form
  // -------------------------------------------------------------------------

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link
          to="/pipeline"
          className="inline-flex items-center gap-1.5 text-sm text-cc-text-muted transition-colors hover:text-cc-text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Pipeline
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-cc-text-primary">New lead</h1>
        <p className="mt-1 text-sm text-cc-text-secondary">
          A name is enough to save. Add what you have and the page grows to match.
        </p>

        <form
          className="mt-6 space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
          onKeyDown={(event) => {
            // A plain Enter inside a single line field must not save the page out from
            // under someone mid sentence. Cmd or Ctrl and Enter is the deliberate save,
            // and it is handled on the window so it works from anywhere.
            if (event.key !== 'Enter' || event.metaKey || event.ctrlKey) return;
            if ((event.target as HTMLElement | null)?.tagName === 'INPUT') {
              event.preventDefault();
            }
          }}
        >
          <WhoSection
            value={who}
            onChange={patchWho}
            nameError={nameError}
            nameInputRef={nameInputRef}
            nameHint={
              <DuplicateHint
                name={primaryName}
                acknowledged={acknowledged}
                onAcknowledgedChange={setAcknowledged}
              />
            }
          />

          <section
            aria-labelledby="lines-heading"
            className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card sm:p-6"
          >
            <SectionLabel>What they need</SectionLabel>
            <h2 id="lines-heading" className="mt-1 text-base font-semibold text-cc-text-primary">
              What are we quoting
            </h2>
            <p className="mt-1 text-sm text-cc-text-secondary">
              Pick every line they asked about. Each one opens its own questions below.
            </p>
            <div className="mt-4">
              <LineChips selected={lines} onToggle={toggleLine} />
            </div>
          </section>

          {chosenLines.map((line) => (
            <LineSection
              key={line}
              line={line}
              values={lineValues[line] ?? {}}
              onValueChange={(key, value) => setLineValue(line, key, value)}
              groups={lineGroups[line] ?? {}}
              onGroupChange={(groupKey, rows) => setLineGroup(line, groupKey, rows)}
              onRemove={() => toggleLine(line)}
            />
          ))}

          <div className="sticky bottom-0 -mx-4 border-t border-cc-border-subtle bg-cc-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/pipeline')}
                className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-primary
                disabled={saving}
                className="btn-primary gap-2 rounded-cc-md bg-cc-accent font-semibold text-cc-on-accent hover:bg-cc-accent-hover"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {saving ? 'Saving' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
