import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/cc';
import { CustomerPickerEmptyState } from '@/components/certificates/CustomerPickerEmptyState';
import { PolicyLineSelector, type CertLineKey } from '@/components/certificates/PolicyLineSelector';
import { HolderField } from '@/components/certificates/HolderField';
import { fetchHolderById, composePrintedOperations, type SelectedHolder } from '@/components/certificates/holderUtils';
import { OperationsAndRemarksFields } from '@/components/certificates/OperationsAndRemarksFields';
import { ValidationStrip, type ValidationIssue } from '@/components/certificates/ValidationStrip';
import { ComplianceStrip } from '@/components/certificates/ComplianceStrip';
import { CertificatePreview } from '@/components/certificates/CertificatePreview';
import { useMasterCoi } from '@/hooks/useMasterCoi';
import { useHolderEndorsementStatus } from '@/hooks/useHolderEndorsementStatus';
import { useHolderRequirements } from '@/hooks/useHolderRequirements';
import { evaluateHolderRequirements } from '@/lib/acord/acord25/requirements';
import { useCertificatePreview } from '@/hooks/useCertificatePreview';
import { toAcord25BuildInput } from '@/lib/acord/acord25/fromMasterCoi';
import { buildAcord25FieldValues } from '@/lib/acord/acord25/buildAcord25FieldValues';
import { ACORD25_DATE_COLUMN_FIELDS, ACORD25_SIGNATURE_FIELDS } from '@/lib/acord/acord25/fieldMap';
import { validateAcord25 } from '@/lib/acord/acord25/validateAcord25';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { MasterCOI, COILineBase, HolderEndorsementResolution } from '@/types/master-coi';
import type { Acord25TemplateInfo, BuildAcord25Result } from '@/lib/acord/acord25/types';
import type { HolderEndorsementStatusMap } from '@/hooks/useHolderEndorsementStatus';

/**
 * Certificates generator (ACORD 25 Certificate of Liability Insurance), Phase 5
 * golden path. Left column = source-data selector (coverage lines with the E&O
 * toggle gate, holder, operations/remarks, validation); right column = live
 * client-fill preview; below = the issuance log with reissue hydration.
 *
 * Calm Command: cc-* tokens (light + dark), exactly ONE lime fill (the Generate
 * button), tabular figures, content-shaped skeletons, no em or en dashes.
 */

// ---------------------------------------------------------------------------
// Local reducer state (blueprint D Section 8) - no form library.
// ---------------------------------------------------------------------------

type LineKey = CertLineKey;
const CERT_LINES: LineKey[] = ['gl', 'auto', 'umbrella', 'wc', 'property'];

interface PerLineIntent {
  addlInsd: boolean;
  subrWvd: boolean;
}

interface CertGenState {
  accountId: string | null;
  selectedLineKeys: LineKey[];
  perLine: Partial<Record<LineKey, PerLineIntent>>;
  holder: SelectedHolder | null;
  descriptionOfOperations: string;
  remarks: string;
  supersedesCertificateId: string | null;
}

type Action =
  | { type: 'setAccount'; accountId: string }
  | { type: 'toggleLine'; lineKey: LineKey; checked: boolean }
  | { type: 'setPerLine'; lineKey: LineKey; key: 'addlInsd' | 'subrWvd'; value: boolean }
  | { type: 'setHolder'; holder: SelectedHolder | null }
  | { type: 'applyEndorsementDefaults'; byLine: Partial<Record<LineKey, PerLineIntent>> }
  | { type: 'setDescriptionOfOperations'; value: string }
  | { type: 'setRemarks'; value: string }
  | { type: 'hydrateFromSnapshot'; state: Partial<CertGenState> };

function initialState(accountId: string | null): CertGenState {
  return {
    accountId,
    selectedLineKeys: [],
    perLine: {},
    holder: null,
    descriptionOfOperations: '',
    remarks: '',
    supersedesCertificateId: null,
  };
}

