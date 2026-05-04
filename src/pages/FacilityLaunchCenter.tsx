import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  Fingerprint,
  Gauge,
  Lock,
  Rocket,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';

type JsonMap = Record<string, unknown>;
type SupabaseError = { message: string };
type QueryResult<T> = Promise<{ data: T | null; error: SupabaseError | null }>;

type ModuleRow = {
  moduleNumber: number;
  moduleCode: string;
  moduleName: string;
  isMvpDetailed: boolean;
  scopeStatus: 'in' | 'out' | 'tbd';
  ownerName: string;
  ownerTitle: string;
  source: string;
  dueDate: string;
  openQuestions: string;
  status: 'not_started' | 'assigned' | 'in_progress' | 'ready_for_review' | 'signed' | 'blocked';
  nextAction: string;
};

type LaunchDocument = {
  id: string;
  title: string;
  artifactType: string;
  facilityId: string;
  legalEntityId: string;
  effectiveDate: string;
  expirationDate: string;
  version: string;
  documentGroupId: string;
  isSourceOfTruth: boolean;
  currencyStatus: 'fresh' | 'aging' | 'stale' | 'unknown';
  custodianApprovalStatus: 'pending' | 'approved' | 'rejected' | 'needs_review';
  confidence: 'low' | 'medium' | 'high' | 'manual';
  routeOwner?: string;
  storagePath?: string;
  fileName?: string;
  notes: string;
};

type DocumentGroup = {
  id: string;
  name: string;
  artifactType: string;
  documentIds: string[];
  sourceOfTruthDocumentId: string;
};

type LaunchException = {
  id: string;
  scopeType: string;
  scopeId: string;
  description: string;
  severity: 'minor' | 'major' | 'blocking';
  ownerName: string;
  approverName: string;
  approverRole: string;
  status: 'requested' | 'approved' | 'closed';
  createdAt: string;
  approvedAt?: string;
};

type Contradiction = {
  id: string;
  type: string;
  severity: 'minor' | 'major' | 'blocking';
  affectedModuleNumber: number;
  ownerName: string;
  decisionOwner: string;
  status: 'open' | 'resolved' | 'exception_approved';
  summary: string;
  policyValue: string;
  realityValue: string;
  appSettingValue: string;
  resolutionNotes: string;
};

type Gate = {
  code: 'G0' | 'G2';
  name: string;
  status: 'blocked' | 'ready' | 'signed';
  requiredSignerRole: string;
  signedBy?: string;
  signerRole?: string;
  signedAt?: string;
  criteriaSnapshot?: JsonMap;
};

type GateCriterion = {
  label: string;
  pass: boolean;
  blocker?: string;
};

type GateEvaluation = {
  pass: boolean;
  criteria: GateCriterion[];
  blockers: string[];
};

type Workspace = {
  id: string;
  account_id: string;
  facility_name: string;
  status: string;
  readiness_score: number;
  program: JsonMap;
  modules: ModuleRow[];
  mvp_data: JsonMap;
  documents: LaunchDocument[];
  document_groups: DocumentGroup[];
  exceptions: LaunchException[];
  contradictions: Contradiction[];
  gates: Gate[];
  decision_log: JsonMap[];
};

type FacilityLaunchInsert = Omit<Workspace, 'id'> & {
  created_by: string;
  updated_by: string;
};

type FacilityLaunchUpdate = Pick<Workspace, 'readiness_score' | 'program' | 'modules' | 'mvp_data' | 'documents' | 'document_groups' | 'exceptions' | 'contradictions' | 'gates' | 'decision_log'>;

type FacilityLaunchQuery = {
  select: (columns: string) => FacilityLaunchQuery;
  eq: (column: string, value: string) => FacilityLaunchQuery;
  order: (column: string, options: { ascending: boolean }) => FacilityLaunchQuery;
  limit: (count: number) => FacilityLaunchQuery;
  maybeSingle: () => QueryResult<Workspace>;
  single: () => QueryResult<Workspace>;
  insert: (values: FacilityLaunchInsert) => FacilityLaunchQuery;
  update: (values: FacilityLaunchUpdate) => FacilityLaunchQuery;
};

type RoomRow = {
  id: string;
  roomNumber: string;
  floor: string;
  wing: string;
  unitType: string;
  bedCount: number;
  careDesignation: string;
  status: string;
};

type EmployeeRow = {
  id: string;
  fullLegalName: string;
  preferredName: string;
  emailOrMobile: string;
  hireDate: string;
  employmentStatus: string;
  jobTitle: string;
  appRole: string;
  primaryFacility: string;
  shiftDepartment: string;
  supervisor: string;
  credentialSummary: string;
  loginStatus: string;
};

