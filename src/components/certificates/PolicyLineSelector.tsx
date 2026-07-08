// PolicyLineSelector (blueprint D Section 3.2 / 3.3, doc 06 Section 4.5) - LOAD-BEARING.
//
// One uniform row per PRESENT coverage line from get_master_coi. A readiness
// blocker targeting a line DISABLES its checkbox and shows the blocker's canonical
// message (R6); the server 422s those lines anyway, so disabling prevents the
// failure. Each CHECKED line grows the two E&O toggles (ADDL INSD, SUBR WVD).
// useHolderEndorsementStatus DEFAULTS them ON when the policy is endorsed and OFF
// otherwise, but they are always selectable once a holder is chosen: staff may
// manually set Y whatever the policy shows, with a standing warning when nothing
// backs it. Checked rows use AccentSpine active (a 2px lime LEFT BORDER, legal
// under the one-lime-fill budget).
//
// Calm Command: cc-* tokens both themes, StatusPill (shared vocabulary), Chip for
// carrier, cc-num tabular figures on policy number / date, no em or en dashes.

import { AlertTriangle, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AccentSpine, Chip, SectionLabel, StatusPill } from '@/components/cc';
import { lineLabel } from '@/components/master-coi/lineDisplay';
import type { MasterCOI, COILineKey, COILineBase } from '@/types/master-coi';
import type { HolderEndorsementStatusMap } from '@/hooks/useHolderEndorsementStatus';

/** The five ACORD certificate lines, in form order. */
export type CertLineKey = Exclude<COILineKey, 'other'>;
const LINE_ORDER: CertLineKey[] = ['gl', 'auto', 'umbrella', 'wc', 'property'];

/** WC has no ADDL INSD column on the ACORD 25. */
const LINES_WITHOUT_ADDL: ReadonlySet<CertLineKey> = new Set(['wc']);

interface PerLineIntent {
  addlInsd: boolean;
  subrWvd: boolean;
}

interface PolicyLineSelectorProps {
  masterCoi: MasterCOI;
  selectedLineKeys: CertLineKey[];
  perLine: Partial<Record<CertLineKey, PerLineIntent>>;
  /** From useHolderEndorsementStatus; undefined until a holder is chosen and it resolves. */
  endorsementByLine: HolderEndorsementStatusMap | undefined;
  holderChosen: boolean;
  onToggleLine: (lineKey: CertLineKey, checked: boolean) => void;
  onTogglePerLine: (lineKey: CertLineKey, key: 'addlInsd' | 'subrWvd', value: boolean) => void;
  accountId: string;
}

/** A blocker's canonical message for a line, or null when the line is unblocked. */
function lineBlockerMessage(masterCoi: MasterCOI, lineKey: CertLineKey): string | null {
  const blocker = masterCoi.readiness.blockers.find(
    (b) => b.line === lineKey &&
      (b.code === 'limit_missing' ||
        b.code === 'policy_core_missing' ||
        b.code === 'insurer_unresolved' ||
        b.code === 'policy_expired'),
  );
  return blocker ? blocker.message : null;
}

/** The insurer letter for a line from the authoritative letter map (R7). */
function letterForLine(masterCoi: MasterCOI, lineKey: CertLineKey): string | null {
  const ins = masterCoi.insurers.find((i) => i.lines.includes(lineKey));
  return ins ? ins.letter : null;
}