function reducer(state: CertGenState, action: Action): CertGenState {
  switch (action.type) {
    case 'setAccount':
      return initialState(action.accountId);
    case 'toggleLine': {
      if (action.checked) {
        if (state.selectedLineKeys.includes(action.lineKey)) return state;
        return {
          ...state,
          selectedLineKeys: [...state.selectedLineKeys, action.lineKey],
          // A newly checked line defaults to N until the holder resolution applies.
          perLine: { ...state.perLine, [action.lineKey]: { addlInsd: false, subrWvd: false } },
        };
      }
      // Unchecking DELETES the perLine entry (reducer invariant).
      const nextPerLine = { ...state.perLine };
      delete nextPerLine[action.lineKey];
      return {
        ...state,
        selectedLineKeys: state.selectedLineKeys.filter((k) => k !== action.lineKey),
        perLine: nextPerLine,
      };
    }
    case 'setPerLine': {
      const current = state.perLine[action.lineKey] ?? { addlInsd: false, subrWvd: false };
      return {
        ...state,
        perLine: {
          ...state.perLine,
          [action.lineKey]: { ...current, [action.key]: action.value },
        },
      };
    }
    case 'setHolder':
      // Changing the holder CLEARS perLine (locked N until resolution returns).
      return {
        ...state,
        holder: action.holder,
        perLine: state.selectedLineKeys.reduce<Partial<Record<LineKey, PerLineIntent>>>(
          (acc, key) => {
            acc[key] = { addlInsd: false, subrWvd: false };
            return acc;
          },
          {},
        ),
      };
    case 'applyEndorsementDefaults':
      // Only touch currently-selected lines; the query result seeds the R3 defaults.
      return {
        ...state,
        perLine: state.selectedLineKeys.reduce<Partial<Record<LineKey, PerLineIntent>>>(
          (acc, key) => {
            acc[key] = action.byLine[key] ?? { addlInsd: false, subrWvd: false };
            return acc;
          },
          {},
        ),
      };
    case 'setDescriptionOfOperations':
      return { ...state, descriptionOfOperations: action.value };
    case 'setRemarks':
      return { ...state, remarks: action.value };
    case 'hydrateFromSnapshot':
      return { ...state, ...action.state };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Template fetch helpers (react-query keys per blueprint D Section 8).
// ---------------------------------------------------------------------------

interface AcordTemplateRow {
  id: string;
  version: string;
  pdf_template_url: string;
  field_inventory: Acord25TemplateInfo['field_inventory'];
}

function useAcord25Template() {
  return useQuery({
    queryKey: ['acord-template', '25', 'current'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AcordTemplateRow | null> => {
      const { data, error } = await supabase
        .from('acord_templates')
        .select('id, version, pdf_template_url, field_inventory')
        .eq('form_number', '25')
        .eq('is_current', true)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as AcordTemplateRow | null) ?? null;
    },
  });
}

function useAcord25TemplateBytes(template: AcordTemplateRow | null | undefined) {
  return useQuery({
    queryKey: ['acord-template-bytes', template?.id],
    enabled: !!template?.pdf_template_url,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<ArrayBuffer> => {
      const res = await fetch(template!.pdf_template_url);
      if (!res.ok) throw new Error('Could not fetch the ACORD 25 template.');
      return res.arrayBuffer();
    },
  });
}

// ---------------------------------------------------------------------------
// Small utilities.
// ---------------------------------------------------------------------------

/** Today as 'YYYY-MM-DD' in local time (no timezone drift for the printed date). */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function cellStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** The five present certificate lines from the read model. */
function presentLineKeys(masterCoi: MasterCOI | undefined): LineKey[] {
  if (!masterCoi) return [];
  return CERT_LINES.filter((k) => (masterCoi.lines[k] as COILineBase | undefined)?.present);
}

/** policy_id for each selected present line (for resolve_holder_endorsements). */
function selectedPolicyIds(masterCoi: MasterCOI | undefined, selected: LineKey[]): string[] {
  if (!masterCoi) return [];
  const ids: string[] = [];
  for (const key of selected) {
    const line = masterCoi.lines[key] as COILineBase | undefined;
    if (line?.policy_id) ids.push(line.policy_id);
  }
  return Array.from(new Set(ids));
}


/** Convert the endorsement-status map to the array shape fromMasterCoi expects. */
function toResolutionArray(
  map: HolderEndorsementStatusMap | undefined,
): HolderEndorsementResolution[] | null {
  if (!map) return null;
  return (Object.keys(map) as LineKey[]).map((line_key) => {
    const row = map[line_key]!;
    return {
      line_key,
      addl_insd_resolved: row.addl_insd_resolved,
      subr_wvd_resolved: row.subr_wvd_resolved,
      basis: row.basis,
    };
  });
}

/** Strip path separators and OS-illegal characters so a name is safe in a filename. */
function safeFilePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Download an already-built PDF (the client-side preview blob) to the user's
 * machine. The Certificates page fills the completed ACORD 25 in the browser for
 * the live preview; "Download certificate" simply saves that same file. No server
 * issuance, no stored record: the button's only outcome is the downloaded PDF.
 */
function downloadPdfBlob(blobUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------------------------------------------------------------------------
// Page.
// ---------------------------------------------------------------------------

export default function Certificates() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1400px] space-y-6 p-6">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold text-cc-text-primary">Certificates</h1>
            <p className="text-cc-text-muted">ACORD 25 Certificate of Liability Insurance</p>
          </header>
          <CustomerPickerEmptyState />
        </div>
      </AppLayout>
    );
  }

  return <CertificateGenerator accountId={accountId} navigateBack={() => navigate(`/customers/${accountId}`)} />;
}