const moduleCatalog: Array<Pick<ModuleRow, 'moduleNumber' | 'moduleCode' | 'moduleName' | 'isMvpDetailed'>> = [
  [1, 'M1', 'Company / Portfolio', true],
  [2, 'M2', 'Facility Profile', true],
  [3, 'M3', 'Rooms / Beds / Units', true],
  [4, 'M4', 'Employees / Users / Roles', true],
  [5, 'M5', 'Residents', false],
  [6, 'M6', 'Resident Rates / Billing / Payer', false],
  [7, 'M7', 'Care Levels / Service Plans / ADLs', false],
  [8, 'M8', 'Rounds / Checks / Care Tasks', false],
  [9, 'M9', 'Schedules / Shifts / Assignments', false],
  [10, 'M10', 'Medications (scope-dependent)', false],
  [11, 'M11', 'Dining / Meals / Dietary', false],
  [12, 'M12', 'Activities / Life Enrichment', false],
  [13, 'M13', 'Maintenance / Work Orders / Assets', false],
  [14, 'M14', 'Admissions / Sales / Move-In Pipeline', false],
  [15, 'M15', 'Family / Responsible-Party Portal', false],
  [16, 'M16', 'Incidents / Risk / Claims Awareness', false],
  [17, 'M17', 'Documents / Insurance / Compliance', true],
  [18, 'M18', 'Vendors / Contacts / Emergency', false],
  [19, 'M19', 'Reports / Dashboards / KPIs', false],
].map(([moduleNumber, moduleCode, moduleName, isMvpDetailed]) => ({ moduleNumber, moduleCode, moduleName, isMvpDetailed }));

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const facilityLaunchQuery = () => (supabase.from as unknown as (table: string) => FacilityLaunchQuery)('facility_launch_workspaces');
const asMap = (value: unknown): JsonMap => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonMap : {};
const asArray = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const asInputValue = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? value : '';
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function createSeedWorkspace(accountId: string, userId?: string): Omit<Workspace, 'id'> {
  const modules = moduleCatalog.map((m, index) => ({
    ...m,
    scopeStatus: 'in' as const,
    ownerName: index < 14 ? 'Assigned Owner' : '',
    ownerTitle: index < 14 ? 'Department Lead' : '',
    source: index < 14 ? 'Roundtable Intake' : '',
    dueDate: index < 14 ? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) : '',
    openQuestions: '',
    status: index < 14 ? 'assigned' as const : 'not_started' as const,
    nextAction: 'Confirm owner, source, due date, and readiness evidence',
  }));

  const documents: LaunchDocument[] = [
    { id: 'doc-gl-1', title: 'HOMEWOOD GL CERT.pdf', artifactType: 'gl_cert', facilityId: 'homewood', legalEntityId: 'homewood-property', effectiveDate: '2022-01-01', expirationDate: '2023-01-01', version: '2022', documentGroupId: 'grp-gl', isSourceOfTruth: false, currencyStatus: 'stale', custodianApprovalStatus: 'needs_review', confidence: 'manual', notes: 'Duplicate GL candidate.' },
    { id: 'doc-gl-2', title: 'HOMEWOOD GL CERT 2.pdf', artifactType: 'gl_cert', facilityId: 'homewood', legalEntityId: 'homewood-property', effectiveDate: '2022-01-01', expirationDate: '2023-01-01', version: 'variant', documentGroupId: 'grp-gl', isSourceOfTruth: false, currencyStatus: 'stale', custodianApprovalStatus: 'needs_review', confidence: 'manual', notes: 'Duplicate GL variant.' },
    { id: 'doc-prop-1', title: 'HOMEWOOD PROPERTY Policy.pdf', artifactType: 'property_policy', facilityId: 'homewood', legalEntityId: 'homewood-property', effectiveDate: '2022-01-01', expirationDate: '2023-01-01', version: '2022', documentGroupId: 'grp-prop', isSourceOfTruth: false, currencyStatus: 'stale', custodianApprovalStatus: 'needs_review', confidence: 'manual', notes: 'Property policy candidate.' },
    { id: 'doc-prop-2', title: 'HOMEWOOD PROPERTY POLICY 2.pdf', artifactType: 'property_policy', facilityId: 'homewood', legalEntityId: 'homewood-property', effectiveDate: '2022-01-01', expirationDate: '2023-01-01', version: 'variant', documentGroupId: 'grp-prop', isSourceOfTruth: false, currencyStatus: 'stale', custodianApprovalStatus: 'needs_review', confidence: 'manual', notes: 'Property policy variant.' },
    { id: 'doc-bond-1', title: 'HOMEWOOD BOND CERTIFICATE.pdf', artifactType: 'bond_certificate', facilityId: 'homewood', legalEntityId: 'homewood-property', effectiveDate: '2024-10-07', expirationDate: '2025-10-07', version: '2024 continuation', documentGroupId: 'grp-bond', isSourceOfTruth: true, currencyStatus: 'aging', custodianApprovalStatus: 'approved', confidence: 'manual', notes: 'Bond continuation evidence.' },
    { id: 'doc-loss-1', title: 'Homewood Loss Run / Sorensen, Smith & Bay', artifactType: 'loss_run', facilityId: 'homewood', legalEntityId: 'ssb-operating', effectiveDate: '2021-03-15', expirationDate: '', version: '2021', documentGroupId: 'grp-loss', isSourceOfTruth: true, currencyStatus: 'stale', custodianApprovalStatus: 'needs_review', confidence: 'manual', notes: 'Claims-awareness route to CFO/Legal; no legal narrative stored.' },
  ];

  return {
    account_id: accountId,
    facility_name: 'Homewood Lodge ALF',
    status: 'pilot',
    readiness_score: 0,
    program: {
      name: 'Homewood Facility Launch MVP',
      sponsor: 'Executive Sponsor',
      deputySponsor: '',
      cfo: 'CFO',
      coo: 'COO',
      onboarder: 'Onboarder',
      documentCustodian: 'Document Custodian',
      definitionOfLive: 'Facility DNA MVP modules complete, Gate 0/Gate 2 signed, and source-of-truth decisions exported.',
      thresholds: { moduleReadinessTarget: 95, staleMonths: 12 },
      homewoodInScope: true,
    },
    modules,
    mvp_data: {
      M1: { parentLegalName: 'Lewis Senior Living Portfolio', dba: 'Homewood Lodge ALF', operatingLlc: 'Sorensen, Smith & Bay LLC', propertyLlc: 'Homewood Property Company LLC', mailingAddress: '426 SW Commerce Dr. #130, Lake City, FL 32025', corporateContact: 'Executive Sponsor', billingContact: 'Business Office', timeZone: 'America/New_York' },
      M2: { legalName: 'Homewood Lodge ALF', dba: 'Homewood', facilityType: 'Assisted Living / Memory Care', licenseNumber: '', licenseState: 'FL', licenseAgency: '', licenseExpiration: '', physicalAddress: '', mailingAddress: '426 SW Commerce Dr. #130, Lake City, FL 32025', mainPhone: '', afterHoursPhone: '', licensedCapacity: '', floors: '', wings: '', executiveDirector: '', don: '', maintenanceDirector: '', businessOffice: '', emergencyContactTree: '', operatingAddressConfirmed: false },
      M3: { bedsTotal: '', unitsTotal: '', rooms: [] },
      M4: { roleCoverageNotes: '', employees: [] },
      M17: { reviewNotes: 'Seeded Homewood docs require source-of-truth selection, currency routing, and custodian approval.' },
    },
    documents,
    document_groups: [
      { id: 'grp-gl', name: 'Homewood GL Coverage', artifactType: 'gl_cert', documentIds: ['doc-gl-1', 'doc-gl-2'], sourceOfTruthDocumentId: '' },
      { id: 'grp-prop', name: 'Homewood Property Policy', artifactType: 'property_policy', documentIds: ['doc-prop-1', 'doc-prop-2'], sourceOfTruthDocumentId: '' },
      { id: 'grp-bond', name: 'Homewood Bond Evidence', artifactType: 'bond_certificate', documentIds: ['doc-bond-1'], sourceOfTruthDocumentId: 'doc-bond-1' },
      { id: 'grp-loss', name: 'Homewood Claims / Loss Run', artifactType: 'loss_run', documentIds: ['doc-loss-1'], sourceOfTruthDocumentId: 'doc-loss-1' },
    ],
    exceptions: [],
    contradictions: [{ id: 'ctr-rounds-cadence-1', type: 'policy_reality_app', severity: 'major', affectedModuleNumber: 8, ownerName: '', decisionOwner: '', status: 'open', summary: 'Homewood rounds cadence needs Policy vs Reality vs App Setting confirmation.', policyValue: 'Policy binder TBD', realityValue: 'DON interview TBD', appSettingValue: 'App setting TBD', resolutionNotes: '' }],
    gates: [{ code: 'G0', name: 'Program Charter', status: 'ready', requiredSignerRole: 'Executive Sponsor' }, { code: 'G2', name: 'Owner + Intake Readiness', status: 'blocked', requiredSignerRole: 'COO / Implementation Owner' }],
    decision_log: [{ id: newId('dec'), timestamp: nowIso(), actor: userId || 'system', actionType: 'workspace_seeded', summary: 'Homewood Facility Launch Center workspace created in Supabase.' }],
  };
}