/** Carrier display name for a line from the letter map. */
function carrierForLine(masterCoi: MasterCOI, lineKey: CertLineKey): string | null {
  const ins = masterCoi.insurers.find((i) => i.lines.includes(lineKey));
  const name = ins?.name.v;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

export function PolicyLineSelector({
  masterCoi,
  selectedLineKeys,
  perLine,
  endorsementByLine,
  holderChosen,
  onToggleLine,
  onTogglePerLine,
  accountId,
}: PolicyLineSelectorProps) {
  const masterCoiLink = `/customers/${accountId}?tab=master-coi`;

  const presentLines = LINE_ORDER.filter(
    (key) => (masterCoi.lines[key] as COILineBase | undefined)?.present,
  );

  const noLinesBlocker = masterCoi.readiness.blockers.some((b) => b.code === 'no_lines');

  // Empty: no policies on file for any certificate line.
  if (presentLines.length === 0 || noLinesBlocker) {
    return (
      <div className="space-y-2">
        <SectionLabel>Coverage lines</SectionLabel>
        <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-4">
          <p className="text-sm text-cc-text-secondary">
            This customer has no policies on file. Add one from the customer record first.
          </p>
          <Link
            to={`/customers/${accountId}?tab=policies`}
            className="mt-3 inline-flex items-center rounded-cc-md border border-cc-border-interactive bg-cc-surface px-3 py-1.5 text-sm text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            Open customer record
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SectionLabel>Coverage lines</SectionLabel>
      <div className="space-y-2">
        {presentLines.map((lineKey) => {
          const line = masterCoi.lines[lineKey] as COILineBase;
          const checked = selectedLineKeys.includes(lineKey);
          const blockerMessage = lineBlockerMessage(masterCoi, lineKey);
          const disabled = blockerMessage !== null;
          const letter = letterForLine(masterCoi, lineKey);
          const carrier = carrierForLine(masterCoi, lineKey);
          const policyNumber =
            typeof line.policy_number.v === 'string' ? line.policy_number.v : '';
          const expDate = formatDisplayDate(
            typeof line.expiration_date.v === 'string' ? line.expiration_date.v : null,
          );
          const noteId = disabled ? `line-blocker-${lineKey}` : undefined;

          return (
            <AccentSpine
              key={lineKey}
              active={checked}
              id={`cert-line-${lineKey}`}
              className="min-h-[48px] p-3"
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`cert-line-check-${lineKey}`}
                  checked={checked}
                  disabled={disabled}
                  aria-describedby={noteId}
                  onCheckedChange={(v) => onToggleLine(lineKey, v === true)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <Label
                    htmlFor={`cert-line-check-${lineKey}`}
                    className={`block cursor-pointer text-sm font-semibold ${
                      disabled ? 'text-cc-text-muted' : 'text-cc-text-primary'
                    }`}
                  >
                    {lineLabel(lineKey)}
                  </Label>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-cc-text-muted">
                    {letter && (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-cc-sm bg-cc-surface-overlay text-[11px] font-semibold text-cc-text-secondary">
                        {letter}
                      </span>
                    )}
                    {carrier && <Chip>{carrier}</Chip>}
                    {policyNumber && (
                      <span className="cc-num font-mono [font-variant-numeric:tabular-nums]">
                        {policyNumber}
                      </span>
                    )}
                    {expDate && (
                      <span className="cc-num [font-variant-numeric:tabular-nums]">
                        Exp {expDate}
                      </span>
                    )}
                    <StatusPill status={line.status} />
                  </div>

                  {disabled && (
                    <div
                      id={noteId}
                      className="mt-2 flex items-start gap-2 rounded-cc-sm bg-cc-surface-overlay px-2.5 py-2 text-xs text-cc-warning"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="text-cc-text-secondary">
                        {blockerMessage}{' '}
                        <Link
                          to={masterCoiLink}
                          className="underline underline-offset-2 hover:text-cc-text-primary"
                        >
                          Open Master COI
                        </Link>
                      </span>
                    </div>
                  )}

                  {checked && !disabled && (
                    <LineEndorsementToggles
                      lineKey={lineKey}
                      perLine={perLine[lineKey]}
                      status={endorsementByLine?.[lineKey]}
                      holderChosen={holderChosen}
                      accountId={accountId}
                      onTogglePerLine={onTogglePerLine}
                    />
                  )}
                </div>
              </div>
            </AccentSpine>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The two per-line E&O toggles (blueprint D Section 3.3, R3).
// ---------------------------------------------------------------------------

function LineEndorsementToggles({
  lineKey,
  perLine,
  status,
  holderChosen,
  accountId,
  onTogglePerLine,
}: {
  lineKey: CertLineKey;
  perLine: PerLineIntent | undefined;
  status:
    | { addl_insd_resolved: string; subr_wvd_resolved: string; basis: string }
    | undefined;
  holderChosen: boolean;
  accountId: string;
  onTogglePerLine: (lineKey: CertLineKey, key: 'addlInsd' | 'subrWvd', value: boolean) => void;
}) {
  const showAddl = !LINES_WITHOUT_ADDL.has(lineKey);

  return (
    <div className="mt-3 space-y-3 border-t border-cc-border-subtle pt-3">
      {showAddl && (
        <EndorsementToggle
          idBase={`addl-${lineKey}`}
          label="Additional insured (ADDL INSD)"
          resolved={status?.addl_insd_resolved}
          basis={status?.basis}
          holderChosen={holderChosen}
          accountId={accountId}
          checked={perLine?.addlInsd ?? false}
          onChange={(value) => onTogglePerLine(lineKey, 'addlInsd', value)}
        />
      )}
      <EndorsementToggle
        idBase={`subr-${lineKey}`}
        label="Waiver of subrogation (SUBR WVD)"
        resolved={status?.subr_wvd_resolved}
        basis={status?.basis}
        holderChosen={holderChosen}
        accountId={accountId}
        checked={perLine?.subrWvd ?? false}
        onChange={(value) => onTogglePerLine(lineKey, 'subrWvd', value)}
      />
    </div>
  );
}

function EndorsementToggle({
  idBase,
  label,
  resolved,
  basis,
  holderChosen,
  accountId,
  checked,
  onChange,
}: {
  idBase: string;
  label: string;
  resolved: string | undefined;
  basis: string | undefined;
  holderChosen: boolean;
  accountId: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const masterCoiLink = `/customers/${accountId}?tab=master-coi`;

  // The toggle is holder-specific, so a holder must be chosen. It is NOT locked on
  // the policy endorsement: staff may manually set Y for this certificate whatever
  // the policy record shows (defaults ON when endorsed, OFF otherwise). The note
  // still warns when nothing on the policy backs a manual Y, and 05's builder
  // emits a matching non-blocking advisory into the ValidationStrip (E&O trail).
  const disabled = !holderChosen;
  // A manual Y with no confirmed endorsement behind it: warn on the toggle.
  const manualUnbacked = holderChosen && checked && resolved !== 'endorsed';

  let note: React.ReactNode = null;
  if (!holderChosen) {
    note = <span className="text-cc-text-muted">Pick a certificate holder to enable.</span>;
  } else if (resolved === 'endorsed') {
    note = (
      <span className="text-cc-text-muted">
        Endorsement on file{basis ? ` (${basis})` : ''}.
      </span>
    );
  } else if (resolved === 'requested') {
    note = (
      <span className="inline-flex items-start gap-1.5 text-cc-warning">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="text-cc-text-secondary">
          Endorsement requested but not yet confirmed on the policy.{' '}
          <Link
            to={masterCoiLink}
            className="underline underline-offset-2 hover:text-cc-text-primary"
          >
            Manage in Master COI
          </Link>
        </span>
      </span>
    );
  } else {
    // 'none' or unresolved (holder chosen but no row for this line).
    note = (
      <span
        className={`inline-flex items-start gap-1.5 ${manualUnbacked ? 'text-cc-warning' : 'text-cc-text-muted'}`}
      >
        {manualUnbacked ? (
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        )}
        <span className="text-cc-text-secondary">
          No endorsement on this line covers this holder.{' '}
          <Link
            to={masterCoiLink}
            className="underline underline-offset-2 hover:text-cc-text-primary"
          >
            Manage in Master COI
          </Link>
        </span>
      </span>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={idBase} className="text-sm text-cc-text-primary">
          {label}
        </Label>
        <p className="mt-0.5 text-xs">{note}</p>
      </div>
      <Switch
        id={idBase}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v)}
        aria-label={label}
      />
    </div>
  );
}