function CertificateGenerator({
  accountId,
  navigateBack,
}: {
  accountId: string;
  navigateBack: () => void;
}) {
  const [searchParams] = useSearchParams();
  const preselectPolicyId = searchParams.get('policyId');
  const preselectHolderId = searchParams.get('holderId');

  const [state, dispatch] = useReducer(reducer, accountId, initialState);

  // -----------------------------------------------------------------------
  // Data.
  // -----------------------------------------------------------------------
  const masterCoiQuery = useMasterCoi(accountId);
  const masterCoi = masterCoiQuery.data;

  const templateQuery = useAcord25Template();
  const template = templateQuery.data;
  const templateBytesQuery = useAcord25TemplateBytes(template);
  const templateBytes = templateBytesQuery.data;

  const [accountName, setAccountName] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setAccountName(null);
    (async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('name')
        .eq('id', accountId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        logger.warn('certificates: account name lookup failed', error);
        return;
      }
      setAccountName((data?.name as string | undefined) ?? null);
    })();
    return () => {
      active = false;
    };
  }, [accountId]);

  // Seed the description of operations once. Remarks are no longer a separate
  // field; any account default remarks are folded onto the BACK of the
  // description (the same box they printed into), matching 05's composition rule.
  const seededDooRef = useRef(false);
  useEffect(() => {
    if (seededDooRef.current || !masterCoi) return;
    seededDooRef.current = true;
    let active = true;
    (async () => {
      const doo = cellStr(masterCoi.description_of_operations?.v);
      let defaultRemarks = '';
      // No account_coi_profiles reader exists in the repo (repo-vs-spec drift, see
      // return notes); read default_remarks directly. The table is not in the
      // generated types, so the .from() target is cast like useMasterCoi's saver.
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('account_coi_profiles' as any)
        .select('default_remarks')
        .eq('account_id', accountId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        logger.warn('certificates: default remarks lookup failed', error);
      } else {
        defaultRemarks =
          (data as unknown as { default_remarks: string | null } | null)?.default_remarks ?? '';
      }
      const seed = composePrintedOperations(doo, defaultRemarks);
      if (seed) dispatch({ type: 'setDescriptionOfOperations', value: seed });
    })();
    return () => {
      active = false;
    };
  }, [masterCoi, accountId]);

  // Preselect a coverage line from ?policyId= (once master COI resolves), if unblocked.
  const preselectedPolicyRef = useRef(false);
  useEffect(() => {
    if (preselectedPolicyRef.current || !masterCoi || !preselectPolicyId) return;
    for (const key of presentLineKeys(masterCoi)) {
      const line = masterCoi.lines[key] as COILineBase;
      const blocked = masterCoi.readiness.blockers.some(
        (b) => b.line === key &&
          (b.code === 'limit_missing' ||
            b.code === 'policy_core_missing' ||
            b.code === 'insurer_unresolved' ||
            b.code === 'policy_expired'),
      );
      if (line.policy_id === preselectPolicyId && !blocked) {
        dispatch({ type: 'toggleLine', lineKey: key, checked: true });
        break;
      }
    }
    preselectedPolicyRef.current = true;
  }, [masterCoi, preselectPolicyId]);

  // Preselect the holder from ?holderId= once, fetching the full row.
  const preselectedHolderRef = useRef(false);
  useEffect(() => {
    if (preselectedHolderRef.current || !preselectHolderId) return;
    preselectedHolderRef.current = true;
    void (async () => {
      const holder = await fetchHolderById(preselectHolderId);
      if (holder) dispatch({ type: 'setHolder', holder });
    })();
  }, [preselectHolderId]);

  // -----------------------------------------------------------------------
  // Endorsement resolution (R2) + the R3 default/reset.
  // -----------------------------------------------------------------------
  const policyIds = useMemo(
    () => selectedPolicyIds(masterCoi, state.selectedLineKeys),
    [masterCoi, state.selectedLineKeys],
  );
  const endorsementQuery = useHolderEndorsementStatus({
    accountId,
    holderId: state.holder?.id ?? null,
    policyIds,
  });
  const endorsementByLine = endorsementQuery.data;

  // Whenever fresh resolution returns, apply the R3 defaults (ON where endorsed).
  const lastResolutionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!endorsementByLine || !state.holder) return;
    const resolutionKey = JSON.stringify({
      holder: state.holder.id,
      lines: [...state.selectedLineKeys].sort(),
      map: endorsementByLine,
    });
    if (lastResolutionKeyRef.current === resolutionKey) return;
    lastResolutionKeyRef.current = resolutionKey;

    const byLine: Partial<Record<LineKey, PerLineIntent>> = {};
    for (const key of state.selectedLineKeys) {
      const row = endorsementByLine[key];
      byLine[key] = {
        addlInsd: row?.addl_insd_resolved === 'endorsed',
        subrWvd: row?.subr_wvd_resolved === 'endorsed',
      };
    }
    dispatch({ type: 'applyEndorsementDefaults', byLine });
  }, [endorsementByLine, state.holder, state.selectedLineKeys]);

  // -----------------------------------------------------------------------
  // Holder requirements evaluation (07 §4.4): advisory compliance strip.
  // Fetch the picked holder's requirements profile, then run the SAME shared
  // pure evaluation the server re-runs, against the selected lines' master COI
  // values and the holder-resolved endorsement rows. Failures never disable
  // Generate; they only surface the strip + the confirm dialog below.
  // -----------------------------------------------------------------------
  const requirementsQuery = useHolderRequirements(state.holder?.id ?? null);
  const holderRequirements = requirementsQuery.data?.requirements ?? null;

  const requirementsEvaluation = useMemo(() => {
    if (!masterCoi) {
      return { has_requirements: false, results: [], all_pass: true, failure_count: 0 };
    }
    const resolutionArray = toResolutionArray(endorsementByLine);
    return evaluateHolderRequirements({
      requirements: holderRequirements,
      masterCoi,
      selectedLineKeys: state.selectedLineKeys,
      holderResolution: (resolutionArray ?? []).map((row) => ({
        line_key: row.line_key,
        addl_insd_resolved: row.addl_insd_resolved,
        subr_wvd_resolved: row.subr_wvd_resolved,
        basis: typeof row.basis === 'string' ? row.basis : null,
      })),
      // Evaluate against what THIS certificate will print (the per-line toggles),
      // so a manual Y flips its requirement to pass in real time.
      printedFlags: state.perLine,
    });
  }, [masterCoi, holderRequirements, state.selectedLineKeys, endorsementByLine, state.perLine]);

  // Custom write-in coverages for the selected lines' policies
  // (policy_additional_coverages). Fetched with the same read + created_at order
  // the server uses at issue, then filtered to the printed (line, policy) pairs,
  // so the client preview and the server rebuild produce the same field values
  // (preview-hash gate R9).
  const additionalCoveragePolicyIds = useMemo(
    () => selectedPolicyIds(masterCoi, state.selectedLineKeys).sort(),
    [masterCoi, state.selectedLineKeys],
  );
  const { data: additionalCoverageRows = [] } = useQuery({
    queryKey: ['cert-additional-coverages', additionalCoveragePolicyIds],
    enabled: additionalCoveragePolicyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('policy_additional_coverages' as never)
        .select('policy_id, line, name, amount')
        .in('policy_id', additionalCoveragePolicyIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        policy_id: string;
        line: LineKey;
        name: string;
        amount: number | null;
      }>;
    },
  });
  const additionalCoverages = useMemo(() => {
    if (!masterCoi) {
      return [] as Array<{ line: LineKey; name: string; amount: number | null }>;
    }
    // Keep only rows for a selected line on that line's selected policy.
    const pairs = new Set<string>();
    for (const key of state.selectedLineKeys) {
      const pid = (masterCoi.lines[key] as COILineBase | undefined)?.policy_id;
      if (pid) pairs.add(`${key}|${pid}`);
    }
    return additionalCoverageRows
      .filter((r) => pairs.has(`${r.line}|${r.policy_id}`))
      .map((r) => ({ line: r.line, name: r.name, amount: r.amount }));
  }, [additionalCoverageRows, masterCoi, state.selectedLineKeys]);

  // -----------------------------------------------------------------------
  // The deterministic build (used by preview AND to validate before issue).
  // -----------------------------------------------------------------------
  const buildResult = useCallback((): BuildAcord25Result | null => {
    if (!masterCoi || state.selectedLineKeys.length === 0) return null;

    const holder = state.holder
      ? {
          name: state.holder.name,
          addressLines: state.holder.addressBlock.split('\n').filter((l) => l.length > 0),
        }
      : null;

    // The authorized representative is the agency's signer (Brian Lewis), not the
    // producer contact. Fixed default for this single-agency deployment; must
    // match the server (generate-certificate) verbatim or issuance 409s on the
    // preview-hash bind.
    const authorizedRepName = 'Brian Lewis';

    const input = toAcord25BuildInput({
      masterCoi,
      selectedLines: state.selectedLineKeys,
      holder,
      holderResolution: toResolutionArray(endorsementByLine),
      printIntents: state.perLine,
      descriptionOfOperations: state.descriptionOfOperations,
      remarks: state.remarks,
      additionalCoverages,
      certificateDate: todayIso(),
      certificateNumber: null,
      authorizedRepName,
    });
    return buildAcord25FieldValues(input);
  }, [masterCoi, state.selectedLineKeys, state.holder, state.perLine, state.descriptionOfOperations, state.remarks, endorsementByLine, additionalCoverages]);

  const preview = useCertificatePreview({
    templateBytes,
    build: buildResult,
    deps: [
      masterCoi,
      state.selectedLineKeys,
      state.holder?.id,
      state.perLine,
      state.descriptionOfOperations,
      state.remarks,
      endorsementByLine,
      additionalCoverages,
    ],
    // Appearance only: shrink the narrow POLICY EFF/EXP date columns and render
    // the authorized rep in italic (signature). Does not affect the preview hash.
    fillStyle: {
      smallFields: ACORD25_DATE_COLUMN_FIELDS,
      italicFields: ACORD25_SIGNATURE_FIELDS,
    },
  });

  // -----------------------------------------------------------------------
  // Validation strip issues (blueprint D Section 3.6).
  // -----------------------------------------------------------------------
  const templateInfo: Acord25TemplateInfo | null = useMemo(() => {
    if (!template) return null;
    return { version: template.version, field_inventory: template.field_inventory };
  }, [template]);

  const validationIssues: ValidationIssue[] = useMemo(() => {
    const issues: ValidationIssue[] = [];

    // Page-level checks.
    if (state.selectedLineKeys.length === 0) {
      issues.push({ code: 'NO_LINES_SELECTED', severity: 'error', message: 'Select at least one coverage line.' });
    }
    if (!state.holder) {
      issues.push({ code: 'HOLDER_MISSING', severity: 'error', message: 'Add a certificate holder.' });
    }

    // Readiness blockers for SELECTED lines (canonical R6 vocabulary).
    if (masterCoi) {
      for (const blocker of masterCoi.readiness.blockers) {
        if (blocker.line && state.selectedLineKeys.includes(blocker.line as LineKey)) {
          issues.push({
            code: blocker.code,
            severity: 'error',
            message: blocker.message,
            lineKey: blocker.line,
          });
        }
      }
    }

    // Client build + validator issues.
    const build = buildResult();
    if (build && templateInfo) {
      const validated = validateAcord25(build, { mode: 'preview', template: templateInfo });
      for (const issue of validated.issues) {
        issues.push({
          code: issue.code,
          severity: issue.severity,
          message: issue.message,
          lineKey: issue.lineKey,
        });
      }
    }

    return issues;
  }, [state.selectedLineKeys, state.holder, masterCoi, buildResult, templateInfo]);

  const hasErrors = validationIssues.some((i) => i.severity === 'error');

  // The button's ONLY job: download the completed ACORD 25 the preview already
  // built in the browser. No server issuance, no stored certificate record.
  const downloadCertificate = useCallback(() => {
    if (!preview.blobUrl) return;
    const who = safeFilePart(state.holder?.name ?? accountName ?? 'certificate');
    downloadPdfBlob(preview.blobUrl, `ACORD 25 - ${who} - ${todayIso()}.pdf`);
  }, [preview.blobUrl, state.holder, accountName]);

  // Refresh the preview by re-reading the underlying data (Master COI +
  // endorsements); the debounced preview effect rebuilds from the fresh data.
  const refreshPreview = useCallback(() => {
    masterCoiQuery.refetch();
    endorsementQuery.refetch();
  }, [masterCoiQuery, endorsementQuery]);

  // -----------------------------------------------------------------------
  // Render.
  // -----------------------------------------------------------------------
  const hasTemplate = !!template;
  const loadingCore = masterCoiQuery.isLoading || templateQuery.isLoading;

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1400px] space-y-6 p-6">
        <header className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={navigateBack}
            className="gap-2 text-cc-text-secondary hover:text-cc-text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to customer
          </Button>
          <h1 className="text-2xl font-semibold text-cc-text-primary">Certificates</h1>
          <p className="text-cc-text-muted">
            ACORD 25 Certificate of Liability Insurance
            {accountName ? (
              <>
                {' for '}
                <span className="font-medium text-cc-text-primary">{accountName}</span>
              </>
            ) : null}
          </p>
        </header>

        {loadingCore || !masterCoi ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(400px,520px)_1fr]">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-cc-md" />
              ))}
            </div>
            <Skeleton className="aspect-[8.5/11] max-h-[80vh] w-full rounded-cc-md" />
          </div>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[minmax(400px,520px)_1fr]">
              <div className="space-y-5">
                <PolicyLineSelector
                  masterCoi={masterCoi}
                  selectedLineKeys={state.selectedLineKeys}
                  perLine={state.perLine}
                  endorsementByLine={endorsementByLine}
                  holderChosen={!!state.holder}
                  onToggleLine={(lineKey, checked) => dispatch({ type: 'toggleLine', lineKey, checked })}
                  onTogglePerLine={(lineKey, key, value) =>
                    dispatch({ type: 'setPerLine', lineKey, key, value })
                  }
                  accountId={accountId}
                />

                <HolderField
                  value={state.holder}
                  onChange={(holder) => dispatch({ type: 'setHolder', holder })}
                />

                <OperationsAndRemarksFields
                  descriptionOfOperations={state.descriptionOfOperations}
                  onChangeDescription={(value) =>
                    dispatch({ type: 'setDescriptionOfOperations', value })
                  }
                />

                <ValidationStrip issues={validationIssues} />

                <ComplianceStrip evaluation={requirementsEvaluation} />

                <div className="flex items-center gap-2">
                  <Button
                    data-primary
                    onClick={downloadCertificate}
                    disabled={hasErrors || preview.building || !preview.blobUrl || !preview.previewSha256}
                    aria-describedby={hasErrors ? 'cert-validation' : undefined}
                    className="font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
                  >
                    Download certificate
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={refreshPreview}
                    className="text-cc-text-secondary hover:text-cc-text-primary"
                  >
                    Refresh preview
                  </Button>
                </div>
              </div>

              <CertificatePreview
                blobUrl={preview.blobUrl}
                building={preview.building}
                error={preview.error}
                hasLines={state.selectedLineKeys.length > 0}
                hasTemplate={hasTemplate}
              />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