const moduleHasCoverage = (m: ModuleRow) => m.scopeStatus === 'out' || Boolean(m.ownerName && m.source && m.dueDate);
const approvedException = (workspace: Workspace, scopeType: string, scopeId: string) => workspace.exceptions.some((e) => e.scopeType === scopeType && e.scopeId === scopeId && e.status === 'approved');

function mvpCompleteness(workspace: Workspace, code: string): number {
  const d = asMap(workspace.mvp_data?.[code]);
  const truthy = (items: unknown[]) => Math.round((items.filter(Boolean).length / items.length) * 100);
  if (code === 'M1') return truthy([d.parentLegalName, d.dba, d.operatingLlc, d.propertyLlc, d.mailingAddress, d.corporateContact, d.billingContact, d.timeZone]);
  if (code === 'M2') return truthy([d.legalName, d.facilityType, d.licenseNumber, d.licenseState, d.physicalAddress, d.mainPhone, d.licensedCapacity, d.executiveDirector, d.don, d.operatingAddressConfirmed]);
  if (code === 'M3') return truthy([Number(d.bedsTotal) > 0, Number(d.unitsTotal) > 0, asArray<RoomRow>(d.rooms).length > 0]);
  if (code === 'M4') return truthy([asArray<EmployeeRow>(d.employees).length > 0, d.roleCoverageNotes]);
  if (code === 'M17') return truthy([workspace.documents.length > 0, unresolvedDuplicateGroups(workspace).length === 0, workspace.documents.some((doc) => doc.custodianApprovalStatus === 'approved'), workspace.documents.some((doc) => doc.confidence === 'high' || doc.confidence === 'manual')]);
  return 0;
}

function moduleScore(workspace: Workspace, module: ModuleRow): number | null {
  if (module.scopeStatus === 'out') return null;
  if (!module.isMvpDetailed) return moduleHasCoverage(module) || approvedException(workspace, 'module', module.moduleCode) ? 100 : module.ownerName || module.source || module.dueDate ? 50 : 0;
  let score = Math.round(mvpCompleteness(workspace, module.moduleCode) * 0.6);
  if (moduleHasCoverage(module) || approvedException(workspace, 'module', module.moduleCode)) score += 20;
  if (module.status === 'ready_for_review' || module.status === 'signed') score += 20;
  if (module.moduleCode === 'M17') {
    if (unresolvedDuplicateGroups(workspace).length > 0) score -= 20;
    if (staleUnroutedDocs(workspace).length > 0) score -= 15;
  }
  return Math.max(0, Math.min(100, score));
}

function unresolvedDuplicateGroups(workspace: Workspace) {
  return workspace.document_groups.filter((g) => g.documentIds.length > 1 && !g.sourceOfTruthDocumentId);
}

function staleUnroutedDocs(workspace: Workspace) {
  return workspace.documents.filter((d) => d.currencyStatus === 'stale' && !d.routeOwner && !approvedException(workspace, 'document', d.id));
}

function moduleMetrics(workspace: Workspace) {
  return workspace.modules.map((m) => {
    const relatedDocs = m.moduleCode === 'M17' ? workspace.documents : [];
    return {
      ...m,
      score: moduleScore(workspace, m),
      completeness: m.isMvpDetailed ? mvpCompleteness(workspace, m.moduleCode) : null,
      evidenceCount: relatedDocs.length,
      staleCount: relatedDocs.filter((d) => d.currencyStatus === 'stale').length,
      contradictionCount: workspace.contradictions.filter((c) => c.affectedModuleNumber === m.moduleNumber && c.status === 'open').length,
      exceptionCount: workspace.exceptions.filter((e) => e.scopeId === m.moduleCode && e.status === 'approved').length,
    };
  });
}

function scoreWorkspace(workspace: Workspace) {
  const scores = moduleMetrics(workspace).map((m) => m.score).filter((s): s is number => typeof s === 'number');
  return Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1));
}

function evaluateGate0(workspace: Workspace): GateEvaluation {
  const p = workspace.program || {};
  const criteria = [
    ['Program exists', p.name],
    ['Executive sponsor named', p.sponsor],
    ['CFO named', p.cfo],
    ['COO named', p.coo],
    ['Onboarder named', p.onboarder],
    ['Document custodian named', p.documentCustodian],
    ['Definition of Live recorded', p.definitionOfLive],
    ['Homewood in scope', p.homewoodInScope],
  ].map(([label, pass]) => ({ label, pass: Boolean(pass) }));
  return { pass: criteria.every((c) => c.pass), criteria, blockers: criteria.filter((c) => !c.pass).map((c) => c.label) };
}

function evaluateGate2(workspace: Workspace): GateEvaluation {
  const missingCoverage = workspace.modules.filter((m) => m.scopeStatus !== 'out' && !moduleHasCoverage(m) && !approvedException(workspace, 'module', m.moduleCode));
  const mvpFailures = workspace.modules.filter((m) => m.isMvpDetailed && mvpCompleteness(workspace, m.moduleCode) < 95 && !approvedException(workspace, 'module', m.moduleCode));
  const ownerlessContradictions = workspace.contradictions.filter((c) => c.status === 'open' && !c.ownerName);
  const criteria = [
    { label: 'All modules have owner/source/due or approved exception', pass: missingCoverage.length === 0, blocker: `Missing coverage: ${missingCoverage.map((m) => m.moduleCode).join(', ')}` },
    { label: 'MVP Facility DNA modules are complete or excepted', pass: mvpFailures.length === 0, blocker: `MVP incomplete: ${mvpFailures.map((m) => `${m.moduleCode}(${mvpCompleteness(workspace, m.moduleCode)}%)`).join(', ')}` },
    { label: 'No unresolved duplicate source-of-truth groups', pass: unresolvedDuplicateGroups(workspace).length === 0, blocker: `Unresolved duplicate groups: ${unresolvedDuplicateGroups(workspace).map((g) => g.name).join(', ')}` },
    { label: 'Stale documents routed or excepted', pass: staleUnroutedDocs(workspace).length === 0, blocker: `Stale docs need routing: ${staleUnroutedDocs(workspace).map((d) => d.title).join(', ')}` },
    { label: 'Open contradictions have named owners', pass: ownerlessContradictions.length === 0, blocker: `Ownerless contradictions: ${ownerlessContradictions.map((c) => c.summary).join(', ')}` },
  ];
  return { pass: criteria.every((c) => c.pass), criteria, blockers: criteria.filter((c) => !c.pass).map((c) => c.blocker) };
}

function launchNarrative(workspace: Workspace) {
  const g2 = evaluateGate2(workspace);
  return g2.pass
    ? `${workspace.facility_name} is Gate 2 ready: core Facility DNA is captured, source-of-truth decisions are made, stale evidence is routed/excepted, and contradictions are owned.`
    : `${workspace.facility_name} is not Gate 2 ready yet. The system is surfacing ${g2.blockers.length} blocker group(s), with ownership and evidence paths visible.`;
}

function buildMarkdownExport(workspace: Workspace) {
  return `# Facility Launch Readiness Packet\n\n## Launch Narrative / Executive Summary\n${launchNarrative(workspace)}\n\n## Facility Score\n${scoreWorkspace(workspace)}\n\n## Gate 0\n${evaluateGate0(workspace).pass ? 'PASS' : 'BLOCKED'}\n\n## Gate 2\n${evaluateGate2(workspace).pass ? 'PASS' : 'BLOCKED'}\n\n## Gate 2 Blockers\n${evaluateGate2(workspace).blockers.map((b) => `- ${b}`).join('\n') || '- None'}\n\n## Source-of-Truth Decisions\n${workspace.document_groups.map((g) => `- ${g.name}: ${g.sourceOfTruthDocumentId || 'unresolved'}`).join('\n')}\n\n## Exceptions\n${workspace.exceptions.map((e) => `- ${e.status}: ${e.scopeType}/${e.scopeId} — ${e.description}`).join('\n') || '- None'}\n\n## Contradictions\n${workspace.contradictions.map((c) => `- ${c.status}: ${c.summary} — owner=${c.ownerName || 'unassigned'}`).join('\n')}\n\n## Recent Decision Log\n${workspace.decision_log.slice(0, 10).map((d) => `- ${d.timestamp}: ${d.summary}`).join('\n')}`;
}

export default function FacilityLaunchCenter() {
  const { user, loading: authLoading } = useAuth();
  const [accountId, setAccountId] = useState<string>('');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeModule, setActiveModule] = useState('M1');
  const [exportText, setExportText] = useState('');
  const [uploading, setUploading] = useState(false);

  const metrics = useMemo(() => (workspace ? moduleMetrics(workspace) : []), [workspace]);
  const score = useMemo(() => (workspace ? scoreWorkspace(workspace) : 0), [workspace]);
  const gate0 = useMemo(() => (workspace ? evaluateGate0(workspace) : null), [workspace]);
  const gate2 = useMemo(() => (workspace ? evaluateGate2(workspace) : null), [workspace]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void loadOrCreateWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  async function loadOrCreateWorkspace() {
    setLoading(true);
    try {
      const { data: membership, error: membershipError } = await supabase
        .from('account_memberships')
        .select('account_id')
        .eq('user_id', user!.id)
        .limit(1)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership?.account_id) throw new Error('No account membership found for this user.');
      setAccountId(membership.account_id);

      const { data: existing, error: existingError } = await facilityLaunchQuery()
        .select('*')
        .eq('account_id', membership.account_id)
        .eq('facility_name', 'Homewood Lodge ALF')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        setWorkspace(existing as Workspace);
        return;
      }

      const seed = createSeedWorkspace(membership.account_id, user!.id);
      const { data: created, error: createError } = await facilityLaunchQuery()
        .insert({ ...seed, created_by: user!.id, updated_by: user!.id, readiness_score: scoreWorkspace({ id: 'tmp', ...seed } as Workspace) })
        .select('*')
        .single();
      if (createError) throw createError;
      setWorkspace(created as Workspace);
      toast.success('Facility Launch Center workspace created');
    } catch (error: unknown) {
      console.error(error);
      toast.error(errorMessage(error, 'Failed to load Facility Launch Center'));
    } finally {
      setLoading(false);
    }
  }

  async function persist(next: Workspace, summary: string) {
    setSaving(true);
    try {
      const entry = { id: newId('dec'), timestamp: nowIso(), actor: user?.id || 'user', actionType: 'update', summary };
      const withLog = { ...next, readiness_score: scoreWorkspace(next), decision_log: [entry, ...(next.decision_log || [])].slice(0, 100) };
      setWorkspace(withLog);
      const { error } = await facilityLaunchQuery()
        .update({
          readiness_score: withLog.readiness_score,
          program: withLog.program,
          modules: withLog.modules,
          mvp_data: withLog.mvp_data,
          documents: withLog.documents,
          document_groups: withLog.document_groups,
          exceptions: withLog.exceptions,
          contradictions: withLog.contradictions,
          gates: withLog.gates,
          decision_log: withLog.decision_log,
        })
        .eq('id', withLog.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Save failed'));
      void loadOrCreateWorkspace();
    } finally {
      setSaving(false);
    }
  }

  function updateProgram(field: string, value: unknown) {
    if (!workspace) return;
    void persist({ ...workspace, program: { ...workspace.program, [field]: value } }, `Updated Program Charter: ${field}`);
  }

  function updateModule(code: string, patch: Partial<ModuleRow>) {
    if (!workspace) return;
    void persist({ ...workspace, modules: workspace.modules.map((m) => (m.moduleCode === code ? { ...m, ...patch } : m)) }, `Updated Owner Worksheet row ${code}`);
  }

  function updateMvp(code: string, field: string, value: unknown) {
    if (!workspace) return;
    void persist({ ...workspace, mvp_data: { ...workspace.mvp_data, [code]: { ...(workspace.mvp_data?.[code] || {}), [field]: value } } }, `Updated Facility DNA ${code}: ${field}`);
  }

  function addRoom() {
    if (!workspace) return;
    const room = { id: newId('room'), roomNumber: '101', floor: '1', wing: 'AL', unitType: 'Private', bedCount: 1, careDesignation: 'Assisted Living', status: 'active' };
    const m3 = workspace.mvp_data.M3 || {};
    void persist({ ...workspace, mvp_data: { ...workspace.mvp_data, M3: { ...m3, rooms: [...(m3.rooms || []), room] } } }, 'Added Homewood room/unit row');
  }

  function addEmployee() {
    if (!workspace) return;
    const emp = { id: newId('emp'), fullLegalName: 'Demo Caregiver', preferredName: 'Demo', emailOrMobile: 'demo@example.com', hireDate: new Date().toISOString().slice(0, 10), employmentStatus: 'active', jobTitle: 'Caregiver', appRole: 'Caregiver', primaryFacility: 'Homewood Lodge ALF', shiftDepartment: 'NOC / Resident Care', supervisor: 'DON', credentialSummary: 'Credential review pending', loginStatus: 'pending' };
    const m4 = workspace.mvp_data.M4 || {};
    void persist({ ...workspace, mvp_data: { ...workspace.mvp_data, M4: { ...m4, employees: [...(m4.employees || []), emp] } } }, 'Added Homewood employee/user row');
  }

  async function uploadDocument(file: File | null) {
    if (!workspace || !accountId) return;
    setUploading(true);
    try {
      let storagePath = '';
      let title = `Manual document ${workspace.documents.length + 1}`;
      if (file) {
        title = file.name;
        storagePath = `${accountId}/${workspace.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error } = await supabase.storage.from('facility-launch-documents').upload(storagePath, file, { upsert: false });
        if (error) throw error;
      }
      const doc: LaunchDocument = { id: newId('doc'), title, artifactType: 'other', facilityId: 'homewood', legalEntityId: 'homewood-property', effectiveDate: '', expirationDate: '', version: 'new', documentGroupId: 'grp-new', isSourceOfTruth: false, currencyStatus: 'unknown', custodianApprovalStatus: 'pending', confidence: 'manual', fileName: file?.name, storagePath, notes: 'Added from live Facility Launch Center.' };
      const groups = workspace.document_groups.some((g) => g.id === 'grp-new') ? workspace.document_groups : [...workspace.document_groups, { id: 'grp-new', name: 'New Intake Documents', artifactType: 'other', documentIds: [], sourceOfTruthDocumentId: '' }];
      void persist({ ...workspace, documents: [doc, ...workspace.documents], document_groups: groups.map((g) => g.id === 'grp-new' ? { ...g, documentIds: [doc.id, ...g.documentIds] } : g) }, `Uploaded/added document ${title}`);
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Document upload failed'));
    } finally {
      setUploading(false);
    }
  }

  function updateDoc(id: string, patch: Partial<LaunchDocument>) {
    if (!workspace) return;
    void persist({ ...workspace, documents: workspace.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)) }, `Updated document ${id}`);
  }

  function selectSourceOfTruth(groupId: string, documentId: string) {
    if (!workspace) return;
    const group = workspace.document_groups.find((g) => g.id === groupId);
    if (!group || !group.documentIds.includes(documentId)) {
      toast.error('Source-of-truth document must belong to the selected group');
      return;
    }
    void persist({
      ...workspace,
      document_groups: workspace.document_groups.map((g) => (g.id === groupId ? { ...g, sourceOfTruthDocumentId: documentId } : g)),
      documents: workspace.documents.map((d) => group.documentIds.includes(d.id) ? { ...d, isSourceOfTruth: d.id === documentId, custodianApprovalStatus: d.id === documentId ? 'approved' : d.custodianApprovalStatus } : d),
    }, `Selected source of truth for ${group.name}`);
  }

  function addException(scopeType = 'module', scopeId = 'M17') {
    if (!workspace) return;
    const ex: LaunchException = { id: newId('exc'), scopeType, scopeId, description: `Exception for ${scopeType}/${scopeId}`, severity: 'major', ownerName: 'Implementation Owner', approverName: '', approverRole: '', status: 'requested', createdAt: nowIso() };
    void persist({ ...workspace, exceptions: [ex, ...workspace.exceptions] }, `Requested exception ${ex.id}`);
  }

  function approveException(id: string, approverName: string, approverRole: string) {
    if (!workspace) return;
    void persist({ ...workspace, exceptions: workspace.exceptions.map((e) => e.id === id ? { ...e, status: 'approved', approverName, approverRole, approvedAt: nowIso() } : e) }, `Approved exception ${id}`);
  }

  function updateContradiction(id: string, patch: Partial<Contradiction>) {
    if (!workspace) return;
    void persist({ ...workspace, contradictions: workspace.contradictions.map((c) => c.id === id ? { ...c, ...patch } : c) }, `Updated contradiction ${id}`);
  }

  function signGate(code: 'G0' | 'G2', signer: string, role: string) {
    if (!workspace) return;
    const evaluation = code === 'G0' ? evaluateGate0(workspace) : evaluateGate2(workspace);
    if (!evaluation.pass) {
      toast.error(`${code} is blocked`);
      return;
    }
    const gate = workspace.gates.find((g) => g.code === code);
    const snapshot = { ...evaluation, exceptionsReliedUpon: workspace.exceptions.filter((e) => e.status === 'approved') };
    void persist({ ...workspace, gates: workspace.gates.map((g) => g.code === code ? { ...g, status: 'signed', signedBy: signer, signerRole: role || gate?.requiredSignerRole, signedAt: nowIso(), criteriaSnapshot: snapshot } : g) }, `Signed ${code} by ${signer}`);
  }

  function generateExport() {
    if (!workspace) return;
    const text = `${buildMarkdownExport(workspace)}\n\n---\n\n## JSON State Export\n\n\`\`\`json\n${JSON.stringify(workspace, null, 2)}\n\`\`\``;
    setExportText(text);
    void persist(workspace, 'Generated executive readiness export');
  }

  if (authLoading || loading) {
    return <AppLayout><div className="p-8">Loading Facility Launch Center…</div></AppLayout>;
  }

  if (!user) {
    return <AppLayout><div className="p-8"><Card><CardHeader><CardTitle>Sign in required</CardTitle><CardDescription>Facility Launch Center uses Supabase Auth and account membership security.</CardDescription></CardHeader></Card></div></AppLayout>;
  }

  if (!workspace) {
    return <AppLayout><div className="p-8"><Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Could not load or create the Facility Launch Center workspace.</CardDescription></CardHeader><CardContent><Button onClick={loadOrCreateWorkspace}>Retry</Button></CardContent></Card></div></AppLayout>;
  }

  const m1 = asMap(workspace.mvp_data.M1);
  const m2 = asMap(workspace.mvp_data.M2);
  const m3 = asMap(workspace.mvp_data.M3);
  const m4 = asMap(workspace.mvp_data.M4);

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Rocket className="h-4 w-4" /> Facility DNA Command Center</div>
            <h1 className="text-3xl font-bold tracking-tight">Facility Launch Center</h1>
            <p className="text-muted-foreground">{launchNarrative(workspace)}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="px-3 py-2"><Lock className="mr-2 h-4 w-4" /> Supabase secured</Badge>
            <Button disabled={saving} onClick={() => void loadOrCreateWorkspace()} variant="outline">Refresh</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Readiness</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{score}</div><p className="text-xs text-muted-foreground">Supabase-backed score</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Gate 0</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{gate0?.pass ? 'Ready' : 'Blocked'}</div><p className="text-xs text-muted-foreground">{gate0?.criteria.filter((c) => c.pass).length}/{gate0?.criteria.length} criteria</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Gate 2</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{gate2?.pass ? 'Ready' : 'Blocked'}</div><p className="text-xs text-muted-foreground">{gate2?.blockers.length} blocker groups</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Evidence</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{workspace.documents.length}</div><p className="text-xs text-muted-foreground">{staleUnroutedDocs(workspace).length} stale unrouted</p></CardContent></Card>
        </div>

        <Tabs defaultValue="command" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="command">Command</TabsTrigger>
            <TabsTrigger value="charter">Charter</TabsTrigger>
            <TabsTrigger value="worksheet">Worksheet</TabsTrigger>
            <TabsTrigger value="dna">Facility DNA</TabsTrigger>
            <TabsTrigger value="docs">Documents</TabsTrigger>
            <TabsTrigger value="readiness">Readiness</TabsTrigger>
            <TabsTrigger value="risk">Exceptions/Risk</TabsTrigger>
            <TabsTrigger value="gates">Gates</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="command" className="space-y-4">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5" /> Homewood operating reality</CardTitle><CardDescription>The app is live against Supabase: this is no longer a local-only prototype.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div><h3 className="font-semibold">What the system knows</h3><ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground"><li>Dual entities: {m1.operatingLlc} / {m1.propertyLlc}</li><li>Seeded stale/duplicate coverage documents</li><li>Homewood rounds Policy vs Reality vs App Setting contradiction</li><li>Claims-awareness routing without legal narrative storage</li></ul></div><div><h3 className="font-semibold">Top Gate 2 blockers</h3><ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{gate2?.blockers.length ? gate2.blockers.map((b) => <li key={b}>{b}</li>) : <li>No Gate 2 blockers.</li>}</ul></div></CardContent></Card>
          </TabsContent>

          <TabsContent value="charter" className="space-y-4">
            <Card><CardHeader><CardTitle>Program Charter / Gate 0</CardTitle><CardDescription>These fields are stored in Supabase and drive Gate 0.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
              {['name','sponsor','deputySponsor','cfo','coo','onboarder','documentCustodian'].map((field) => <div key={field}><Label>{field}</Label><Input value={asInputValue(workspace.program[field])} onChange={(e) => updateProgram(field, e.target.value)} /></div>)}
              <div className="md:col-span-2"><Label>Definition of Live</Label><Textarea value={asInputValue(workspace.program.definitionOfLive)} onChange={(e) => updateProgram('definitionOfLive', e.target.value)} /></div>
              <div><Label>Readiness target</Label><Input type="number" value={asInputValue(asMap(workspace.program.thresholds).moduleReadinessTarget) || 95} onChange={(e) => updateProgram('thresholds', { ...asMap(workspace.program.thresholds), moduleReadinessTarget: Number(e.target.value) })} /></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={Boolean(workspace.program.homewoodInScope)} onChange={(e) => updateProgram('homewoodInScope', e.target.checked)} /><Label>Homewood in scope</Label></div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="worksheet">
            <Card><CardHeader><CardTitle>19-module Owner Worksheet</CardTitle><CardDescription>Every module needs an owner/source/due date or an approved exception.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Module</th><th>Owner</th><th>Source</th><th>Due</th><th>Status</th><th>Next action</th></tr></thead><tbody>{workspace.modules.map((m) => <tr key={m.moduleCode} className="border-b"><td className="min-w-64 p-2 font-medium">{m.moduleCode} {m.moduleName}</td><td><Input value={m.ownerName} onChange={(e) => updateModule(m.moduleCode, { ownerName: e.target.value })} /></td><td><Input value={m.source} onChange={(e) => updateModule(m.moduleCode, { source: e.target.value })} /></td><td><Input type="date" value={m.dueDate} onChange={(e) => updateModule(m.moduleCode, { dueDate: e.target.value })} /></td><td><select className="rounded-md border bg-background p-2" value={m.status} onChange={(e) => updateModule(m.moduleCode, { status: e.target.value as ModuleRow['status'] })}>{['not_started','assigned','in_progress','ready_for_review','signed','blocked'].map((s) => <option key={s}>{s}</option>)}</select></td><td><Input value={m.nextAction} onChange={(e) => updateModule(m.moduleCode, { nextAction: e.target.value })} /></td></tr>)}</tbody></table></div></CardContent></Card>
          </TabsContent>

          <TabsContent value="dna" className="space-y-4">
            <Tabs value={activeModule} onValueChange={setActiveModule}><TabsList><TabsTrigger value="M1">M1</TabsTrigger><TabsTrigger value="M2">M2</TabsTrigger><TabsTrigger value="M3">M3</TabsTrigger><TabsTrigger value="M4">M4</TabsTrigger><TabsTrigger value="M17">M17</TabsTrigger></TabsList>
              <TabsContent value="M1"><Card><CardHeader><CardTitle>M1 Company / Portfolio</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{['parentLegalName','dba','operatingLlc','propertyLlc','mailingAddress','corporateContact','billingContact','timeZone'].map((f) => <div key={f}><Label>{f}</Label><Input value={asInputValue(m1[f])} onChange={(e) => updateMvp('M1', f, e.target.value)} /></div>)}</CardContent></Card></TabsContent>
              <TabsContent value="M2"><Card><CardHeader><CardTitle>M2 Facility Profile</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{['legalName','dba','facilityType','licenseNumber','licenseState','licenseAgency','licenseExpiration','physicalAddress','mailingAddress','mainPhone','afterHoursPhone','licensedCapacity','floors','wings','executiveDirector','don','maintenanceDirector','businessOffice','emergencyContactTree'].map((f) => <div key={f}><Label>{f}</Label><Input value={asInputValue(m2[f])} onChange={(e) => updateMvp('M2', f, e.target.value)} /></div>)}<div className="flex items-center gap-2"><input type="checkbox" checked={Boolean(m2.operatingAddressConfirmed)} onChange={(e) => updateMvp('M2', 'operatingAddressConfirmed', e.target.checked)} /><Label>Operating address confirmed</Label></div></CardContent></Card></TabsContent>
              <TabsContent value="M3"><Card><CardHeader><CardTitle>M3 Rooms / Beds / Units</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><div><Label>Beds Total</Label><Input value={asInputValue(m3.bedsTotal)} onChange={(e) => updateMvp('M3', 'bedsTotal', e.target.value)} /></div><div><Label>Units Total</Label><Input value={asInputValue(m3.unitsTotal)} onChange={(e) => updateMvp('M3', 'unitsTotal', e.target.value)} /></div></div><Button onClick={addRoom}>Add representative room</Button><div className="grid gap-2">{asArray<RoomRow>(m3.rooms).map((r) => <div key={r.id} className="rounded border p-3 text-sm">{r.roomNumber} · Floor {r.floor} · {r.wing} · {r.unitType} · {r.bedCount} bed · {r.careDesignation} · {r.status}</div>)}</div></CardContent></Card></TabsContent>
              <TabsContent value="M4"><Card><CardHeader><CardTitle>M4 Employees / Users / Roles</CardTitle></CardHeader><CardContent className="space-y-4"><Button onClick={addEmployee}>Add representative employee</Button><div><Label>Role Coverage Notes</Label><Textarea value={asInputValue(m4.roleCoverageNotes)} onChange={(e) => updateMvp('M4', 'roleCoverageNotes', e.target.value)} /></div>{asArray<EmployeeRow>(m4.employees).map((emp) => <div key={emp.id} className="rounded border p-3 text-sm">{emp.fullLegalName} · {emp.jobTitle} · {emp.appRole} · {emp.shiftDepartment} · login {emp.loginStatus}</div>)}</CardContent></Card></TabsContent>
              <TabsContent value="M17"><Card><CardHeader><CardTitle>M17 Documents / Insurance / Compliance</CardTitle><CardDescription>Edit details in Document Intake.</CardDescription></CardHeader><CardContent><Textarea value={asInputValue(asMap(workspace.mvp_data.M17).reviewNotes)} onChange={(e) => updateMvp('M17', 'reviewNotes', e.target.value)} /></CardContent></Card></TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="docs" className="space-y-4">
            <Card><CardHeader><CardTitle>Document Intake + Supabase Storage</CardTitle><CardDescription>Files are uploaded to the private `facility-launch-documents` bucket under the account/workspace path.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex gap-2"><Input type="file" onChange={(e) => void uploadDocument(e.target.files?.[0] || null)} disabled={uploading} /><Button onClick={() => void uploadDocument(null)} variant="outline"><Upload className="mr-2 h-4 w-4" />Add manual metadata row</Button></div><div className="space-y-2">{workspace.document_groups.map((g) => <Card key={g.id}><CardHeader><CardTitle className="text-base">{g.name}</CardTitle><CardDescription>Source of truth: {g.sourceOfTruthDocumentId || 'unresolved'}</CardDescription></CardHeader><CardContent className="space-y-2">{g.documentIds.map((id) => workspace.documents.find((d) => d.id === id)).filter(Boolean).map((doc) => <div key={doc!.id} className="grid gap-2 rounded border p-3 md:grid-cols-7"><div className="md:col-span-2"><Input value={doc!.title} onChange={(e) => updateDoc(doc!.id, { title: e.target.value })} /></div><Input value={doc!.artifactType} onChange={(e) => updateDoc(doc!.id, { artifactType: e.target.value })} /><Input value={doc!.expirationDate} onChange={(e) => updateDoc(doc!.id, { expirationDate: e.target.value })} /><select className="rounded-md border bg-background p-2" value={doc!.currencyStatus} onChange={(e) => updateDoc(doc!.id, { currencyStatus: e.target.value as LaunchDocument['currencyStatus'] })}><option>fresh</option><option>aging</option><option>stale</option><option>unknown</option></select><Input placeholder="Route owner" value={doc!.routeOwner || ''} onChange={(e) => updateDoc(doc!.id, { routeOwner: e.target.value })} /><Button size="sm" onClick={() => selectSourceOfTruth(g.id, doc!.id)}>{doc!.isSourceOfTruth ? 'Selected' : 'Use as SoT'}</Button></div>)}</CardContent></Card>)}</div></CardContent></Card>
          </TabsContent>

          <TabsContent value="readiness"><Card><CardHeader><CardTitle>Facility Readiness Map</CardTitle><CardDescription>Hero map of what is known, blocked, owned, excepted, and ready.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{metrics.map((m) => <Card key={m.moduleCode} className="border"><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base">{m.moduleCode}</CardTitle><Badge variant={m.score && m.score >= 95 ? 'default' : 'outline'}>{m.score ?? 'out'}</Badge></div><CardDescription>{m.moduleName}</CardDescription></CardHeader><CardContent className="space-y-1 text-sm"><div>Owner: {m.ownerName || 'missing'}</div><div>Scope/status: {m.scopeStatus} / {m.status}</div><div>Completeness: {m.completeness ?? 'n/a'}%</div><div>Evidence: {m.evidenceCount} · stale {m.staleCount}</div><div>Contradictions: {m.contradictionCount} · exceptions {m.exceptionCount}</div><div className="text-muted-foreground">Next: {m.nextAction}</div></CardContent></Card>)}</CardContent></Card></TabsContent>

          <TabsContent value="risk" className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Exceptions</CardTitle></CardHeader><CardContent className="space-y-3"><Button onClick={() => addException('module', 'M17')}>Request M17 exception</Button>{workspace.exceptions.map((e) => <div key={e.id} className="rounded border p-3 text-sm"><div className="font-medium">{e.scopeType}/{e.scopeId} · {e.status}</div><div>{e.description}</div><div className="mt-2 grid gap-2 md:grid-cols-2"><Input placeholder="Approver name" value={e.approverName} onChange={(ev) => void persist({ ...workspace, exceptions: workspace.exceptions.map((x) => x.id === e.id ? { ...x, approverName: ev.target.value } : x) }, `Updated exception approver ${e.id}`)} /><Input placeholder="Approver role" value={e.approverRole} onChange={(ev) => void persist({ ...workspace, exceptions: workspace.exceptions.map((x) => x.id === e.id ? { ...x, approverRole: ev.target.value } : x) }, `Updated exception approver role ${e.id}`)} /></div><Button className="mt-2" size="sm" onClick={() => approveException(e.id, e.approverName || 'Approver', e.approverRole || 'Executive')}>Approve</Button></div>)}</CardContent></Card>
            <Card><CardHeader><CardTitle>Policy vs Reality vs App Setting</CardTitle></CardHeader><CardContent className="space-y-3">{workspace.contradictions.map((c) => <div key={c.id} className="rounded border p-3 text-sm space-y-2"><div className="font-medium">{c.summary}</div><Input placeholder="Owner" value={c.ownerName} onChange={(e) => updateContradiction(c.id, { ownerName: e.target.value })} /><Input placeholder="Decision owner" value={c.decisionOwner} onChange={(e) => updateContradiction(c.id, { decisionOwner: e.target.value })} /><Textarea placeholder="Policy" value={c.policyValue} onChange={(e) => updateContradiction(c.id, { policyValue: e.target.value })} /><Textarea placeholder="Reality" value={c.realityValue} onChange={(e) => updateContradiction(c.id, { realityValue: e.target.value })} /><Textarea placeholder="App setting" value={c.appSettingValue} onChange={(e) => updateContradiction(c.id, { appSettingValue: e.target.value })} /><Textarea placeholder="Resolution" value={c.resolutionNotes} onChange={(e) => updateContradiction(c.id, { resolutionNotes: e.target.value })} /><Button size="sm" onClick={() => updateContradiction(c.id, { status: 'resolved' })}>Resolve</Button></div>)}</CardContent></Card>
          </TabsContent>

          <TabsContent value="gates" className="grid gap-4 lg:grid-cols-2">{(['G0','G2'] as const).map((code) => { const evaln = code === 'G0' ? gate0! : gate2!; const gate = workspace.gates.find((g) => g.code === code)!; return <Card key={code}><CardHeader><CardTitle>{code} — {gate.name}</CardTitle><CardDescription>Required signer: {gate.requiredSignerRole}. Status: {gate.status}</CardDescription></CardHeader><CardContent className="space-y-3"><ul className="space-y-2 text-sm">{evaln.criteria.map((c) => <li key={c.label} className="flex gap-2"><span>{c.pass ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}</span>{c.label}</li>)}</ul><Input id={`${code}-signer`} placeholder="Signer name" /><Input id={`${code}-role`} placeholder="Signer role" defaultValue={gate.requiredSignerRole} /><Button disabled={!evaln.pass} onClick={() => signGate(code, (document.getElementById(`${code}-signer`) as HTMLInputElement)?.value || '', (document.getElementById(`${code}-role`) as HTMLInputElement)?.value || gate.requiredSignerRole)}>Sign {code}</Button></CardContent></Card>; })}</TabsContent>

          <TabsContent value="export" className="space-y-4"><Card><CardHeader><CardTitle>Executive Readiness Export</CardTitle><CardDescription>Markdown + JSON generated from Supabase workspace state.</CardDescription></CardHeader><CardContent className="space-y-4"><Button onClick={generateExport}><FileText className="mr-2 h-4 w-4" />Generate readiness packet</Button><Textarea className="min-h-[420px] font-mono text-xs" value={exportText} readOnly /></CardContent></Card></TabsContent>
        </Tabs>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Decision Log</CardTitle></CardHeader><CardContent><div className="space-y-2 text-sm">{workspace.decision_log.slice(0, 8).map((d) => <div key={d.id} className="rounded border p-2"><span className="text-muted-foreground">{new Date(d.timestamp).toLocaleString()}</span> — {d.summary}</div>)}</div></CardContent></Card>
      </div>
    </AppLayout>
  );
}
